import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Alert, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { analyzeFoodPhoto } from '../src/data/mockFoods';
import { Button } from '../src/components/Button';
import { colors, fontSize, spacing, borderRadius } from '../src/utils/theme';

export default function CameraScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [photo, setPhoto] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const takePhoto = async () => {
    if (!cameraRef.current) return;
    try {
      const result = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      if (result?.uri) {
        setPhoto(result.uri);
      }
    } catch {
      Alert.alert('Error', 'Failed to take photo. Try using the gallery instead.');
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setPhoto(result.assets[0].uri);
    }
  };

  const analyzePhoto = () => {
    if (!photo) return;
    setAnalyzing(true);

    // Simulate analysis delay
    setTimeout(() => {
      const foodItem = analyzeFoodPhoto(photo);
      foodItem.imageUri = photo;
      setAnalyzing(false);
      router.replace({ pathname: '/results', params: { food: JSON.stringify(foodItem) } });
    }, 1500);
  };

  if (!permission) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.permText}>Loading camera...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.permEmoji}>📸</Text>
          <Text style={styles.permTitle}>Camera Access Needed</Text>
          <Text style={styles.permText}>
            We need your camera to analyze meals. Your photos are processed locally.
          </Text>
          <Button title="Grant Camera Access" onPress={requestPermission} size="lg" style={{ marginTop: spacing.md }} />
          <Button title="Use Gallery Instead" onPress={pickImage} variant="outline" size="md" style={{ marginTop: spacing.sm }} />
          <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.fullScreen}>
      {photo ? (
        // Preview
        <View style={styles.fullScreen}>
          <Image source={{ uri: photo }} style={styles.preview} />
          <SafeAreaView style={styles.previewOverlay}>
            <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>

            <View style={styles.previewActions}>
              {analyzing ? (
                <View style={styles.analyzingContainer}>
                  <Text style={styles.analyzingText}>Analyzing your meal...</Text>
                  <Text style={styles.analyzingSubtext}>Estimating nutrition</Text>
                </View>
              ) : (
                <>
                  <Button title="Retake" onPress={() => setPhoto(null)} variant="secondary" size="md" />
                  <Button title="Analyze This Meal" onPress={analyzePhoto} size="lg" style={{ flex: 1 }} />
                </>
              )}
            </View>
          </SafeAreaView>
        </View>
      ) : (
        // Camera
        <View style={styles.fullScreen}>
          <CameraView ref={cameraRef} style={styles.camera} facing="back">
            <SafeAreaView style={styles.cameraOverlay}>
              <View style={styles.topBar}>
                <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.guide}>
                <View style={styles.guideBox}>
                  <Text style={styles.guideText}>Center your meal in frame</Text>
                </View>
              </View>

              <View style={styles.bottomBar}>
                <TouchableOpacity onPress={pickImage} style={styles.galleryBtn}>
                  <Text style={styles.galleryBtnText}>🖼️</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={takePhoto} style={styles.shutterBtn}>
                  <View style={styles.shutterInner} />
                </TouchableOpacity>
                <View style={{ width: 48 }} />
              </View>
            </SafeAreaView>
          </CameraView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  fullScreen: { flex: 1, backgroundColor: colors.black },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  camera: { flex: 1 },
  cameraOverlay: { flex: 1, justifyContent: 'space-between' },
  topBar: { flexDirection: 'row', padding: spacing.md },
  closeBtn: {
    width: 40, height: 40, borderRadius: borderRadius.full,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { color: colors.white, fontSize: fontSize.lg, fontWeight: '700' },
  guide: { alignItems: 'center' },
  guideBox: {
    width: 280, height: 280, borderRadius: borderRadius.lg,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  guideText: { color: 'rgba(255,255,255,0.7)', fontSize: fontSize.sm, fontWeight: '600' },
  bottomBar: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    paddingHorizontal: spacing.xl, paddingBottom: spacing.xl,
  },
  galleryBtn: {
    width: 48, height: 48, borderRadius: borderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  galleryBtnText: { fontSize: 24 },
  shutterBtn: {
    width: 72, height: 72, borderRadius: borderRadius.full,
    borderWidth: 4, borderColor: colors.white, alignItems: 'center', justifyContent: 'center',
  },
  shutterInner: {
    width: 58, height: 58, borderRadius: borderRadius.full, backgroundColor: colors.white,
  },
  preview: { flex: 1, resizeMode: 'cover' },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject, justifyContent: 'space-between',
  },
  previewActions: {
    flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.xl,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  analyzingContainer: { flex: 1, alignItems: 'center', padding: spacing.md },
  analyzingText: { color: colors.white, fontSize: fontSize.lg, fontWeight: '800' },
  analyzingSubtext: { color: 'rgba(255,255,255,0.7)', fontSize: fontSize.sm, marginTop: 4 },
  permEmoji: { fontSize: 48, marginBottom: spacing.md },
  permTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  permText: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  backLink: { marginTop: spacing.lg },
  backText: { color: colors.textSecondary, fontSize: fontSize.md },
});
