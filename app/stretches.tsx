import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { StretchGuide } from '../src/components/StretchGuide';
import { colors, fontSize, spacing, borderRadius, fontWeight } from '../src/utils/theme';
import type { StretchExercise } from '../src/types';

const CATEGORIES = [
  { key: undefined, label: 'All' },
  { key: 'neck' as const, label: 'Neck' },
  { key: 'shoulders' as const, label: 'Shoulders' },
  { key: 'wrists' as const, label: 'Wrists' },
  { key: 'back' as const, label: 'Back' },
  { key: 'legs' as const, label: 'Legs' },
  { key: 'eyes' as const, label: 'Eyes' },
];

export default function StretchesScreen() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<StretchExercise['category'] | undefined>(undefined);
  const [activeStretch, setActiveStretch] = useState<StretchExercise | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [isActive, setIsActive] = useState(false);

  const startStretch = (stretch: StretchExercise) => {
    setActiveStretch(stretch);
    setCountdown(stretch.durationSeconds);
    setIsActive(true);

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsActive(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  if (isActive && activeStretch) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.activeContainer}>
          <Text style={styles.activeIcon}>{activeStretch.icon}</Text>
          <Text style={styles.activeName}>{activeStretch.name}</Text>
          <Text style={styles.activeDesc}>{activeStretch.description}</Text>

          <View style={styles.countdownCircle}>
            <Text style={styles.countdownText}>{countdown}</Text>
            <Text style={styles.countdownUnit}>sec</Text>
          </View>

          <TouchableOpacity
            style={styles.doneButton}
            onPress={() => setIsActive(false)}
            activeOpacity={0.7}
          >
            <Text style={styles.doneText}>{countdown === 0 ? 'Done!' : 'Skip'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={styles.backArrow}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Stretch Library</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Category filters */}
        <View style={styles.filterRow}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.label}
              style={[
                styles.filterChip,
                selectedCategory === cat.key && styles.filterChipSelected,
              ]}
              onPress={() => setSelectedCategory(cat.key)}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.filterText,
                selectedCategory === cat.key && styles.filterTextSelected,
              ]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Stretch list */}
        <StretchGuide
          filterCategory={selectedCategory}
          onSelectStretch={startStretch}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.md },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    marginTop: spacing.md,
  },
  backArrow: { fontSize: fontSize.md, color: colors.primary, fontWeight: fontWeight.medium },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  filterChip: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
  },
  filterText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
  },
  filterTextSelected: {
    color: colors.primaryLight,
  },
  // Active stretch
  activeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  activeIcon: { fontSize: 64, marginBottom: spacing.lg },
  activeName: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  activeDesc: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.xl,
  },
  countdownCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: colors.movement,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  countdownText: { fontSize: fontSize.display, fontWeight: fontWeight.bold, color: colors.movement },
  countdownUnit: { fontSize: fontSize.sm, color: colors.movementLight },
  doneButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.full,
    backgroundColor: colors.movement,
  },
  doneText: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.background },
});
