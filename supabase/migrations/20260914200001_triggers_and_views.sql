-- ============================================================================
-- Bakkie — triggers and derived views
--
-- Two jobs here:
--   1. Keep the inventory ledger in sync automatically, so the app never has
--      to remember to write a transaction. Consistency belongs next to the
--      data, not in whichever client happens to be writing.
--   2. Expose derived state (stock on hand, freshness) as views, so the
--      aggregation logic is defined once in SQL rather than reimplemented in
--      the app, a future web client, and an analysis notebook.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- New-user bootstrap
--
-- Fires when Supabase Auth creates a user. Creates the profile row and seeds
-- the per-user lookup tables so a new account is immediately usable instead
-- of starting with empty dropdowns.
--
-- SECURITY DEFINER because the trigger runs in the auth system's context and
-- needs to write into our tables.
-- ---------------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'display_name');

  insert into processes (user_id, name, sort_order) values
    (new.id, 'Washed',              10),
    (new.id, 'Natural',             20),
    (new.id, 'Honey',               30),
    (new.id, 'Anaerobic',           40),
    (new.id, 'Carbonic Maceration', 50);

  insert into varieties (user_id, name) values
    (new.id, 'Bourbon'),
    (new.id, 'Typica'),
    (new.id, 'Caturra'),
    (new.id, 'Catuai'),
    (new.id, 'Geisha'),
    (new.id, 'SL28'),
    (new.id, 'SL34'),
    (new.id, 'Pacamara'),
    (new.id, 'Castillo'),
    (new.id, 'Mundo Novo'),
    (new.id, 'Ethiopian Heirloom');

  insert into brew_methods (user_id, name, is_espresso, sort_order) values
    (new.id, 'Espresso',     true,  10),
    (new.id, 'V60',          false, 20),
    (new.id, 'Aeropress',    false, 30),
    (new.id, 'French Press', false, 40),
    (new.id, 'Moka Pot',     false, 50),
    (new.id, 'Chemex',       false, 60),
    (new.id, 'Cold Brew',    false, 70);

  insert into rating_criteria (user_id, name, sort_order) values
    (new.id, 'Aroma',      10),
    (new.id, 'Acidity',    20),
    (new.id, 'Sweetness',  30),
    (new.id, 'Body',       40),
    (new.id, 'Balance',    50),
    (new.id, 'Aftertaste', 60),
    (new.id, 'Overall',    70);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Ledger automation: bags
--
-- Creating a bag means coffee arrived, so the opening 'purchase' transaction
-- is written for you. Editing initial_grams (fixing a typo) rewrites that
-- opening transaction rather than adding a correcting entry, because it was
-- never a real-world event — it was a data-entry mistake. Real-world
-- corrections use an 'adjustment'.
-- ---------------------------------------------------------------------------

create or replace function sync_bag_purchase_txn()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into inventory_transactions
      (user_id, bag_id, occurred_at, txn_type, grams_delta, note)
    values
      (new.user_id, new.id,
       coalesce(new.purchased_at::timestamptz, now()),
       'purchase', new.initial_grams, 'Opening balance');

  elsif tg_op = 'UPDATE' and (
        new.initial_grams is distinct from old.initial_grams
     or new.purchased_at  is distinct from old.purchased_at) then
    update inventory_transactions
       set grams_delta = new.initial_grams,
           occurred_at = coalesce(new.purchased_at::timestamptz, occurred_at)
     where bag_id = new.id
       and txn_type = 'purchase';
  end if;

  return new;
end;
$$;

create trigger bags_sync_purchase_txn
  after insert or update on bags
  for each row execute function sync_bag_purchase_txn();

-- ---------------------------------------------------------------------------
-- Ledger automation: brews
--
-- Logging a brew consumes dose_grams. The matching negative transaction is
-- written, updated and (via ON DELETE CASCADE) removed automatically, so the
-- ledger cannot drift from the brew log.
-- ---------------------------------------------------------------------------

create or replace function sync_brew_consumption_txn()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into inventory_transactions
      (user_id, bag_id, brew_id, occurred_at, txn_type, grams_delta)
    values
      (new.user_id, new.bag_id, new.id, new.brewed_at, 'brew', -new.dose_grams);

  elsif tg_op = 'UPDATE' and (
        new.dose_grams is distinct from old.dose_grams
     or new.brewed_at  is distinct from old.brewed_at
     or new.bag_id     is distinct from old.bag_id) then
    update inventory_transactions
       set grams_delta = -new.dose_grams,
           occurred_at = new.brewed_at,
           bag_id      = new.bag_id
     where brew_id = new.id;
  end if;

  return new;
end;
$$;

create trigger brews_sync_consumption_txn
  after insert or update on brews
  for each row execute function sync_brew_consumption_txn();

-- ---------------------------------------------------------------------------
-- Views
--
-- security_invoker = on makes the view run with the *querying* user's
-- permissions, so RLS on the underlying tables still applies. Without it a
-- view silently becomes a hole straight through row-level security.
-- ---------------------------------------------------------------------------

-- Current stock per bag, straight off the ledger.
create view v_bag_stock
with (security_invoker = on)
as
select
  b.id                                            as bag_id,
  b.user_id,
  b.coffee_id,
  coalesce(sum(t.grams_delta), 0)                 as grams_remaining,
  b.initial_grams,
  case
    when b.initial_grams > 0
    then round(
      greatest(coalesce(sum(t.grams_delta), 0), 0) / b.initial_grams * 100, 1)
    else 0
  end                                             as percent_remaining,
  count(*) filter (where t.txn_type = 'brew')     as brew_count,
  max(t.occurred_at) filter (where t.txn_type = 'brew') as last_brewed_at
from bags b
left join inventory_transactions t on t.bag_id = b.id
group by b.id, b.user_id, b.coffee_id, b.initial_grams;

comment on view v_bag_stock is
  'Stock on hand derived from the append-only ledger. There is no stored '
  'balance column by design.';

-- Freshness: where a bag sits on the degas curve today.
create view v_bag_freshness
with (security_invoker = on)
as
select
  b.id                                        as bag_id,
  b.user_id,
  b.roast_date,
  (current_date - b.roast_date)               as days_since_roast,
  (b.roast_date + b.degas_days_to_peak)       as peak_starts_on,
  (b.roast_date + b.degas_days_to_peak + b.peak_window_days) as peak_ends_on,
  case
    when b.roast_date is null or b.degas_days_to_peak is null then 'unknown'
    when current_date <  b.roast_date + b.degas_days_to_peak then 'degassing'
    when current_date <= b.roast_date + b.degas_days_to_peak + b.peak_window_days
      then 'peak'
    else 'past_peak'
  end                                         as freshness_state
from bags b;

-- Blend composition, flattened to one row per coffee.
--
-- Returned as JSONB rather than two parallel arrays (names[] + percentages[])
-- because parallel arrays silently desynchronise the moment anything sorts or
-- filters one of them. Formatting "70% Bourbon, 30% Typica" is left to the
-- app — that is presentation, not data.
create view v_coffee_varieties
with (security_invoker = on)
as
select
  cv.coffee_id,
  cv.user_id,
  array_agg(v.name order by cv.percentage desc nulls last, v.name)
    as variety_names,
  jsonb_agg(
    jsonb_build_object('name', v.name, 'percentage', cv.percentage)
    order by cv.percentage desc nulls last, v.name
  ) as composition,
  count(*) > 1 as is_blend
from coffee_varieties cv
join varieties v on v.id = cv.variety_id
group by cv.coffee_id, cv.user_id;

-- One row per bag with everything the list screen needs, so the app makes
-- one request instead of stitching four together on the client.
create view v_bag_overview
with (security_invoker = on)
as
select
  b.id            as bag_id,
  b.user_id,
  b.status,
  b.roast_date,
  b.price,
  b.currency,
  c.id            as coffee_id,
  c.name          as coffee_name,
  c.country,
  cv.variety_names,
  cv.composition,
  cv.is_blend,
  c.tasting_notes,
  c.roast_level,
  r.name          as roaster_name,
  s.grams_remaining,
  s.percent_remaining,
  s.brew_count,
  s.last_brewed_at,
  f.days_since_roast,
  f.freshness_state,
  -- Cost per brewed gram, once there is something to divide by.
  case
    when b.price is not null and b.initial_grams > 0
    then round(b.price / b.initial_grams, 4)
  end             as price_per_gram
from bags b
join coffees c                on c.id = b.coffee_id
left join roasters r          on r.id = c.roaster_id
left join v_coffee_varieties cv on cv.coffee_id = c.id
join v_bag_stock s            on s.bag_id = b.id
join v_bag_freshness f        on f.bag_id = b.id;
