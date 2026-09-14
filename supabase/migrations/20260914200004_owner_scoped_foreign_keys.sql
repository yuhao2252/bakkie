-- ============================================================================
-- Bakkie — owner-scoped foreign keys
--
-- Postgres checks foreign keys with row level security switched off. A plain
-- FK such as bags.coffee_id -> coffees.id therefore only proves that *some*
-- coffee with that id exists, not that it belongs to the same user. RLS hides
-- the other user's row, but the link itself would be accepted.
--
-- The fix is structural: every child references its parent by (id, user_id).
-- A row can then only point at a parent with the same owner, and the database
-- guarantees it regardless of which client wrote the row.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Step 1: parents expose (id, user_id) as a referenceable key
--
-- id is already unique, so these add no new rule. Postgres simply requires a
-- unique constraint on exactly the referenced columns. Cost: one extra index
-- per parent table, which is small next to the guarantee.
-- ---------------------------------------------------------------------------

alter table roasters        add constraint roasters_id_user_key        unique (id, user_id);
alter table processes       add constraint processes_id_user_key       unique (id, user_id);
alter table varieties       add constraint varieties_id_user_key       unique (id, user_id);
alter table brew_methods    add constraint brew_methods_id_user_key    unique (id, user_id);
alter table rating_criteria add constraint rating_criteria_id_user_key unique (id, user_id);
alter table coffees         add constraint coffees_id_user_key         unique (id, user_id);
alter table bags            add constraint bags_id_user_key            unique (id, user_id);
alter table brews           add constraint brews_id_user_key           unique (id, user_id);

-- ---------------------------------------------------------------------------
-- Step 2: replace each single-column FK with a composite one
--
-- Two details worth knowing:
--   * ON DELETE SET NULL (col): a plain SET NULL would null *every* FK column,
--     including user_id, which is NOT NULL, so deleting a roaster would fail.
--     The column list (Postgres 15+) nulls only the pointer.
--   * Nullable pointers (roaster_id, brew_id, ...) still work: with the default
--     MATCH SIMPLE, a composite FK is not checked when any column is null.
-- ---------------------------------------------------------------------------

alter table coffees
  drop constraint coffees_roaster_id_fkey,
  drop constraint coffees_process_id_fkey,
  add constraint coffees_roaster_fkey
    foreign key (roaster_id, user_id) references roasters (id, user_id)
    on delete set null (roaster_id),
  add constraint coffees_process_fkey
    foreign key (process_id, user_id) references processes (id, user_id)
    on delete set null (process_id);

alter table coffee_varieties
  drop constraint coffee_varieties_coffee_id_fkey,
  drop constraint coffee_varieties_variety_id_fkey,
  add constraint coffee_varieties_coffee_fkey
    foreign key (coffee_id, user_id) references coffees (id, user_id)
    on delete cascade,
  add constraint coffee_varieties_variety_fkey
    foreign key (variety_id, user_id) references varieties (id, user_id)
    on delete cascade;

alter table bags
  drop constraint bags_coffee_id_fkey,
  add constraint bags_coffee_fkey
    foreign key (coffee_id, user_id) references coffees (id, user_id)
    on delete cascade;

alter table brews
  drop constraint brews_bag_id_fkey,
  drop constraint brews_brew_method_id_fkey,
  add constraint brews_bag_fkey
    foreign key (bag_id, user_id) references bags (id, user_id)
    on delete cascade,
  add constraint brews_brew_method_fkey
    foreign key (brew_method_id, user_id) references brew_methods (id, user_id)
    on delete set null (brew_method_id);

alter table brew_ratings
  drop constraint brew_ratings_brew_id_fkey,
  drop constraint brew_ratings_criterion_id_fkey,
  add constraint brew_ratings_brew_fkey
    foreign key (brew_id, user_id) references brews (id, user_id)
    on delete cascade,
  add constraint brew_ratings_criterion_fkey
    foreign key (criterion_id, user_id) references rating_criteria (id, user_id)
    on delete cascade;

alter table inventory_transactions
  drop constraint inventory_transactions_bag_id_fkey,
  drop constraint inventory_transactions_brew_id_fkey,
  add constraint inventory_transactions_bag_fkey
    foreign key (bag_id, user_id) references bags (id, user_id)
    on delete cascade,
  add constraint inventory_transactions_brew_fkey
    foreign key (brew_id, user_id) references brews (id, user_id)
    on delete cascade;

alter table photos
  drop constraint photos_coffee_id_fkey,
  drop constraint photos_bag_id_fkey,
  add constraint photos_coffee_fkey
    foreign key (coffee_id, user_id) references coffees (id, user_id)
    on delete cascade,
  add constraint photos_bag_fkey
    foreign key (bag_id, user_id) references bags (id, user_id)
    on delete cascade;

alter table import_jobs
  drop constraint import_jobs_created_coffee_id_fkey,
  drop constraint import_jobs_created_bag_id_fkey,
  add constraint import_jobs_created_coffee_fkey
    foreign key (created_coffee_id, user_id) references coffees (id, user_id)
    on delete set null (created_coffee_id),
  add constraint import_jobs_created_bag_fkey
    foreign key (created_bag_id, user_id) references bags (id, user_id)
    on delete set null (created_bag_id);
