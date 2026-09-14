-- Isolation between users: row level security plus owner-scoped foreign keys.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'alice@test.local', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test.local',   'authenticated', 'authenticated');

-- Act as Alice
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into coffees (id, user_id, name)
values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Alice Geisha');
insert into bags (id, user_id, coffee_id, initial_grams)
values ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 250);
insert into import_jobs (id, user_id, source, source_url)
values ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'url', 'https://roaster.example/geisha');

select is((select count(*) from coffees)::int, 1, 'Alice sees her own coffee');

-- Act as Bob
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is((select count(*) from coffees)::int, 0, 'RLS: Bob cannot see Alice''s coffees');
select is((select count(*) from bags)::int, 0, 'RLS: Bob cannot see Alice''s bags');
select is((select count(*) from import_jobs)::int, 0, 'RLS: Bob cannot see Alice''s imports');

select throws_ok(
  $$insert into coffees (user_id, name) values ('11111111-1111-1111-1111-111111111111', 'Spoofed owner')$$,
  '42501', null,
  'RLS: Bob cannot write a row that claims Alice as owner'
);

select throws_ok(
  $$insert into bags (user_id, coffee_id, initial_grams)
    values ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001', 100)$$,
  '23503', null,
  'Owner-scoped FK: Bob cannot attach a bag to Alice''s coffee'
);

select throws_ok(
  $$insert into import_job_photos (import_job_id, user_id, storage_path)
    values ('aaaaaaaa-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222',
            '22222222-2222-2222-2222-222222222222/front.jpg')$$,
  '23503', null,
  'Owner-scoped FK: Bob cannot attach a photo to Alice''s import'
);

-- RLS makes Alice's rows invisible to this delete, so it removes nothing.
delete from coffees;

-- Back to Alice
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is((select count(*) from coffees)::int, 1, 'RLS: Bob''s delete did not touch Alice''s coffee');

select throws_ok(
  $$insert into import_job_photos (import_job_id, user_id, storage_path)
    values ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
            '22222222-2222-2222-2222-222222222222/front.jpg')$$,
  '23514', null,
  'Photo paths must live under the owner''s own storage folder'
);

select * from finish();
rollback;
