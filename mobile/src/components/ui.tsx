import type { PropsWithChildren } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { type Edge, SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, space, typography } from '@/lib/theme';

export function Screen({
  children,
  edges = ['top', 'left', 'right'],
  style,
}: PropsWithChildren<{ edges?: Edge[]; style?: StyleProp<ViewStyle> }>) {
  return (
    <SafeAreaView edges={edges} style={[styles.screen, style]}>
      {children}
    </SafeAreaView>
  );
}

export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Message({ tone = 'info', children }: PropsWithChildren<{ tone?: 'info' | 'warning' | 'error' }>) {
  return (
    <View style={[styles.message, tone === 'error' && styles.messageError, tone === 'warning' && styles.messageWarning]}>
      <Text
        style={[
          typography.body,
          tone === 'error' && { color: colors.danger },
          tone === 'warning' && { color: colors.warning },
        ]}>
        {children}
      </Text>
    </View>
  );
}

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
}

export function Button({ title, onPress, variant = 'primary', disabled = false, loading = false }: ButtonProps) {
  const primary = variant === 'primary';
  const inactive = disabled || loading;
  const textColor = primary ? colors.onPrimary : variant === 'danger' ? colors.danger : colors.primary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        inactive && styles.buttonInactive,
        pressed && styles.buttonPressed,
      ]}>
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.buttonText, { color: textColor }]}>{title}</Text>
      )}
    </Pressable>
  );
}

interface TextFieldProps extends TextInputProps {
  label: string;
  hint?: string;
  flagged?: boolean;
}

export function TextField({ label, hint, flagged = false, style, ...input }: TextFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={typography.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        style={[styles.input, flagged && styles.inputFlagged, style]}
        {...input}
      />
      {hint ? <Text style={[typography.muted, flagged && { color: colors.warning }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.md,
  },
  message: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: space.md,
  },
  messageError: {
    backgroundColor: colors.dangerSurface,
    borderColor: colors.dangerBorder,
  },
  messageWarning: {
    backgroundColor: colors.warningSurface,
    borderColor: colors.warningBorder,
  },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
  },
  buttonSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonInactive: {
    opacity: 0.5,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  field: {
    gap: space.xs,
  },
  input: {
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: 16,
    color: colors.text,
  },
  inputFlagged: {
    borderColor: colors.warning,
    backgroundColor: colors.warningSurface,
  },
});
