import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { UserGoal, GOAL_LABELS } from '../../src/types';
import { Button } from '../../src/components/Button';
import { colors, fontSize, spacing, borderRadius } from '../../src/utils/theme';

const ALL_GOALS: UserGoal[] = [
  'lose-weight', 'maintain-weight', 'build-muscle',
  'reduce-sugar', 'reduce-sodium', 'eat-cleaner',
];

export default function ProfileScreen() {
  const { profile, updateProfile, meals } = useApp();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile?.name || '');
  const [goals, setGoals] = useState<UserGoal[]>(profile?.goals || []);
  const [calorieTarget, setCalorieTarget] = useState(
    (profile?.dailyCalorieTarget || 2000).toString()
  );

  const toggleGoal = (goal: UserGoal) => {
    setGoals((prev) =>
      prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal]
    );
  };

  const saveChanges = async () => {
    await updateProfile({
      name: name.trim() || 'Friend',
      goals,
      onboardingComplete: true,
      dailyCalorieTarget: parseInt(calorieTarget) || 2000,
    });
    setEditing(false);
  };

  // Stats
  const totalMeals = meals.length;
  const gradeAB = meals.filter((m) => m.foodItem.grade === 'A' || m.foodItem.grade === 'B').length;
  const gradeDF = meals.filter((m) => m.foodItem.grade === 'D' || m.foodItem.grade === 'F').length;
  const smartPct = totalMeals > 0 ? Math.round((gradeAB / totalMeals) * 100) : 0;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Profile</Text>

        {/* Stats */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{totalMeals}</Text>
            <Text style={styles.statLabel}>Meals Logged</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.gradeA }]}>{gradeAB}</Text>
            <Text style={styles.statLabel}>Smart</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.gradeF }]}>{gradeDF}</Text>
            <Text style={styles.statLabel}>Junky</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{smartPct}%</Text>
            <Text style={styles.statLabel}>Smart Rate</Text>
          </View>
        </View>

        {/* Profile Info */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your Info</Text>
            {!editing && (
              <TouchableOpacity onPress={() => setEditing(true)}>
                <Text style={styles.editButton}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          {editing ? (
            <View style={styles.editCard}>
              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor={colors.textLight}
              />

              <Text style={styles.fieldLabel}>Daily Calorie Target</Text>
              <TextInput
                style={styles.input}
                value={calorieTarget}
                onChangeText={setCalorieTarget}
                keyboardType="numeric"
                placeholder="2000"
                placeholderTextColor={colors.textLight}
              />

              <Text style={styles.fieldLabel}>Goals</Text>
              <View style={styles.goalsGrid}>
                {ALL_GOALS.map((goal) => {
                  const selected = goals.includes(goal);
                  return (
                    <TouchableOpacity
                      key={goal}
                      style={[styles.goalChip, selected && styles.goalChipSelected]}
                      onPress={() => toggleGoal(goal)}
                    >
                      <Text style={[styles.goalText, selected && styles.goalTextSelected]}>
                        {GOAL_LABELS[goal]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.editActions}>
                <Button title="Cancel" onPress={() => setEditing(false)} variant="secondary" size="sm" />
                <Button title="Save" onPress={saveChanges} size="sm" />
              </View>
            </View>
          ) : (
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Name</Text>
                <Text style={styles.infoValue}>{profile?.name || 'Not set'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Daily Target</Text>
                <Text style={styles.infoValue}>{profile?.dailyCalorieTarget || 2000} cal</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Goals</Text>
                <Text style={styles.infoValue}>
                  {profile?.goals?.length
                    ? profile.goals.map((g) => GOAL_LABELS[g]).join(', ')
                    : 'None set'}
                </Text>
              </View>
            </View>
          )}
        </View>

        <Text style={styles.disclaimer}>
          Restaurant Junky provides nutrition estimates, not exact values.{'\n'}
          Always consult a healthcare professional for dietary guidance.
        </Text>

        <Text style={styles.version}>Restaurant Junky MVP v1.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: fontSize.xxl, fontWeight: '900', color: colors.text, marginTop: spacing.md, marginBottom: spacing.lg },
  statsCard: {
    flexDirection: 'row', backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: fontSize.xl, fontWeight: '900', color: colors.text },
  statLabel: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '600', marginTop: 2 },
  statDivider: { width: 1, backgroundColor: colors.border },
  section: { marginBottom: spacing.lg },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text },
  editButton: { fontSize: fontSize.md, color: colors.primary, fontWeight: '700' },
  infoCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
  infoLabel: { fontSize: fontSize.md, color: colors.textSecondary },
  infoValue: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, flex: 1, textAlign: 'right' },
  editCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  fieldLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text, marginBottom: 4, marginTop: spacing.sm },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.sm,
    padding: spacing.sm, fontSize: fontSize.md, color: colors.text, backgroundColor: colors.surfaceAlt,
  },
  goalsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  goalChip: {
    paddingVertical: spacing.xs + 2, paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surfaceAlt,
  },
  goalChipSelected: { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
  goalText: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600' },
  goalTextSelected: { color: colors.primary },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.md },
  disclaimer: {
    fontSize: fontSize.xs, color: colors.textLight, textAlign: 'center', lineHeight: 18,
  },
  version: {
    fontSize: fontSize.xs, color: colors.textLight, textAlign: 'center', marginTop: spacing.md,
  },
});
