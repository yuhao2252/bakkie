import { useQuery } from '@tanstack/react-query';

import type { Database } from './database.types';
import { supabase } from './supabase';

// One row per bag with stock, freshness and coffee details, computed by the v_bag_overview view.
export type BagOverview = Database['public']['Views']['v_bag_overview']['Row'];

export const bagKeys = {
  all: ['bags'] as const,
};

async function fetchBagsOnHand(): Promise<BagOverview[]> {
  const { data, error } = await supabase
    .from('v_bag_overview')
    .select('*')
    .in('status', ['sealed', 'open'])
    .order('roast_date', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data;
}

export function useBagsOnHand() {
  return useQuery({ queryKey: bagKeys.all, queryFn: fetchBagsOnHand });
}
