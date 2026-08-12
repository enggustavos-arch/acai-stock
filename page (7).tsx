'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { todayLisbon, addDays, displayDate } from '@/lib/dates';
import { parseQty, fmtQty } from '@/lib/num';
import AdminHeader from '@/components/AdminHeader';
import type { Location, Product, Restock } from '@/lib/types';

export default function AdminRestocks() {
  const supabase = useMemo(() => createClient(), []);
  const today = todayLisbon();

  const [locations, setLocations] = useState<Location[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locId, setLocId] = useState('');
  const [from, setFrom] = useState(addDays(today, -13));
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<Restock[]>([]);
  const [loading, setLoading] = useState(false);
  // admin add form
  const [fProduct, setFProduct] = useState('');
  const [fDate, setFDate] = useState(today);
  const [fQty, setFQty] = useState('');
  const [fNote, setFNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [locRes, prodRes] = await Promise.all([
        supabase.from('locations').select('*').order('name'),
        supabase.from('products').select('*').order('name'),
      ]);
      const locs = (locRes.data ?? []) as Location[];
      setLocations(locs);
      setProducts((prodRes.data ?? []) as Product[]);
      if (locs.length > 0) setLocId(locs[0].id);
    })();
  }, [supabase]);

  const load = useCallback(async () => {
    if (!locId) return;
    setLoading(true);
    const { data } = await supabase
      .from('restocks')
      .select('*')
      .eq('location_id', locId)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false });
    setRows((data ?? []) as Restock[]);
    setLoading(false);
  }, [supabase, locId, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    const n = parseQty(fQty);
    if (!fProduct || n === null || n <= 0) return;
    setBusy(true);
    const { error } = await supabase.from('restocks').insert({
      location_id: locId,
      product_id: fProduct,
      date: fDate,
      quantity: n,
      note: fNote.trim() || null,
    });
    setBusy(false);
    if (!error) {
      setFQty('');
      setFNote('');
      load();
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Apagar esta reposição?')) return;
    const { error } = await supabase.from('restocks').delete().eq('id', id);
    if (!error) setRows((r) => r.filter((x) => x.id !== id));
  }

  const pName = (id: string) => products.find((p) => p.id === id)?.name ?? '?';

  return (
    <main>
      <AdminHeader title="Reposições" />
      <div className="p-3 space-y-3 max-w-2xl mx-auto">
        <div className="card p-3 space-y-2">
          <select className="input" value={locId} onChange={(e) => setLocId(e.target.value)}>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <input type="date" className="input flex-1" value={from} max={to}
              onChange={(e) => setFrom(e.target.value)} />
            <input type="date" className="input flex-1" value={to} max={today}
              onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <section className="card p-4">
          <h2 className="font-semibold mb-2 text-sm">Adicionar reposição (escritório)</h2>
          <div className="space-y-2">
            <div className="flex gap-2">
              <select className="input flex-1" value={fProduct}
                onChange={(e) => setFProduct(e.target.value)}>
                <option value="">Produto…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <input type="date" className="input w-40" value={fDate} max={today}
                onChange={(e) => setFDate(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <input className="input w-28" inputMode="decimal" placeholder="Qtd."
                value={fQty} onChange={(e) => setFQty(e.target.value)} />
              <input className="input flex-1" placeholder="Nota (opcional)"
                value={fNote} onChange={(e) => setFNote(e.target.value)} />
              <button className="btn-secondary shrink-0" onClick={add}
                disabled={busy || !fProduct || parseQty(fQty) === null}>
                Adicionar
              </button>
            </div>
          </div>
        </section>

        <section className="card p-4">
          <h2 className="font-semibold mb-2">Registo</h2>
          {loading ? (
            <p className="text-gray-400 text-sm">A carregar…</p>
          ) : rows.length === 0 ? (
            <p className="text-gray-400 text-sm">Sem reposições neste período.</p>
          ) : (
            <ul className="divide-y divide-gray-100 text-sm">
              {rows.map((r) => (
                <li key={r.id} className="py-2 flex items-center justify-between gap-2">
                  <span>
                    <span className="text-gray-400">{displayDate(r.date)}</span> ·{' '}
                    <strong>{fmtQty(r.quantity)}</strong> × {pName(r.product_id)}
                    {r.note ? <span className="text-gray-400"> — {r.note}</span> : null}
                  </span>
                  <button className="text-red-500 text-xs underline shrink-0"
                    onClick={() => remove(r.id)}>
                    apagar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
