import React from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Alternative, GRADE_INFO } from '../src/types';
import { AlternativeCard } from '../src/components/AlternativeCard';
import { colors, fontSize, spacing, borderRadius } from '../src/utils/theme';

export default function AlternativesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ alternatives: string; foodName: string }>();

  let alternatives: Alternative[] = [];
  try {
    alternatives = JSON.parse(params.alternatives);
  } catch {
    alternatives = [];
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Healthier Swaps</Text>
        {params.foodName && (
          <Text style={styles.subtitle}>Better options instead of {params.foodName}</Text>
        )}

        {alternatives.length > 0 ? (
          <View style={styles.list}>
            {alternatives.map((alt, i) => (
              <AlternativeCard key={i} alternative={alt} />
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🤷</Text>
            <Text style={styles.emptyText}>No alternatives available</Text>
          </View>
        )}

        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>General Tips</Text>
          <Text style={styles.tip}>• Ask for sauces and dressings on the side</Text>
          <Text style={styles.tip}>• Grilled beats fried every time</Text>
          <Text style={styles.tip}>• Water is always the smartest drink choice</Text>
          <Text style={styles.tip}>• Restaurant portions are usually 2x normal — share or box half</Text>
          <Text style={styles.tip}>• Load up on veggies first, protein second, carbs third</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  backText: { fontSize: fontSize.md, color: colors.primary, fontWeight: '700', marginBottom: spacing.md },
  title: { fontSize: fontSize.xxl, fontWeight: '900', color: colors.text },
  subtitle: { fontSize: fontSize.md, color: colors.textSecondary, marginTop: 4, marginBottom: spacing.lg },
  list: { marginTop: spacing.md },
  emptyState: { alignItems: 'center', padding: spacing.xxl },
  emptyEmoji: { fontSize: 48, marginBottom: spacing.sm },
  emptyText: { fontSize: fontSize.md, color: colors.textSecondary },
  tipsCard: {
    backgroundColor: '#F0FDF4', borderRadius: borderRadius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: '#BBF7D0', marginTop: spacing.lg,
  },
  tipsTitle: { fontSize: fontSize.md, fontWeight: '700', color: '#166534', marginBottom: spacing.sm },
  tip: { fontSize: fontSize.sm, color: '#166534', lineHeight: 22 },
});
