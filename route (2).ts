import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { requireBotSecret } from '@/lib/bot-auth';
import { todayLisbon, addDays, displayDate, nowTimeLisbon } from '@/lib/dates';

export const dynamic = 'force-dynamic';

/**
 * GET /api/bot/summary
 * One-shot daily digest: low stock across all locations, today's consumption
 * vs yesterday+restocks, and any locations still missing a count. Returns a
 * ready-to-send `text` field (pt-PT) so the OpenClaw daily cron skill can
 * just forward it to the WhatsApp group without having to do the maths
 * itself — plus the structured `data` in case the cousin's follow-up
 * questions need it.
 */
export async function GET(req: NextRequest) {
  const unauth = requireBotSecret(req);
  if (unauth) return unauth;

  const supabase = createServiceClient();
  const today = todayLisbon();
  const yesterday = addDays(today, -1);

  const [locRes, prodRes, countRes, rsRes, setRes] = await Promise.all([
    supabase.from('locations').select('*').eq('active', true).order('name'),
    supabase.from('products').select('*').eq('active', true),
    supabase.from('daily_counts').select('*, count_lines(*)').in('date', [today, yesterday]),
    supabase.from('restocks').select('*').eq('date', today),
    supabase.from('settings').select('*').single(),
  ]);
  if (locRes.error || prodRes.error || countRes.error || rsRes.error) {
    return NextResponse.json({ error: 'db error' }, { status: 500 });
  }

  const locations = locRes.data ?? [];
  const pById = new Map((prodRes.data ?? []).map((p: any) => [p.id, p]));
  const counts = countRes.data ?? [];
  const restocks = rsRes.data ?? [];
  const cutoff = String((setRes.data as any)?.cutoff_time ?? '11:00').slice(0, 5);

  const low: { location: string; product: string; qty: number; unit: string; threshold: number }[] = [];
  const consumption: { location: string; product: string; cons: number; unit: string }[] = [];
  const missing: string[] = [];

  for (const loc of locations) {
    const tCount = counts.find((c: any) => c.location_id === loc.id && c.date === today);
    const yCount = counts.find((c: any) => c.location_id === loc.id && c.date === yesterday);
    if (!tCount) missing.push(loc.name);

    const latest = tCount ?? yCount;
    if (latest) {
      for (const l of latest.count_lines ?? []) {
        const p = pById.get(l.product_id);
        if (p && Number(l.quantity) <= Number(p.low_stock_threshold)) {
          low.push({ location: loc.name, product: p.name, qty: Number(l.quantity), unit: p.unit, threshold: Number(p.low_stock_threshold) });
        }
      }
    }
    if (tCount && yCount) {
      const yBy = new Map<string, number>(
        (yCount.count_lines ?? []).map((l: any) => [l.product_id, Number(l.quantity)])
      );
      for (const l of tCount.count_lines ?? []) {
        const yq = yBy.get(l.product_id);
        if (yq === undefined) continue;
        const rs = restocks
          .filter((r: any) => r.location_id === loc.id && r.product_id === l.product_id)
          .reduce((s: number, r: any) => s + Number(r.quantity), 0);
        const cons = yq + rs - Number(l.quantity);
        const p = pById.get(l.product_id);
        consumption.push({ location: loc.name, product: p?.name ?? '?', cons, unit: p?.unit ?? '' });
      }
    }
  }

  const topConsumption = [...consumption].sort((a, b) => b.cons - a.cons).slice(0, 8);
  const negatives = consumption.filter((c) => c.cons < 0);

  const lines: string[] = [];
  lines.push(`📊 Resumo diário — ${displayDate(today)}`);
  lines.push('');
  if (missing.length > 0) {
    lines.push(`⏳ Sem contagem hoje: ${missing.join(', ')}`);
  } else {
    lines.push('✅ Todas as lojas contaram hoje.');
  }
  lines.push('');
  lines.push(`🔴 Stock baixo (${low.length}):`);
  if (low.length === 0) {
    lines.push('Nenhum produto abaixo do limite.');
  } else {
    for (const it of low.slice(0, 15)) {
      lines.push(`- ${it.product} · ${it.location}: ${it.qty} ${it.unit} (limite ${it.threshold})`);
    }
    if (low.length > 15) lines.push(`… e mais ${low.length - 15}.`);
  }
  lines.push('');
  lines.push('📉 Consumo de hoje (maior consumo):');
  if (topConsumption.length === 0) {
    lines.push('Sem dados suficientes (falta contagem de ontem ou de hoje).');
  } else {
    for (const it of topConsumption) {
      lines.push(`- ${it.product} · ${it.location}: ${it.cons.toFixed(1)} ${it.unit}`);
    }
  }
  if (negatives.length > 0) {
    lines.push('');
    lines.push(`⚠️ Consumo negativo em ${negatives.length} produto(s) — possível erro de contagem ou reposição não registada.`);
  }

  return NextResponse.json({
    today,
    now: nowTimeLisbon(),
    cutoff,
    text: lines.join('\n'),
    data: { missing, low, top_consumption: topConsumption, negatives },
  });
}
