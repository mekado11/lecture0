import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, fontSize, spacing, borderRadius, fontWeight } from '../utils/theme';
import { formatDuration, getPostureColor } from '../utils/wellness';
import type { PostureType } from '../types';

interface Props {
  currentPosture: PostureType;
  sittingMinutes: number;
  standingMinutes: number;
  postureScore: number;
  timeSinceChange: string;
  onTogglePosture: () => void;
}

export function PostureCard({
  currentPosture,
  sittingMinutes,
  standingMinutes,
  postureScore,
  timeSinceChange,
  onTogglePosture,
}: Props) {
  const totalMinutes = sittingMinutes + standingMinutes;
  const standingPercent = totalMinutes > 0 ? Math.round((standingMinutes / totalMinutes) * 100) : 0;
  const scoreColor = getPostureColor(postureScore);

  return (
    <View style={styles.container}>
      {/* Current posture + toggle */}
      <View style={styles.postureRow}>
        <View style={styles.postureInfo}>
          <Text style={styles.postureIcon}>
            {currentPosture === 'sitting' ? '🪑' : '🧍'}
          </Text>
          <View>
            <Text style={styles.postureLabel}>
              {currentPosture === 'sitting' ? 'Sitting' : 'Standing'}
            </Text>
            <Text style={styles.postureTime}>{timeSinceChange}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.toggleButton} onPress={onTogglePosture} activeOpacity={0.7}>
          <Text style={styles.toggleText}>
            {currentPosture === 'sitting' ? 'Stand Up' : 'Sit Down'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{formatDuration(sittingMinutes)}</Text>
          <Text style={styles.statLabel}>Sitting</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>{formatDuration(standingMinutes)}</Text>
          <Text style={styles.statLabel}>Standing</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: scoreColor }]}>{postureScore}</Text>
          <Text style={styles.statLabel}>Score</Text>
        </View>
      </View>

      {/* Sit/stand ratio bar */}
      <View style={styles.ratioContainer}>
        <View style={styles.ratioTrack}>
          <View style={[styles.ratioFillSit, { flex: sittingMinutes || 1 }]} />
          <View style={[styles.ratioFillStand, { flex: standingMinutes || 0 }]} />
        </View>
        <Text style={styles.ratioText}>
          {standingPercent}% standing
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  postureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  postureInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  postureIcon: {
    fontSize: 28,
  },
  postureLabel: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  postureTime: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  toggleButton: {
    backgroundColor: colors.movement,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
  },
  toggleText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.background,
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
    fontSize: fontSize.lg,
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
  ratioContainer: {
    gap: spacing.xs,
  },
  ratioTrack: {
    flexDirection: 'row',
    height: 8,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  ratioFillSit: {
    backgroundColor: colors.surfaceLight,
  },
  ratioFillStand: {
    backgroundColor: colors.movement,
  },
  ratioText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'right',
  },
});
