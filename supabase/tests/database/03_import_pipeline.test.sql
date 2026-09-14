-- The import lifecycle: status state machine and the transactional confirm step.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'alice@test.local', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test.local',   'authenticated', 'authenticated');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into import_jobs (id, user_id, source) values
  ('aaaaaaaa-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 'photo');
insert into import_jobs (id, user_id, source, source_url) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'url', 'https://roaster.example/gesha'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'url', 'https://roaster.example/gesha-again');

-- Status state machine --------------------------------------------------------

select throws_ok(
  $$insert into import_jobs (user_id, source, source_url, status)
    values ('11111111-1111-1111-1111-111111111111', 'url', 'https://roaster.example/x', 'extracted')$$,
  'P0001', null,
  'New imports must start as pending'
);

select throws_ok(
  $$update import_jobs set status = 'extracting' where id = 'aaaaaaaa-0000-0000-0000-000000000009'$$,
  'P0001', null,
  'A photo import without photos cannot start extracting'
);

select throws_ok(
  $$update import_jobs set status = 'extracted' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  'P0001', null,
  'pending -> extracted skips a step and is rejected'
);

select lives_ok(
  $$update import_jobs set status = 'extracting'
     where id in ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002')$$,
  'pending -> extracting is allowed'
);

select lives_ok(
  $$update import_jobs set status = 'extracted'
     where id in ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002')$$,
  'extracting -> extracted is allowed'
);

select throws_ok(
  $$update import_jobs set status = 'confirmed' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  'P0001', 'Imports are confirmed through confirm_import(), not by updating status',
  'confirmed is only reachable through confirm_import()'
);

-- confirm_import ----------------------------------------------------------------

select lives_ok(
  $$select confirm_import('aaaaaaaa-0000-0000-0000-000000000001', '{
      "coffee_id": null,
      "coffee": {"name": "Gesha Village Lot 12", "roaster": "Onyx Coffee Lab", "country": "Ethiopia",
                 "process": "washed", "roast_level": "light",
                 "varieties": [{"name": "geisha", "percentage": 70}, {"name": "Pink Bourbon", "percentage": 30}],
                 "tasting_notes": ["jasmine", "bergamot"], "is_decaf": false},
      "bag": {"roast_date": "2026-09-01", "initial_grams": 250, "price": 22.50}
    }'::jsonb)$$,
  'confirm_import creates the coffee and its bag'
);

select results_eq(
  $$select coffee_name, roaster_name, grams_remaining, currency from v_bag_overview$$,
  $$values ('Gesha Village Lot 12'::text, 'Onyx Coffee Lab'::text, 250.00::numeric, 'EUR'::text)$$,
  'The confirmed import shows up in stock, priced in the profile''s default currency'
);

select is(
  (select count(*) from varieties where lower(name) = 'geisha')::int,
  1,
  'Existing lookup values are reused case-insensitively'
);

select throws_ok(
  $$select confirm_import('aaaaaaaa-0000-0000-0000-000000000001', '{"bag": {"initial_grams": 250}}')$$,
  'P0001', null,
  'An import cannot be confirmed twice'
);

select throws_ok(
  $$select confirm_import('aaaaaaaa-0000-0000-0000-000000000002', '{
      "coffee": {"name": "gesha village lot 12", "roaster": "onyx coffee lab"},
      "bag": {"initial_grams": 250}}')$$,
  '23505', null,
  'A duplicate coffee is rejected instead of silently merged'
);

select lives_ok(
  format(
    $$select confirm_import('aaaaaaaa-0000-0000-0000-000000000002',
        jsonb_build_object('coffee_id', %L, 'bag', jsonb_build_object('initial_grams', 1000)))$$,
    (select id from coffees where name = 'Gesha Village Lot 12')
  ),
  'A new bag can be added to an existing coffee'
);

select is((select count(*) from bags)::int, 2, 'The existing coffee now has two bags');

-- Other callers -------------------------------------------------------------

set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select throws_ok(
  $$select confirm_import('aaaaaaaa-0000-0000-0000-000000000002', '{"bag": {"initial_grams": 1}}')$$,
  'P0001', null,
  'Bob cannot confirm Alice''s import'
);

set local role anon;

select throws_ok(
  $$select confirm_import('aaaaaaaa-0000-0000-0000-000000000002', '{}')$$,
  '42501', null,
  'Anonymous callers cannot execute confirm_import'
);

select * from finish();
rollback;
