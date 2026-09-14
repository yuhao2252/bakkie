import { focusManager, QueryClient } from '@tanstack/react-query';
import { AppState, Platform, type AppStateStatus } from 'react-native';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data younger than 30 s is served from cache without asking the server again.
      staleTime: 30_000,
      retry: 1,
    },
  },
});

// React Native has no browser "window focus" event; tell TanStack Query when the
// app returns to the foreground so stale queries refetch.
AppState.addEventListener('change', (status: AppStateStatus) => {
  if (Platform.OS !== 'web') {
    focusManager.setFocused(status === 'active');
  }
});
