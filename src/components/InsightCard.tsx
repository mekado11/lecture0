import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fontSize, spacing, borderRadius, fontWeight } from '../utils/theme';
import type { WellnessInsight } from '../types';

interface Props {
  insight: WellnessInsight;
}

const typeColors = {
  success: colors.success,
  warning: colors.warning,
  tip: colors.info,
};

export function InsightCard({ insight }: Props) {
  const accentColor = typeColors[insight.type];

  return (
    <View style={[styles.card, { borderLeftColor: accentColor }]}>
      <View style={styles.header}>
        <Text style={styles.icon}>{insight.icon}</Text>
        <Text style={[styles.title, { color: accentColor }]}>{insight.title}</Text>
      </View>
      <Text style={styles.description}>{insight.description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderLeftWidth: 3,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  icon: {
    fontSize: fontSize.md,
  },
  title: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  description: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
