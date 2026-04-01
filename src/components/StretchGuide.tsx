import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { colors, fontSize, spacing, borderRadius, fontWeight } from '../utils/theme';
import { STRETCHES } from '../utils/wellness';
import type { StretchExercise } from '../types';

interface Props {
  onSelectStretch?: (stretch: StretchExercise) => void;
  filterCategory?: StretchExercise['category'];
}

const categoryLabels: Record<StretchExercise['category'], string> = {
  neck: 'Neck',
  shoulders: 'Shoulders',
  wrists: 'Wrists',
  back: 'Back',
  legs: 'Legs',
  eyes: 'Eyes',
};

export function StretchGuide({ onSelectStretch, filterCategory }: Props) {
  const stretches = filterCategory
    ? STRETCHES.filter((s) => s.category === filterCategory)
    : STRETCHES;

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {stretches.map((stretch) => (
          <TouchableOpacity
            key={stretch.id}
            style={styles.card}
            onPress={() => onSelectStretch?.(stretch)}
            activeOpacity={0.7}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.stretchIcon}>{stretch.icon}</Text>
              <View style={styles.cardInfo}>
                <Text style={styles.stretchName}>{stretch.name}</Text>
                <Text style={styles.stretchCategory}>{categoryLabels[stretch.category]}</Text>
              </View>
              <View style={styles.durationBadge}>
                <Text style={styles.durationText}>{stretch.durationSeconds}s</Text>
              </View>
            </View>
            <Text style={styles.description}>{stretch.description}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  card: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  stretchIcon: {
    fontSize: 24,
  },
  cardInfo: {
    flex: 1,
  },
  stretchName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  stretchCategory: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  durationBadge: {
    backgroundColor: colors.surfaceLight,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
  },
  durationText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  description: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
