-- ============================================================================
-- Bakkie — import pipeline: live status and transactional confirm
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Live status
--
-- The app subscribes to its import_jobs rows to follow pending -> extracting
-- -> extracted. Realtime only streams tables in this publication, and it
-- applies RLS to every event, so a user only receives their own jobs.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table import_jobs;

-- ---------------------------------------------------------------------------
-- confirm_import — the silver -> gold step
--
-- Takes the fields the user reviewed and writes roaster, coffee, varieties and
-- bag in ONE transaction. Any failure (a constraint, a bad cast, a blend over
-- 100%) rolls everything back, so there is never a coffee without its bag.
--
-- p_reviewed shape (plain values; confidence scores stay in import_jobs):
--   {
--     "coffee_id": null | "<uuid of an existing coffee the user chose>",
--     "coffee": { "name", "roaster", "description", "country", "region",
--                 "producer", "altitude_masl", "process", "roast_level",
--                 "varieties": [{ "name", "percentage" }],
--                 "tasting_notes": [], "is_decaf", "source_url" },
--     "bag":    { "roast_date", "purchased_at", "initial_grams",
--                 "price", "currency", "vendor" }
--   }
-- When coffee_id is given, "coffee" is ignored: confirming adds a bag to the
-- existing coffee rather than overwriting what the user already curated.
--
-- SECURITY INVOKER (the default, stated for the reader): the function runs as
-- the calling user, so every insert still passes through RLS and the
-- owner-scoped foreign keys. It gains no privileges by being a function.
-- ---------------------------------------------------------------------------

create or replace function confirm_import(p_job_id uuid, p_reviewed jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid        uuid  := (select auth.uid());
  v_job        import_jobs%rowtype;
  v_coffee     jsonb := coalesce(p_reviewed->'coffee', '{}'::jsonb);
  v_bag        jsonb := coalesce(p_reviewed->'bag', '{}'::jsonb);
  v_coffee_id  uuid  := nullif(p_reviewed->>'coffee_id', '')::uuid;
  v_roaster    text  := nullif(trim(v_coffee->>'roaster'), '');
  v_process    text  := nullif(trim(v_coffee->>'process'), '');
  v_roaster_id uuid;
  v_process_id uuid;
  v_variety    jsonb;
  v_variety_id uuid;
  v_bag_id     uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- FOR UPDATE locks the job row until commit. Two quick taps on "Confirm"
  -- then run one after the other: the second sees status = 'confirmed' and
  -- stops, instead of both passing the check and creating two bags.
  select * into v_job from import_jobs where id = p_job_id for update;

  if not found then
    -- Also what another user's job looks like: RLS makes it invisible.
    raise exception 'Import % not found', p_job_id;
  end if;

  if v_job.status <> 'extracted' then
    raise exception 'Import % is %; only extracted imports can be confirmed',
      p_job_id, v_job.status;
  end if;

  if v_coffee_id is null then
    -- Lookup values are find-or-create. ON CONFLICT targets the
    -- case-insensitive unique index, so "Onyx" reuses an existing "onyx".
    if v_roaster is not null then
      insert into roasters (user_id, name) values (v_uid, v_roaster)
      on conflict (user_id, lower(name)) do nothing;

      select id into v_roaster_id
        from roasters where user_id = v_uid and lower(name) = lower(v_roaster);
    end if;

    if v_process is not null then
      insert into processes (user_id, name) values (v_uid, v_process)
      on conflict (user_id, lower(name)) do nothing;

      select id into v_process_id
        from processes where user_id = v_uid and lower(name) = lower(v_process);
    end if;

    -- No ON CONFLICT here on purpose: if this roaster + name already exists,
    -- the unique index raises and the app asks the user to pick the existing
    -- coffee or rename. Silently merging would be entity resolution by accident.
    insert into coffees (
      user_id, roaster_id, name, description,
      country, region, producer, altitude_masl,
      process_id, roast_level, tasting_notes, is_decaf, source_url
    ) values (
      v_uid, v_roaster_id, trim(v_coffee->>'name'), v_coffee->>'description',
      v_coffee->>'country', v_coffee->>'region', v_coffee->>'producer',
      (v_coffee->>'altitude_masl')::int,
      v_process_id, (v_coffee->>'roast_level')::roast_level,
      array(select jsonb_array_elements_text(coalesce(v_coffee->'tasting_notes', '[]'::jsonb))),
      coalesce((v_coffee->>'is_decaf')::boolean, false),
      coalesce(v_coffee->>'source_url', v_job.source_url)
    )
    returning id into v_coffee_id;

    for v_variety in
      select value from jsonb_array_elements(coalesce(v_coffee->'varieties', '[]'::jsonb))
    loop
      continue when nullif(trim(v_variety->>'name'), '') is null;

      insert into varieties (user_id, name) values (v_uid, trim(v_variety->>'name'))
      on conflict (user_id, lower(name)) do nothing;

      select id into v_variety_id
        from varieties
       where user_id = v_uid and lower(name) = lower(trim(v_variety->>'name'));

      insert into coffee_varieties (coffee_id, variety_id, user_id, percentage)
      values (v_coffee_id, v_variety_id, v_uid, (v_variety->>'percentage')::numeric)
      on conflict (coffee_id, variety_id) do nothing;
    end loop;
  end if;

  -- Unknown purchase facts stay NULL rather than being invented. Currency is
  -- the one default: a price without a currency is unusable, and the user's
  -- profile says which currency they normally pay in.
  insert into bags (
    user_id, coffee_id, roast_date, purchased_at,
    initial_grams, price, currency, vendor
  ) values (
    v_uid, v_coffee_id,
    (v_bag->>'roast_date')::date, (v_bag->>'purchased_at')::date,
    (v_bag->>'initial_grams')::numeric, (v_bag->>'price')::numeric,
    case when v_bag->>'price' is not null then
      coalesce(v_bag->>'currency', (select default_currency from profiles where id = v_uid))
    end,
    v_bag->>'vendor'
  )
  returning id into v_bag_id;

  -- Transaction-local flag read by the status-transition trigger: it is the
  -- only way a job may become 'confirmed'. It resets automatically at commit.
  perform set_config('bakkie.confirming', 'on', true);

  update import_jobs
     set status            = 'confirmed',
         created_coffee_id = v_coffee_id,
         created_bag_id    = v_bag_id,
         processed_at      = now()
   where id = p_job_id;

  return jsonb_build_object('coffee_id', v_coffee_id, 'bag_id', v_bag_id);
end;
$$;

-- Functions in public are executable by everyone by default, including the
-- anonymous role. Only signed-in users have any business confirming imports.
revoke execute on function confirm_import(uuid, jsonb) from public, anon;
grant  execute on function confirm_import(uuid, jsonb) to authenticated;
