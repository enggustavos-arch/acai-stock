-- ============================================================
-- 001_schema.sql — tables, helper functions, RLS, submit RPC
-- Run in Supabase SQL Editor (or supabase db push).
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Tables ----------

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category_id uuid not null references public.categories(id),
  unit text not null default 'un' check (unit in ('un','kg','L','cx')),
  allows_half boolean not null default false,
  low_stock_threshold numeric not null default 1,
  active boolean not null default true
);

create table public.location_products (
  location_id uuid not null references public.locations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  active boolean not null default true,
  primary key (location_id, product_id)
);

-- Maps each auth user to a role and (for staff) a location.
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','staff')),
  location_id uuid references public.locations(id)
);

create table public.daily_counts (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id),
  date date not null,
  counted_by text not null,
  prefill_missing boolean not null default false, -- yesterday's count was missing at submit time
  submitted_at timestamptz not null default now(),
  unique (location_id, date)
);

create table public.count_lines (
  daily_count_id uuid not null references public.daily_counts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity numeric not null check (quantity >= 0),
  primary key (daily_count_id, product_id)
);

create table public.restocks (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id),
  product_id uuid not null references public.products(id),
  date date not null,
  quantity numeric not null check (quantity > 0),
  note text
);

create table public.settings (
  id int primary key default 1 check (id = 1),
  cutoff_time time not null default '11:00'  -- missing-count alert cutoff (hora de Lisboa)
);
insert into public.settings (id) values (1);

create index idx_daily_counts_loc_date on public.daily_counts (location_id, date desc);
create index idx_restocks_loc_date on public.restocks (location_id, date desc);
create index idx_count_lines_product on public.count_lines (product_id);

-- ---------- Helper functions ----------
-- SECURITY DEFINER so they can read profiles without tripping RLS recursion.

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as
$$ select role from public.profiles where user_id = auth.uid() $$;

create or replace function public.my_location() returns uuid
language sql stable security definer set search_path = public as
$$ select location_id from public.profiles where user_id = auth.uid() $$;

create or replace function public.today_lisbon() returns date
language sql stable as
$$ select (now() at time zone 'Europe/Lisbon')::date $$;

revoke all on function public.my_role() from anon;
revoke all on function public.my_location() from anon;

-- ---------- Row Level Security ----------

alter table public.locations enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.location_products enable row level security;
alter table public.profiles enable row level security;
alter table public.daily_counts enable row level security;
alter table public.count_lines enable row level security;
alter table public.restocks enable row level security;
alter table public.settings enable row level security;

-- profiles: users see their own row; admin sees/manages all
create policy profiles_select on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.my_role() = 'admin');
create policy profiles_admin_write on public.profiles for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- locations: staff see their own; admin all
create policy locations_select on public.locations for select to authenticated
  using (public.my_role() = 'admin' or id = public.my_location());
create policy locations_admin_write on public.locations for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- categories & products: everyone authenticated can read; admin writes
create policy categories_select on public.categories for select to authenticated using (true);
create policy categories_admin_write on public.categories for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

create policy products_select on public.products for select to authenticated using (true);
create policy products_admin_write on public.products for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- location_products: staff read own location; admin all
create policy location_products_select on public.location_products for select to authenticated
  using (public.my_role() = 'admin' or location_id = public.my_location());
create policy location_products_admin_write on public.location_products for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- daily_counts:
--   staff: read own location; create/update ONLY for their location and ONLY today's
--   (enforces "editable until end of day" at the database, Lisbon time)
--   admin: everything, any date
create policy daily_counts_select on public.daily_counts for select to authenticated
  using (public.my_role() = 'admin' or location_id = public.my_location());
create policy daily_counts_insert on public.daily_counts for insert to authenticated
  with check (
    public.my_role() = 'admin'
    or (location_id = public.my_location() and date = public.today_lisbon())
  );
create policy daily_counts_update on public.daily_counts for update to authenticated
  using (
    public.my_role() = 'admin'
    or (location_id = public.my_location() and date = public.today_lisbon())
  )
  with check (
    public.my_role() = 'admin'
    or (location_id = public.my_location() and date = public.today_lisbon())
  );
create policy daily_counts_delete on public.daily_counts for delete to authenticated
  using (public.my_role() = 'admin');

-- count_lines: gated through the parent daily_count
create policy count_lines_select on public.count_lines for select to authenticated
  using (exists (
    select 1 from public.daily_counts dc
    where dc.id = daily_count_id
      and (public.my_role() = 'admin' or dc.location_id = public.my_location())
  ));
create policy count_lines_write on public.count_lines for all to authenticated
  using (exists (
    select 1 from public.daily_counts dc
    where dc.id = daily_count_id
      and (public.my_role() = 'admin'
        or (dc.location_id = public.my_location() and dc.date = public.today_lisbon()))
  ))
  with check (exists (
    select 1 from public.daily_counts dc
    where dc.id = daily_count_id
      and (public.my_role() = 'admin'
        or (dc.location_id = public.my_location() and dc.date = public.today_lisbon()))
  ));

-- restocks: staff manage today's restocks for their location; admin all
create policy restocks_select on public.restocks for select to authenticated
  using (public.my_role() = 'admin' or location_id = public.my_location());
create policy restocks_insert on public.restocks for insert to authenticated
  with check (
    public.my_role() = 'admin'
    or (location_id = public.my_location() and date = public.today_lisbon())
  );
create policy restocks_update on public.restocks for update to authenticated
  using (
    public.my_role() = 'admin'
    or (location_id = public.my_location() and date = public.today_lisbon())
  )
  with check (
    public.my_role() = 'admin'
    or (location_id = public.my_location() and date = public.today_lisbon())
  );
create policy restocks_delete on public.restocks for delete to authenticated
  using (
    public.my_role() = 'admin'
    or (location_id = public.my_location() and date = public.today_lisbon())
  );

-- settings: all read; admin writes
create policy settings_select on public.settings for select to authenticated using (true);
create policy settings_admin_write on public.settings for update to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- ---------- Submit RPC (atomic upsert of a day's count) ----------
-- SECURITY INVOKER (default): all RLS policies above still apply inside.

create or replace function public.submit_count(
  p_counted_by text,
  p_lines jsonb,               -- [{"product_id": "...", "quantity": 1.5}, ...]
  p_prefill_missing boolean default false
) returns uuid
language plpgsql as $$
declare
  v_loc uuid;
  v_date date;
  v_id uuid;
begin
  if coalesce(trim(p_counted_by), '') = '' then
    raise exception 'counted_by required';
  end if;

  v_loc := public.my_location();
  if v_loc is null then
    raise exception 'no location for user';
  end if;

  v_date := public.today_lisbon();

  insert into public.daily_counts (location_id, date, counted_by, prefill_missing)
  values (v_loc, v_date, trim(p_counted_by), p_prefill_missing)
  on conflict (location_id, date)
  do update set counted_by = excluded.counted_by, submitted_at = now()
  returning id into v_id;

  delete from public.count_lines where daily_count_id = v_id;

  insert into public.count_lines (daily_count_id, product_id, quantity)
  select v_id, (l->>'product_id')::uuid, (l->>'quantity')::numeric
  from jsonb_array_elements(p_lines) l;

  return v_id;
end;
$$;

grant execute on function public.submit_count(text, jsonb, boolean) to authenticated;
revoke execute on function public.submit_count(text, jsonb, boolean) from anon;
