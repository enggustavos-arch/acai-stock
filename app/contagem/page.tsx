'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { todayLisbon, addDays, displayDate } from '@/lib/dates';
import { parseQty, fmtQty } from '@/lib/num';
import type { Category, Product, Restock } from '@/lib/types';

type QtyMap = Record<string, string>;

interface LoadedData {
  locationId: string;
  locationName: string;
  categories: Category[];
  products: Product[];
  todayCountedBy: string | null;
  todaySubmittedAt: string | null;
  prefillMissing: boolean;
  initialQty: QtyMap;
  initialRestock: QtyMap;
}

export default function CountPage() {
  const supabase = useMemo(() => createClient(), []);
  const today = todayLisbon();

  const [data, setData] = useState<LoadedData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [qty, setQty] = useState<QtyMap>({});
  const [restockQty, setRestockQty] = useState<QtyMap>({});
  const [showRs, setShowRs] = useState<Record<string, boolean>>({});
  const rsDirty = useRef(false);
  const [countedBy, setCountedBy] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [online, setOnline] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const draftKey = useRef<string>('');

  // --- online/offline banner ---
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // --- load everything ---
  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userRes.user) throw new Error('auth');

      const { data: profile, error: pErr } = await supabase
        .from('profiles')
        .select('role, location_id, locations(name)')
        .eq('user_id', userRes.user.id)
        .single();
      if (pErr) throw new Error('Não foi possível carregar o perfil.');
      if (!profile?.location_id) {
        // admin/manager have no store — send them to the dashboard instead of erroring
        if (profile?.role === 'admin' || profile?.role === 'manager') {
          window.location.replace('/admin');
          return;
        }
        throw new Error('Sem loja associada a este utilizador.');
      }

      const locationId = profile.location_id as string;
      const locationName = (profile as any).locations?.name ?? '';
      const yesterday = addDays(today, -1);

      const [catsRes, prodsRes, lpRes, countsRes, rsRes] = await Promise.all([
        supabase.from('categories').select('*').order('sort_order'),
        supabase.from('products').select('*').eq('active', true),
        supabase.from('location_products').select('*').eq('location_id', locationId).eq('active', true),
        supabase
          .from('daily_counts')
          .select('*, count_lines(*)')
          .eq('location_id', locationId)
          .in('date', [today, yesterday]),
        supabase.from('restocks').select('*').eq('location_id', locationId).eq('date', today),
      ]);
      const firstErr = catsRes.error || prodsRes.error || lpRes.error || countsRes.error || rsRes.error;
      if (firstErr) throw firstErr;

      const activeIds = new Set((lpRes.data ?? []).map((r: any) => r.product_id));
      const products = ((prodsRes.data ?? []) as Product[]).filter((p) => activeIds.has(p.id));
      const todayCount = (countsRes.data ?? []).find((c: any) => c.date === today);
      const yCount = (countsRes.data ?? []).find((c: any) => c.date === yesterday);

      // Pre-fill priority: today's submitted count > yesterday's count > empty
      const initialQty: QtyMap = {};
      const source = todayCount ?? yCount;
      if (source) {
        for (const l of source.count_lines ?? []) {
          if (activeIds.has(l.product_id)) initialQty[l.product_id] = fmtQty(l.quantity);
        }
      }

      // today's restocks, summed per product
      const rsSums: Record<string, number> = {};
      for (const r of (rsRes.data ?? []) as Restock[]) {
        rsSums[r.product_id] = (rsSums[r.product_id] ?? 0) + Number(r.quantity);
      }
      const initialRestock: QtyMap = {};
      for (const [pid, n] of Object.entries(rsSums)) {
        if (n > 0) initialRestock[pid] = fmtQty(n);
      }

      setData({
        locationId,
        locationName,
        categories: (catsRes.data ?? []) as Category[],
        products,
        todayCountedBy: todayCount?.counted_by ?? null,
        todaySubmittedAt: todayCount?.submitted_at ?? null,
        prefillMissing: !todayCount && !yCount,
        initialQty,
        initialRestock,
      });
      setSubmittedAt(todayCount?.submitted_at ?? null);

      // Draft (kept on the phone) beats server pre-fill for today's typing
      draftKey.current = `acai-draft-${locationId}-${today}`;
      let applied = false;
      try {
        const raw = localStorage.getItem(draftKey.current);
        if (raw) {
          const draft = JSON.parse(raw);
          if (draft && typeof draft === 'object') {
            setQty({ ...initialQty, ...(draft.qty ?? {}) });
            setRestockQty({ ...initialRestock, ...(draft.rs ?? {}) });
            if (draft.rs && Object.keys(draft.rs).length > 0) rsDirty.current = true;
            setCountedBy(draft.countedBy ?? todayCount?.counted_by ?? '');
            applied = true;
          }
        }
      } catch {}
      if (!applied) {
        setQty(initialQty);
        setRestockQty(initialRestock);
        setCountedBy(todayCount?.counted_by ?? '');
      }
    } catch (e: any) {
      setLoadError(
        typeof e?.message === 'string' && e.message !== 'auth'
          ? e.message
          : 'Não foi possível carregar. Verifique a ligação e tente novamente.'
      );
    }
  }, [supabase, today]);

  useEffect(() => {
    load();
  }, [load]);

  // --- draft autosave: every change hits localStorage immediately ---
  const saveDraft = useCallback((nextQty: QtyMap, nextRs: QtyMap, nextCountedBy: string) => {
    if (!draftKey.current) return;
    try {
      localStorage.setItem(
        draftKey.current,
        JSON.stringify({ qty: nextQty, rs: nextRs, countedBy: nextCountedBy, ts: Date.now() })
      );
    } catch {}
  }, []);

  function setProductQty(productId: string, value: string) {
    setQty((prev) => {
      const next = { ...prev, [productId]: value };
      saveDraft(next, restockQty, countedBy);
      return next;
    });
  }

  function setProductRestock(productId: string, value: string) {
    rsDirty.current = true;
    setRestockQty((prev) => {
      const next = { ...prev, [productId]: value };
      saveDraft(qty, next, countedBy);
      return next;
    });
  }

  function step(productId: string, delta: number) {
    const current = parseQty(qty[productId] ?? '') ?? 0;
    const next = Math.max(0, Math.round((current + delta) * 100) / 100);
    setProductQty(productId, fmtQty(next));
  }

  function onCountedBy(v: string) {
    setCountedBy(v);
    saveDraft(qty, restockQty, v);
  }

  // --- submit: count via RPC, then sync today's restocks (if touched) ---
  async function submit() {
    if (!data) return;
    setSubmitError(null);
    if (!countedBy.trim()) {
      setSubmitError('Indique quem fez a contagem ("Contado por").');
      return;
    }
    const lines: { product_id: string; quantity: number }[] = [];
    for (const p of data.products) {
      const n = parseQty(qty[p.id] ?? '');
      if (n !== null) lines.push({ product_id: p.id, quantity: n });
    }
    if (lines.length === 0) {
      setSubmitError('Preencha pelo menos um produto.');
      return;
    }
    const emptyCount = data.products.length - lines.length;
    if (emptyCount > 0) {
      const ok = window.confirm(
        `${emptyCount} produto(s) sem valor ficam fora da contagem. Submeter mesmo assim?`
      );
      if (!ok) return;
    }
    setSaving(true);
    const { error } = await supabase.rpc('submit_count', {
      p_counted_by: countedBy.trim(),
      p_lines: lines,
      p_prefill_missing: data.prefillMissing,
    });
    if (error) {
      setSaving(false);
      setSubmitError('Falha ao submeter. Verifique a ligação e tente novamente. (Os valores estão guardados neste telemóvel.)');
      return;
    }

    // restocks: replace today's rows with what's on screen (only if user touched them)
    if (rsDirty.current) {
      const del = await supabase
        .from('restocks')
        .delete()
        .eq('location_id', data.locationId)
        .eq('date', today);
      let rsError = del.error;
      if (!rsError) {
        const rows = data.products
          .map((p) => ({ pid: p.id, n: parseQty(restockQty[p.id] ?? '') }))
          .filter((x) => x.n !== null && x.n > 0)
          .map((x) => ({
            location_id: data.locationId,
            product_id: x.pid,
            date: today,
            quantity: x.n as number,
          }));
        if (rows.length > 0) {
          const ins = await supabase.from('restocks').insert(rows);
          rsError = ins.error;
        }
      }
      if (rsError) {
        setSaving(false);
        setSubmitError(
          'Contagem submetida ✓, mas falhou o registo das reposições. Tente Submeter outra vez.'
        );
        return;
      }
      rsDirty.current = false;
    }

    setSaving(false);
    try {
      localStorage.removeItem(draftKey.current);
    } catch {}
    setSubmittedAt(new Date().toISOString());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  // --- render ---
  if (loadError) {
    return (
      <main className="min-h-dvh flex items-center justify-center p-6">
        <div className="card p-6 text-center max-w-sm">
          <p className="text-red-600 mb-4">{loadError}</p>
          <button className="btn-primary w-full" onClick={() => load()}>
            Tentar novamente
          </button>
        </div>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="min-h-dvh flex items-center justify-center">
        <p className="text-gray-400">A carregar…</p>
      </main>
    );
  }

  const byCategory = data.categories
    .map((c) => ({
      cat: c,
      items: data.products
        .filter((p) => p.category_id === c.id)
        .sort((a, b) => a.name.localeCompare(b.name, 'pt')),
    }))
    .filter((g) => g.items.length > 0);

  const filled = data.products.filter((p) => parseQty(qty[p.id] ?? '') !== null).length;
  const restockCount = data.products.filter(
    (p) => (parseQty(restockQty[p.id] ?? '') ?? 0) > 0
  ).length;

  return (
    <main className="pb-40">
      {/* header */}
      <header className="sticky top-0 z-20 bg-acai-600 text-white px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)] shadow">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-bold text-lg leading-tight">Contagem de hoje</h1>
            <p className="text-acai-100 text-sm">
              {data.locationName} · {displayDate(today)}
            </p>
          </div>
          <button onClick={logout} className="text-acai-100 text-sm underline">
            Sair
          </button>
        </div>
      </header>

      {!online && (
        <div className="bg-amber-100 text-amber-900 text-sm px-4 py-2">
          Sem ligação à internet. Pode continuar a contar — os valores ficam guardados neste
          telemóvel. Submeta quando a ligação voltar.
        </div>
      )}

      {submittedAt && (
        <div className="bg-green-100 text-green-900 text-sm px-4 py-2">
          Contagem de hoje submetida ✓ — pode corrigir e voltar a submeter até ao fim do dia.
        </div>
      )}

      {data.prefillMissing && (
        <div className="bg-amber-100 text-amber-900 text-sm px-4 py-2">
          Não há contagem de ontem — preencha os valores do zero. (O escritório será avisado.)
        </div>
      )}

      <div className="px-4 pt-2 pb-0">
        <p className="text-xs text-gray-400">
          Chegou mercadoria? Use «recebi mercadoria hoje» debaixo do produto.
        </p>
      </div>

      <div className="p-3 space-y-3">
        {/* count list */}
        {byCategory.map(({ cat, items }) => {
          const isCollapsed = collapsed[cat.id];
          const catFilled = items.filter((p) => parseQty(qty[p.id] ?? '') !== null).length;
          const catRs = items.filter((p) => (parseQty(restockQty[p.id] ?? '') ?? 0) > 0).length;
          return (
            <section key={cat.id} className="card overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3.5 bg-acai-50 active:bg-acai-100"
                onClick={() => setCollapsed((c) => ({ ...c, [cat.id]: !c[cat.id] }))}
              >
                <span className="font-semibold text-acai-900">
                  {cat.name}
                  {catRs > 0 && <span className="ml-1.5 text-xs">📦{catRs}</span>}
                </span>
                <span className="text-sm text-gray-500">
                  {catFilled}/{items.length} {isCollapsed ? '▸' : '▾'}
                </span>
              </button>
              {!isCollapsed && (
                <ul className="divide-y divide-gray-100">
                  {items.map((p) => {
                    const rsOpen = showRs[p.id] || (restockQty[p.id] ?? '') !== '';
                    return (
                      <li key={p.id} className="px-3 py-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="font-medium text-[15px]">{p.name}</span>
                          <span className="text-xs text-gray-400 shrink-0">{p.unit}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button className="btn-step" onClick={() => step(p.id, -1)} aria-label="menos 1">
                            −1
                          </button>
                          <button className="btn-step text-sm" onClick={() => step(p.id, -0.5)}>
                            −½
                          </button>
                          <input
                            className="input text-center font-semibold flex-1 min-w-0 py-2.5"
                            inputMode="decimal"
                            value={qty[p.id] ?? ''}
                            placeholder="—"
                            onChange={(e) => setProductQty(p.id, e.target.value)}
                          />
                          <button className="btn-step text-sm" onClick={() => step(p.id, 0.5)}>
                            +½
                          </button>
                          <button className="btn-step" onClick={() => step(p.id, 1)} aria-label="mais 1">
                            +1
                          </button>
                        </div>
                        {rsOpen ? (
                          <div className="mt-2 flex items-center gap-2 bg-acai-50 rounded-xl px-2.5 py-1.5">
                            <span className="text-xs font-medium text-acai-700 shrink-0">
                              📦 Recebido hoje
                            </span>
                            <input
                              className="input text-center py-1.5 flex-1 min-w-0"
                              inputMode="decimal"
                              placeholder="0"
                              value={restockQty[p.id] ?? ''}
                              onChange={(e) => setProductRestock(p.id, e.target.value)}
                            />
                            <button
                              className="text-gray-400 text-lg px-1 shrink-0"
                              aria-label="remover reposição"
                              onClick={() => {
                                setProductRestock(p.id, '');
                                setShowRs((s) => ({ ...s, [p.id]: false }));
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            className="mt-1.5 text-xs text-acai-600 underline"
                            onClick={() => setShowRs((s) => ({ ...s, [p.id]: true }))}
                          >
                            + recebi mercadoria hoje
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {/* sticky submit bar */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-2">
        {submitError && <p className="text-sm text-red-600">{submitError}</p>}
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Contado por (nome)"
            value={countedBy}
            onChange={(e) => onCountedBy(e.target.value)}
          />
          <button
            className="btn-primary shrink-0"
            onClick={submit}
            disabled={saving || !online}
          >
            {saving ? 'A enviar…' : submittedAt ? 'Atualizar' : 'Submeter'}
          </button>
        </div>
        <p className="text-xs text-gray-400 text-center">
          {filled}/{data.products.length} produtos preenchidos
          {restockCount > 0 ? ` · 📦 ${restockCount} reposição(ões)` : ''}
          {!online ? ' · sem ligação — guardado no telemóvel' : ''}
        </p>
      </div>
    </main>
  );
}
