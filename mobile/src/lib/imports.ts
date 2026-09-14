import { FunctionsHttpError } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { Database, Json } from './database.types';
import { type PickedPhoto, prepareForUpload } from './photos';
import type { ReviewedImport } from './review';
import { supabase } from './supabase';

// raw_payload (the fetched page, possibly 150k characters) exists for debugging
// and re-runs, so the app never downloads it.
const JOB_COLUMNS =
  'id, source, source_url, status, extracted, confidence, error_message, created_coffee_id, created_bag_id, created_at, processed_at';

export type ImportJob = Omit<Database['public']['Tables']['import_jobs']['Row'], 'raw_payload' | 'user_id'>;

export const importKeys = {
  all: ['imports'] as const,
  recent: ['imports', 'recent'] as const,
  job: (id: string) => ['imports', 'job', id] as const,
};

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('You are signed out. Please sign in again.');
  return id;
}

export async function startExtraction(jobId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('extract-import', { body: { job_id: jobId } });
  if (!error) return;

  // The function explains itself in a JSON body; surface that instead of a generic HTTP error.
  if (error instanceof FunctionsHttpError) {
    const body = await error.context.json().catch(() => null);
    throw new Error(body?.error ?? body?.message ?? error.message);
  }
  throw error;
}

// If anything fails before extraction starts, retire the half-built job so it
// does not linger in the list. Its photos are removed later by the retention job.
async function abandon(jobId: string) {
  await supabase.from('import_jobs').update({ status: 'rejected' }).eq('id', jobId).eq('status', 'pending');
}

export async function createUrlImport(url: string): Promise<string> {
  const userId = await requireUserId();
  const { data: job, error } = await supabase
    .from('import_jobs')
    .insert({ user_id: userId, source: 'url', source_url: url.trim() })
    .select('id')
    .single();
  if (error) throw error;

  try {
    await startExtraction(job.id);
  } catch (err) {
    await abandon(job.id);
    throw err;
  }
  return job.id;
}

export async function createPhotoImport(photos: PickedPhoto[]): Promise<string> {
  const userId = await requireUserId();
  const { data: job, error } = await supabase
    .from('import_jobs')
    .insert({ user_id: userId, source: 'photo' })
    .select('id')
    .single();
  if (error) throw error;

  try {
    for (const [position, photo] of photos.entries()) {
      const uri = await prepareForUpload(photo);
      const body = await fetch(uri).then((res) => res.arrayBuffer());

      // The first folder must be the user's id: the storage policy and a CHECK
      // constraint on import_job_photos both enforce it.
      const storagePath = `${userId}/${job.id}/${position}.jpg`;

      const upload = await supabase.storage
        .from('import-photos')
        .upload(storagePath, body, { contentType: 'image/jpeg' });
      if (upload.error) throw upload.error;

      const { error: photoError } = await supabase
        .from('import_job_photos')
        .insert({ import_job_id: job.id, user_id: userId, storage_path: storagePath, position });
      if (photoError) throw photoError;
    }

    await startExtraction(job.id);
  } catch (err) {
    await abandon(job.id);
    throw err;
  }
  return job.id;
}

async function fetchImportJob(jobId: string): Promise<ImportJob> {
  const { data, error } = await supabase.from('import_jobs').select(JOB_COLUMNS).eq('id', jobId).single();
  if (error) throw error;
  return data;
}

async function fetchRecentImports(): Promise<ImportJob[]> {
  const { data, error } = await supabase
    .from('import_jobs')
    .select(JOB_COLUMNS)
    .in('status', ['pending', 'extracting', 'extracted', 'failed'])
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return data;
}

// Snapshot plus change stream, like change data capture: load the row, then let
// Realtime events tell us when to reload it. The event only signals a change;
// the refetch carries the data, so large columns never travel over the socket.
// Refetching once subscribed also catches a change that landed in between.
export function useImportJob(jobId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: importKeys.job(jobId), queryFn: () => fetchImportJob(jobId) });

  useEffect(() => {
    const refresh = () => queryClient.invalidateQueries({ queryKey: importKeys.job(jobId) });
    const channel = supabase
      .channel(`import-job-${jobId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'import_jobs', filter: `id=eq.${jobId}` },
        refresh,
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') refresh();
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId, queryClient]);

  return query;
}

export function useRecentImports() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: importKeys.recent, queryFn: fetchRecentImports });

  useEffect(() => {
    // RLS applies to Realtime too, so this only ever sees the signed-in user's jobs.
    const channel = supabase
      .channel('recent-imports')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'import_jobs' }, () =>
        queryClient.invalidateQueries({ queryKey: importKeys.recent }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export interface CoffeeMatch {
  id: string;
  name: string;
  roaster: string | null;
}

// Same rule as the unique index on coffees: same roaster + same name, ignoring case.
export async function findExistingCoffee(name: string, roaster: string): Promise<CoffeeMatch | null> {
  if (name.trim() === '') return null;

  // Escape LIKE wildcards so ilike behaves as a case-insensitive equals.
  const pattern = name.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data, error } = await supabase.from('coffees').select('id, name, roasters(name)').ilike('name', pattern);
  if (error) throw error;

  const wanted = roaster.trim().toLowerCase();
  const match = data.find((c) => (c.roasters?.name ?? '').toLowerCase() === wanted);
  return match ? { id: match.id, name: match.name, roaster: match.roasters?.name ?? null } : null;
}

export async function confirmImport(jobId: string, reviewed: ReviewedImport) {
  const { data, error } = await supabase.rpc('confirm_import', {
    p_job_id: jobId,
    p_reviewed: reviewed as unknown as Json,
  });
  if (error) throw error;
  return data as { coffee_id: string; bag_id: string };
}

export async function rejectImport(jobId: string) {
  const { error } = await supabase.from('import_jobs').update({ status: 'rejected' }).eq('id', jobId);
  if (error) throw error;
}

export async function retryImport(jobId: string) {
  await startExtraction(jobId);
}
