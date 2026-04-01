import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Animated } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { colors, fontSize, spacing, borderRadius, fontWeight } from '../../src/utils/theme';
import { getTimeSince, formatDuration } from '../../src/utils/wellness';
import { ProgressRing } from '../../src/components/ProgressRing';

export default function EyesScreen() {
  const { wellness, logEyeBreak, profile } = useApp();
  const { eyes } = wellness;

  const [isBreaking, setIsBreaking] = useState(false);
  const [countdown, setCountdown] = useState(20);
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  const intervalMinutes = profile?.eyeBreakIntervalMinutes ?? 20;
  const minutesSinceBreak = eyes.lastBreakTimestamp
    ? (Date.now() - eyes.lastBreakTimestamp) / (1000 * 60)
    : intervalMinutes;
  const nextBreakIn = Math.max(0, intervalMinutes - minutesSinceBreak);
  const breakProgress = Math.min(1, minutesSinceBreak / intervalMinutes);

  useEffect(() => {
    if (!isBreaking) return;

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 1500, useNativeDriver: true }),
      ]),
    ).start();

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsBreaking(false);
          logEyeBreak(20);
          return 20;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
      pulseAnim.stopAnimation();
    };
  }, [isBreaking]);

  const screenHours = Math.round(eyes.totalScreenMinutes / 60 * 10) / 10;
  const recommendedBreaks = Math.max(1, Math.floor(eyes.totalScreenMinutes / intervalMinutes));
  const breakPercent = recommendedBreaks > 0 ? Math.min(1, eyes.breaksTaken / recommendedBreaks) : 0;

  // Full-screen break mode
  if (isBreaking) {
    return (
      <SafeAreaView style={styles.breakSafe}>
        <Animated.View style={[styles.breakBackground, { opacity: pulseAnim }]} />
        <View style={styles.breakContent}>
          <Text style={styles.breakEmoji}>🌅</Text>
          <Text style={styles.breakTitle}>Look Away</Text>
          <Text style={styles.breakSubtitle}>Focus on something 20+ feet away</Text>

          <View style={styles.countdownCircle}>
            <Text style={styles.countdownNumber}>{countdown}</Text>
            <Text style={styles.countdownUnit}>seconds</Text>
          </View>

          <Text style={styles.breakTips}>
            Breathe deeply. Relax your eye muscles.{'\n'}Blink slowly a few times.
          </Text>

          <TouchableOpacity
            style={styles.earlyDoneButton}
            onPress={() => {
              setIsBreaking(false);
              setCountdown(20);
              logEyeBreak(20 - countdown);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.earlyDoneText}>Done Early</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Focus</Text>
        <Text style={styles.subtitle}>Protect your eyes from screen strain</Text>

        {/* Next break timer */}
        <View style={styles.timerCard}>
          <View style={styles.timerRow}>
            <View>
              <Text style={styles.timerLabel}>Next 20-20-20 Break</Text>
              <Text style={styles.timerValue}>
                {nextBreakIn < 1 ? 'Now!' : `In ${Math.round(nextBreakIn)} min`}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.startBreakButton, nextBreakIn < 1 && styles.startBreakButtonUrgent]}
              onPress={() => setIsBreaking(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.startBreakText}>Take Break</Text>
            </TouchableOpacity>
          </View>
          {/* Timer progress */}
          <View style={styles.timerProgress}>
            <View style={[styles.timerFill, { width: `${Math.round(breakProgress * 100)}%` as any }]} />
          </View>
        </View>

        {/* Stats rings */}
        <View style={styles.ringsRow}>
          <View style={styles.ringItem}>
            <ProgressRing
              progress={breakPercent}
              size={110}
              strokeWidth={8}
              color={colors.eyes}
              label={`${eyes.breaksTaken}`}
              sublabel="breaks"
            />
          </View>
          <View style={styles.ringItem}>
            <ProgressRing
              progress={Math.min(1, screenHours / 8)}
              size={110}
              strokeWidth={8}
              color={screenHours > 6 ? colors.danger : colors.info}
              label={`${screenHours}h`}
              sublabel="screen"
            />
          </View>
        </View>

        {/* 20-20-20 Explanation */}
        <View style={styles.ruleCard}>
          <Text style={styles.ruleTitle}>The 20-20-20 Rule</Text>
          <View style={styles.ruleRow}>
            <View style={styles.ruleItem}>
              <Text style={styles.ruleNumber}>20</Text>
              <Text style={styles.ruleUnit}>minutes</Text>
              <Text style={styles.ruleDesc}>of screen time</Text>
            </View>
            <Text style={styles.ruleDivider}>→</Text>
            <View style={styles.ruleItem}>
              <Text style={styles.ruleNumber}>20</Text>
              <Text style={styles.ruleUnit}>seconds</Text>
              <Text style={styles.ruleDesc}>looking away</Text>
            </View>
            <Text style={styles.ruleDivider}>→</Text>
            <View style={styles.ruleItem}>
              <Text style={styles.ruleNumber}>20</Text>
              <Text style={styles.ruleUnit}>feet</Text>
              <Text style={styles.ruleDesc}>distance</Text>
            </View>
          </View>
        </View>

        {/* Eye Care Tips */}
        <Text style={styles.sectionTitle}>Eye Care Tips</Text>
        {[
          { icon: '💡', tip: 'Position your screen to reduce glare from windows and lights' },
          { icon: '📏', tip: 'Keep your screen 20-28 inches from your eyes' },
          { icon: '😌', tip: 'Remember to blink! We blink 66% less when looking at screens' },
          { icon: '🌙', tip: 'Use night mode or blue light filters in the evening' },
        ].map((item, i) => (
          <View key={i} style={styles.tipCard}>
            <Text style={styles.tipIcon}>{item.icon}</Text>
            <Text style={styles.tipText}>{item.tip}</Text>
          </View>
        ))}

        {/* Break History */}
        {eyes.events.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Break History</Text>
            {eyes.events.slice().reverse().slice(0, 8).map((event) => (
              <View key={event.id} style={styles.historyItem}>
                <Text style={styles.historyIcon}>👁️</Text>
                <View style={styles.historyInfo}>
                  <Text style={styles.historyType}>Eye Break</Text>
                  <Text style={styles.historyTime}>
                    {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <Text style={styles.historyDuration}>{event.durationSeconds}s</Text>
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
    color: colors.eyes,
    marginTop: spacing.md,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  // Timer card
  timerCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  timerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  timerLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  timerValue: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text, marginTop: 2 },
  startBreakButton: {
    backgroundColor: colors.eyes,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
  },
  startBreakButtonUrgent: {
    backgroundColor: colors.danger,
  },
  startBreakText: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.background },
  timerProgress: {
    height: 6,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  timerFill: {
    height: '100%',
    backgroundColor: colors.eyes,
    borderRadius: borderRadius.full,
  },
  // Rings
  ringsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.lg,
  },
  ringItem: {
    alignItems: 'center',
  },
  // Rule card
  ruleCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  ruleTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.eyes,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  ruleItem: { alignItems: 'center' },
  ruleNumber: { fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: colors.text },
  ruleUnit: { fontSize: fontSize.sm, color: colors.eyes, fontWeight: fontWeight.semibold },
  ruleDesc: { fontSize: fontSize.xs, color: colors.textMuted },
  ruleDivider: { fontSize: fontSize.lg, color: colors.textMuted },
  // Section
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  // Tips
  tipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.sm + 2,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  tipIcon: { fontSize: 18, marginTop: 2 },
  tipText: { flex: 1, fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
  // History
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
  historyDuration: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.eyes },
  // Break screen
  breakSafe: { flex: 1, backgroundColor: '#0a1628' },
  breakBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
  },
  breakContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  breakEmoji: { fontSize: 64, marginBottom: spacing.lg },
  breakTitle: { fontSize: fontSize.hero, fontWeight: fontWeight.bold, color: colors.eyes, marginBottom: spacing.sm },
  breakSubtitle: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl },
  countdownCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 4,
    borderColor: colors.eyes,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  countdownNumber: { fontSize: fontSize.display, fontWeight: fontWeight.bold, color: colors.eyes },
  countdownUnit: { fontSize: fontSize.sm, color: colors.eyesLight },
  breakTips: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.xl,
  },
  earlyDoneButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  earlyDoneText: { fontSize: fontSize.md, color: colors.textSecondary, fontWeight: fontWeight.medium },
});
