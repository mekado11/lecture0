import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../../src/components/Button';
import { colors, fontSize, spacing, borderRadius } from '../../src/utils/theme';

export default function ScanTab() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Analyze Food</Text>
        <Text style={styles.subtitle}>Choose how you want to check your meal</Text>

        <View style={styles.optionsContainer}>
          <View style={styles.optionCard}>
            <Text style={styles.optionEmoji}>📸</Text>
            <Text style={styles.optionTitle}>Photo of a Meal</Text>
            <Text style={styles.optionDesc}>
              Snap a picture of your plate and we'll estimate the nutrition and grade it.
            </Text>
            <Button
              title="Take a Photo"
              onPress={() => router.push('/camera')}
              size="md"
              style={styles.optionButton}
            />
          </View>

          <View style={styles.optionCard}>
            <Text style={styles.optionEmoji}>📋</Text>
            <Text style={styles.optionTitle}>Restaurant Menu</Text>
            <Text style={styles.optionDesc}>
              Upload a menu photo and tap any item to see its nutrition breakdown.
            </Text>
            <Button
              title="Scan a Menu"
              onPress={() => router.push('/menu-scan')}
              variant="outline"
              size="md"
              style={styles.optionButton}
            />
          </View>
        </View>

        <Text style={styles.disclaimer}>
          All nutrition values are estimates based on typical restaurant portions. Not medical advice.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.lg, paddingTop: spacing.xl },
  title: { fontSize: fontSize.xxl, fontWeight: '900', color: colors.text },
  subtitle: { fontSize: fontSize.md, color: colors.textSecondary, marginTop: 4, marginBottom: spacing.lg },
  optionsContainer: { gap: spacing.md },
  optionCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  optionEmoji: { fontSize: 36, marginBottom: spacing.sm },
  optionTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text, marginBottom: 4 },
  optionDesc: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.md },
  optionButton: { alignSelf: 'flex-start' },
  disclaimer: {
    fontSize: fontSize.xs, color: colors.textLight, textAlign: 'center',
    marginTop: 'auto', paddingTop: spacing.lg,
  },
});
