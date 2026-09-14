import type { Session } from '@supabase/supabase-js';
import { createContext, type PropsWithChildren, use, useEffect, useState } from 'react';

import { supabase } from './supabase';

interface SessionState {
  session: Session | null;
  isLoading: boolean;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<SessionState>({ session: null, isLoading: true });

  useEffect(() => {
    // The stored session loads first; after that, sign-in, sign-out and token
    // refreshes arrive as auth state changes.
    supabase.auth.getSession().then(({ data }) => setState({ session: data.session, isLoading: false }));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ session, isLoading: false });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return <SessionContext value={state}>{children}</SessionContext>;
}

export function useSession(): SessionState {
  const value = use(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>.');
  return value;
}
