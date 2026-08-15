import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client using the SERVICE ROLE key — bypasses RLS entirely.
 *
 * ONLY use this inside app/api/bot/* route handlers (or other trusted server code
 * that itself checks BOT_API_SECRET / a webhook secret before doing anything).
 * NEVER import this from a Client Component, and never prefix the key with
 * NEXT_PUBLIC_ — that would ship it to the browser.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createSupabaseClient(url, key, { auth: { persistSession: false } });
}
