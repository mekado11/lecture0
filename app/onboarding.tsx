import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '../src/context/AppContext';
import { UserGoal, GOAL_LABELS } from '../src/types';
import { Button } from '../src/components/Button';
import { colors, fontSize, spacing, borderRadius } from '../src/utils/theme';

const GOALS: UserGoal[] = [
  'lose-weight', 'maintain-weight', 'build-muscle',
  'reduce-sugar', 'reduce-sodium', 'eat-cleaner',
];

export default function Onboarding() {
  const router = useRouter();
  const { updateProfile } = useApp();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [selectedGoals, setSelectedGoals] = useState<UserGoal[]>([]);

  const toggleGoal = (goal: UserGoal) => {
    setSelectedGoals((prev) =>
      prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal]
    );
  };

  const finish = async () => {
    await updateProfile({
      name: name.trim() || 'Friend',
      goals: selectedGoals,
      onboardingComplete: true,
    });
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {step === 0 && (
          <View style={styles.stepContainer}>
            <Text style={styles.emoji}>🍔</Text>
            <Text style={styles.title}>Restaurant Junky</Text>
            <Text style={styles.subtitle}>
              Know exactly what you're eating.{'\n'}No more guessing at restaurants.
            </Text>
            <Text style={styles.body}>
              Snap a photo of your meal or scan a menu.{'\n'}
              We'll tell you if it's fuel or junk — and find you something better.
            </Text>
            <Button title="Let's Go" onPress={() => setStep(1)} size="lg" style={styles.button} />
          </View>
        )}

        {step === 1 && (
          <View style={styles.stepContainer}>
            <Text style={styles.emoji}>👋</Text>
            <Text style={styles.title}>What should we call you?</Text>
            <TextInput
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor={colors.textLight}
              value={name}
              onChangeText={setName}
              autoFocus
              autoCapitalize="words"
            />
            <Button
              title="Next"
              onPress={() => setStep(2)}
              size="lg"
              style={styles.button}
            />
          </View>
        )}

        {step === 2 && (
          <View style={styles.stepContainer}>
            <Text style={styles.emoji}>🎯</Text>
            <Text style={styles.title}>What are your goals?</Text>
            <Text style={styles.subtitle}>Pick as many as you want. This helps us give better advice.</Text>
            <View style={styles.goalsGrid}>
              {GOALS.map((goal) => {
                const selected = selectedGoals.includes(goal);
                return (
                  <TouchableOpacity
                    key={goal}
                    style={[styles.goalChip, selected && styles.goalChipSelected]}
                    onPress={() => toggleGoal(goal)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.goalText, selected && styles.goalTextSelected]}>
                      {GOAL_LABELS[goal]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Button
              title={selectedGoals.length > 0 ? "I'm Ready" : "Skip for Now"}
              onPress={finish}
              size="lg"
              variant={selectedGoals.length > 0 ? 'primary' : 'outline'}
              style={styles.button}
            />
          </View>
        )}

        <Text style={styles.disclaimer}>
          Nutrition estimates are not medical advice. Always consult a professional for dietary needs.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  stepContainer: {
    alignItems: 'center',
  },
  emoji: {
    fontSize: 64,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  body: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  input: {
    width: '100%',
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSize.lg,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
  },
  goalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  goalChip: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  goalChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '15',
  },
  goalText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  goalTextSelected: {
    color: colors.primary,
  },
  button: {
    width: '100%',
    marginTop: spacing.md,
  },
  disclaimer: {
    fontSize: fontSize.xs,
    color: colors.textLight,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
});
