-- ============================================================
-- 003_manager_role.sql — add 'manager' role
-- Manager can read + edit operational data across all stores.
-- Structural changes (products, locations, settings, users) remain admin-only.
-- Run in Supabase SQL Editor.
-- ============================================================

-- 1. Widen the role check constraint
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin','manager','staff'));

-- 2. Helper: returns true if the caller is admin OR manager
create or replace function public.my_can_manage() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(role in ('admin','manager'), false)
   from public.profiles where user_id = auth.uid() $$;

revoke all on function public.my_can_manage() from anon;

-- ============================================================
-- 3. Widen SELECT policies so managers can see everything admins can
-- ============================================================

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.my_can_manage());

drop policy if exists locations_select on public.locations;
create policy locations_select on public.locations for select to authenticated
  using (public.my_can_manage() or id = public.my_location());

drop policy if exists location_products_select on public.location_products;
create policy location_products_select on public.location_products for select to authenticated
  using (public.my_can_manage() or location_id = public.my_location());

drop policy if exists daily_counts_select on public.daily_counts;
create policy daily_counts_select on public.daily_counts for select to authenticated
  using (public.my_can_manage() or location_id = public.my_location());

drop policy if exists count_lines_select on public.count_lines;
create policy count_lines_select on public.count_lines for select to authenticated
  using (exists (
    select 1 from public.daily_counts dc
    where dc.id = daily_count_id
      and (public.my_can_manage() or dc.location_id = public.my_location())
  ));

drop policy if exists restocks_select on public.restocks;
create policy restocks_select on public.restocks for select to authenticated
  using (public.my_can_manage() or location_id = public.my_location());

-- (categories, products, settings already `select using (true)` — no change needed.)

-- ============================================================
-- 4. Widen operational WRITE policies to include manager
-- (daily_counts insert/update, count_lines write, restocks insert/update/delete)
-- ============================================================

drop policy if exists daily_counts_insert on public.daily_counts;
create policy daily_counts_insert on public.daily_counts for insert to authenticated
  with check (
    public.my_can_manage()
    or (location_id = public.my_location() and date = public.today_lisbon())
  );

drop policy if exists daily_counts_update on public.daily_counts;
create policy daily_counts_update on public.daily_counts for update to authenticated
  using (
    public.my_can_manage()
    or (location_id = public.my_location() and date = public.today_lisbon())
  )
  with check (
    public.my_can_manage()
    or (location_id = public.my_location() and date = public.today_lisbon())
  );

-- delete of daily_counts stays admin-only (destructive)
drop policy if exists daily_counts_delete on public.daily_counts;
create policy daily_counts_delete on public.daily_counts for delete to authenticated
  using (public.my_role() = 'admin');

drop policy if exists count_lines_write on public.count_lines;
create policy count_lines_write on public.count_lines for all to authenticated
  using (exists (
    select 1 from public.daily_counts dc
    where dc.id = daily_count_id
      and (public.my_can_manage()
        or (dc.location_id = public.my_location() and dc.date = public.today_lisbon()))
  ))
  with check (exists (
    select 1 from public.daily_counts dc
    where dc.id = daily_count_id
      and (public.my_can_manage()
        or (dc.location_id = public.my_location() and dc.date = public.today_lisbon()))
  ));

drop policy if exists restocks_insert on public.restocks;
create policy restocks_insert on public.restocks for insert to authenticated
  with check (
    public.my_can_manage()
    or (location_id = public.my_location() and date = public.today_lisbon())
  );

drop policy if exists restocks_update on public.restocks;
create policy restocks_update on public.restocks for update to authenticated
  using (
    public.my_can_manage()
    or (location_id = public.my_location() and date = public.today_lisbon())
  )
  with check (
    public.my_can_manage()
    or (location_id = public.my_location() and date = public.today_lisbon())
  );

drop policy if exists restocks_delete on public.restocks;
create policy restocks_delete on public.restocks for delete to authenticated
  using (
    public.my_can_manage()
    or (location_id = public.my_location() and date = public.today_lisbon())
  );

-- ============================================================
-- 5. Structural write policies (locations, categories, products,
--    location_products, profiles, settings) stay admin-only.
--    No changes needed — 001_schema.sql already uses my_role()='admin'.
-- ============================================================
