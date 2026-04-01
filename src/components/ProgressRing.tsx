import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fontSize, fontWeight } from '../utils/theme';

interface Props {
  progress: number; // 0-1
  size?: number;
  strokeWidth?: number;
  color: string;
  label?: string;
  sublabel?: string;
}

export function ProgressRing({
  progress,
  size = 100,
  strokeWidth = 8,
  color,
  label,
  sublabel,
}: Props) {
  const clampedProgress = Math.min(1, Math.max(0, progress));
  const percentage = Math.round(clampedProgress * 100);

  // Simple progress bar visualization using View backgrounds
  const innerSize = size - strokeWidth * 2;
  const segments = 12;
  const filledSegments = Math.round(clampedProgress * segments);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <View
        style={[
          styles.outerRing,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: strokeWidth,
            borderColor: colors.surfaceLight,
          },
        ]}
      />
      {/* Progress indicator using filled arc segments */}
      {Array.from({ length: segments }).map((_, i) => {
        const angle = (i / segments) * 360 - 90;
        const rad = (angle * Math.PI) / 180;
        const radius = (size - strokeWidth) / 2;
        const x = Math.cos(rad) * radius;
        const y = Math.sin(rad) * radius;
        const filled = i < filledSegments;

        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              width: strokeWidth + 2,
              height: strokeWidth + 2,
              borderRadius: (strokeWidth + 2) / 2,
              backgroundColor: filled ? color : 'transparent',
              left: size / 2 + x - (strokeWidth + 2) / 2,
              top: size / 2 + y - (strokeWidth + 2) / 2,
            }}
          />
        );
      })}
      <View style={[styles.inner, { width: innerSize, height: innerSize, borderRadius: innerSize / 2 }]}>
        <Text style={[styles.percentage, { color }]}>{percentage}%</Text>
        {label && <Text style={styles.label}>{label}</Text>}
        {sublabel && <Text style={styles.sublabel}>{sublabel}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  outerRing: {
    position: 'absolute',
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  percentage: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  label: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sublabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
});
