'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { todayLisbon, addDays, displayDate, nowTimeLisbon } from '@/lib/dates';
import { fmtQty } from '@/lib/num';
import AdminHeader from '@/components/AdminHeader';
import type { DailyCount, Location, Product, Restock } from '@/lib/types';

interface LowItem {
  locationName: string;
  productName: string;
  unit: string;
  qty: number;
  threshold: number;
  countDate: string;
}
interface NegItem {
  locationName: string;
  productName: string;
  consumption: number;
}

export default function AdminOverview() {
  const supabase = useMemo(() => createClient(), []);
  const today = todayLisbon();
  const yesterday = addDays(today, -1);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [counts, setCounts] = useState<DailyCount[]>([]);
  const [lowStock, setLowStock] = useState<LowItem[]>([]);
  const [negatives, setNegatives] = useState<NegItem[]>([]);
  const [cutoff, setCutoff] = useState('11:00');

  useEffect(() => {
    (async () => {
      try {
        const [locRes, setRes, prodRes, countRes, rsRes] = await Promise.all([
          supabase.from('locations').select('*').eq('active', true).order('name'),
          supabase.from('settings').select('*').single(),
          supabase.from('products').select('*').eq('active', true),
          supabase
            .from('daily_counts')
            .select('*, count_lines(*)')
            .in('date', [today, yesterday]),
          supabase.from('restocks').select('*').eq('date', today),
        ]);
        const err = locRes.error || setRes.error || prodRes.error || countRes.error || rsRes.error;
        if (err) throw err;

        const locs = (locRes.data ?? []) as Location[];
        const products = (prodRes.data ?? []) as Product[];
        const allCounts = (countRes.data ?? []) as DailyCount[];
        const restocks = (rsRes.data ?? []) as Restock[];
        const pById = new Map(products.map((p) => [p.id, p]));
        const cutoffTime = String((setRes.data as any)?.cutoff_time ?? '11:00').slice(0, 5);

        const low: LowItem[] = [];
        const neg: NegItem[] = [];
        for (const loc of locs) {
          const tCount = allCounts.find((c) => c.location_id === loc.id && c.date === today);
          const yCount = allCounts.find((c) => c.location_id === loc.id && c.date === yesterday);
          const latest = tCount ?? yCount;
          if (latest) {
            for (const l of latest.count_lines ?? []) {
              const p = pById.get(l.product_id);
              if (p && l.quantity <= p.low_stock_threshold) {
                low.push({
                  locationName: loc.name,
                  productName: p.name,
                  unit: p.unit,
                  qty: l.quantity,
                  threshold: p.low_stock_threshold,
                  countDate: latest.date,
                });
              }
            }
          }
          if (tCount && yCount) {
            const yBy = new Map((yCount.count_lines ?? []).map((l) => [l.product_id, l.quantity]));
            for (const l of tCount.count_lines ?? []) {
              const yq = yBy.get(l.product_id);
              if (yq === undefined) continue;
              const rs = restocks
                .filter((r) => r.location_id === loc.id && r.product_id === l.product_id)
                .reduce((s, r) => s + Number(r.quantity), 0);
              const cons = yq + rs - l.quantity;
              if (cons < 0) {
                neg.push({
                  locationName: loc.name,
                  productName: pById.get(l.product_id)?.name ?? '?',
                  consumption: cons,
                });
              }
            }
          }
        }
        low.sort((a, b) => a.qty - a.threshold - (b.qty - b.threshold));

        setLocations(locs);
        setCounts(allCounts);
        setLowStock(low);
        setNegatives(neg);
        setCutoff(cutoffTime);
      } catch (e) {
        setError('Não foi possível carregar o painel.');
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase, today, yesterday]);

  const pastCutoff = nowTimeLisbon() >= cutoff;
  const missing = locations.filter(
    (l) => !counts.some((c) => c.location_id === l.id && c.date === today)
  );
  const flaggedPrefill = counts.filter((c) => c.date === today && c.prefill_missing);
  const locName = (id: string) => locations.find((l) => l.id === id)?.name ?? '?';

  return (
    <main>
      <AdminHeader title="Painel" subtitle={`Hoje · ${displayDate(today)}`} />
      <div className="p-3 space-y-3 max-w-lg mx-auto">
        {loading && <p className="text-gray-400 text-center py-10">A carregar…</p>}
        {error && <p className="text-red-600 text-center py-10">{error}</p>}
        {!loading && !error && (
          <>
            {/* missing counts */}
            {missing.length > 0 ? (
              <section
                className={`card p-4 border-2 ${
                  pastCutoff ? 'border-red-400 bg-red-50' : 'border-amber-300 bg-amber-50'
                }`}
              >
                <h2 className={`font-bold ${pastCutoff ? 'text-red-700' : 'text-amber-700'}`}>
                  {pastCutoff
                    ? `⚠️ Sem contagem hoje (limite ${cutoff})`
                    : `Ainda sem contagem hoje (limite ${cutoff})`}
                </h2>
                <ul className="mt-2 space-y-1 text-sm">
                  {missing.map((l) => (
                    <li key={l.id} className="font-medium">
                      {l.name}
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              <section className="card p-4 border-2 border-green-300 bg-green-50">
                <h2 className="font-bold text-green-700">✓ Todas as lojas contaram hoje</h2>
              </section>
            )}

            {/* prefill-missing flags */}
            {flaggedPrefill.length > 0 && (
              <section className="card p-4 bg-amber-50 border-amber-200">
                <h2 className="font-semibold text-amber-800 text-sm">
                  Contagens de hoje feitas sem contagem de ontem (valores do zero):
                </h2>
                <p className="text-sm mt-1">
                  {flaggedPrefill.map((c) => locName(c.location_id)).join(', ')}
                </p>
              </section>
            )}

            {/* low stock */}
            <section className="card p-4">
              <h2 className="font-bold text-red-600 mb-2">
                🔴 Stock baixo ({lowStock.length})
              </h2>
              {lowStock.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum produto abaixo do limite.</p>
              ) : (
                <ul className="divide-y divide-gray-100 text-sm">
                  {lowStock.map((it, i) => (
                    <li key={i} className="py-2 flex items-center justify-between gap-2">
                      <span>
                        <strong>{it.productName}</strong>
                        <span className="text-gray-400"> · {it.locationName}</span>
                        {it.countDate !== today && (
                          <span className="text-amber-600 text-xs"> (contagem de ontem)</span>
                        )}
                      </span>
                      <span className="text-red-600 font-semibold shrink-0">
                        {fmtQty(it.qty)} {it.unit}
                        <span className="text-gray-400 font-normal"> / lim. {fmtQty(it.threshold)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* negative consumption */}
            {negatives.length > 0 && (
              <section className="card p-4 border-2 border-red-300">
                <h2 className="font-bold text-red-600 mb-1">⚠️ Consumo negativo hoje</h2>
                <p className="text-xs text-gray-500 mb-2">
                  Hoje contou-se mais do que ontem + reposições → provável erro de contagem ou
                  reposição não registada.
                </p>
                <ul className="divide-y divide-gray-100 text-sm">
                  {negatives.map((n, i) => (
                    <li key={i} className="py-2 flex justify-between">
                      <span>
                        <strong>{n.productName}</strong>
                        <span className="text-gray-400"> · {n.locationName}</span>
                      </span>
                      <span className="text-red-600 font-semibold">{fmtQty(n.consumption)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* submissions today */}
            <section className="card p-4">
              <h2 className="font-semibold mb-2">Contagens de hoje</h2>
              <ul className="divide-y divide-gray-100 text-sm">
                {locations.map((l) => {
                  const c = counts.find((x) => x.location_id === l.id && x.date === today);
                  return (
                    <li key={l.id} className="py-2 flex justify-between items-center">
                      <span className="font-medium">{l.name}</span>
                      {c ? (
                        <span className="text-green-700">
                          ✓ {c.counted_by} ·{' '}
                          {new Date(c.submitted_at).toLocaleTimeString('pt-PT', {
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: 'Europe/Lisbon',
                          })}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <Link href="/admin/stock" className="btn-secondary w-full mt-3">
                Ver stock por loja →
              </Link>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
