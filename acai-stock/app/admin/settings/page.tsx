'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import AdminHeader from '@/components/AdminHeader';
import type { Location } from '@/lib/types';

export default function AdminSettings() {
  const supabase = useMemo(() => createClient(), []);
  const [cutoff, setCutoff] = useState('11:00');
  const [locations, setLocations] = useState<Location[]>([]);
  const [newLoc, setNewLoc] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [setRes, locRes] = await Promise.all([
      supabase.from('settings').select('*').single(),
      supabase.from('locations').select('*').order('name'),
    ]);
    setCutoff(String((setRes.data as any)?.cutoff_time ?? '11:00').slice(0, 5));
    setLocations((locRes.data ?? []) as Location[]);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  function flash(m: string) {
    setMsg(m);
    setTimeout(() => setMsg(null), 2000);
  }

  async function saveCutoff() {
    const { error } = await supabase.from('settings').update({ cutoff_time: cutoff }).eq('id', 1);
    flash(error ? 'Erro.' : 'Guardado ✓');
  }

  async function addLocation() {
    if (!newLoc.trim()) return;
    const { data, error } = await supabase
      .from('locations')
      .insert({ name: newLoc.trim() })
      .select()
      .single();
    if (error || !data) return flash('Erro ao criar loja.');
    // activate all active products for the new location
    const { data: prods } = await supabase.from('products').select('id').eq('active', true);
    if (prods && prods.length > 0) {
      await supabase
        .from('location_products')
        .insert(prods.map((p: any) => ({ location_id: data.id, product_id: p.id, active: true })));
    }
    setNewLoc('');
    flash('Loja criada ✓ — crie o login em Supabase (ver README)');
    load();
  }

  async function toggleLocation(l: Location) {
    const { error } = await supabase
      .from('locations')
      .update({ active: !l.active })
      .eq('id', l.id);
    if (!error) load();
  }

  return (
    <main>
      <AdminHeader title="Definições" />
      <div className="p-3 space-y-3 max-w-lg mx-auto">
        {msg && (
          <div className="fixed top-16 inset-x-0 z-40 flex justify-center">
            <span className="bg-gray-900 text-white text-sm px-4 py-2 rounded-full">{msg}</span>
          </div>
        )}

        <section className="card p-4 space-y-2">
          <h2 className="font-semibold">Hora limite da contagem</h2>
          <p className="text-sm text-gray-500">
            Depois desta hora (hora de Portugal), lojas sem contagem aparecem a vermelho no painel.
          </p>
          <div className="flex gap-2">
            <input type="time" className="input flex-1" value={cutoff}
              onChange={(e) => setCutoff(e.target.value)} />
            <button className="btn-secondary" onClick={saveCutoff}>Guardar</button>
          </div>
        </section>

        <section className="card p-4 space-y-2">
          <h2 className="font-semibold">Lojas</h2>
          <ul className="divide-y divide-gray-100 text-sm">
            {locations.map((l) => (
              <li key={l.id} className="py-2 flex items-center justify-between">
                <span className={l.active ? 'font-medium' : 'text-gray-400 line-through'}>
                  {l.name}
                </span>
                <button className="text-xs underline text-gray-500" onClick={() => toggleLocation(l)}>
                  {l.active ? 'desativar' : 'ativar'}
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <input className="input flex-1" placeholder="Nova loja (ex.: Loja Praia)"
              value={newLoc} onChange={(e) => setNewLoc(e.target.value)} />
            <button className="btn-secondary" onClick={addLocation} disabled={!newLoc.trim()}>
              Criar
            </button>
          </div>
          <p className="text-xs text-gray-400">
            Depois de criar uma loja, crie o login partilhado dela no Supabase e ligue-o com a
            tabela <code>profiles</code> — passos no README.
          </p>
        </section>
      </div>
    </main>
  );
}
