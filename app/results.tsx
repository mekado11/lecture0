import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Alert, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { FoodItem, GRADE_INFO, MealLog } from '../src/types';
import { useApp } from '../src/context/AppContext';
import { GradeCard } from '../src/components/GradeCard';
import { MacroBar } from '../src/components/MacroBar';
import { AlternativeCard } from '../src/components/AlternativeCard';
import { Button } from '../src/components/Button';
import { colors, fontSize, spacing, borderRadius } from '../src/utils/theme';

const CONFIDENCE_LABELS = {
  low: 'Rough estimate — take with a grain of salt',
  medium: 'Decent estimate based on typical portions',
  high: 'Solid estimate for this type of dish',
};

export default function ResultsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ food: string }>();
  const { addMeal, profile } = useApp();
  const [saved, setSaved] = useState(false);

  let foodItem: FoodItem;
  try {
    foodItem = JSON.parse(params.food);
  } catch {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Something went wrong</Text>
          <Button title="Go Back" onPress={() => router.back()} variant="outline" />
        </View>
      </SafeAreaView>
    );
  }

  const gradeInfo = GRADE_INFO[foodItem.grade];
  const nutrition = foodItem.nutrition;

  const handleSave = (mealType: MealLog['mealType']) => {
    addMeal(foodItem, mealType);
    setSaved(true);
    Alert.alert('Saved!', `${foodItem.name} added to your ${mealType} log.`);
  };

  const showMealPicker = () => {
    Alert.alert('Save as...', 'What meal is this?', [
      { text: 'Breakfast', onPress: () => handleSave('breakfast') },
      { text: 'Lunch', onPress: () => handleSave('lunch') },
      { text: 'Dinner', onPress: () => handleSave('dinner') },
      { text: 'Snack', onPress: () => handleSave('snack') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
        </View>

        {/* Food Image */}
        {foodItem.imageUri && (
          <Image source={{ uri: foodItem.imageUri }} style={styles.foodImage} />
        )}

        {/* Grade + Name */}
        <View style={styles.gradeSection}>
          <GradeCard grade={foodItem.grade} size="large" />
          <Text style={styles.foodName}>{foodItem.name}</Text>
          <Text style={[styles.gradeLabel, { color: gradeInfo.color }]}>
            {foodItem.gradeLabel}
          </Text>
        </View>

        {/* Verdict */}
        <View style={[styles.verdictCard, { borderColor: gradeInfo.color + '40' }]}>
          <Text style={styles.verdictTitle}>Is this junk?</Text>
          <Text style={styles.verdictText}>{foodItem.verdict}</Text>
          <Text style={styles.explanationText}>{foodItem.explanation}</Text>
        </View>

        {/* Calorie Estimate */}
        <View style={styles.calorieCard}>
          <Text style={styles.calorieValue}>{nutrition.calories}</Text>
          <Text style={styles.calorieLabel}>estimated calories</Text>
          <Text style={styles.calorieRange}>
            Likely range: {nutrition.calorieRange.min}–{nutrition.calorieRange.max} cal
          </Text>
          <View style={[styles.confidenceBadge, {
            backgroundColor: nutrition.confidenceLevel === 'high' ? colors.gradeA + '20' :
              nutrition.confidenceLevel === 'medium' ? colors.gradeC + '20' : colors.gradeF + '20'
          }]}>
            <Text style={[styles.confidenceText, {
              color: nutrition.confidenceLevel === 'high' ? colors.gradeA :
                nutrition.confidenceLevel === 'medium' ? colors.gradeC : colors.gradeF
            }]}>
              {CONFIDENCE_LABELS[nutrition.confidenceLevel]}
            </Text>
          </View>
        </View>

        {/* Macros */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Nutrition Breakdown</Text>
          <View style={styles.macroCard}>
            <MacroBar label="Protein" value={nutrition.protein} unit="g" max={60} color={colors.primary} />
            <MacroBar label="Carbs" value={nutrition.carbs} unit="g" max={150} color="#6366F1" />
            <MacroBar label="Fat" value={nutrition.fat} unit="g" max={80} color="#F59E0B" />
            <MacroBar label="Fiber" value={nutrition.fiber} unit="g" max={15} color={colors.gradeA} />
            <MacroBar label="Sugar" value={nutrition.sugar} unit="g" max={50} color="#EC4899" />
            <MacroBar label="Sodium" value={nutrition.sodium} unit="mg" max={2300} color="#EF4444" />
            <MacroBar label="Sat. Fat" value={nutrition.saturatedFat} unit="g" max={20} color="#F97316" />
          </View>
        </View>

        {/* Alternatives */}
        {foodItem.alternatives.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Better Swaps</Text>
            <Text style={styles.sectionSubtitle}>Healthier alternatives you can ask for</Text>
            {foodItem.alternatives.map((alt, i) => (
              <AlternativeCard key={i} alternative={alt} />
            ))}
          </View>
        )}

        {/* Save Button */}
        <View style={styles.saveSection}>
          {saved ? (
            <View style={styles.savedBadge}>
              <Text style={styles.savedText}>✓ Saved to your log</Text>
            </View>
          ) : (
            <Button title="Save to Daily Log" onPress={showMealPicker} size="lg" style={styles.saveBtn} />
          )}
          <Button
            title="Scan Another"
            onPress={() => router.replace('/camera')}
            variant="outline"
            size="md"
            style={styles.anotherBtn}
          />
        </View>

        <Text style={styles.disclaimer}>
          These are estimates based on typical restaurant portions. Not medical advice.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { marginBottom: spacing.md },
  backBtn: { alignSelf: 'flex-start' },
  backBtnText: { fontSize: fontSize.md, color: colors.primary, fontWeight: '700' },
  foodImage: {
    width: '100%', height: 200, borderRadius: borderRadius.lg, marginBottom: spacing.md,
  },
  gradeSection: { alignItems: 'center', marginBottom: spacing.lg },
  foodName: {
    fontSize: fontSize.xl, fontWeight: '900', color: colors.text,
    textAlign: 'center', marginTop: spacing.md,
  },
  gradeLabel: { fontSize: fontSize.md, fontWeight: '800', marginTop: 4 },
  verdictCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md,
    borderWidth: 2, marginBottom: spacing.lg,
  },
  verdictTitle: { fontSize: fontSize.sm, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
  verdictText: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text, marginTop: 4 },
  explanationText: { fontSize: fontSize.md, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 22 },
  calorieCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg,
    alignItems: 'center', borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg,
  },
  calorieValue: { fontSize: fontSize.hero, fontWeight: '900', color: colors.text },
  calorieLabel: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600' },
  calorieRange: { fontSize: fontSize.sm, color: colors.textLight, marginTop: spacing.xs },
  confidenceBadge: {
    paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: borderRadius.full, marginTop: spacing.sm,
  },
  confidenceText: { fontSize: fontSize.xs, fontWeight: '700' },
  section: { marginBottom: spacing.lg },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text, marginBottom: spacing.xs },
  sectionSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.sm },
  macroCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  saveSection: { marginBottom: spacing.lg },
  saveBtn: { width: '100%' },
  anotherBtn: { width: '100%', marginTop: spacing.sm },
  savedBadge: {
    backgroundColor: colors.gradeA + '20', padding: spacing.md,
    borderRadius: borderRadius.md, alignItems: 'center',
  },
  savedText: { color: colors.gradeA, fontWeight: '800', fontSize: fontSize.md },
  disclaimer: { fontSize: fontSize.xs, color: colors.textLight, textAlign: 'center' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  errorText: { fontSize: fontSize.lg, color: colors.text, fontWeight: '700', marginBottom: spacing.md },
});
