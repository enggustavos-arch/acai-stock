import { NextRequest, NextResponse } from 'next/server';

/**
 * Shared-secret check for the /api/bot/* GET endpoints (called by the OpenClaw
 * skill when the cousin asks the bot a question, or by the daily cron job).
 * Set BOT_API_SECRET in Vercel env vars and paste the same value into the
 * OpenClaw skill config as the Authorization header.
 */
export function requireBotSecret(req: NextRequest): NextResponse | null {
  const expected = process.env.BOT_API_SECRET;
  const got = req.headers.get('authorization');
  if (!expected || got !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}
