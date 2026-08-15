'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { todayLisbon, addDays, displayDate } from '@/lib/dates';
import { parseQty, fmtQty } from '@/lib/num';
import AdminHeader from '@/components/AdminHeader';
import type { DailyCount, Location, Product, Restock, SaleDaily } from '@/lib/types';

// NOTE: there's no POS/sales system connected yet. Sales are entered here
// manually (or pasted as CSV) until we wire up the real export — ask
// whoever owns that export what its columns look like and we'll build a
// proper importer instead of this placeholder.

export default function AdminAnalytics() {
  const supabase = useMemo(() => createClient(), []);
  const today = todayLisbon();

  const [locations, setLocations] = useState<Location[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locId, setLocId] = useState('');
  const [productId, setProductId] = useState('');
  const [days, setDays] = useState<7 | 30>(7);
  const [counts, setCounts] = useState<DailyCount[]>([]);
  const [restocks, setRestocks] = useState<Restock[]>([]);
  const [sales, setSales] = useState<SaleDaily[]>([]);
  const [loading, setLoading] = useState(false);

  // manual entry form
  const [feDate, setFeDate] = useState(today);
  const [feAmount, setFeAmount] = useState('');
  const [feMsg, setFeMsg] = useState<string | null>(null);

  // CSV paste import
  const [csv, setCsv] = useState('');
  const [csvMsg, setCsvMsg] = useState<string | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);

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
    const start = addDays(today, -days);
    const [cRes, rRes, sRes] = await Promise.all([
      supabase
        .from('daily_counts')
        .select('*, count_lines(*)')
        .eq('location_id', locId)
        .gte('date', start)
        .lte('date', today),
      supabase.from('restocks').select('*').eq('location_id', locId).gte('date', start).lte('date', today),
      supabase
        .from('sales_daily')
        .select('*')
        .eq('location_id', locId)
        .gte('date', start)
        .lte('date', today)
        .order('date'),
    ]);
    setCounts((cRes.data ?? []) as DailyCount[]);
    setRestocks((rRes.data ?? []) as Restock[]);
    setSales((sRes.data ?? []) as SaleDaily[]);
    setLoading(false);
  }, [supabase, locId, days, today]);

  useEffect(() => {
    load();
  }, [load]);

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

  const salesSeries = useMemo(
    () => windowDays.map((d) => sales.find((s) => s.date === d)?.amount ?? null),
    [windowDays, sales]
  );
  const consSeries = useMemo(
    () => (productId ? windowDays.map((d) => consumptionOn(productId, d)) : []),
    [windowDays, productId, consumptionOn]
  );

  async function saveManualSale() {
    setFeMsg(null);
    const amount = parseQty(feAmount);
    if (amount === null) return setFeMsg('Valor inválido.');
    const { error } = await supabase
      .from('sales_daily')
      .upsert({ location_id: locId, date: feDate, amount }, { onConflict: 'location_id,date' });
    if (error) return setFeMsg('Erro ao guardar.');
    setFeAmount('');
    setFeMsg('Guardado ✓');
    load();
  }

  async function importCsv() {
    setCsvBusy(true);
    setCsvMsg(null);
    try {
      // expected: date;location_name;amount  (one per line, ; separated, comma or dot decimal)
      const rows = csv
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => l.split(';').map((c) => c.trim()));
      const byName = new Map(locations.map((l) => [l.name.toLowerCase(), l.id]));
      const toInsert: { location_id: string; date: string; amount: number }[] = [];
      const errors: string[] = [];
      for (const [i, r] of rows.entries()) {
        if (r.length < 3) {
          errors.push(`Linha ${i + 1}: esperado "data;loja;valor"`);
          continue;
        }
        const [dateRaw, locName, amountRaw] = r;
        const locationId = byName.get(locName.toLowerCase());
        const amount = parseQty(amountRaw);
        if (!locationId) {
          errors.push(`Linha ${i + 1}: loja "${locName}" não encontrada`);
          continue;
        }
        if (amount === null) {
          errors.push(`Linha ${i + 1}: valor inválido "${amountRaw}"`);
          continue;
        }
        toInsert.push({ location_id: locationId, date: dateRaw, amount });
      }
      if (toInsert.length > 0) {
        const { error } = await supabase
          .from('sales_daily')
          .upsert(toInsert, { onConflict: 'location_id,date' });
        if (error) errors.push('Erro ao guardar no servidor.');
      }
      setCsvMsg(
        `${toInsert.length} linha(s) importada(s)` + (errors.length ? ` · ${errors.length} erro(s): ${errors.slice(0, 3).join('; ')}` : ' ✓')
      );
      if (errors.length === 0) setCsv('');
      load();
    } finally {
      setCsvBusy(false);
    }
  }

  const selProduct = products.find((p) => p.id === productId);

  // --- shared bar-chart geometry ---
  const W = 360;
  const H = 130;
  const PAD = { l: 34, r: 6, t: 10, b: 20 };

  function BarChart({
    series,
    color,
    unitLabel,
  }: {
    series: (number | null)[];
    color: string;
    unitLabel: string;
  }) {
    const values = series.filter((v): v is number => v !== null);
    const maxV = Math.max(1, ...values.map((v) => Math.abs(v)));
    const bw = (W - PAD.l - PAD.r) / series.length;
    const total = values.reduce((a, b) => a + b, 0);
    return (
      <>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={unitLabel}>
          <text x={PAD.l - 4} y={PAD.t + 8} textAnchor="end" fontSize="9" fill="#9ca3af">
            {fmtQty(maxV)}
          </text>
          <text x={PAD.l - 4} y={H - PAD.b + 3} textAnchor="end" fontSize="9" fill="#9ca3af">
            0
          </text>
          <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="#e5e7eb" />
          {series.map((v, i) => {
            const x = PAD.l + i * bw + bw * 0.15;
            const w = bw * 0.7;
            if (v === null) {
              return <rect key={i} x={x} y={H - PAD.b - 1} width={w} height={2} fill="#e5e7eb" />;
            }
            const h = (Math.abs(v) / maxV) * (H - PAD.t - PAD.b);
            return <rect key={i} x={x} y={H - PAD.b - h} width={w} height={Math.max(h, 1)} rx={2} fill={color} />;
          })}
          {[0, Math.floor(series.length / 2), series.length - 1].map((i) => (
            <text key={i} x={PAD.l + i * bw + bw / 2} y={H - 4} textAnchor="middle" fontSize="9" fill="#9ca3af">
              {windowDays[i].slice(8, 10) + '/' + windowDays[i].slice(5, 7)}
            </text>
          ))}
        </svg>
        <p className="text-xs text-gray-500 mt-1">
          Total: <strong>{fmtQty(total)}</strong> {unitLabel}
          {values.length < series.length && ` · ${series.length - values.length} dia(s) sem dados`}
        </p>
      </>
    );
  }

  return (
    <main>
      <AdminHeader title="Análise" subtitle="Vendas vs. consumo de stock" />
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
        </div>

        {loading && <p className="text-gray-400 text-center py-6">A carregar…</p>}

        {!loading && (
          <section className="card p-4">
            <h2 className="font-semibold mb-1">
              Vendas <span className="text-gray-400 font-normal text-sm">por dia</span>
            </h2>
            {sales.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">
                Sem vendas registadas neste período — adicione abaixo.
              </p>
            ) : (
              <BarChart series={salesSeries} color="#059669" unitLabel="€" />
            )}
          </section>
        )}

        {!loading && (
          <section className="card p-4">
            <h2 className="font-semibold mb-1">
              Consumo de stock <span className="text-gray-400 font-normal text-sm">por dia</span>
            </h2>
            <select className="input mb-2" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Escolher produto para comparar…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {productId ? (
              <BarChart series={consSeries} color="#7c3aed" unitLabel={selProduct?.unit ?? ''} />
            ) : (
              <p className="text-sm text-gray-400 py-4 text-center">
                Escolha um produto para ver o consumo ao lado das vendas.
              </p>
            )}
          </section>
        )}

        <section className="card p-4 space-y-2">
          <h2 className="font-semibold text-sm">Registar venda do dia</h2>
          <div className="flex gap-2">
            <input
              type="date"
              className="input flex-1"
              value={feDate}
              max={today}
              onChange={(e) => setFeDate(e.target.value)}
            />
            <input
              className="input w-28"
              inputMode="decimal"
              placeholder="€ vendas"
              value={feAmount}
              onChange={(e) => setFeAmount(e.target.value)}
            />
            <button className="btn-secondary" onClick={saveManualSale} disabled={!feAmount.trim()}>
              Guardar
            </button>
          </div>
          {feMsg && <p className="text-sm">{feMsg}</p>}
        </section>

        <section className="card p-4 space-y-2">
          <h2 className="font-semibold text-sm">Importar CSV de vendas</h2>
          <p className="text-xs text-gray-500">
            Uma linha por dia: <code>data;loja;valor</code> (ex.: <code>2026-08-10;Algarve Shopping;432,50</code>).
            Isto é temporário — assim que tivermos o formato real do relatório de vendas, eu construo a
            importação certa.
          </p>
          <textarea
            className="input min-h-24 font-mono text-xs"
            placeholder="2026-08-10;Algarve Shopping;432,50"
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
          />
          <button className="btn-secondary" onClick={importCsv} disabled={csvBusy || !csv.trim()}>
            {csvBusy ? 'A importar…' : 'Importar'}
          </button>
          {csvMsg && <p className="text-sm">{csvMsg}</p>}
        </section>

        {!loading && sales.length > 0 && (
          <section className="card p-4">
            <h2 className="font-semibold mb-2 text-sm">Vendas registadas · {locations.find((l) => l.id === locId)?.name}</h2>
            <ul className="divide-y divide-gray-100 text-sm">
              {[...sales].reverse().map((s) => (
                <li key={s.id} className="py-2 flex justify-between">
                  <span>{displayDate(s.date)}</span>
                  <span className="font-semibold">{fmtQty(s.amount)} €</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
