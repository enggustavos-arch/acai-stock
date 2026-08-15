-- ============================================================
-- 004_bot_alerts.sql — dedupe table for the WhatsApp bot's
-- instant low-stock alerts. Run in Supabase SQL Editor.
-- ============================================================

create table if not exists public.bot_alerts_sent (
  location_id uuid not null references public.locations(id),
  product_id uuid not null references public.products(id),
  date date not null,
  sent_at timestamptz not null default now(),
  primary key (location_id, product_id, date)
);

-- Locked down: only the service-role key (used by app/api/bot/alert-check)
-- touches this table. No policies for anon/authenticated on purpose.
alter table public.bot_alerts_sent enable row level security;
