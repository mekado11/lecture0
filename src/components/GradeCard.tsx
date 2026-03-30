import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NutritionGrade, GRADE_INFO } from '../types';
import { colors, fontSize, borderRadius, spacing } from '../utils/theme';

interface Props {
  grade: NutritionGrade;
  size?: 'small' | 'large';
}

export function GradeCard({ grade, size = 'large' }: Props) {
  const info = GRADE_INFO[grade];
  const isLarge = size === 'large';

  return (
    <View style={[styles.container, { backgroundColor: info.color }, isLarge ? styles.large : styles.small]}>
      <Text style={[styles.grade, isLarge ? styles.gradeLarge : styles.gradeSmall]}>{grade}</Text>
      {isLarge && <Text style={styles.label}>{info.label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.lg,
  },
  large: {
    width: 120,
    height: 120,
    borderRadius: borderRadius.xl,
  },
  small: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm,
  },
  grade: {
    color: colors.white,
    fontWeight: '900',
  },
  gradeLarge: {
    fontSize: 52,
    lineHeight: 58,
  },
  gradeSmall: {
    fontSize: fontSize.lg,
  },
  label: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '700',
    marginTop: -2,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
