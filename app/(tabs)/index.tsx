import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '../../src/context/AppContext';
import { WellnessCard } from '../../src/components/WellnessCard';
import { WaterTracker } from '../../src/components/WaterTracker';
import { PostureCard } from '../../src/components/PostureCard';
import { EyeBreakCard } from '../../src/components/EyeBreakCard';
import { InsightCard } from '../../src/components/InsightCard';
import { BreakOverlay } from '../../src/components/BreakOverlay';
import { colors, fontSize, spacing, borderRadius, fontWeight } from '../../src/utils/theme';
import { getTimeSince, generateInsights } from '../../src/utils/wellness';

export default function Dashboard() {
  const router = useRouter();
  const {
    profile,
    wellness,
    pendingBreak,
    logWater,
    togglePosture,
    logEyeBreak,
    toggleFocusMode,
    dismissBreak,
    completeBreak,
  } = useApp();

  const hydrationPercent = wellness.hydration.dailyGoalMl > 0
    ? (wellness.hydration.dailyTotalMl / wellness.hydration.dailyGoalMl) * 100
    : 0;

  const insights = generateInsights(
    hydrationPercent,
    wellness.movement.postureScore,
    wellness.eyes.breaksTaken,
    wellness.eyes.totalScreenMinutes,
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>
              Hey{profile?.name ? `, ${profile.name}` : ''} 🌿
            </Text>
            <Text style={styles.subtitle}>Your wellness dashboard</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.focusBadge, wellness.focusMode && styles.focusBadgeActive]}
              onPress={toggleFocusMode}
              activeOpacity={0.7}
            >
              <Text style={styles.focusText}>
                {wellness.focusMode ? '🎯 Focus On' : '🎯 Focus'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.settingsButton}
              onPress={() => router.push('/settings')}
              activeOpacity={0.7}
            >
              <Text style={styles.settingsIcon}>⚙️</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Status Bar */}
        <View style={styles.statusBar}>
          <View style={styles.statusItem}>
            <Text style={styles.statusIcon}>💧</Text>
            <View style={[styles.statusDot, {
              backgroundColor: hydrationPercent >= 80 ? colors.hydration : hydrationPercent >= 50 ? colors.warning : colors.danger,
            }]} />
          </View>
          <View style={styles.statusItem}>
            <Text style={styles.statusIcon}>{wellness.movement.currentPosture === 'sitting' ? '🪑' : '🧍'}</Text>
            <View style={[styles.statusDot, {
              backgroundColor: wellness.movement.postureScore >= 75 ? colors.movement : colors.warning,
            }]} />
          </View>
          <View style={styles.statusItem}>
            <Text style={styles.statusIcon}>👁️</Text>
            <View style={[styles.statusDot, {
              backgroundColor: wellness.eyes.breaksTaken >= 4 ? colors.success : colors.warning,
            }]} />
          </View>
        </View>

        {/* Hydration Card */}
        <WellnessCard title="Hydration" icon="💧" accentColor={colors.hydration}>
          <WaterTracker
            currentMl={wellness.hydration.dailyTotalMl}
            goalMl={wellness.hydration.dailyGoalMl}
            lastDrink={getTimeSince(wellness.hydration.lastDrinkTimestamp)}
            onLogWater={() => logWater(250, 'water')}
            onLogCoffee={() => logWater(200, 'coffee')}
            onLogTea={() => logWater(200, 'tea')}
          />
        </WellnessCard>

        {/* Movement Card */}
        <WellnessCard title="Movement" icon="🧘" accentColor={colors.movement}>
          <PostureCard
            currentPosture={wellness.movement.currentPosture}
            sittingMinutes={wellness.movement.totalSittingMinutes}
            standingMinutes={wellness.movement.totalStandingMinutes}
            postureScore={wellness.movement.postureScore}
            timeSinceChange={getTimeSince(wellness.movement.lastPostureChangeTimestamp)}
            onTogglePosture={togglePosture}
          />
        </WellnessCard>

        {/* Eye Care Card */}
        <WellnessCard title="Eye Care" icon="👁️" accentColor={colors.eyes}>
          <EyeBreakCard
            breaksTaken={wellness.eyes.breaksTaken}
            lastBreak={getTimeSince(wellness.eyes.lastBreakTimestamp)}
            screenMinutes={wellness.eyes.totalScreenMinutes}
            onTakeBreak={() => logEyeBreak(20)}
          />
        </WellnessCard>

        {/* Insights */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Insights</Text>
          {insights.map((insight, i) => (
            <InsightCard key={i} insight={insight} />
          ))}
        </View>

        {/* Quick Stretch Link */}
        <TouchableOpacity
          style={styles.stretchLink}
          onPress={() => router.push('/stretches')}
          activeOpacity={0.7}
        >
          <Text style={styles.stretchIcon}>🤸</Text>
          <View style={styles.stretchInfo}>
            <Text style={styles.stretchTitle}>Stretch Library</Text>
            <Text style={styles.stretchDesc}>Browse guided desk stretches</Text>
          </View>
          <Text style={styles.arrow}>→</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Break Overlay */}
      {pendingBreak && (
        <BreakOverlay
          routine={pendingBreak}
          onComplete={completeBreak}
          onDismiss={dismissBreak}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.md, paddingBottom: spacing.xxl * 2 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
    marginTop: spacing.md,
  },
  greeting: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  focusBadge: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  focusBadgeActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderColor: colors.primary,
  },
  focusText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  settingsButton: {
    padding: spacing.xs,
  },
  settingsIcon: {
    fontSize: 22,
  },
  // Status bar
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  statusItem: {
    alignItems: 'center',
    position: 'relative',
  },
  statusIcon: {
    fontSize: 24,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    position: 'absolute',
    bottom: -4,
  },
  // Section
  section: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  // Stretch link
  stretchLink: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  stretchIcon: {
    fontSize: 28,
  },
  stretchInfo: {
    flex: 1,
  },
  stretchTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  stretchDesc: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  arrow: {
    fontSize: fontSize.xl,
    color: colors.textMuted,
  },
});
