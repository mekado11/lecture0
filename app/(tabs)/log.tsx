import React from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Alert } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { GRADE_INFO } from '../../src/types';
import { colors, fontSize, spacing, borderRadius } from '../../src/utils/theme';

export default function LogScreen() {
  const { todaySummary, removeMeal, profile } = useApp();
  const meals = todaySummary.meals;

  const calorieTarget = profile?.dailyCalorieTarget || 2000;
  const caloriePct = Math.min(100, (todaySummary.totalCalories / calorieTarget) * 100);

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Remove Meal', `Remove ${name} from your log?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeMeal(id) },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Daily Log</Text>
        <Text style={styles.date}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </Text>

        {/* Calorie Progress */}
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressTitle}>Calories</Text>
            <Text style={styles.progressValue}>
              {todaySummary.totalCalories} / {calorieTarget}
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${caloriePct}%`,
                  backgroundColor: caloriePct > 100 ? colors.gradeF : caloriePct > 80 ? colors.gradeC : colors.gradeA,
                },
              ]}
            />
          </View>

          <View style={styles.macroRow}>
            <View style={styles.macroItem}>
              <Text style={styles.macroValue}>{Math.round(todaySummary.totalProtein)}g</Text>
              <Text style={styles.macroLabel}>Protein</Text>
            </View>
            <View style={styles.macroItem}>
              <Text style={styles.macroValue}>{Math.round(todaySummary.totalCarbs)}g</Text>
              <Text style={styles.macroLabel}>Carbs</Text>
            </View>
            <View style={styles.macroItem}>
              <Text style={styles.macroValue}>{Math.round(todaySummary.totalFat)}g</Text>
              <Text style={styles.macroLabel}>Fat</Text>
            </View>
          </View>
        </View>

        {/* Meal List */}
        <Text style={styles.sectionTitle}>Meals ({meals.length})</Text>

        {meals.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📝</Text>
            <Text style={styles.emptyText}>Nothing logged yet</Text>
            <Text style={styles.emptySubtext}>Your meals will show up here after you scan them</Text>
          </View>
        ) : (
          meals.map((meal) => {
            const gradeInfo = GRADE_INFO[meal.foodItem.grade];
            const time = new Date(meal.timestamp).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            });

            return (
              <TouchableOpacity
                key={meal.id}
                style={styles.mealCard}
                onLongPress={() => handleDelete(meal.id, meal.foodItem.name)}
                activeOpacity={0.8}
              >
                <View style={[styles.mealGrade, { backgroundColor: gradeInfo.color }]}>
                  <Text style={styles.mealGradeText}>{meal.foodItem.grade}</Text>
                </View>
                <View style={styles.mealInfo}>
                  <Text style={styles.mealName} numberOfLines={1}>{meal.foodItem.name}</Text>
                  <View style={styles.mealMeta}>
                    <Text style={styles.mealType}>{meal.mealType}</Text>
                    <Text style={styles.mealDot}>·</Text>
                    <Text style={styles.mealTime}>{time}</Text>
                  </View>
                </View>
                <View style={styles.mealCalories}>
                  <Text style={styles.mealCalText}>{meal.foodItem.nutrition.calories}</Text>
                  <Text style={styles.mealCalUnit}>cal</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        {meals.length > 0 && (
          <Text style={styles.hint}>Long press a meal to remove it</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: fontSize.xxl, fontWeight: '900', color: colors.text, marginTop: spacing.md },
  date: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.lg },
  progressCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg,
  },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  progressTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  progressValue: { fontSize: fontSize.md, fontWeight: '700', color: colors.textSecondary },
  progressTrack: {
    height: 10, backgroundColor: colors.surfaceAlt, borderRadius: borderRadius.full,
    overflow: 'hidden', marginBottom: spacing.md,
  },
  progressFill: { height: '100%', borderRadius: borderRadius.full },
  macroRow: { flexDirection: 'row', justifyContent: 'space-around' },
  macroItem: { alignItems: 'center' },
  macroValue: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text },
  macroLabel: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '600' },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  emptyState: {
    alignItems: 'center', padding: spacing.xl, backgroundColor: colors.surface,
    borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border,
  },
  emptyEmoji: { fontSize: 36, marginBottom: spacing.sm },
  emptyText: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  emptySubtext: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 4, textAlign: 'center' },
  mealCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  mealGrade: {
    width: 40, height: 40, borderRadius: borderRadius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  mealGradeText: { color: colors.white, fontWeight: '900', fontSize: fontSize.md },
  mealInfo: { flex: 1, marginLeft: spacing.sm },
  mealName: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  mealMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  mealType: { fontSize: fontSize.xs, color: colors.textSecondary, textTransform: 'capitalize', fontWeight: '600' },
  mealDot: { fontSize: fontSize.xs, color: colors.textLight, marginHorizontal: 4 },
  mealTime: { fontSize: fontSize.xs, color: colors.textLight },
  mealCalories: { alignItems: 'center' },
  mealCalText: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text },
  mealCalUnit: { fontSize: fontSize.xs, color: colors.textSecondary },
  hint: { fontSize: fontSize.xs, color: colors.textLight, textAlign: 'center', marginTop: spacing.sm },
});
