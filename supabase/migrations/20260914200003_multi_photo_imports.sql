-- ============================================================================
-- Bakkie — multi-photo imports
--
-- One import can carry several photos (front and back of a bag), so the single
-- import_jobs.source_photo_path column becomes a child table. Confirming an
-- import now creates a coffee AND a bag, so the job also records the bag.
--
-- This is a new migration rather than an edit to the initial one: migrations
-- are an append-only history, and once one has run against any database,
-- editing it makes that database silently disagree with the files.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- import_jobs: drop the single photo column, record the created bag
-- ---------------------------------------------------------------------------

alter table import_jobs drop constraint import_jobs_has_source;
alter table import_jobs drop column source_photo_path;

-- "A photo import has at least one photo" spans two tables, so a CHECK cannot
-- express it any more (see check_import_job_ready below).
alter table import_jobs add constraint import_jobs_has_source check (
  (source = 'url' and source_url is not null) or
  (source in ('photo', 'manual'))
);

alter table import_jobs
  add column created_bag_id uuid references bags(id) on delete set null;

-- Target for the composite foreign key below. id alone is already unique, so
-- this adds no new rule; it just lets children reference (id, user_id).
alter table import_jobs
  add constraint import_jobs_id_user_key unique (id, user_id);

-- ---------------------------------------------------------------------------
-- import_job_photos
--
-- Why a composite FK on (import_job_id, user_id)? Postgres runs foreign-key
-- checks with RLS switched off. A plain FK on import_job_id would let a user
-- attach their photo to another user's job, as long as they knew its uuid.
-- Including user_id in the key makes that structurally impossible: the parent
-- row must have the same owner.
-- ---------------------------------------------------------------------------

create table import_job_photos (
  id             uuid primary key default gen_random_uuid(),
  import_job_id  uuid not null,
  user_id        uuid not null references auth.users(id) on delete cascade,

  storage_path   text not null,
  position       smallint not null default 0,   -- display/prompt order
  created_at     timestamptz not null default now(),

  foreign key (import_job_id, user_id)
    references import_jobs (id, user_id) on delete cascade,

  constraint import_job_photos_position_range check (position between 0 and 9),
  constraint import_job_photos_position_key   unique (import_job_id, position),
  constraint import_job_photos_path_key       unique (storage_path),

  -- The storage policy below only allows uploads under "<user_id>/...". This
  -- keeps the database pointer consistent with that rule.
  constraint import_job_photos_path_owned check (
    split_part(storage_path, '/', 1) = user_id::text
  )
);

create index import_job_photos_user_idx on import_job_photos (user_id);

alter table import_job_photos enable row level security;

create policy import_job_photos_own_rows on import_job_photos
  for all
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Lifecycle invariant: no extraction without photos
--
-- The app writes the job and its photos in separate HTTP requests, which means
-- separate transactions. Checking "has photos" at insert time would always
-- fail, because the job exists before its photos do. So the rule is tied to the
-- state transition instead: a photo job cannot move to 'extracting' empty.
-- ---------------------------------------------------------------------------

create or replace function check_import_job_ready()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'extracting'
     and old.status is distinct from 'extracting'
     and new.source = 'photo'
     and not exists (
       select 1 from import_job_photos p where p.import_job_id = new.id
     )
  then
    raise exception 'Photo import % has no photos attached', new.id;
  end if;

  return new;
end;
$$;

create trigger import_jobs_check_ready
  before update of status on import_jobs
  for each row execute function check_import_job_ready();

-- ---------------------------------------------------------------------------
-- Storage bucket for import photos
--
-- Private bucket: files are only reachable through signed URLs or an
-- authenticated request. Limits are enforced by Storage itself, so a buggy or
-- tampered client cannot upload a 200 MB file or a HEIC the extractor cannot
-- read (the app converts iPhone HEIC photos to JPEG before upload).
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'import-photos', 'import-photos', false,
  10485760,                                        -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp']
);

-- Path convention: <user_id>/<import_job_id>/<file>. The first folder must be
-- the caller's own uid, which is what isolates users inside one bucket.
create policy import_photos_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'import-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy import_photos_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'import-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy import_photos_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'import-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
