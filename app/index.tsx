import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '../src/context/AppContext';
import { colors, fontSize, fontWeight } from '../src/utils/theme';

export default function Index() {
  const router = useRouter();
  const { profile, isLoading } = useApp();

  useEffect(() => {
    if (isLoading) return;

    if (!profile?.onboardingComplete) {
      router.replace('/onboarding');
    } else {
      router.replace('/(tabs)');
    }
  }, [isLoading, profile]);

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>V</Text>
      <Text style={styles.title}>Vital</Text>
      <Text style={styles.tagline}>Your complete wellness companion</Text>
      <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  logo: {
    fontSize: 64,
    fontWeight: fontWeight.bold,
    color: colors.primary,
    marginBottom: 4,
  },
  title: {
    fontSize: fontSize.hero,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: 8,
  },
  tagline: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  spinner: {
    marginTop: 32,
  },
});
