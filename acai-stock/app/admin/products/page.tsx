'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { parseQty, fmtQty } from '@/lib/num';
import AdminHeader from '@/components/AdminHeader';
import type { Category, Location, LocationProduct, Product } from '@/lib/types';

const UNITS = ['un', 'kg', 'L', 'cx'] as const;

export default function AdminProducts() {
  const supabase = useMemo(() => createClient(), []);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locProducts, setLocProducts] = useState<LocationProduct[]>([]);
  const [locId, setLocId] = useState(''); // '' = editar produtos; senão ativação por loja
  const [msg, setMsg] = useState<string | null>(null);
  // new product form
  const [npName, setNpName] = useState('');
  const [npCat, setNpCat] = useState('');
  const [npUnit, setNpUnit] = useState<string>('un');
  const [npHalf, setNpHalf] = useState(false);
  const [npThr, setNpThr] = useState('1');
  // new category
  const [ncName, setNcName] = useState('');

  const load = useCallback(async () => {
    const [catRes, prodRes, locRes, lpRes] = await Promise.all([
      supabase.from('categories').select('*').order('sort_order'),
      supabase.from('products').select('*').order('name'),
      supabase.from('locations').select('*').order('name'),
      supabase.from('location_products').select('*'),
    ]);
    setCategories((catRes.data ?? []) as Category[]);
    setProducts((prodRes.data ?? []) as Product[]);
    setLocations((locRes.data ?? []) as Location[]);
    setLocProducts((lpRes.data ?? []) as LocationProduct[]);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  function flash(m: string) {
    setMsg(m);
    setTimeout(() => setMsg(null), 2000);
  }

  async function saveProduct(p: Product, patch: Partial<Product>) {
    const { error } = await supabase.from('products').update(patch).eq('id', p.id);
    if (error) return flash('Erro ao guardar.');
    setProducts((ps) => ps.map((x) => (x.id === p.id ? { ...x, ...patch } : x)));
  }

  async function addProduct() {
    const thr = parseQty(npThr) ?? 1;
    if (!npName.trim() || !npCat) return;
    const { data, error } = await supabase
      .from('products')
      .insert({
        name: npName.trim(),
        category_id: npCat,
        unit: npUnit,
        allows_half: npHalf,
        low_stock_threshold: thr,
      })
      .select()
      .single();
    if (error || !data) return flash('Erro ao criar produto.');
    // activate in every location by default
    if (locations.length > 0) {
      await supabase
        .from('location_products')
        .upsert(locations.map((l) => ({ location_id: l.id, product_id: data.id, active: true })));
    }
    setNpName('');
    flash('Produto criado ✓');
    load();
  }

  async function addCategory() {
    if (!ncName.trim()) return;
    const maxSort = Math.max(0, ...categories.map((c) => c.sort_order));
    const { error } = await supabase
      .from('categories')
      .insert({ name: ncName.trim(), sort_order: maxSort + 1 });
    if (error) return flash('Erro ao criar categoria.');
    setNcName('');
    flash('Categoria criada ✓');
    load();
  }

  async function toggleLocProduct(productId: string, active: boolean) {
    const { error } = await supabase
      .from('location_products')
      .upsert({ location_id: locId, product_id: productId, active });
    if (error) return flash('Erro.');
    setLocProducts((lps) => {
      const rest = lps.filter((x) => !(x.location_id === locId && x.product_id === productId));
      return [...rest, { location_id: locId, product_id: productId, active }];
    });
  }

  const isActiveAt = (productId: string) =>
    locProducts.find((x) => x.location_id === locId && x.product_id === productId)?.active ?? false;

  const grouped = categories
    .map((c) => ({ cat: c, items: products.filter((p) => p.category_id === c.id) }))
    .filter((g) => g.items.length > 0);

  return (
    <main>
      <AdminHeader title="Produtos" />
      <div className="p-3 space-y-3 max-w-2xl mx-auto">
        {msg && (
          <div className="fixed top-16 inset-x-0 z-40 flex justify-center">
            <span className="bg-gray-900 text-white text-sm px-4 py-2 rounded-full">{msg}</span>
          </div>
        )}

        {/* mode selector */}
        <div className="card p-3">
          <label className="label">Modo</label>
          <select className="input" value={locId} onChange={(e) => setLocId(e.target.value)}>
            <option value="">Editar produtos (todas as lojas)</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                Ativação na loja: {l.name}
              </option>
            ))}
          </select>
        </div>

        {locId === '' && (
          <>
            <section className="card p-4 space-y-2">
              <h2 className="font-semibold text-sm">Novo produto</h2>
              <input className="input" placeholder="Nome" value={npName}
                onChange={(e) => setNpName(e.target.value)} />
              <div className="flex gap-2">
                <select className="input flex-1" value={npCat} onChange={(e) => setNpCat(e.target.value)}>
                  <option value="">Categoria…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <select className="input w-24" value={npUnit} onChange={(e) => setNpUnit(e.target.value)}>
                  {UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 items-center">
                <label className="flex items-center gap-1.5 text-sm flex-1">
                  <input type="checkbox" className="h-5 w-5" checked={npHalf}
                    onChange={(e) => setNpHalf(e.target.checked)} />
                  Permite ½
                </label>
                <input className="input w-28" inputMode="decimal" placeholder="Limite mín."
                  value={npThr} onChange={(e) => setNpThr(e.target.value)} />
                <button className="btn-secondary" onClick={addProduct}
                  disabled={!npName.trim() || !npCat}>
                  Criar
                </button>
              </div>
              <div className="flex gap-2 pt-2 border-t border-gray-100">
                <input className="input flex-1" placeholder="Nova categoria"
                  value={ncName} onChange={(e) => setNcName(e.target.value)} />
                <button className="btn-secondary" onClick={addCategory} disabled={!ncName.trim()}>
                  + Categoria
                </button>
              </div>
            </section>

            {grouped.map(({ cat, items }) => (
              <section key={cat.id} className="card overflow-hidden">
                <h2 className="px-3 py-2 bg-acai-50 font-semibold text-acai-900 text-sm">
                  {cat.name}
                </h2>
                <ul className="divide-y divide-gray-100">
                  {items.map((p) => (
                    <li key={p.id} className={`px-3 py-2.5 ${p.active ? '' : 'opacity-50'}`}>
                      <div className="flex items-center gap-2">
                        <span className="flex-1 text-sm font-medium">{p.name}</span>
                        <select
                          className="input py-1 px-1.5 w-16 text-sm"
                          value={p.unit}
                          onChange={(e) => saveProduct(p, { unit: e.target.value as Product['unit'] })}
                        >
                          {UNITS.map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                        <label className="flex items-center gap-1 text-xs text-gray-500">
                          ½
                          <input type="checkbox" className="h-4 w-4" checked={p.allows_half}
                            onChange={(e) => saveProduct(p, { allows_half: e.target.checked })} />
                        </label>
                        <input
                          className="input py-1 px-1 w-14 text-right text-sm"
                          inputMode="decimal"
                          title="Limite de stock baixo"
                          defaultValue={fmtQty(p.low_stock_threshold)}
                          onBlur={(e) => {
                            const n = parseQty(e.target.value);
                            if (n !== null && n !== p.low_stock_threshold)
                              saveProduct(p, { low_stock_threshold: n });
                          }}
                        />
                        <button
                          className={`text-xs underline shrink-0 ${
                            p.active ? 'text-gray-400' : 'text-green-600'
                          }`}
                          onClick={() => saveProduct(p, { active: !p.active })}
                        >
                          {p.active ? 'desativar' : 'ativar'}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <p className="text-xs text-gray-400 px-1">
              Coluna numérica = limite de stock baixo. Produtos desativados desaparecem da contagem
              em todas as lojas, mas o histórico mantém-se.
            </p>
          </>
        )}

        {locId !== '' && (
          <>
            <p className="text-xs text-gray-400 px-1">
              Marque os produtos que esta loja conta. Desmarcados não aparecem na contagem desta
              loja.
            </p>
            {grouped
              .map(({ cat, items }) => ({ cat, items: items.filter((p) => p.active) }))
              .filter((g) => g.items.length > 0)
              .map(({ cat, items }) => (
                <section key={cat.id} className="card overflow-hidden">
                  <h2 className="px-3 py-2 bg-acai-50 font-semibold text-acai-900 text-sm">
                    {cat.name}
                  </h2>
                  <ul className="divide-y divide-gray-100">
                    {items.map((p) => (
                      <li key={p.id} className="px-3 py-2.5">
                        <label className="flex items-center gap-3 text-sm">
                          <input
                            type="checkbox"
                            className="h-5 w-5"
                            checked={isActiveAt(p.id)}
                            onChange={(e) => toggleLocProduct(p.id, e.target.checked)}
                          />
                          <span className="font-medium">{p.name}</span>
                          <span className="text-gray-400 text-xs ml-auto">{p.unit}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
          </>
        )}
      </div>
    </main>
  );
}
