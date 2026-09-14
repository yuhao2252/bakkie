import { StyleSheet } from 'react-native';

export const colors = {
  background: '#FAF7F2',
  surface: '#FFFFFF',
  border: '#E6DDD3',
  text: '#2A211C',
  muted: '#7B6D63',
  primary: '#6F4E37',
  onPrimary: '#FFFFFF',
  danger: '#B3261E',
  dangerSurface: '#FDECEA',
  dangerBorder: '#F5C2BE',
  warning: '#8A5A00',
  warningSurface: '#FFF3D1',
  warningBorder: '#F0D48A',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 8, md: 12, lg: 16 };

export const typography = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  heading: { fontSize: 18, fontWeight: '600', color: colors.text },
  body: { fontSize: 16, color: colors.text },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  muted: { fontSize: 14, color: colors.muted },
});
