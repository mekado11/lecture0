import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { colors, fontSize, spacing, borderRadius, fontWeight } from '../utils/theme';

interface Props {
  breaksTaken: number;
  lastBreak: string;
  screenMinutes: number;
  onTakeBreak: () => void;
}

export function EyeBreakCard({ breaksTaken, lastBreak, screenMinutes, onTakeBreak }: Props) {
  const [isBreaking, setIsBreaking] = useState(false);
  const [countdown, setCountdown] = useState(20);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isBreaking) {
      // Pulse animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.1, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ]),
      ).start();

      // Countdown
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setIsBreaking(false);
            setCountdown(20);
            onTakeBreak();
            return 20;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        clearInterval(timer);
        pulseAnim.stopAnimation();
      };
    }
  }, [isBreaking]);

  const screenHours = Math.round(screenMinutes / 60 * 10) / 10;

  if (isBreaking) {
    return (
      <View style={styles.breakingContainer}>
        <Animated.View style={[styles.breakCircle, { transform: [{ scale: pulseAnim }] }]}>
          <Text style={styles.breakCountdown}>{countdown}</Text>
          <Text style={styles.breakUnit}>sec</Text>
        </Animated.View>
        <Text style={styles.breakInstruction}>Look at something 20+ feet away</Text>
        <Text style={styles.breakSubtext}>Breathe deeply and relax your eyes</Text>
        <TouchableOpacity
          style={styles.skipButton}
          onPress={() => {
            setIsBreaking(false);
            setCountdown(20);
            onTakeBreak();
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.skipText}>Done Early</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{screenHours}h</Text>
          <Text style={styles.statLabel}>Screen time</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>{breaksTaken}</Text>
          <Text style={styles.statLabel}>Breaks taken</Text>
        </View>
      </View>

      {/* Last break */}
      <Text style={styles.lastBreak}>Last break: {lastBreak}</Text>

      {/* Take break button */}
      <TouchableOpacity
        style={styles.takeBreakButton}
        onPress={() => setIsBreaking(true)}
        activeOpacity={0.7}
      >
        <Text style={styles.takeBreakIcon}>👁️</Text>
        <Text style={styles.takeBreakText}>Start 20-20-20 Break</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  stat: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  divider: {
    width: 1,
    height: 30,
    backgroundColor: colors.border,
  },
  lastBreak: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  takeBreakButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  takeBreakIcon: {
    fontSize: fontSize.lg,
  },
  takeBreakText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.eyes,
  },
  // Breaking state
  breakingContainer: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  breakCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderWidth: 3,
    borderColor: colors.eyes,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breakCountdown: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    color: colors.eyes,
  },
  breakUnit: {
    fontSize: fontSize.xs,
    color: colors.eyesLight,
  },
  breakInstruction: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    textAlign: 'center',
  },
  breakSubtext: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  skipButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  skipText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
});
