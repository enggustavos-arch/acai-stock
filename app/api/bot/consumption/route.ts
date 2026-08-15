import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { requireBotSecret } from '@/lib/bot-auth';
import { todayLisbon, addDays } from '@/lib/dates';

export const dynamic = 'force-dynamic';

/**
 * GET /api/bot/consumption?days=7&location=Algarve
 * Consumption per product = yesterday's count + today's restocks - today's count
 * (same formula as app/admin/stock and app/admin/page.tsx). Summed over the
 * requested window. Also flags negative-consumption days (likely a count
 * error or an unlogged restock) so the cousin can be warned, not just given
 * a number that looks wrong.
 */
export async function GET(req: NextRequest) {
  const unauth = requireBotSecret(req);
  if (unauth) return unauth;

  const supabase = createServiceClient();
  const days = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('days') ?? '7', 10) || 7, 1), 30);
  const locationFilter = req.nextUrl.searchParams.get('location')?.toLowerCase() ?? null;

  const today = todayLisbon();
  const startDate = addDays(today, -days);
  // need one extra day back to compute consumption on startDate+1
  const rangeStart = addDays(startDate, -1);

  const [locRes, prodRes, countRes, rsRes] = await Promise.all([
    supabase.from('locations').select('*').eq('active', true).order('name'),
    supabase.from('products').select('*').eq('active', true),
    supabase.from('daily_counts').select('*, count_lines(*)').gte('date', rangeStart).lte('date', today),
    supabase.from('restocks').select('*').gte('date', rangeStart).lte('date', today),
  ]);
  if (locRes.error || prodRes.error || countRes.error || rsRes.error) {
    return NextResponse.json({ error: 'db error' }, { status: 500 });
  }

  let locations = locRes.data ?? [];
  if (locationFilter) {
    locations = locations.filter((l: any) => l.name.toLowerCase().includes(locationFilter));
  }
  const pById = new Map((prodRes.data ?? []).map((p: any) => [p.id, p]));
  const counts = countRes.data ?? [];
  const restocks = rsRes.data ?? [];

  const result = locations.map((loc: any) => {
    const locCounts = counts
      .filter((c: any) => c.location_id === loc.id)
      .sort((a: any, b: any) => a.date.localeCompare(b.date));

    const perProduct = new Map<string, { total: number; negativeDays: string[] }>();

    for (let i = 1; i < locCounts.length; i++) {
      const prev = locCounts[i - 1];
      const cur = locCounts[i];
      // only meaningful for consecutive calendar days
      if (addDays(prev.date, 1) !== cur.date) continue;
      const prevByProduct = new Map<string, number>(
        (prev.count_lines ?? []).map((l: any) => [l.product_id, Number(l.quantity)])
      );
      for (const l of cur.count_lines ?? []) {
        const y = prevByProduct.get(l.product_id);
        if (y === undefined) continue;
        const rs = restocks
          .filter((r: any) => r.location_id === loc.id && r.product_id === l.product_id && r.date === cur.date)
          .reduce((s: number, r: any) => s + Number(r.quantity), 0);
        const cons = y + rs - Number(l.quantity);
        const entry = perProduct.get(l.product_id) ?? { total: 0, negativeDays: [] };
        entry.total += cons;
        if (cons < 0) entry.negativeDays.push(cur.date);
        perProduct.set(l.product_id, entry);
      }
    }

    const items = Array.from(perProduct.entries())
      .map(([pid, v]) => ({
        product: pById.get(pid)?.name ?? '?',
        unit: pById.get(pid)?.unit ?? '',
        total_consumption: Math.round(v.total * 100) / 100,
        negative_days: v.negativeDays,
      }))
      .sort((a, b) => b.total_consumption - a.total_consumption);

    return { location: loc.name, items };
  });

  return NextResponse.json({ from: startDate, to: today, days, locations: result });
}
