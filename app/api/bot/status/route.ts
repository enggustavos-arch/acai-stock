import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { requireBotSecret } from '@/lib/bot-auth';
import { todayLisbon, addDays } from '@/lib/dates';

export const dynamic = 'force-dynamic';

/**
 * GET /api/bot/status?location=Algarve
 * Latest stock level per product, per location (falls back to yesterday's
 * count if today's hasn't been submitted yet). Used by the OpenClaw skill
 * for ad hoc "how much X do we have" / "what's low" questions.
 */
export async function GET(req: NextRequest) {
  const unauth = requireBotSecret(req);
  if (unauth) return unauth;

  const supabase = createServiceClient();
  const today = todayLisbon();
  const yesterday = addDays(today, -1);
  const locationFilter = req.nextUrl.searchParams.get('location')?.toLowerCase() ?? null;

  const [locRes, prodRes, countRes] = await Promise.all([
    supabase.from('locations').select('*').eq('active', true).order('name'),
    supabase.from('products').select('*').eq('active', true),
    supabase.from('daily_counts').select('*, count_lines(*)').in('date', [today, yesterday]),
  ]);
  if (locRes.error || prodRes.error || countRes.error) {
    return NextResponse.json({ error: 'db error' }, { status: 500 });
  }

  let locations = locRes.data ?? [];
  if (locationFilter) {
    locations = locations.filter((l: any) => l.name.toLowerCase().includes(locationFilter));
  }
  const pById = new Map((prodRes.data ?? []).map((p: any) => [p.id, p]));
  const counts = countRes.data ?? [];

  const result = locations.map((loc: any) => {
    const c =
      counts.find((x: any) => x.location_id === loc.id && x.date === today) ??
      counts.find((x: any) => x.location_id === loc.id && x.date === yesterday);
    const items = (c?.count_lines ?? [])
      .map((l: any) => {
        const p = pById.get(l.product_id);
        return {
          product: p?.name ?? '?',
          unit: p?.unit ?? '',
          quantity: Number(l.quantity),
          threshold: p ? Number(p.low_stock_threshold) : null,
          low: p ? Number(l.quantity) <= Number(p.low_stock_threshold) : false,
        };
      })
      .sort((a: any, b: any) => a.product.localeCompare(b.product, 'pt'));
    return {
      location: loc.name,
      count_date: c?.date ?? null,
      stale: c ? c.date !== today : null,
      counted_by: c?.counted_by ?? null,
      low_stock_count: items.filter((i: any) => i.low).length,
      items,
    };
  });

  return NextResponse.json({ today, locations: result });
}
