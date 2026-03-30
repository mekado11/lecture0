import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Alternative, GRADE_INFO } from '../types';
import { colors, fontSize, spacing, borderRadius } from '../utils/theme';
import { GradeCard } from './GradeCard';

interface Props {
  alternative: Alternative;
}

const SWAP_LABELS: Record<string, string> = {
  'cooking-method': 'Cooking Swap',
  'side-swap': 'Side Swap',
  'drink-swap': 'Drink Swap',
  'portion': 'Portion Fix',
  'menu-pick': 'Better Pick',
};

export function AlternativeCard({ alternative }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <GradeCard grade={alternative.grade} size="small" />
        <View style={styles.info}>
          <Text style={styles.name}>{alternative.name}</Text>
          <Text style={styles.description}>{alternative.description}</Text>
        </View>
      </View>
      <View style={styles.footer}>
        <View style={[styles.badge, { backgroundColor: GRADE_INFO[alternative.grade].color + '20' }]}>
          <Text style={[styles.badgeText, { color: GRADE_INFO[alternative.grade].color }]}>
            {SWAP_LABELS[alternative.swapType] || 'Swap'}
          </Text>
        </View>
        <Text style={styles.calories}>~{alternative.estimatedCalories} cal</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  description: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  calories: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '600',
  },
});
