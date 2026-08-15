import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/bot/alert-check
 * Receiver for a Supabase Database Webhook on count_lines (INSERT).
 * Fires on every submit/edit (submit_count deletes+reinserts all lines), so
 * this dedupes with bot_alerts_sent (one alert per location+product+date)
 * rather than pinging every time someone re-saves an already-low count.
 *
 * Configure in Supabase: Database → Webhooks → Create webhook
 *   Table: count_lines · Events: Insert · Type: HTTP Request
 *   URL: https://<your-vercel-domain>/api/bot/alert-check
 *   HTTP Headers: x-webhook-secret: <SUPABASE_WEBHOOK_SECRET value>
 *
 * NOTE: the exact shape of the outbound call to OpenClaw (OPENCLAW_WEBHOOK_URL)
 * depends on how the OpenClaw Launch instance's inbound webhook/trigger is
 * configured — adjust the body below to match once that's set up.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-webhook-secret');
  if (!process.env.SUPABASE_WEBHOOK_SECRET || secret !== process.env.SUPABASE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }
  if (body?.type !== 'INSERT' || body?.table !== 'count_lines') {
    return NextResponse.json({ ok: true });
  }

  const record = body.record ?? {};
  const { daily_count_id, product_id, quantity } = record;
  if (!daily_count_id || !product_id || quantity === undefined) {
    return NextResponse.json({ ok: true });
  }

  const supabase = createServiceClient();

  const [{ data: dc }, { data: product }] = await Promise.all([
    supabase.from('daily_counts').select('location_id, date').eq('id', daily_count_id).single(),
    supabase.from('products').select('name, unit, low_stock_threshold').eq('id', product_id).single(),
  ]);
  if (!dc || !product) return NextResponse.json({ ok: true });
  if (Number(quantity) > Number(product.low_stock_threshold)) return NextResponse.json({ ok: true });

  // Dedupe: one alert per location+product+date. If the row already exists,
  // the insert conflicts and we skip sending again.
  const { error: dupErr } = await supabase
    .from('bot_alerts_sent')
    .insert({ location_id: dc.location_id, product_id, date: dc.date });
  if (dupErr) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  const { data: loc } = await supabase.from('locations').select('name').eq('id', dc.location_id).single();

  const message =
    `🔴 Stock baixo — ${loc?.name ?? '?'}\n` +
    `${product.name}: ${quantity} ${product.unit} (limite ${product.low_stock_threshold})`;

  if (process.env.OPENCLAW_WEBHOOK_URL) {
    try {
      await fetch(process.env.OPENCLAW_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message }),
      });
    } catch {
      // best-effort — don't fail the webhook response over a delivery error
    }
  }

  return NextResponse.json({ ok: true, sent: true, message });
}
