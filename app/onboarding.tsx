import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '../src/context/AppContext';
import { DEFAULT_PROFILE } from '../src/context/AppContext';
import { Button } from '../src/components/Button';
import { colors, fontSize, spacing, borderRadius, fontWeight } from '../src/utils/theme';
import type { WellnessModule, DeskType, EyewearType, NotificationStyle } from '../src/types';

const STEPS = ['welcome', 'name', 'modules', 'desk', 'notification'] as const;

export default function Onboarding() {
  const router = useRouter();
  const { updateProfile } = useApp();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [modules, setModules] = useState<WellnessModule[]>(['hydration', 'movement', 'eyes']);
  const [deskType, setDeskType] = useState<DeskType>('fixed');
  const [eyewear, setEyewear] = useState<EyewearType>('neither');
  const [notifStyle, setNotifStyle] = useState<NotificationStyle>('balanced');

  const toggleModule = (mod: WellnessModule) => {
    setModules((prev) =>
      prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod],
    );
  };

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const finish = async () => {
    await updateProfile({
      ...DEFAULT_PROFILE,
      name: name.trim() || 'Friend',
      enabledModules: modules.length > 0 ? modules : ['hydration', 'movement', 'eyes'],
      deskType,
      eyewear,
      notificationStyle: notifStyle,
      onboardingComplete: true,
    });
    router.replace('/(tabs)');
  };

  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress}%` as any }]} />
      </View>

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Step 0: Welcome */}
        {step === 0 && (
          <View style={styles.stepContainer}>
            <Text style={styles.heroEmoji}>🌿</Text>
            <Text style={styles.title}>Vital</Text>
            <Text style={styles.subtitle}>
              Your complete wellness companion{'\n'}for the screen-based life.
            </Text>
            <Text style={styles.body}>
              Hydration, movement, and eye care —{'\n'}
              intelligently coordinated, never overwhelming.
            </Text>
            <View style={styles.pillRow}>
              <View style={[styles.pill, { backgroundColor: 'rgba(56, 189, 248, 0.15)' }]}>
                <Text style={styles.pillText}>💧 Hydration</Text>
              </View>
              <View style={[styles.pill, { backgroundColor: 'rgba(52, 211, 153, 0.15)' }]}>
                <Text style={styles.pillText}>🧘 Movement</Text>
              </View>
              <View style={[styles.pill, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                <Text style={styles.pillText}>👁️ Eye Care</Text>
              </View>
            </View>
            <Button title="Get Started" onPress={next} size="lg" style={styles.button} />
          </View>
        )}

        {/* Step 1: Name */}
        {step === 1 && (
          <View style={styles.stepContainer}>
            <Text style={styles.heroEmoji}>👋</Text>
            <Text style={styles.title}>What's your name?</Text>
            <TextInput
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
              autoFocus
              autoCapitalize="words"
            />
            <Button title="Next" onPress={next} size="lg" style={styles.button} />
            <TouchableOpacity onPress={back} style={styles.backButton}>
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step 2: Modules */}
        {step === 2 && (
          <View style={styles.stepContainer}>
            <Text style={styles.heroEmoji}>🎯</Text>
            <Text style={styles.title}>Choose your focus</Text>
            <Text style={styles.subtitle}>All three recommended for complete wellness</Text>

            {([
              { key: 'hydration' as WellnessModule, icon: '💧', label: 'Sip - Hydration', desc: 'Track water intake, smart reminders' },
              { key: 'movement' as WellnessModule, icon: '🧘', label: 'Flow - Movement', desc: 'Posture tracking, sit-stand reminders' },
              { key: 'eyes' as WellnessModule, icon: '👁️', label: 'Focus - Eye Care', desc: '20-20-20 rule, screen time tracking' },
            ]).map((mod) => {
              const selected = modules.includes(mod.key);
              return (
                <TouchableOpacity
                  key={mod.key}
                  style={[styles.moduleCard, selected && styles.moduleCardSelected]}
                  onPress={() => toggleModule(mod.key)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.moduleIcon}>{mod.icon}</Text>
                  <View style={styles.moduleInfo}>
                    <Text style={[styles.moduleLabel, selected && styles.moduleLabelSelected]}>{mod.label}</Text>
                    <Text style={styles.moduleDesc}>{mod.desc}</Text>
                  </View>
                  <View style={[styles.moduleCheck, selected && styles.moduleCheckSelected]}>
                    {selected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}

            <Button title="Next" onPress={next} size="lg" style={styles.button} />
            <TouchableOpacity onPress={back} style={styles.backButton}>
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step 3: Desk Setup */}
        {step === 3 && (
          <View style={styles.stepContainer}>
            <Text style={styles.heroEmoji}>🖥️</Text>
            <Text style={styles.title}>Your desk setup</Text>

            <Text style={styles.label}>Desk type</Text>
            <View style={styles.optionRow}>
              {([
                { key: 'fixed' as DeskType, icon: '🪑', label: 'Fixed' },
                { key: 'standing' as DeskType, icon: '🧍', label: 'Standing' },
              ]).map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.optionCard, deskType === opt.key && styles.optionCardSelected]}
                  onPress={() => setDeskType(opt.key)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.optionIcon}>{opt.icon}</Text>
                  <Text style={[styles.optionLabel, deskType === opt.key && styles.optionLabelSelected]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Eyewear</Text>
            <View style={styles.optionRow}>
              {([
                { key: 'glasses' as EyewearType, icon: '👓', label: 'Glasses' },
                { key: 'contacts' as EyewearType, icon: '🫧', label: 'Contacts' },
                { key: 'neither' as EyewearType, icon: '👁️', label: 'Neither' },
              ]).map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.optionCard, eyewear === opt.key && styles.optionCardSelected]}
                  onPress={() => setEyewear(opt.key)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.optionIcon}>{opt.icon}</Text>
                  <Text style={[styles.optionLabel, eyewear === opt.key && styles.optionLabelSelected]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Button title="Next" onPress={next} size="lg" style={styles.button} />
            <TouchableOpacity onPress={back} style={styles.backButton}>
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step 4: Notification Style */}
        {step === 4 && (
          <View style={styles.stepContainer}>
            <Text style={styles.heroEmoji}>🔔</Text>
            <Text style={styles.title}>Notification style</Text>
            <Text style={styles.subtitle}>How would you like to be reminded?</Text>

            {([
              { key: 'gentle' as NotificationStyle, icon: '🍃', label: 'Gentle', desc: 'Subtle visual cues, rarely intrusive' },
              { key: 'balanced' as NotificationStyle, icon: '⚖️', label: 'Balanced', desc: 'Smart timing, escalates when needed' },
              { key: 'strict' as NotificationStyle, icon: '💪', label: 'Strict', desc: 'Consistent reminders, hard to ignore' },
            ]).map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.moduleCard, notifStyle === opt.key && styles.moduleCardSelected]}
                onPress={() => setNotifStyle(opt.key)}
                activeOpacity={0.7}
              >
                <Text style={styles.moduleIcon}>{opt.icon}</Text>
                <View style={styles.moduleInfo}>
                  <Text style={[styles.moduleLabel, notifStyle === opt.key && styles.moduleLabelSelected]}>
                    {opt.label}
                  </Text>
                  <Text style={styles.moduleDesc}>{opt.desc}</Text>
                </View>
                <View style={[styles.moduleCheck, notifStyle === opt.key && styles.moduleCheckSelected]}>
                  {notifStyle === opt.key && <Text style={styles.checkmark}>✓</Text>}
                </View>
              </TouchableOpacity>
            ))}

            <Button title="Start My Wellness Journey" onPress={finish} size="lg" style={styles.button} />
            <TouchableOpacity onPress={back} style={styles.backButton}>
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  progressBar: {
    height: 3,
    backgroundColor: colors.surfaceLight,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  stepContainer: {
    alignItems: 'center',
  },
  heroEmoji: {
    fontSize: 56,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
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
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  pillRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  pill: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
  },
  pillText: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: fontWeight.medium,
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
  label: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
    alignSelf: 'flex-start',
    width: '100%',
  },
  moduleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    width: '100%',
    marginBottom: spacing.sm,
    borderWidth: 2,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  moduleCardSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
  },
  moduleIcon: {
    fontSize: 24,
  },
  moduleInfo: {
    flex: 1,
  },
  moduleLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  moduleLabelSelected: {
    color: colors.primaryLight,
  },
  moduleDesc: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  moduleCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleCheckSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    fontSize: 14,
    color: colors.white,
    fontWeight: fontWeight.bold,
  },
  optionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
    marginBottom: spacing.lg,
  },
  optionCard: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  optionCardSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
  },
  optionIcon: {
    fontSize: 28,
  },
  optionLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  optionLabelSelected: {
    color: colors.primaryLight,
  },
  button: {
    width: '100%',
    marginTop: spacing.md,
  },
  backButton: {
    marginTop: spacing.md,
    padding: spacing.sm,
  },
  backText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
});
