import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '../../src/context/AppContext';
import { GRADE_INFO } from '../../src/types';
import { colors, fontSize, spacing, borderRadius } from '../../src/utils/theme';

export default function HomeScreen() {
  const router = useRouter();
  const { profile, todaySummary } = useApp();

  const smartCount = (todaySummary.gradeBreakdown.A || 0) + (todaySummary.gradeBreakdown.B || 0);
  const junkyCount = (todaySummary.gradeBreakdown.D || 0) + (todaySummary.gradeBreakdown.F || 0);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.greeting}>
            Hey{profile?.name ? `, ${profile.name}` : ''} 👋
          </Text>
          <Text style={styles.subtitle}>What are you eating today?</Text>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: colors.primary }]}
            onPress={() => router.push('/camera')}
            activeOpacity={0.85}
          >
            <Text style={styles.actionEmoji}>📷</Text>
            <Text style={styles.actionTitle}>Snap a Meal</Text>
            <Text style={styles.actionDesc}>Analyze your plate</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: '#6366F1' }]}
            onPress={() => router.push('/menu-scan')}
            activeOpacity={0.85}
          >
            <Text style={styles.actionEmoji}>📋</Text>
            <Text style={styles.actionTitle}>Scan Menu</Text>
            <Text style={styles.actionDesc}>Check before you order</Text>
          </TouchableOpacity>
        </View>

        {/* Today's Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today's Summary</Text>

          {todaySummary.meals.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>🍽️</Text>
              <Text style={styles.emptyText}>No meals logged yet today</Text>
              <Text style={styles.emptySubtext}>Snap a photo to get started</Text>
            </View>
          ) : (
            <>
              {/* Calorie Summary */}
              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryValue}>{todaySummary.totalCalories}</Text>
                    <Text style={styles.summaryLabel}>Calories</Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryValue}>{Math.round(todaySummary.totalProtein)}g</Text>
                    <Text style={styles.summaryLabel}>Protein</Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryValue}>{todaySummary.meals.length}</Text>
                    <Text style={styles.summaryLabel}>Meals</Text>
                  </View>
                </View>
              </View>

              {/* Grade Breakdown */}
              <View style={styles.gradeRow}>
                {smartCount > 0 && (
                  <View style={[styles.gradeBadge, { backgroundColor: colors.gradeA + '20' }]}>
                    <Text style={[styles.gradeBadgeText, { color: colors.gradeA }]}>
                      {smartCount} Smart {smartCount === 1 ? 'Choice' : 'Choices'}
                    </Text>
                  </View>
                )}
                {junkyCount > 0 && (
                  <View style={[styles.gradeBadge, { backgroundColor: colors.gradeF + '20' }]}>
                    <Text style={[styles.gradeBadgeText, { color: colors.gradeF }]}>
                      {junkyCount} Junky
                    </Text>
                  </View>
                )}
              </View>

              {/* Recent Meals */}
              <Text style={styles.recentTitle}>Recent</Text>
              {todaySummary.meals.slice(-3).reverse().map((meal) => {
                const gradeInfo = GRADE_INFO[meal.foodItem.grade];
                return (
                  <View key={meal.id} style={styles.mealRow}>
                    <View style={[styles.mealGrade, { backgroundColor: gradeInfo.color }]}>
                      <Text style={styles.mealGradeText}>{meal.foodItem.grade}</Text>
                    </View>
                    <View style={styles.mealInfo}>
                      <Text style={styles.mealName} numberOfLines={1}>{meal.foodItem.name}</Text>
                      <Text style={styles.mealCals}>{meal.foodItem.nutrition.calories} cal</Text>
                    </View>
                    <Text style={styles.mealType}>{meal.mealType}</Text>
                  </View>
                );
              })}
            </>
          )}
        </View>

        {/* Tips */}
        <View style={styles.tipCard}>
          <Text style={styles.tipTitle}>Pro Tip 💡</Text>
          <Text style={styles.tipText}>
            Scan the menu before you order — it's easier to make a smart choice before the food arrives.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { marginBottom: spacing.lg, marginTop: spacing.md },
  greeting: { fontSize: fontSize.xxl, fontWeight: '900', color: colors.text },
  subtitle: { fontSize: fontSize.md, color: colors.textSecondary, marginTop: 4 },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  actionCard: {
    flex: 1, borderRadius: borderRadius.lg, padding: spacing.md, paddingVertical: spacing.lg,
  },
  actionEmoji: { fontSize: 28, marginBottom: spacing.sm },
  actionTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.white },
  actionDesc: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  section: { marginBottom: spacing.lg },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  emptyCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.xl,
    alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  emptyEmoji: { fontSize: 40, marginBottom: spacing.sm },
  emptyText: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  emptySubtext: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 4 },
  summaryCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: fontSize.xl, fontWeight: '900', color: colors.text },
  summaryLabel: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '600', marginTop: 2 },
  summaryDivider: { width: 1, height: 30, backgroundColor: colors.border },
  gradeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  gradeBadge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: borderRadius.full },
  gradeBadgeText: { fontSize: fontSize.xs, fontWeight: '700' },
  recentTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  mealRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: borderRadius.md, padding: spacing.sm, marginBottom: spacing.xs,
    borderWidth: 1, borderColor: colors.border,
  },
  mealGrade: {
    width: 32, height: 32, borderRadius: borderRadius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  mealGradeText: { color: colors.white, fontWeight: '900', fontSize: fontSize.sm },
  mealInfo: { flex: 1, marginLeft: spacing.sm },
  mealName: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  mealCals: { fontSize: fontSize.xs, color: colors.textSecondary },
  mealType: { fontSize: fontSize.xs, color: colors.textLight, fontWeight: '600', textTransform: 'capitalize' },
  tipCard: {
    backgroundColor: '#FEF3C7', borderRadius: borderRadius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  tipTitle: { fontSize: fontSize.md, fontWeight: '800', color: '#92400E', marginBottom: 4 },
  tipText: { fontSize: fontSize.sm, color: '#92400E', lineHeight: 20 },
});
