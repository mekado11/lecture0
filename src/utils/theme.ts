export const colors = {
  // Primary palette - dark, calming
  primary: '#6366F1', // Indigo
  primaryLight: '#818CF8',
  primaryDark: '#4F46E5',

  // Module colors
  hydration: '#38BDF8', // Sky blue
  hydrationLight: '#7DD3FC',
  hydrationDark: '#0284C7',

  movement: '#34D399', // Emerald
  movementLight: '#6EE7B7',
  movementDark: '#059669',

  eyes: '#F59E0B', // Amber
  eyesLight: '#FCD34D',
  eyesDark: '#D97706',

  // Backgrounds
  background: '#0F172A', // Slate 900
  surface: '#1E293B', // Slate 800
  surfaceLight: '#334155', // Slate 700
  surfaceElevated: '#283548',

  // Text
  text: '#F8FAFC', // Slate 50
  textSecondary: '#94A3B8', // Slate 400
  textMuted: '#64748B', // Slate 500

  // Status
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',

  // Misc
  white: '#FFFFFF',
  black: '#000000',
  border: '#334155',
  overlay: 'rgba(0, 0, 0, 0.7)',
  cardGlow: 'rgba(99, 102, 241, 0.1)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  hero: 32,
  display: 40,
};

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
};

export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};
