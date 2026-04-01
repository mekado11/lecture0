import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '../../src/context/AppContext';
import { colors, fontSize, spacing, borderRadius, fontWeight } from '../../src/utils/theme';
import { formatDuration, getTimeSince, getPostureColor, STRETCHES } from '../../src/utils/wellness';
import { ProgressRing } from '../../src/components/ProgressRing';

export default function MovementScreen() {
  const router = useRouter();
  const { wellness, togglePosture, setPosture } = useApp();
  const { movement } = wellness;

  const totalMinutes = movement.totalSittingMinutes + movement.totalStandingMinutes;
  const standingPercent = totalMinutes > 0 ? movement.totalStandingMinutes / totalMinutes : 0;
  const scoreColor = getPostureColor(movement.postureScore);

  const currentDuration = Math.round((Date.now() - movement.postureStartTime) / (1000 * 60));

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Flow</Text>
        <Text style={styles.subtitle}>Move more, sit less, feel better</Text>

        {/* Current posture + big toggle */}
        <View style={styles.postureSection}>
          <View style={styles.postureDisplay}>
            <Text style={styles.postureEmoji}>
              {movement.currentPosture === 'sitting' ? '🪑' : '🧍'}
            </Text>
            <Text style={styles.postureLabel}>
              Currently {movement.currentPosture === 'sitting' ? 'Sitting' : 'Standing'}
            </Text>
            <Text style={styles.postureDuration}>
              for {currentDuration > 0 ? formatDuration(currentDuration) : 'just now'}
            </Text>
          </View>

          <TouchableOpacity style={styles.bigToggle} onPress={togglePosture} activeOpacity={0.7}>
            <Text style={styles.bigToggleText}>
              {movement.currentPosture === 'sitting' ? 'Switch to Standing' : 'Switch to Sitting'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Posture Score Ring */}
        <View style={styles.ringContainer}>
          <ProgressRing
            progress={movement.postureScore / 100}
            size={140}
            strokeWidth={10}
            color={scoreColor}
            label="Score"
          />
        </View>

        {/* Day breakdown */}
        <View style={styles.breakdownCard}>
          <Text style={styles.breakdownTitle}>Today's Breakdown</Text>
          <View style={styles.breakdownRow}>
            <View style={styles.breakdownItem}>
              <View style={[styles.breakdownDot, { backgroundColor: colors.surfaceLight }]} />
              <Text style={styles.breakdownLabel}>Sitting</Text>
              <Text style={styles.breakdownValue}>{formatDuration(movement.totalSittingMinutes)}</Text>
            </View>
            <View style={styles.breakdownItem}>
              <View style={[styles.breakdownDot, { backgroundColor: colors.movement }]} />
              <Text style={styles.breakdownLabel}>Standing</Text>
              <Text style={styles.breakdownValue}>{formatDuration(movement.totalStandingMinutes)}</Text>
            </View>
            <View style={styles.breakdownItem}>
              <View style={[styles.breakdownDot, { backgroundColor: colors.primary }]} />
              <Text style={styles.breakdownLabel}>Changes</Text>
              <Text style={styles.breakdownValue}>{movement.events.length}</Text>
            </View>
          </View>

          {/* Ratio bar */}
          <View style={styles.ratioBar}>
            <View style={[styles.ratioSit, { flex: movement.totalSittingMinutes || 1 }]} />
            <View style={[styles.ratioStand, { flex: movement.totalStandingMinutes || 0 }]} />
          </View>
          <Text style={styles.ratioText}>
            {Math.round(standingPercent * 100)}% standing · Goal: 40-50%
          </Text>
        </View>

        {/* Quick Stretches */}
        <Text style={styles.sectionTitle}>Quick Stretches</Text>
        {STRETCHES.filter((s) => ['shoulders', 'back', 'neck'].includes(s.category)).slice(0, 3).map((stretch) => (
          <View key={stretch.id} style={styles.stretchCard}>
            <Text style={styles.stretchIcon}>{stretch.icon}</Text>
            <View style={styles.stretchInfo}>
              <Text style={styles.stretchName}>{stretch.name}</Text>
              <Text style={styles.stretchDesc} numberOfLines={2}>{stretch.description}</Text>
            </View>
            <View style={styles.stretchDuration}>
              <Text style={styles.durationText}>{stretch.durationSeconds}s</Text>
            </View>
          </View>
        ))}

        <TouchableOpacity
          style={styles.viewAllButton}
          onPress={() => router.push('/stretches')}
          activeOpacity={0.7}
        >
          <Text style={styles.viewAllText}>View All Stretches →</Text>
        </TouchableOpacity>

        {/* Posture History */}
        {movement.events.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Today's Changes</Text>
            {movement.events.slice().reverse().slice(0, 5).map((event) => (
              <View key={event.id} style={styles.historyItem}>
                <Text style={styles.historyIcon}>
                  {event.postureType === 'sitting' ? '🪑' : '🧍'}
                </Text>
                <View style={styles.historyInfo}>
                  <Text style={styles.historyType}>
                    {event.postureType === 'sitting' ? 'Sat down' : 'Stood up'}
                  </Text>
                  <Text style={styles.historyTime}>
                    {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <Text style={styles.historyDuration}>{formatDuration(event.durationMinutes)}</Text>
              </View>
            ))}
          </>
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
    color: colors.movement,
    marginTop: spacing.md,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  postureSection: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  postureDisplay: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  postureEmoji: { fontSize: 48 },
  postureLabel: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginTop: spacing.sm,
  },
  postureDuration: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  bigToggle: {
    backgroundColor: colors.movement,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.full,
  },
  bigToggleText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.background,
  },
  ringContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  breakdownCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  breakdownTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.md,
  },
  breakdownItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  breakdownDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  breakdownLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  breakdownValue: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  ratioBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  ratioSit: { backgroundColor: colors.surfaceLight },
  ratioStand: { backgroundColor: colors.movement },
  ratioText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  stretchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.sm + 2,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  stretchIcon: { fontSize: 24 },
  stretchInfo: { flex: 1 },
  stretchName: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text },
  stretchDesc: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  stretchDuration: {
    backgroundColor: colors.surfaceLight,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
  },
  durationText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary },
  viewAllButton: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  viewAllText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
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
  historyType: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text },
  historyTime: { fontSize: fontSize.xs, color: colors.textMuted },
  historyDuration: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.movement },
});
