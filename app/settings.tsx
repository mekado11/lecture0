import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, TextInput, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '../src/context/AppContext';
import { DEFAULT_PROFILE } from '../src/context/AppContext';
import { Button } from '../src/components/Button';
import { colors, fontSize, spacing, borderRadius, fontWeight } from '../src/utils/theme';
import type { NotificationStyle, DeskType, EyewearType, WellnessModule } from '../src/types';

export default function SettingsScreen() {
  const router = useRouter();
  const { profile, updateProfile, wellness, toggleFocusMode } = useApp();

  const [name, setName] = useState(profile?.name ?? '');
  const [waterGoal, setWaterGoal] = useState(String(profile?.dailyWaterGoal ?? 8));
  const [maxSitting, setMaxSitting] = useState(String(profile?.maxSittingMinutes ?? 45));
  const [eyeInterval, setEyeInterval] = useState(String(profile?.eyeBreakIntervalMinutes ?? 20));
  const [notifStyle, setNotifStyle] = useState<NotificationStyle>(profile?.notificationStyle ?? 'balanced');
  const [deskType, setDeskType] = useState<DeskType>(profile?.deskType ?? 'fixed');
  const [eyewear, setEyewear] = useState<EyewearType>(profile?.eyewear ?? 'neither');
  const [modules, setModules] = useState<WellnessModule[]>(profile?.enabledModules ?? ['hydration', 'movement', 'eyes']);

  const toggleModule = (mod: WellnessModule) => {
    setModules((prev) =>
      prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod],
    );
  };

  const save = async () => {
    await updateProfile({
      ...(profile ?? DEFAULT_PROFILE),
      name: name.trim() || 'Friend',
      dailyWaterGoal: parseInt(waterGoal) || 8,
      maxSittingMinutes: parseInt(maxSitting) || 45,
      eyeBreakIntervalMinutes: parseInt(eyeInterval) || 20,
      notificationStyle: notifStyle,
      deskType,
      eyewear,
      enabledModules: modules,
      onboardingComplete: true,
    });
    router.back();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={styles.backArrow}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Settings</Text>
          <TouchableOpacity onPress={save} activeOpacity={0.7}>
            <Text style={styles.saveText}>Save</Text>
          </TouchableOpacity>
        </View>

        {/* General */}
        <Text style={styles.sectionLabel}>GENERAL</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Name</Text>
            <TextInput
              style={styles.rowInput}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={colors.textMuted}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Focus Mode</Text>
            <Switch
              value={wellness.focusMode}
              onValueChange={toggleFocusMode}
              trackColor={{ false: colors.surfaceLight, true: colors.primary }}
              thumbColor={colors.white}
            />
          </View>
        </View>

        {/* Notification Style */}
        <Text style={styles.sectionLabel}>NOTIFICATION STYLE</Text>
        <View style={styles.chipRow}>
          {(['gentle', 'balanced', 'strict'] as NotificationStyle[]).map((style) => (
            <TouchableOpacity
              key={style}
              style={[styles.chip, notifStyle === style && styles.chipSelected]}
              onPress={() => setNotifStyle(style)}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, notifStyle === style && styles.chipTextSelected]}>
                {style.charAt(0).toUpperCase() + style.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Modules */}
        <Text style={styles.sectionLabel}>ACTIVE MODULES</Text>
        <View style={styles.card}>
          {([
            { key: 'hydration' as WellnessModule, icon: '💧', label: 'Sip - Hydration' },
            { key: 'movement' as WellnessModule, icon: '🧘', label: 'Flow - Movement' },
            { key: 'eyes' as WellnessModule, icon: '👁️', label: 'Focus - Eye Care' },
          ]).map((mod, i) => (
            <React.Fragment key={mod.key}>
              {i > 0 && <View style={styles.divider} />}
              <View style={styles.row}>
                <Text style={styles.rowLabel}>{mod.icon}  {mod.label}</Text>
                <Switch
                  value={modules.includes(mod.key)}
                  onValueChange={() => toggleModule(mod.key)}
                  trackColor={{ false: colors.surfaceLight, true: colors.primary }}
                  thumbColor={colors.white}
                />
              </View>
            </React.Fragment>
          ))}
        </View>

        {/* Hydration Settings */}
        <Text style={styles.sectionLabel}>HYDRATION</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Daily Goal (glasses)</Text>
            <TextInput
              style={styles.rowInput}
              value={waterGoal}
              onChangeText={setWaterGoal}
              keyboardType="number-pad"
              maxLength={2}
            />
          </View>
        </View>

        {/* Movement Settings */}
        <Text style={styles.sectionLabel}>MOVEMENT</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Max Sitting (min)</Text>
            <TextInput
              style={styles.rowInput}
              value={maxSitting}
              onChangeText={setMaxSitting}
              keyboardType="number-pad"
              maxLength={3}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Desk Type</Text>
            <View style={styles.miniChipRow}>
              {(['fixed', 'standing'] as DeskType[]).map((dt) => (
                <TouchableOpacity
                  key={dt}
                  style={[styles.miniChip, deskType === dt && styles.miniChipSelected]}
                  onPress={() => setDeskType(dt)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.miniChipText, deskType === dt && styles.miniChipTextSelected]}>
                    {dt === 'fixed' ? '🪑 Fixed' : '🧍 Standing'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Eye Care Settings */}
        <Text style={styles.sectionLabel}>EYE CARE</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Break Interval (min)</Text>
            <TextInput
              style={styles.rowInput}
              value={eyeInterval}
              onChangeText={setEyeInterval}
              keyboardType="number-pad"
              maxLength={3}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Eyewear</Text>
            <View style={styles.miniChipRow}>
              {(['glasses', 'contacts', 'neither'] as EyewearType[]).map((ew) => (
                <TouchableOpacity
                  key={ew}
                  style={[styles.miniChip, eyewear === ew && styles.miniChipSelected]}
                  onPress={() => setEyewear(ew)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.miniChipText, eyewear === ew && styles.miniChipTextSelected]}>
                    {ew === 'glasses' ? '👓' : ew === 'contacts' ? '🫧' : '👁️'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Privacy */}
        <Text style={styles.sectionLabel}>PRIVACY</Text>
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>🔒</Text>
            <Text style={styles.infoText}>All data is stored locally on your device. No account required.</Text>
          </View>
        </View>

        {/* Save Button */}
        <Button title="Save Settings" onPress={save} size="lg" style={styles.saveButton} />

        {/* Version */}
        <Text style={styles.version}>Vital v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.md, paddingBottom: spacing.xxl * 2 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
    marginTop: spacing.md,
  },
  backArrow: { fontSize: fontSize.md, color: colors.primary, fontWeight: fontWeight.medium },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  saveText: { fontSize: fontSize.md, color: colors.primary, fontWeight: fontWeight.bold },
  sectionLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: fontWeight.semibold,
    letterSpacing: 1,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
  },
  rowLabel: {
    fontSize: fontSize.md,
    color: colors.text,
    flex: 1,
  },
  rowInput: {
    fontSize: fontSize.md,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
    textAlign: 'right',
    minWidth: 60,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.border,
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
  },
  chipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  chipTextSelected: {
    color: colors.primary,
  },
  miniChipRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  miniChip: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
  },
  miniChipSelected: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
  },
  miniChipText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  miniChipTextSelected: {
    color: colors.primaryLight,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    gap: spacing.sm,
  },
  infoIcon: { fontSize: 18 },
  infoText: { flex: 1, fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
  saveButton: {
    marginTop: spacing.lg,
  },
  version: {
    textAlign: 'center',
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.lg,
  },
});
