-- New-user bootstrap, the inventory ledger, and blend composition rules.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email, aud, role, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111111', 'alice@test.local', 'authenticated', 'authenticated',
        '{"display_name":"Alice"}');

select is(
  (select display_name from profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Alice',
  'Signup trigger creates the profile'
);

select ok(
  (select count(*) from varieties    where user_id = '11111111-1111-1111-1111-111111111111') > 0
  and (select count(*) from brew_methods where user_id = '11111111-1111-1111-1111-111111111111') > 0,
  'Signup trigger seeds the lookup tables'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into coffees (id, user_id, name)
values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Ledger coffee');
insert into bags (id, user_id, coffee_id, initial_grams)
values ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-000000000001', 250);

select is(
  (select grams_remaining from v_bag_stock where bag_id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  250.00::numeric,
  'A new bag opens with a purchase transaction'
);

insert into brews (id, user_id, bag_id, dose_grams)
values ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-000000000002', 18);

select is(
  (select grams_remaining from v_bag_stock where bag_id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  232.00::numeric,
  'Logging a brew consumes its dose'
);

update brews set dose_grams = 20 where id = 'aaaaaaaa-0000-0000-0000-000000000003';

select is(
  (select grams_remaining from v_bag_stock where bag_id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  230.00::numeric,
  'Editing a brew rewrites its ledger entry instead of adding one'
);

-- The blend check is deferred to commit in real use; make it fire per statement here.
set constraints coffee_varieties_pct_total immediate;

select throws_ok(
  $$insert into coffee_varieties (coffee_id, variety_id, user_id, percentage)
    select 'aaaaaaaa-0000-0000-0000-000000000001', id, user_id,
           case when name = 'Bourbon' then 70 else 50 end
      from varieties
     where user_id = '11111111-1111-1111-1111-111111111111' and name in ('Bourbon', 'Typica')$$,
  'P0001', null,
  'Blend percentages above 100% are rejected'
);

select * from finish();
rollback;
