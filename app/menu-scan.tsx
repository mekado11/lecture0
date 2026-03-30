import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Image, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { getMenuItems } from '../src/data/mockFoods';
import { FoodItem, GRADE_INFO } from '../src/types';
import { Button } from '../src/components/Button';
import { GradeCard } from '../src/components/GradeCard';
import { colors, fontSize, spacing, borderRadius } from '../src/utils/theme';

export default function MenuScanScreen() {
  const router = useRouter();
  const [menuImage, setMenuImage] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [restaurantName, setRestaurantName] = useState('');
  const [menuItems, setMenuItems] = useState<FoodItem[]>([]);

  const pickMenu = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setMenuImage(result.assets[0].uri);
      scanMenu(result.assets[0].uri);
    }
  };

  const takeMenuPhoto = async () => {
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setMenuImage(result.assets[0].uri);
      scanMenu(result.assets[0].uri);
    }
  };

  const scanMenu = (uri: string) => {
    setScanning(true);
    // Simulate OCR + analysis delay
    setTimeout(() => {
      const result = getMenuItems(uri);
      setRestaurantName(result.restaurantName);
      setMenuItems(result.items);
      setScanning(false);
    }, 2000);
  };

  const viewItem = (item: FoodItem) => {
    router.push({ pathname: '/results', params: { food: JSON.stringify(item) } });
  };

  // Sort: best grades first
  const sortedItems = [...menuItems].sort((a, b) => {
    const order = { A: 0, B: 1, C: 2, D: 3, F: 4 };
    return order[a.grade] - order[b.grade];
  });

  const bestPick = sortedItems.length > 0 ? sortedItems[0] : null;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Menu Scanner</Text>
          <Text style={styles.subtitle}>Upload a restaurant menu to check nutrition</Text>
        </View>

        {!menuImage && !scanning && menuItems.length === 0 && (
          <View style={styles.uploadSection}>
            <View style={styles.uploadCard}>
              <Text style={styles.uploadEmoji}>📋</Text>
              <Text style={styles.uploadTitle}>Scan a Restaurant Menu</Text>
              <Text style={styles.uploadDesc}>
                Take a photo or upload an image of a menu. We'll extract the items and estimate nutrition for each one.
              </Text>
              <View style={styles.uploadActions}>
                <Button title="Take Photo" onPress={takeMenuPhoto} size="md" />
                <Button title="From Gallery" onPress={pickMenu} variant="outline" size="md" />
              </View>
            </View>

            <View style={styles.tipCard}>
              <Text style={styles.tipTitle}>Tips for best results</Text>
              <Text style={styles.tipItem}>• Get the full menu section in frame</Text>
              <Text style={styles.tipItem}>• Good lighting helps with text recognition</Text>
              <Text style={styles.tipItem}>• Flat angle works better than angled shots</Text>
            </View>
          </View>
        )}

        {scanning && (
          <View style={styles.scanningCard}>
            <Text style={styles.scanningEmoji}>🔍</Text>
            <Text style={styles.scanningTitle}>Scanning Menu...</Text>
            <Text style={styles.scanningSubtext}>Extracting items and estimating nutrition</Text>
          </View>
        )}

        {menuItems.length > 0 && (
          <>
            {menuImage && (
              <Image source={{ uri: menuImage }} style={styles.menuPreview} />
            )}

            <Text style={styles.restaurantName}>{restaurantName}</Text>
            <Text style={styles.itemCount}>{menuItems.length} items found</Text>

            {/* Best Pick */}
            {bestPick && (
              <TouchableOpacity
                style={[styles.bestPickCard, { borderColor: GRADE_INFO[bestPick.grade].color }]}
                onPress={() => viewItem(bestPick)}
                activeOpacity={0.8}
              >
                <Text style={styles.bestPickLabel}>Best Available Choice</Text>
                <View style={styles.bestPickContent}>
                  <GradeCard grade={bestPick.grade} size="small" />
                  <View style={styles.bestPickInfo}>
                    <Text style={styles.bestPickName}>{bestPick.name}</Text>
                    <Text style={styles.bestPickCals}>{bestPick.nutrition.calories} cal</Text>
                  </View>
                  <Text style={styles.arrow}>→</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* All Items */}
            <Text style={styles.allItemsTitle}>All Menu Items</Text>
            {sortedItems.map((item) => {
              const info = GRADE_INFO[item.grade];
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.menuItem}
                  onPress={() => viewItem(item)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.itemGrade, { backgroundColor: info.color }]}>
                    <Text style={styles.itemGradeText}>{item.grade}</Text>
                  </View>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.itemMeta}>
                      {item.nutrition.calories} cal · {item.nutrition.protein}g protein
                    </Text>
                  </View>
                  <Text style={[styles.itemLabel, { color: info.color }]}>{item.gradeLabel}</Text>
                </TouchableOpacity>
              );
            })}

            <View style={styles.rescanSection}>
              <Button title="Scan Another Menu" onPress={() => {
                setMenuImage(null);
                setMenuItems([]);
              }} variant="outline" size="md" />
            </View>
          </>
        )}

        <Text style={styles.disclaimer}>
          Nutrition estimates are based on typical restaurant preparation. Actual values may vary.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { marginBottom: spacing.lg },
  backText: { fontSize: fontSize.md, color: colors.primary, fontWeight: '700', marginBottom: spacing.sm },
  title: { fontSize: fontSize.xxl, fontWeight: '900', color: colors.text },
  subtitle: { fontSize: fontSize.md, color: colors.textSecondary, marginTop: 4 },
  uploadSection: { gap: spacing.md },
  uploadCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg,
    alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  uploadEmoji: { fontSize: 48, marginBottom: spacing.sm },
  uploadTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text },
  uploadDesc: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginTop: spacing.xs, marginBottom: spacing.md },
  uploadActions: { flexDirection: 'row', gap: spacing.sm },
  tipCard: {
    backgroundColor: '#F0F9FF', borderRadius: borderRadius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: '#BAE6FD',
  },
  tipTitle: { fontSize: fontSize.md, fontWeight: '700', color: '#0C4A6E', marginBottom: spacing.xs },
  tipItem: { fontSize: fontSize.sm, color: '#0C4A6E', lineHeight: 22 },
  scanningCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.xxl,
    alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  scanningEmoji: { fontSize: 48, marginBottom: spacing.sm },
  scanningTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text },
  scanningSubtext: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 4 },
  menuPreview: { width: '100%', height: 120, borderRadius: borderRadius.md, marginBottom: spacing.md },
  restaurantName: { fontSize: fontSize.xl, fontWeight: '900', color: colors.text },
  itemCount: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.md },
  bestPickCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md,
    borderWidth: 2, marginBottom: spacing.lg,
  },
  bestPickLabel: { fontSize: fontSize.xs, fontWeight: '800', color: colors.gradeA, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm },
  bestPickContent: { flexDirection: 'row', alignItems: 'center' },
  bestPickInfo: { flex: 1, marginLeft: spacing.sm },
  bestPickName: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  bestPickCals: { fontSize: fontSize.sm, color: colors.textSecondary },
  arrow: { fontSize: fontSize.lg, color: colors.textLight },
  allItemsTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: borderRadius.md, padding: spacing.sm + 2, marginBottom: spacing.xs,
    borderWidth: 1, borderColor: colors.border,
  },
  itemGrade: {
    width: 36, height: 36, borderRadius: borderRadius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  itemGradeText: { color: colors.white, fontWeight: '900', fontSize: fontSize.sm },
  itemInfo: { flex: 1, marginLeft: spacing.sm },
  itemName: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  itemMeta: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  itemLabel: { fontSize: fontSize.xs, fontWeight: '700' },
  rescanSection: { marginTop: spacing.lg, alignItems: 'center' },
  disclaimer: { fontSize: fontSize.xs, color: colors.textLight, textAlign: 'center', marginTop: spacing.lg },
});
