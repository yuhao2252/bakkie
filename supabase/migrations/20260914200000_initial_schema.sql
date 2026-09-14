-- ============================================================================
-- Bakkie — initial schema
--
-- Modeling notes for the reader:
--   * Grain: a COFFEE is a product (stable facts about a bean). A BAG is one
--     purchase of that product (roast date, price, weight). Buying the same
--     coffee twice creates two bags, not two coffees.
--   * Closed domains (a fixed set we control) use Postgres enums — changing
--     them requires a migration, which is the point.
--   * Open domains (sets the user extends at runtime) use lookup tables.
--   * Every user-owned row carries user_id and is gated by RLS (see the
--     rls_policies migration). Isolation is enforced by the database, not
--     by application code.
-- ============================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enums (closed domains)
-- ---------------------------------------------------------------------------

create type roast_level as enum (
  'light', 'medium_light', 'medium', 'medium_dark', 'dark'
);

create type bag_status as enum (
  'sealed', 'open', 'finished', 'discarded'
);

-- The ledger's vocabulary. Every movement of coffee in or out is one of these.
create type inventory_txn_type as enum (
  'purchase',    -- coffee arrives  (positive)
  'brew',        -- consumed in a brew (negative, auto-written by trigger)
  'waste',       -- purge, spill, dialing-in throwaway (negative)
  'gift',        -- given away (negative)
  'adjustment'   -- reconciliation against a real-world scale (either sign)
);

create type import_source as enum ('url', 'photo', 'manual');

create type import_status as enum (
  'pending', 'extracting', 'extracted', 'failed', 'confirmed', 'rejected'
);

-- ---------------------------------------------------------------------------
-- profiles — app-level user record, 1:1 with Supabase's auth.users
--
-- auth.users is managed by Supabase and we should not add columns to it.
-- This is the standard pattern: our own table keyed by the same uuid.
-- ---------------------------------------------------------------------------

create table profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  display_name      text,
  default_currency  text not null default 'EUR',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

comment on table profiles is
  'Application-level user record. One row per auth.users row.';

-- ---------------------------------------------------------------------------
-- Lookup tables (open domains — the user can add rows at runtime)
--
-- These are per-user rather than global. Trade-off: a shared catalog would
-- let users benefit from each other''s data entry, but it couples users
-- together and needs moderation. Per-user keeps "each user has one
-- repository" literally true. Promoting these to a shared catalog later is
-- a migration, not a redesign.
-- ---------------------------------------------------------------------------

create table roasters (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  website     text,
  country     text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint roasters_name_not_blank check (length(trim(name)) > 0)
);

-- Case-insensitive uniqueness per user: "Mellow" and "mellow" are one roaster.
create unique index roasters_user_name_key
  on roasters (user_id, lower(name));

create trigger roasters_set_updated_at
  before update on roasters
  for each row execute function set_updated_at();

create table processes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  sort_order  int not null default 100,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create unique index processes_user_name_key
  on processes (user_id, lower(name));

comment on table processes is
  'Coffee processing methods (washed, natural, honey, ...). A lookup table '
  'rather than an enum because specialty roasters invent new ones constantly.';

create table varieties (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  notes       text,
  created_at  timestamptz not null default now()
);

create unique index varieties_user_name_key
  on varieties (user_id, lower(name));

comment on table varieties is
  'Cultivars (Bourbon, Geisha, SL28, ...). A dimension table rather than free '
  'text so that "every Geisha I have owned" is a join, not a string match.';

create table brew_methods (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  -- Espresso and filter have different sensible defaults and different
  -- ratio maths, so we tag the family rather than hardcoding method names.
  is_espresso boolean not null default false,
  sort_order  int not null default 100,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create unique index brew_methods_user_name_key
  on brew_methods (user_id, lower(name));

create table rating_criteria (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  scale_min   int not null default 1,
  scale_max   int not null default 10,
  sort_order  int not null default 100,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),

  constraint rating_criteria_scale_valid check (scale_max > scale_min)
);

create unique index rating_criteria_user_name_key
  on rating_criteria (user_id, lower(name));

comment on table rating_criteria is
  'User-definable rating dimensions (acidity, sweetness, body, ...). Adding '
  'a criterion is an INSERT, not a schema change — that is why ratings are '
  'stored long/narrow in brew_ratings instead of as columns on brews.';

-- ---------------------------------------------------------------------------
-- coffees — the product dimension
--
-- Stable facts about a bean that do not change between purchases.
-- ---------------------------------------------------------------------------

create table coffees (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  roaster_id     uuid references roasters(id) on delete set null,

  name           text not null,
  description    text,

  -- Origin
  country        text,
  region         text,
  producer       text,          -- farm, co-op, or washing station
  altitude_masl  int,

  -- Varieties live in the coffee_varieties junction table below, because a
  -- blend is a many-to-many with an attribute (the percentage) on the
  -- relationship itself. That attribute is exactly what an array cannot hold.
  process_id     uuid references processes(id) on delete set null,
  roast_level    roast_level,

  -- Stored as an array so "show me every floral coffee I own" is an index
  -- scan rather than a LIKE over prose.
  tasting_notes  text[] not null default '{}',

  is_decaf       boolean not null default false,
  source_url     text,          -- provenance: where this record came from

  -- Escape hatch for fields not yet worth a column. The intended lifecycle is
  -- JSONB first, then promote to a real typed column once a field proves it
  -- is load-bearing. Schema-on-read, graduating to schema-on-write.
  attributes     jsonb not null default '{}'::jsonb,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint coffees_name_not_blank check (length(trim(name)) > 0),
  constraint coffees_altitude_sane  check (altitude_masl is null
                                           or altitude_masl between 0 and 4000)
);

-- Same roaster + same name = same coffee. NULLS NOT DISTINCT so that two
-- roaster-less coffees with the same name still collide (default Postgres
-- behaviour would treat each NULL as unique and let duplicates through).
create unique index coffees_user_roaster_name_key
  on coffees (user_id, roaster_id, lower(name)) nulls not distinct;

create index coffees_user_id_idx       on coffees (user_id);
create index coffees_tasting_notes_idx on coffees using gin (tasting_notes);
create index coffees_attributes_idx    on coffees using gin (attributes);

create trigger coffees_set_updated_at
  before update on coffees
  for each row execute function set_updated_at();

comment on column coffees.attributes is
  'Unmodeled extra fields. Promote to a real column once a key is queried '
  'often or needs a constraint.';

-- ---------------------------------------------------------------------------
-- coffee_varieties — blend composition
--
-- A junction table rather than an array on coffees, because the percentage is
-- an attribute of the *relationship* between a coffee and a variety, not of
-- either one alone. Single-origins are simply the one-row case.
--
-- percentage is nullable: plenty of bags say "Bourbon and Typica" without
-- telling you the split, and inventing a number would be worse than admitting
-- we do not know.
-- ---------------------------------------------------------------------------

create table coffee_varieties (
  coffee_id   uuid not null references coffees(id)   on delete cascade,
  variety_id  uuid not null references varieties(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  percentage  numeric(5,2),
  created_at  timestamptz not null default now(),

  primary key (coffee_id, variety_id),

  constraint coffee_varieties_pct_range check (
    percentage is null or (percentage > 0 and percentage <= 100)
  )
);

create index coffee_varieties_variety_idx on coffee_varieties (variety_id);
create index coffee_varieties_user_idx    on coffee_varieties (user_id);

-- "Percentages must not exceed 100" spans several rows, so a row-level CHECK
-- cannot express it — this is the class of invariant that needs a constraint
-- trigger. Deferred to the end of the statement so that inserting a 70/30
-- split as two rows does not trip over itself midway.
create or replace function check_variety_percentage_total()
returns trigger
language plpgsql
as $$
declare
  total numeric;
  target_coffee uuid;
begin
  -- NEW is unassigned during DELETE, and merely *referencing* it there raises
  -- "record new is not assigned yet" — so this has to branch on TG_OP rather
  -- than lean on coalesce(new.…, old.…), which would evaluate NEW eagerly.
  if tg_op = 'DELETE' then
    target_coffee := old.coffee_id;
  else
    target_coffee := new.coffee_id;
  end if;

  select sum(percentage) into total
    from coffee_varieties
   where coffee_id = target_coffee;

  if total is not null and total > 100 then
    raise exception
      'Blend percentages for coffee % total %%%, which exceeds 100%%',
      target_coffee, total;
  end if;

  return null;
end;
$$;

create constraint trigger coffee_varieties_pct_total
  after insert or update or delete on coffee_varieties
  deferrable initially deferred
  for each row execute function check_variety_percentage_total();

-- ---------------------------------------------------------------------------
-- bags — one purchase of a coffee
--
-- This is where roast date, price and weight live, because they are facts
-- about the purchase, not about the bean.
-- ---------------------------------------------------------------------------

create table bags (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  coffee_id           uuid not null references coffees(id) on delete cascade,

  roast_date          date,
  purchased_at        date,
  opened_at           date,

  initial_grams       numeric(8,2) not null,
  price               numeric(10,2),        -- numeric, never float, for money
  currency            text,
  vendor              text,

  -- Freshness model: coffee degasses after roasting, hits a plateau, then
  -- fades. Two numbers describe that curve per-bag because it varies by
  -- roast level and brew method.
  degas_days_to_peak  int,
  peak_window_days    int not null default 14,

  status              bag_status not null default 'sealed',
  notes               text,
  attributes          jsonb not null default '{}'::jsonb,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint bags_initial_grams_positive check (initial_grams > 0),
  constraint bags_price_non_negative     check (price is null or price >= 0),
  constraint bags_degas_sane             check (degas_days_to_peak is null
                                                or degas_days_to_peak between 0 and 90),
  constraint bags_opened_after_roast     check (opened_at is null
                                                or roast_date is null
                                                or opened_at >= roast_date)
);

create index bags_user_id_idx   on bags (user_id);
create index bags_coffee_id_idx on bags (coffee_id);
create index bags_status_idx    on bags (user_id, status);

create trigger bags_set_updated_at
  before update on bags
  for each row execute function set_updated_at();

comment on column bags.initial_grams is
  'Declared weight on the label. The ledger is the source of truth for what '
  'is actually left; this value seeds the opening purchase transaction.';

-- ---------------------------------------------------------------------------
-- brews — the event/fact table
--
-- One row per cup. This is the table that will grow fastest and the one
-- worth analysing later.
-- ---------------------------------------------------------------------------

create table brews (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  bag_id             uuid not null references bags(id) on delete cascade,
  brew_method_id     uuid references brew_methods(id) on delete set null,

  brewed_at          timestamptz not null default now(),

  dose_grams         numeric(6,2) not null,   -- coffee in
  yield_grams        numeric(6,2),            -- liquid out (espresso)
  water_grams        numeric(7,2),            -- water in (filter)
  brew_time_seconds  int,
  water_temp_c       numeric(4,1),
  grind_setting      text,                    -- text: every grinder differs

  notes              text,
  attributes         jsonb not null default '{}'::jsonb,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint brews_dose_positive   check (dose_grams > 0),
  constraint brews_yield_positive  check (yield_grams is null or yield_grams > 0),
  constraint brews_water_positive  check (water_grams is null or water_grams > 0),
  constraint brews_time_sane       check (brew_time_seconds is null
                                          or brew_time_seconds between 1 and 86400),
  constraint brews_temp_sane       check (water_temp_c is null
                                          or water_temp_c between 0 and 100)
);

create index brews_user_id_idx    on brews (user_id);
create index brews_bag_id_idx     on brews (bag_id);
create index brews_brewed_at_idx  on brews (user_id, brewed_at desc);

create trigger brews_set_updated_at
  before update on brews
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- brew_ratings — long/narrow so criteria can be added without a migration
-- ---------------------------------------------------------------------------

create table brew_ratings (
  brew_id      uuid not null references brews(id) on delete cascade,
  criterion_id uuid not null references rating_criteria(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  score        numeric(4,1) not null,
  created_at   timestamptz not null default now(),

  primary key (brew_id, criterion_id)
);

create index brew_ratings_user_id_idx on brew_ratings (user_id);

-- ---------------------------------------------------------------------------
-- inventory_transactions — the ledger
--
-- Append-only. There is deliberately no grams_remaining column anywhere:
-- stock is SUM(grams_delta) over this table. Same reasoning as an accounting
-- ledger — history is preserved, a partial failure cannot silently corrupt a
-- balance, and "how fast do I drink a bag" is answerable after the fact.
-- ---------------------------------------------------------------------------

create table inventory_transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  bag_id       uuid not null references bags(id) on delete cascade,
  brew_id      uuid references brews(id) on delete cascade,

  occurred_at  timestamptz not null default now(),
  txn_type     inventory_txn_type not null,
  grams_delta  numeric(8,2) not null,
  note         text,

  created_at   timestamptz not null default now(),

  constraint inventory_txn_nonzero check (grams_delta <> 0),

  -- The sign must agree with the type. Pushing this invariant into the
  -- database means no application bug can write a purchase that removes
  -- coffee, regardless of which client wrote it.
  constraint inventory_txn_sign_matches_type check (
    (txn_type = 'purchase'   and grams_delta > 0) or
    (txn_type in ('brew', 'waste', 'gift') and grams_delta < 0) or
    (txn_type = 'adjustment')
  ),

  -- A brew-type transaction must point at its brew, and nothing else may.
  constraint inventory_txn_brew_link check (
    (txn_type = 'brew' and brew_id is not null) or
    (txn_type <> 'brew' and brew_id is null)
  )
);

create index inventory_txn_bag_idx  on inventory_transactions (bag_id, occurred_at);
create index inventory_txn_user_idx on inventory_transactions (user_id, occurred_at desc);

-- One ledger row per brew, enforced structurally.
create unique index inventory_txn_one_per_brew
  on inventory_transactions (brew_id) where brew_id is not null;

-- ---------------------------------------------------------------------------
-- photos — images attached to a coffee or a bag
--
-- The image bytes live in Supabase Storage; this table holds the pointer plus
-- metadata. Storing binaries in Postgres is possible and almost always wrong.
-- ---------------------------------------------------------------------------

create table photos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  coffee_id     uuid references coffees(id) on delete cascade,
  bag_id        uuid references bags(id) on delete cascade,

  storage_path  text not null,
  caption       text,
  created_at    timestamptz not null default now(),

  constraint photos_attached_to_something check (
    coffee_id is not null or bag_id is not null
  )
);

create index photos_user_id_idx   on photos (user_id);
create index photos_coffee_id_idx on photos (coffee_id);
create index photos_bag_id_idx    on photos (bag_id);

-- ---------------------------------------------------------------------------
-- import_jobs — the staging layer for URL and photo ingestion
--
-- Imports never write straight into coffees. They land here with the raw
-- payload (bronze) and the structured extraction (silver); the user reviews
-- and confirms, and only then is a coffee row created (gold).
--
-- Keeping raw_payload means a better extractor can be re-run over old inputs
-- without re-fetching anything.
-- ---------------------------------------------------------------------------

create table import_jobs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,

  source            import_source not null,
  source_url        text,
  source_photo_path text,

  raw_payload       jsonb,      -- fetched HTML / OCR text / response metadata
  extracted         jsonb,      -- structured candidate fields
  confidence        numeric(3,2),

  status            import_status not null default 'pending',
  error_message     text,

  created_coffee_id uuid references coffees(id) on delete set null,

  created_at        timestamptz not null default now(),
  processed_at      timestamptz,

  constraint import_jobs_confidence_range check (
    confidence is null or confidence between 0 and 1
  ),
  constraint import_jobs_has_source check (
    (source = 'url'    and source_url is not null) or
    (source = 'photo'  and source_photo_path is not null) or
    (source = 'manual')
  )
);

create index import_jobs_user_status_idx on import_jobs (user_id, status, created_at desc);
