'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { todayLisbon, addDays } from '@/lib/dates';
import { fmtQty } from '@/lib/num';
import AdminHeader from '@/components/AdminHeader';
import type { DailyCount, Location, Product, Restock } from '@/lib/types';

interface DayPoint {
  date: string; // day whose consumption this is
  value: number | null; // null = not computable (missing count)
}

export default function AdminTrends() {
  const supabase = useMemo(() => createClient(), []);
  const today = todayLisbon();

  const [locations, setLocations] = useState<Location[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locId, setLocId] = useState('');
  const [productId, setProductId] = useState('');
  const [days, setDays] = useState<7 | 30>(7);
  const [counts, setCounts] = useState<DailyCount[]>([]);
  const [restocks, setRestocks] = useState<Restock[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const [locRes, prodRes] = await Promise.all([
        supabase.from('locations').select('*').eq('active', true).order('name'),
        supabase.from('products').select('*').eq('active', true).order('name'),
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
    const start = addDays(today, -days); // need day-before-window for first consumption
    const [cRes, rRes] = await Promise.all([
      supabase
        .from('daily_counts')
        .select('*, count_lines(*)')
        .eq('location_id', locId)
        .gte('date', start)
        .lte('date', today),
      supabase
        .from('restocks')
        .select('*')
        .eq('location_id', locId)
        .gte('date', start)
        .lte('date', today),
    ]);
    setCounts((cRes.data ?? []) as DailyCount[]);
    setRestocks((rRes.data ?? []) as Restock[]);
    setLoading(false);
  }, [supabase, locId, days, today]);

  useEffect(() => {
    load();
  }, [load]);

  // consumption for product pid on day d: count(d-1) + restocks(d) − count(d)
  const consumptionOn = useCallback(
    (pid: string, d: string): number | null => {
      const c = counts.find((x) => x.date === d);
      const prev = counts.find((x) => x.date === addDays(d, -1));
      if (!c || !prev) return null;
      const t = c.count_lines?.find((l) => l.product_id === pid)?.quantity;
      const y = prev.count_lines?.find((l) => l.product_id === pid)?.quantity;
      if (t === undefined || y === undefined) return null;
      const rs = restocks
        .filter((r) => r.date === d && r.product_id === pid)
        .reduce((s, r) => s + Number(r.quantity), 0);
      return y + rs - t;
    },
    [counts, restocks]
  );

  const windowDays: string[] = useMemo(() => {
    const arr: string[] = [];
    for (let i = days - 1; i >= 0; i--) arr.push(addDays(today, -i));
    return arr;
  }, [days, today]);

  const series: DayPoint[] = useMemo(() => {
    if (!productId) return [];
    return windowDays.map((d) => ({ date: d, value: consumptionOn(productId, d) }));
  }, [productId, windowDays, consumptionOn]);

  // totals table across all products
  const totals = useMemo(() => {
    const map = new Map<string, { total: number; days: number }>();
    for (const p of products) {
      let total = 0;
      let n = 0;
      for (const d of windowDays) {
        const v = consumptionOn(p.id, d);
        if (v !== null) {
          total += v;
          n++;
        }
      }
      if (n > 0) map.set(p.id, { total, days: n });
    }
    return [...map.entries()]
      .map(([pid, t]) => ({
        product: products.find((p) => p.id === pid)!,
        ...t,
      }))
      .sort((a, b) => b.total - a.total);
  }, [products, windowDays, consumptionOn]);

  const selProduct = products.find((p) => p.id === productId);

  // --- chart geometry ---
  const W = 360;
  const H = 160;
  const PAD = { l: 30, r: 6, t: 10, b: 22 };
  const values = series.map((s) => s.value).filter((v): v is number => v !== null);
  const maxV = Math.max(1, ...values.map((v) => Math.abs(v)));
  const hasNeg = values.some((v) => v < 0);
  const zeroY = hasNeg
    ? PAD.t + (H - PAD.t - PAD.b) / 2
    : H - PAD.b;
  const scale = (v: number) =>
    (Math.abs(v) / maxV) * (hasNeg ? (H - PAD.t - PAD.b) / 2 : H - PAD.t - PAD.b);
  const bw = (W - PAD.l - PAD.r) / series.length;

  return (
    <main>
      <AdminHeader title="Consumo" subtitle="ontem + reposição − hoje" />
      <div className="p-3 space-y-3 max-w-2xl mx-auto">
        <div className="card p-3 space-y-2">
          <div className="flex gap-2">
            <select className="input flex-1" value={locId} onChange={(e) => setLocId(e.target.value)}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <div className="flex rounded-xl overflow-hidden border border-gray-300">
              {([7, 30] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-4 text-sm font-semibold ${
                    days === d ? 'bg-acai-600 text-white' : 'bg-white text-gray-600'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
          <select
            className="input"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">Escolher produto para o gráfico…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {loading && <p className="text-gray-400 text-center py-6">A carregar…</p>}

        {!loading && selProduct && (
          <section className="card p-4">
            <h2 className="font-semibold mb-1">
              {selProduct.name}{' '}
              <span className="text-gray-400 font-normal text-sm">
                consumo diário ({selProduct.unit})
              </span>
            </h2>
            {values.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">
                Sem dados suficientes (são precisas contagens em dias consecutivos).
              </p>
            ) : (
              <>
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
                  aria-label={`Consumo diário de ${selProduct.name}`}>
                  {/* y max labels */}
                  <text x={PAD.l - 4} y={PAD.t + 8} textAnchor="end" fontSize="9" fill="#9ca3af">
                    {fmtQty(maxV)}
                  </text>
                  <text x={PAD.l - 4} y={zeroY + 3} textAnchor="end" fontSize="9" fill="#9ca3af">
                    0
                  </text>
                  {/* zero axis */}
                  <line x1={PAD.l} x2={W - PAD.r} y1={zeroY} y2={zeroY} stroke="#e5e7eb" />
                  {series.map((s, i) => {
                    const x = PAD.l + i * bw + bw * 0.15;
                    const w = bw * 0.7;
                    if (s.value === null) {
                      return (
                        <rect key={s.date} x={x} y={zeroY - 1} width={w} height={2}
                          fill="#e5e7eb" />
                      );
                    }
                    const h = scale(s.value);
                    const neg = s.value < 0;
                    return (
                      <rect
                        key={s.date}
                        x={x}
                        y={neg ? zeroY : zeroY - h}
                        width={w}
                        height={Math.max(h, 1)}
                        rx={2}
                        fill={neg ? '#dc2626' : '#7c3aed'}
                      />
                    );
                  })}
                  {/* x labels: first, middle, last */}
                  {[0, Math.floor(series.length / 2), series.length - 1].map((i) => (
                    <text
                      key={i}
                      x={PAD.l + i * bw + bw / 2}
                      y={H - 6}
                      textAnchor="middle"
                      fontSize="9"
                      fill="#9ca3af"
                    >
                      {series[i].date.slice(8, 10) + '/' + series[i].date.slice(5, 7)}
                    </text>
                  ))}
                </svg>
                <p className="text-xs text-gray-500 mt-2">
                  Total: <strong>{fmtQty(values.reduce((a, b) => a + b, 0))}</strong> · Média/dia:{' '}
                  <strong>{fmtQty(values.reduce((a, b) => a + b, 0) / values.length)}</strong>
                  {values.length < series.length &&
                    ` · ${series.length - values.length} dia(s) sem dados (traço cinzento)`}
                </p>
              </>
            )}
          </section>
        )}

        {!loading && (
          <section className="card p-4">
            <h2 className="font-semibold mb-2">Consumo total · últimos {days} dias</h2>
            {totals.length === 0 ? (
              <p className="text-sm text-gray-400">
                Sem dados — são precisas contagens em dias consecutivos.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 text-sm">
                {totals.map(({ product, total, days: n }) => (
                  <li
                    key={product.id}
                    className="py-2 flex justify-between items-center cursor-pointer"
                    onClick={() => setProductId(product.id)}
                  >
                    <span>
                      {product.name}
                      <span className="text-gray-400 text-xs"> · {n} dia(s)</span>
                    </span>
                    <span className={`font-semibold ${total < 0 ? 'text-red-600' : ''}`}>
                      {fmtQty(total)} {product.unit}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
