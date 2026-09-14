import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Message, Screen, TextField } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { colors, space, typography } from '@/lib/theme';

type Mode = 'sign-in' | 'sign-up';

export default function SignInScreen() {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const credentials = { email: email.trim(), password };

    if (mode === 'sign-in') {
      const { error: signInError } = await supabase.auth.signInWithPassword(credentials);
      if (signInError) setError(signInError.message);
    } else {
      const { data, error: signUpError } = await supabase.auth.signUp(credentials);
      if (signUpError) setError(signUpError.message);
      else if (!data.session) setNotice('Check your email to confirm your account, then sign in.');
    }

    // On success the session changes and the root layout switches to the app by itself.
    setBusy(false);
  }

  const signingIn = mode === 'sign-in';

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <View style={styles.intro}>
          <Text style={typography.title}>Bakkie</Text>
          <Text style={typography.muted}>Your coffee beans, in one place.</Text>
        </View>

        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={signingIn ? 'current-password' : 'new-password'}
          textContentType={signingIn ? 'password' : 'newPassword'}
        />

        {error ? <Message tone="error">{error}</Message> : null}
        {notice ? <Message>{notice}</Message> : null}

        <Button
          title={signingIn ? 'Sign in' : 'Create account'}
          onPress={submit}
          loading={busy}
          disabled={email.trim() === '' || password.length < 6}
        />

        <Pressable onPress={() => setMode(signingIn ? 'sign-up' : 'sign-in')} style={styles.switch}>
          <Text style={styles.switchText}>
            {signingIn ? 'New here? Create an account' : 'Already have an account? Sign in'}
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: space.xl,
    gap: space.lg,
  },
  intro: {
    gap: space.xs,
    marginBottom: space.md,
  },
  switch: {
    alignItems: 'center',
    padding: space.sm,
  },
  switchText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '500',
  },
});
