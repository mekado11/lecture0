import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { colors, fontSize, spacing, borderRadius, fontWeight } from '../utils/theme';

interface Props {
  title: string;
  icon: string;
  accentColor: string;
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  rightElement?: React.ReactNode;
}

export function WellnessCard({ title, icon, accentColor, children, onPress, style, rightElement }: Props) {
  const Container = onPress ? TouchableOpacity : View;

  return (
    <Container
      style={[styles.card, { borderLeftColor: accentColor }, style]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.icon}>{icon}</Text>
          <Text style={[styles.title, { color: accentColor }]}>{title}</Text>
        </View>
        {rightElement}
      </View>
      <View style={styles.content}>{children}</View>
    </Container>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderLeftWidth: 3,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  icon: {
    fontSize: fontSize.lg,
  },
  title: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  content: {},
});
