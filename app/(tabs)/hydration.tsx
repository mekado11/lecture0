import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { colors, fontSize, spacing, borderRadius, fontWeight } from '../../src/utils/theme';
import { getTimeSince, getHydrationColor } from '../../src/utils/wellness';
import { ProgressRing } from '../../src/components/ProgressRing';
import type { BeverageType } from '../../src/types';

const BEVERAGES: { type: BeverageType; icon: string; label: string; ml: number }[] = [
  { type: 'water', icon: '💧', label: 'Water', ml: 250 },
  { type: 'coffee', icon: '☕', label: 'Coffee', ml: 200 },
  { type: 'tea', icon: '🍵', label: 'Tea', ml: 200 },
  { type: 'juice', icon: '🧃', label: 'Juice', ml: 250 },
];

export default function HydrationScreen() {
  const { wellness, logWater } = useApp();
  const { hydration } = wellness;
  const [selectedAmount, setSelectedAmount] = useState(250);

  const progress = hydration.dailyGoalMl > 0 ? hydration.dailyTotalMl / hydration.dailyGoalMl : 0;
  const glasses = Math.round(hydration.dailyTotalMl / 250);
  const goalGlasses = Math.round(hydration.dailyGoalMl / 250);
  const progressColor = getHydrationColor(progress * 100);

  const todayEvents = hydration.events.slice().reverse();

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Sip</Text>
        <Text style={styles.subtitle}>Stay hydrated throughout the day</Text>

        {/* Progress Ring */}
        <View style={styles.ringContainer}>
          <ProgressRing
            progress={progress}
            size={160}
            strokeWidth={12}
            color={progressColor}
            label={`${glasses}/${goalGlasses}`}
            sublabel="glasses"
          />
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{hydration.dailyTotalMl}ml</Text>
            <Text style={styles.statLabel}>Today</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{hydration.dailyGoalMl}ml</Text>
            <Text style={styles.statLabel}>Goal</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{getTimeSince(hydration.lastDrinkTimestamp)}</Text>
            <Text style={styles.statLabel}>Last drink</Text>
          </View>
        </View>

        {/* Quick Log */}
        <Text style={styles.sectionTitle}>Quick Log</Text>
        <View style={styles.beverageGrid}>
          {BEVERAGES.map((bev) => (
            <TouchableOpacity
              key={bev.type}
              style={styles.beverageButton}
              onPress={() => logWater(bev.ml, bev.type)}
              activeOpacity={0.7}
            >
              <Text style={styles.beverageIcon}>{bev.icon}</Text>
              <Text style={styles.beverageLabel}>{bev.label}</Text>
              <Text style={styles.beverageMl}>{bev.ml}ml</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Custom amount */}
        <View style={styles.customSection}>
          <Text style={styles.sectionTitle}>Custom Amount</Text>
          <View style={styles.amountRow}>
            {[100, 200, 250, 350, 500].map((ml) => (
              <TouchableOpacity
                key={ml}
                style={[styles.amountChip, selectedAmount === ml && styles.amountChipSelected]}
                onPress={() => setSelectedAmount(ml)}
                activeOpacity={0.7}
              >
                <Text style={[styles.amountText, selectedAmount === ml && styles.amountTextSelected]}>
                  {ml}ml
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={styles.logCustomButton}
            onPress={() => logWater(selectedAmount, 'water')}
            activeOpacity={0.7}
          >
            <Text style={styles.logCustomText}>Log {selectedAmount}ml</Text>
          </TouchableOpacity>
        </View>

        {/* History */}
        <Text style={styles.sectionTitle}>Today's Log</Text>
        {todayEvents.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No drinks logged yet today</Text>
          </View>
        ) : (
          todayEvents.map((event) => (
            <View key={event.id} style={styles.historyItem}>
              <Text style={styles.historyIcon}>
                {event.beverageType === 'water' ? '💧' : event.beverageType === 'coffee' ? '☕' : event.beverageType === 'tea' ? '🍵' : '🧃'}
              </Text>
              <View style={styles.historyInfo}>
                <Text style={styles.historyType}>{event.beverageType}</Text>
                <Text style={styles.historyTime}>
                  {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              <Text style={styles.historyAmount}>{event.amountMl}ml</Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.md, paddingBottom: spacing.xxl * 2 },
  title: {
    fontSize: fontSize.hero,
    fontWeight: fontWeight.bold,
    color: colors.hydration,
    marginTop: spacing.md,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  ringContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text },
  statLabel: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: colors.border, marginVertical: 4 },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  beverageGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  beverageButton: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  beverageIcon: { fontSize: 24 },
  beverageLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text },
  beverageMl: { fontSize: fontSize.xs, color: colors.textMuted },
  customSection: {
    marginBottom: spacing.lg,
  },
  amountRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  amountChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  amountChipSelected: {
    borderColor: colors.hydration,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  amountText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary },
  amountTextSelected: { color: colors.hydration },
  logCustomButton: {
    backgroundColor: colors.hydration,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  logCustomText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.background,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyText: { fontSize: fontSize.sm, color: colors.textMuted },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.sm + 2,
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  historyIcon: { fontSize: 18 },
  historyInfo: { flex: 1 },
  historyType: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text, textTransform: 'capitalize' },
  historyTime: { fontSize: fontSize.xs, color: colors.textMuted },
  historyAmount: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.hydration },
});
