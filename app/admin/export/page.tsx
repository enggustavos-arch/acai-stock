'use client';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { todayLisbon, addDays } from '@/lib/dates';
import AdminHeader from '@/components/AdminHeader';
import type { Category, DailyCount, Location, Product, Restock } from '@/lib/types';

export default function AdminExport() {
  const supabase = useMemo(() => createClient(), []);
  const today = todayLisbon();

  const [locations, setLocations] = useState<Location[]>([]);
  const [locId, setLocId] = useState('');
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('locations').select('*').order('name');
      const locs = (data ?? []) as Location[];
      setLocations(locs);
      if (locs.length > 0) setLocId(locs[0].id);
    })();
  }, [supabase]);

  async function exportCsv() {
    setBusy(true);
    setMsg(null);
    try {
      const prevDay = addDays(from, -1);
      const [catRes, prodRes, countRes, rsRes] = await Promise.all([
        supabase.from('categories').select('*').order('sort_order'),
        supabase.from('products').select('*'),
        supabase
          .from('daily_counts')
          .select('*, count_lines(*)')
          .eq('location_id', locId)
          .gte('date', prevDay)
          .lte('date', to)
          .order('date'),
        supabase
          .from('restocks')
          .select('*')
          .eq('location_id', locId)
          .gte('date', from)
          .lte('date', to),
      ]);
      const cats = (catRes.data ?? []) as Category[];
      const products = (prodRes.data ?? []) as Product[];
      const counts = (countRes.data ?? []) as DailyCount[];
      const restocks = (rsRes.data ?? []) as Restock[];
      const catName = (id: string) => cats.find((c) => c.id === id)?.name ?? '';
      const locName = locations.find((l) => l.id === locId)?.name ?? 'loja';

      const q = (s: string) => '"' + s.replace(/"/g, '""') + '"';
      const num = (n: number) => n.toString().replace('.', ','); // pt Excel decimals
      const rows: string[] = [
        ['Data', 'Loja', 'Categoria', 'Produto', 'Unidade', 'Ontem', 'Reposicao', 'Hoje', 'Consumo', 'Contado por'].join(';'),
      ];

      let d = from;
      while (d <= to) {
        const c = counts.find((x) => x.date === d);
        const prev = counts.find((x) => x.date === addDays(d, -1));
        if (c) {
          for (const line of c.count_lines ?? []) {
            const p = products.find((x) => x.id === line.product_id);
            if (!p) continue;
            const y = prev?.count_lines?.find((l) => l.product_id === p.id)?.quantity;
            const rs = restocks
              .filter((r) => r.date === d && r.product_id === p.id)
              .reduce((s, r) => s + Number(r.quantity), 0);
            const cons = y !== undefined ? y + rs - line.quantity : undefined;
            rows.push(
              [
                d,
                q(locName),
                q(catName(p.category_id)),
                q(p.name),
                p.unit,
                y !== undefined ? num(y) : '',
                num(rs),
                num(line.quantity),
                cons !== undefined ? num(cons) : '',
                q(c.counted_by),
              ].join(';')
            );
          }
        }
        d = addDays(d, 1);
      }

      if (rows.length === 1) {
        setMsg('Sem contagens neste período.');
        setBusy(false);
        return;
      }

      // BOM so Excel opens UTF-8 accents correctly; ';' separator for pt locale
      const blob = new Blob(['\uFEFF' + rows.join('\r\n')], {
        type: 'text/csv;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stock_${locName.replace(/\s+/g, '-')}_${from}_${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(`Exportado: ${rows.length - 1} linhas.`);
    } catch {
      setMsg('Erro ao exportar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <AdminHeader title="Exportar CSV" />
      <div className="p-3 max-w-lg mx-auto">
        <div className="card p-4 space-y-3">
          <div>
            <label className="label">Loja</label>
            <select className="input" value={locId} onChange={(e) => setLocId(e.target.value)}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="label">De</label>
              <input type="date" className="input" value={from} max={to}
                onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className="label">Até</label>
              <input type="date" className="input" value={to} max={today}
                onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <button className="btn-primary w-full" onClick={exportCsv} disabled={busy || !locId}>
            {busy ? 'A exportar…' : 'Descarregar CSV'}
          </button>
          {msg && <p className="text-sm text-center text-gray-600">{msg}</p>}
          <p className="text-xs text-gray-400">
            Separador «;» e vírgula decimal — abre diretamente no Excel em português.
          </p>
        </div>
      </div>
    </main>
  );
}
