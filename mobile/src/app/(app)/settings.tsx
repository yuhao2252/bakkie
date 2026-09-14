import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Button, Card, Screen } from '@/components/ui';
import { useSession } from '@/lib/auth';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import { space, typography } from '@/lib/theme';

export default function SettingsScreen() {
  const { session } = useSession();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await supabase.auth.signOut();
    // Cached query results belong to this user and must not show up for the next one.
    queryClient.clear();
  }

  return (
    <Screen edges={['bottom', 'left', 'right']} style={styles.container}>
      <Card>
        <Text style={typography.label}>Signed in as</Text>
        <Text style={typography.body}>{session?.user.email}</Text>
      </Card>
      <Button title="Sign out" variant="danger" onPress={signOut} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: space.lg,
    gap: space.lg,
  },
});
