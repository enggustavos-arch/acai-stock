-- ============================================================
-- 006_sales_analytics.sql
-- Stores daily sales totals (manual entry or CSV paste for now —
-- swap for a real POS import once we have the export format) so the
-- owner's Analytics tab can chart sales against stock consumption.
-- Owner + admin only (not store_manager, not staff).
-- Run in Supabase SQL Editor, after 005.
-- ============================================================

create table if not exists public.sales_daily (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id),
  date date not null,
  amount numeric not null check (amount >= 0),
  note text,
  created_at timestamptz not null default now(),
  unique (location_id, date)
);

create index if not exists idx_sales_daily_loc_date on public.sales_daily (location_id, date desc);

alter table public.sales_daily enable row level security;

create policy sales_daily_select on public.sales_daily for select to authenticated
  using (public.my_is_owner());
create policy sales_daily_write on public.sales_daily for all to authenticated
  using (public.my_is_owner()) with check (public.my_is_owner());
