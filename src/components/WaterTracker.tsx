import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, fontSize, spacing, borderRadius, fontWeight } from '../utils/theme';

interface Props {
  currentMl: number;
  goalMl: number;
  lastDrink: string;
  onLogWater: () => void;
  onLogCoffee: () => void;
  onLogTea: () => void;
}

export function WaterTracker({ currentMl, goalMl, lastDrink, onLogWater, onLogCoffee, onLogTea }: Props) {
  const glasses = Math.round(currentMl / 250);
  const goalGlasses = Math.round(goalMl / 250);
  const progress = Math.min(1, currentMl / goalMl);
  const barWidth = `${Math.round(progress * 100)}%`;

  return (
    <View style={styles.container}>
      {/* Progress bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: barWidth as any }]} />
        </View>
        <Text style={styles.progressText}>
          {glasses}/{goalGlasses} glasses
        </Text>
      </View>

      {/* Last drink */}
      <Text style={styles.lastDrink}>Last drink: {lastDrink}</Text>

      {/* Quick log buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity style={[styles.logButton, styles.waterButton]} onPress={onLogWater} activeOpacity={0.7}>
          <Text style={styles.logButtonIcon}>💧</Text>
          <Text style={styles.logButtonText}>Water</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.logButton, styles.coffeeButton]} onPress={onLogCoffee} activeOpacity={0.7}>
          <Text style={styles.logButtonIcon}>☕</Text>
          <Text style={styles.logButtonText}>Coffee</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.logButton, styles.teaButton]} onPress={onLogTea} activeOpacity={0.7}>
          <Text style={styles.logButtonIcon}>🍵</Text>
          <Text style={styles.logButtonText}>Tea</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  progressContainer: {
    gap: spacing.xs,
  },
  progressTrack: {
    height: 12,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.hydration,
    borderRadius: borderRadius.full,
    minWidth: 4,
  },
  progressText: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: fontWeight.medium,
  },
  lastDrink: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  logButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  waterButton: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  coffeeButton: {
    backgroundColor: 'rgba(180, 130, 80, 0.15)',
  },
  teaButton: {
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
  },
  logButtonIcon: {
    fontSize: fontSize.md,
  },
  logButtonText: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: fontWeight.medium,
  },
});
