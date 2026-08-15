import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { requireBotSecret } from '@/lib/bot-auth';
import { todayLisbon, nowTimeLisbon } from '@/lib/dates';

export const dynamic = 'force-dynamic';

/** GET /api/bot/missing — locations that haven't submitted today's count yet. */
export async function GET(req: NextRequest) {
  const unauth = requireBotSecret(req);
  if (unauth) return unauth;

  const supabase = createServiceClient();
  const today = todayLisbon();

  const [locRes, countRes, setRes] = await Promise.all([
    supabase.from('locations').select('*').eq('active', true).order('name'),
    supabase.from('daily_counts').select('location_id, counted_by, submitted_at').eq('date', today),
    supabase.from('settings').select('*').single(),
  ]);
  if (locRes.error || countRes.error) {
    return NextResponse.json({ error: 'db error' }, { status: 500 });
  }

  const submitted = new Set((countRes.data ?? []).map((c: any) => c.location_id));
  const missing = (locRes.data ?? []).filter((l: any) => !submitted.has(l.id)).map((l: any) => l.name);
  const cutoff = String((setRes.data as any)?.cutoff_time ?? '11:00').slice(0, 5);

  return NextResponse.json({
    today,
    now: nowTimeLisbon(),
    cutoff,
    past_cutoff: nowTimeLisbon() >= cutoff,
    missing_locations: missing,
  });
}
