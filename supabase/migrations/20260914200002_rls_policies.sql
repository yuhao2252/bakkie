-- ============================================================================
-- Bakkie — Row Level Security
--
-- Supabase exposes Postgres directly to the mobile app over HTTPS. The app
-- authenticates as the logged-in user, which means the *database* is the
-- security boundary — there is no server-side API layer in between to check
-- permissions for us.
--
-- So: RLS on every table, no exceptions. A table with RLS disabled in this
-- setup is world-readable to any authenticated user.
--
-- Note `(select auth.uid())` rather than a bare `auth.uid()`. Wrapping it in
-- a subquery lets Postgres evaluate it once per statement instead of once per
-- row, which matters as the brews table grows.
-- ============================================================================

alter table profiles               enable row level security;
alter table roasters               enable row level security;
alter table processes              enable row level security;
alter table brew_methods           enable row level security;
alter table rating_criteria        enable row level security;
alter table varieties              enable row level security;
alter table coffees                enable row level security;
alter table coffee_varieties       enable row level security;
alter table bags                   enable row level security;
alter table brews                  enable row level security;
alter table brew_ratings           enable row level security;
alter table inventory_transactions enable row level security;
alter table photos                 enable row level security;
alter table import_jobs            enable row level security;

-- profiles is keyed by the auth uuid itself rather than a user_id column.
create policy profiles_own_row on profiles
  for all
  using      (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Everything else follows one shape: you touch only rows you own.
-- USING gates which existing rows are visible/updatable; WITH CHECK gates what
-- values may be written. Both are required — USING alone would let a user
-- reassign a row to someone else on UPDATE.

create policy roasters_own_rows on roasters
  for all
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy processes_own_rows on processes
  for all
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy brew_methods_own_rows on brew_methods
  for all
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy rating_criteria_own_rows on rating_criteria
  for all
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy varieties_own_rows on varieties
  for all
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy coffees_own_rows on coffees
  for all
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy coffee_varieties_own_rows on coffee_varieties
  for all
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy bags_own_rows on bags
  for all
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy brews_own_rows on brews
  for all
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy brew_ratings_own_rows on brew_ratings
  for all
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy inventory_transactions_own_rows on inventory_transactions
  for all
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy photos_own_rows on photos
  for all
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy import_jobs_own_rows on import_jobs
  for all
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
