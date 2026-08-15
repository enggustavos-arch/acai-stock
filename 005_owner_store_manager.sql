-- ============================================================
-- 005_owner_store_manager.sql
--
-- - Renames role 'manager' -> 'owner' (same person/login, new name).
-- - Adds a new role 'store_manager': same permissions as owner.
--   Both: read/write operational data (counts, restocks) across ALL
--   locations, any date, any time; add/remove products & categories.
--   Locations, settings (cutoff time), and profiles (user accounts)
--   stay admin-only — unchanged from 001/003.
-- - Adds my_is_owner(): admin or owner (NOT store_manager) — used to
--   gate the new Analytics tab.
-- - Widens staff's edit window from "today only" to "today or
--   yesterday" (Lisbon), any time of day.
--
-- Run in Supabase SQL Editor, in order after 001-004.
-- ============================================================

-- ---------- 1. Rename 'manager' -> 'owner', add 'store_manager' ----------

-- widen the constraint first so the UPDATE below is legal
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin','manager','owner','store_manager','staff'));

update public.profiles set role = 'owner' where role = 'manager';

-- drop 'manager' now that no row uses it
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin','owner','store_manager','staff'));

-- ---------- 2. Helper functions ----------

create or replace function public.my_can_manage() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(role in ('admin','owner','store_manager'), false)
   from public.profiles where user_id = auth.uid() $$;

create or replace function public.my_is_owner() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(role in ('admin','owner'), false)
   from public.profiles where user_id = auth.uid() $$;

revoke all on function public.my_can_manage() from anon;
revoke all on function public.my_is_owner() from anon;

-- ---------- 3. Structural write: products, categories, location_products ----------
-- Previously admin-only (001_schema.sql). Now owner + store_manager too.

drop policy if exists products_admin_write on public.products;
create policy products_admin_write on public.products for all to authenticated
  using (public.my_can_manage()) with check (public.my_can_manage());

drop policy if exists categories_admin_write on public.categories;
create policy categories_admin_write on public.categories for all to authenticated
  using (public.my_can_manage()) with check (public.my_can_manage());

drop policy if exists location_products_admin_write on public.location_products;
create policy location_products_admin_write on public.location_products for all to authenticated
  using (public.my_can_manage()) with check (public.my_can_manage());

-- locations_admin_write, settings_admin_write, profiles_admin_write:
-- deliberately left as my_role() = 'admin' — no change.

-- ---------- 4. Staff edit window: today OR yesterday, any time ----------
-- (owner/store_manager/admin already unrestricted via my_can_manage() / admin — unchanged)

drop policy if exists daily_counts_insert on public.daily_counts;
create policy daily_counts_insert on public.daily_counts for insert to authenticated
  with check (
    public.my_can_manage()
    or (location_id = public.my_location() and date >= public.today_lisbon() - 1)
  );

drop policy if exists daily_counts_update on public.daily_counts;
create policy daily_counts_update on public.daily_counts for update to authenticated
  using (
    public.my_can_manage()
    or (location_id = public.my_location() and date >= public.today_lisbon() - 1)
  )
  with check (
    public.my_can_manage()
    or (location_id = public.my_location() and date >= public.today_lisbon() - 1)
  );

drop policy if exists count_lines_write on public.count_lines;
create policy count_lines_write on public.count_lines for all to authenticated
  using (exists (
    select 1 from public.daily_counts dc
    where dc.id = daily_count_id
      and (public.my_can_manage()
        or (dc.location_id = public.my_location() and dc.date >= public.today_lisbon() - 1))
  ))
  with check (exists (
    select 1 from public.daily_counts dc
    where dc.id = daily_count_id
      and (public.my_can_manage()
        or (dc.location_id = public.my_location() and dc.date >= public.today_lisbon() - 1))
  ));

drop policy if exists restocks_insert on public.restocks;
create policy restocks_insert on public.restocks for insert to authenticated
  with check (
    public.my_can_manage()
    or (location_id = public.my_location() and date >= public.today_lisbon() - 1)
  );

drop policy if exists restocks_update on public.restocks;
create policy restocks_update on public.restocks for update to authenticated
  using (
    public.my_can_manage()
    or (location_id = public.my_location() and date >= public.today_lisbon() - 1)
  )
  with check (
    public.my_can_manage()
    or (location_id = public.my_location() and date >= public.today_lisbon() - 1)
  );

drop policy if exists restocks_delete on public.restocks;
create policy restocks_delete on public.restocks for delete to authenticated
  using (
    public.my_can_manage()
    or (location_id = public.my_location() and date >= public.today_lisbon() - 1)
  );

-- daily_counts_delete stays admin-only (destructive) — unchanged from 003.
