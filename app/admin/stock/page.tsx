'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { todayLisbon, addDays } from '@/lib/dates';
import { parseQty, fmtQty } from '@/lib/num';
import AdminHeader from '@/components/AdminHeader';
import type { Category, DailyCount, Location, Product, Restock } from '@/lib/types';

export default function AdminStock() {
  const supabase = useMemo(() => createClient(), []);
  const today = todayLisbon();

  const [locations, setLocations] = useState<Location[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locId, setLocId] = useState('');
  const [date, setDate] = useState(today);
  const [products, setProducts] = useState<Product[]>([]);
  const [count, setCount] = useState<DailyCount | null>(null);
  const [prevCount, setPrevCount] = useState<DailyCount | null>(null);
  const [restocks, setRestocks] = useState<Restock[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editQty, setEditQty] = useState<Record<string, string>>({});
  const [editRs, setEditRs] = useState<Record<string, string>>({});
  const [rsDirty, setRsDirty] = useState(false);
  const [editBy, setEditBy] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // initial: locations + categories
  useEffect(() => {
    (async () => {
      const [locRes, catRes] = await Promise.all([
        supabase.from('locations').select('*').order('name'),
        supabase.from('categories').select('*').order('sort_order'),
      ]);
      const locs = (locRes.data ?? []) as Location[];
      setLocations(locs);
      setCategories((catRes.data ?? []) as Category[]);
      if (locs.length > 0) setLocId(locs[0].id);
    })();
  }, [supabase]);

  const load = useCallback(async () => {
    if (!locId || !date) return;
    setLoading(true);
    setMsg(null);
    setEditing(false);
    const prevDate = addDays(date, -1);
    const [prodRes, lpRes, countRes, rsRes] = await Promise.all([
      supabase.from('products').select('*').eq('active', true),
      supabase.from('location_products').select('*').eq('location_id', locId).eq('active', true),
      supabase
        .from('daily_counts')
        .select('*, count_lines(*)')
        .eq('location_id', locId)
        .in('date', [date, prevDate]),
      supabase.from('restocks').select('*').eq('location_id', locId).eq('date', date),
    ]);
    const activeIds = new Set((lpRes.data ?? []).map((r: any) => r.product_id));
    setProducts(((prodRes.data ?? []) as Product[]).filter((p) => activeIds.has(p.id)));
    const cs = (countRes.data ?? []) as DailyCount[];
    setCount(cs.find((c) => c.date === date) ?? null);
    setPrevCount(cs.find((c) => c.date === prevDate) ?? null);
    setRestocks((rsRes.data ?? []) as Restock[]);
    setLoading(false);
  }, [supabase, locId, date]);

  useEffect(() => {
    load();
  }, [load]);

  const lineBy = (c: DailyCount | null, pid: string) =>
    c?.count_lines?.find((l) => l.product_id === pid)?.quantity;

  const restockSum = (pid: string) =>
    restocks.filter((r) => r.product_id === pid).reduce((s, r) => s + Number(r.quantity), 0);

  function startEdit() {
    const q: Record<string, string> = {};
    const r: Record<string, string> = {};
    for (const p of products) {
      const v = lineBy(count, p.id);
      if (v !== undefined) q[p.id] = fmtQty(v);
      const rs = restockSum(p.id);
      if (rs > 0) r[p.id] = fmtQty(rs);
    }
    setEditQty(q);
    setEditRs(r);
    setRsDirty(false);
    setEditBy(count?.counted_by ?? 'Escritório');
    setEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    setMsg(null);
    try {
      const { data: dc, error: e1 } = await supabase
        .from('daily_counts')
        .upsert(
          {
            location_id: locId,
            date,
            counted_by: editBy.trim() || 'Escritório',
            submitted_at: new Date().toISOString(),
          },
          { onConflict: 'location_id,date' }
        )
        .select()
        .single();
      if (e1 || !dc) throw e1;
      const { error: e2 } = await supabase
        .from('count_lines')
        .delete()
        .eq('daily_count_id', dc.id);
      if (e2) throw e2;
      const lines = products
        .map((p) => ({ product_id: p.id, q: parseQty(editQty[p.id] ?? '') }))
        .filter((x) => x.q !== null)
        .map((x) => ({ daily_count_id: dc.id, product_id: x.product_id, quantity: x.q as number }));
      if (lines.length > 0) {
        const { error: e3 } = await supabase.from('count_lines').insert(lines);
        if (e3) throw e3;
      }
      // replace this date's restocks only if the Rep. column was touched
      if (rsDirty) {
        const { error: e4 } = await supabase
          .from('restocks')
          .delete()
          .eq('location_id', locId)
          .eq('date', date);
        if (e4) throw e4;
        const rsRows = products
          .map((p) => ({ pid: p.id, n: parseQty(editRs[p.id] ?? '') }))
          .filter((x) => x.n !== null && x.n > 0)
          .map((x) => ({
            location_id: locId,
            product_id: x.pid,
            date,
            quantity: x.n as number,
          }));
        if (rsRows.length > 0) {
          const { error: e5 } = await supabase.from('restocks').insert(rsRows);
          if (e5) throw e5;
        }
      }
      setMsg('Guardado ✓');
      await load();
    } catch {
      setMsg('Erro ao guardar.');
    } finally {
      setSaving(false);
    }
  }

  const grouped = categories
    .map((c) => ({
      cat: c,
      items: products
        .filter((p) => p.category_id === c.id)
        .sort((a, b) => a.name.localeCompare(b.name, 'pt')),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <main>
      <AdminHeader title="Stock e consumo" />
      <div className="p-3 space-y-3 max-w-2xl mx-auto">
        <div className="card p-3 flex gap-2">
          <select className="input flex-1" value={locId} onChange={(e) => setLocId(e.target.value)}>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="input flex-1"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        {loading ? (
          <p className="text-gray-400 text-center py-10">A carregar…</p>
        ) : (
          <>
            <div className="card p-3 text-sm flex items-center justify-between gap-2 flex-wrap">
              <div>
                {count ? (
                  <span>
                    Contado por <strong>{count.counted_by}</strong>
                    {count.prefill_missing && (
                      <span className="text-amber-600"> · sem contagem no dia anterior</span>
                    )}
                  </span>
                ) : (
                  <span className="text-red-600 font-medium">Sem contagem nesta data.</span>
                )}
                {!prevCount && (
                  <span className="text-gray-400 block text-xs">
                    Sem contagem no dia anterior → consumo não calculável.
                  </span>
                )}
              </div>
              {!editing ? (
                <button className="btn-secondary" onClick={startEdit}>
                  {count ? 'Editar' : 'Criar contagem'}
                </button>
              ) : (
                <div className="flex gap-2 items-center w-full">
                  <input
                    className="input flex-1"
                    value={editBy}
                    onChange={(e) => setEditBy(e.target.value)}
                    placeholder="Contado por"
                  />
                  <button className="btn-primary px-4 py-2.5" onClick={saveEdit} disabled={saving}>
                    {saving ? '…' : 'Guardar'}
                  </button>
                  <button className="btn-secondary" onClick={() => setEditing(false)}>
                    Cancelar
                  </button>
                </div>
              )}
              {msg && <span className="text-sm">{msg}</span>}
            </div>

            {grouped.map(({ cat, items }) => (
              <section key={cat.id} className="card overflow-hidden">
                <h2 className="px-3 py-2 bg-acai-50 font-semibold text-acai-900 text-sm">
                  {cat.name}
                </h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 text-xs">
                      <th className="text-left px-3 py-1.5 font-medium">Produto</th>
                      <th className="text-right px-1 py-1.5 font-medium">Ontem</th>
                      <th className="text-right px-1 py-1.5 font-medium">Rep.</th>
                      <th className="text-right px-1 py-1.5 font-medium">Hoje</th>
                      <th className="text-right px-3 py-1.5 font-medium">Consumo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((p) => {
                      const y = lineBy(prevCount, p.id);
                      const t = lineBy(count, p.id);
                      const rs = restockSum(p.id);
                      const cons =
                        y !== undefined && t !== undefined ? y + rs - t : undefined;
                      const low = t !== undefined && t <= p.low_stock_threshold;
                      return (
                        <tr key={p.id} className={low ? 'bg-red-50' : ''}>
                          <td className="px-3 py-2">
                            {p.name}
                            <span className="text-gray-400 text-xs"> {p.unit}</span>
                          </td>
                          <td className="text-right px-1 py-2 text-gray-500">
                            {y !== undefined ? fmtQty(y) : '—'}
                          </td>
                          <td className="text-right px-1 py-2 text-gray-500">
                            {editing ? (
                              <input
                                className="input py-1 px-1 w-14 text-right text-sm"
                                inputMode="decimal"
                                placeholder="0"
                                value={editRs[p.id] ?? ''}
                                onChange={(e) => {
                                  setRsDirty(true);
                                  setEditRs((q) => ({ ...q, [p.id]: e.target.value }));
                                }}
                              />
                            ) : rs > 0 ? (
                              '+' + fmtQty(rs)
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="text-right px-1 py-2">
                            {editing ? (
                              <input
                                className="input py-1 px-1 w-16 text-right text-sm"
                                inputMode="decimal"
                                value={editQty[p.id] ?? ''}
                                onChange={(e) =>
                                  setEditQty((q) => ({ ...q, [p.id]: e.target.value }))
                                }
                              />
                            ) : (
                              <span className={low ? 'text-red-600 font-bold' : 'font-semibold'}>
                                {t !== undefined ? fmtQty(t) : '—'}
                              </span>
                            )}
                          </td>
                          <td
                            className={`text-right px-3 py-2 font-semibold ${
                              cons !== undefined && cons < 0 ? 'text-red-600' : 'text-gray-700'
                            }`}
                          >
                            {cons !== undefined ? fmtQty(cons) : '—'}
                            {cons !== undefined && cons < 0 ? ' ⚠️' : ''}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            ))}
          </>
        )}
      </div>
    </main>
  );
}
