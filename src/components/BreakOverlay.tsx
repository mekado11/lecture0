import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { colors, fontSize, spacing, borderRadius, fontWeight } from '../utils/theme';
import type { BreakRoutine } from '../types';

interface Props {
  routine: BreakRoutine;
  onComplete: () => void;
  onDismiss: () => void;
}

export function BreakOverlay({ routine, onComplete, onDismiss }: Props) {
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  const toggleStep = (index: number) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const allComplete = completedSteps.size === routine.steps.length;

  return (
    <View style={styles.overlay}>
      <View style={styles.content}>
        <Text style={styles.emoji}>🌿</Text>
        <Text style={styles.title}>{routine.title}</Text>
        <Text style={styles.subtitle}>{routine.subtitle}</Text>

        <View style={styles.stepsContainer}>
          {routine.steps.map((step, index) => {
            const done = completedSteps.has(index);
            return (
              <TouchableOpacity
                key={index}
                style={[styles.step, done && styles.stepDone]}
                onPress={() => toggleStep(index)}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, done && styles.checkboxDone]}>
                  {done && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.stepIcon}>{step.icon}</Text>
                <Text style={[styles.stepText, done && styles.stepTextDone]}>
                  {step.instruction}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.dismissButton} onPress={onDismiss} activeOpacity={0.7}>
            <Text style={styles.dismissText}>Remind Later</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.completeButton, allComplete && styles.completeButtonActive]}
            onPress={onComplete}
            activeOpacity={0.7}
          >
            <Text style={[styles.completeText, allComplete && styles.completeTextActive]}>
              {allComplete ? 'All Done!' : 'Complete'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.tip}>
          💡 Deep breaths help maximize the break benefit
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    zIndex: 100,
  },
  content: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  emoji: {
    fontSize: 40,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  stepsContainer: {
    width: '100%',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  stepDone: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxDone: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  checkmark: {
    fontSize: 14,
    color: colors.white,
    fontWeight: fontWeight.bold,
  },
  stepIcon: {
    fontSize: fontSize.lg,
  },
  stepText: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
  },
  stepTextDone: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  dismissButton: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dismissText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  completeButton: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
  },
  completeButtonActive: {
    backgroundColor: colors.success,
  },
  completeText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: fontWeight.bold,
  },
  completeTextActive: {
    color: colors.white,
  },
  tip: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
