-- ============================================================================
-- Bakkie — import status state machine
--
-- import_jobs.status is a lifecycle, not a free-form label. This trigger turns
-- the allowed moves into a constraint:
--
--   (new row)   -> pending
--   pending     -> extracting | rejected
--   extracting  -> extracted  | failed
--   failed      -> extracting | rejected          (retry or give up)
--   extracted   -> extracting | rejected | confirmed
--   confirmed, rejected                           (final)
--
-- extracting -> failed is also the recovery path for a job stuck in
-- 'extracting' after a crashed function: mark it failed, then retry.
--
-- 'confirmed' is special. It must happen together with creating the coffee
-- and bag, so it is only allowed when confirm_import() has set a
-- transaction-local flag. Clients talk to the database through the REST API,
-- which cannot call set_config(), so they cannot set that flag themselves.
-- ============================================================================

create or replace function enforce_import_status_transition()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      raise exception 'New imports must start as pending, not %', new.status;
    end if;
    return new;
  end if;

  if new.status = old.status then
    return new;
  end if;

  if not (
       (old.status = 'pending'    and new.status in ('extracting', 'rejected'))
    or (old.status = 'extracting' and new.status in ('extracted', 'failed'))
    or (old.status = 'failed'     and new.status in ('extracting', 'rejected'))
    or (old.status = 'extracted'  and new.status in ('extracting', 'rejected', 'confirmed'))
  ) then
    raise exception 'Import % cannot move from % to %', old.id, old.status, new.status;
  end if;

  if new.status = 'confirmed'
     and coalesce(current_setting('bakkie.confirming', true), '') <> 'on' then
    raise exception 'Imports are confirmed through confirm_import(), not by updating status';
  end if;

  return new;
end;
$$;

create trigger import_jobs_status_transition
  before insert or update of status on import_jobs
  for each row execute function enforce_import_status_transition();
