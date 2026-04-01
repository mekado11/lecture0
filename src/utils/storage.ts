import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserProfile, HydrationEvent, PostureEvent, EyeBreakEvent, DailySummary } from '../types';

const KEYS = {
  PROFILE: '@vital_profile',
  HYDRATION_EVENTS: '@vital_hydration',
  POSTURE_EVENTS: '@vital_posture',
  EYE_EVENTS: '@vital_eyes',
  DAILY_SUMMARY: '@vital_daily',
  STREAK: '@vital_streak',
};

// ─── Profile ───

export async function saveProfile(profile: UserProfile): Promise<void> {
  await AsyncStorage.setItem(KEYS.PROFILE, JSON.stringify(profile));
}

export async function loadProfile(): Promise<UserProfile | null> {
  const data = await AsyncStorage.getItem(KEYS.PROFILE);
  return data ? JSON.parse(data) : null;
}

// ─── Hydration ───

export async function saveHydrationEvents(events: HydrationEvent[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.HYDRATION_EVENTS, JSON.stringify(events));
}

export async function loadHydrationEvents(): Promise<HydrationEvent[]> {
  const data = await AsyncStorage.getItem(KEYS.HYDRATION_EVENTS);
  return data ? JSON.parse(data) : [];
}

// ─── Posture ───

export async function savePostureEvents(events: PostureEvent[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.POSTURE_EVENTS, JSON.stringify(events));
}

export async function loadPostureEvents(): Promise<PostureEvent[]> {
  const data = await AsyncStorage.getItem(KEYS.POSTURE_EVENTS);
  return data ? JSON.parse(data) : [];
}

// ─── Eye Breaks ───

export async function saveEyeBreakEvents(events: EyeBreakEvent[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.EYE_EVENTS, JSON.stringify(events));
}

export async function loadEyeBreakEvents(): Promise<EyeBreakEvent[]> {
  const data = await AsyncStorage.getItem(KEYS.EYE_EVENTS);
  return data ? JSON.parse(data) : [];
}

// ─── Daily Summary ───

export async function saveDailySummary(summary: DailySummary): Promise<void> {
  const key = `${KEYS.DAILY_SUMMARY}_${summary.date}`;
  await AsyncStorage.setItem(key, JSON.stringify(summary));
}

export async function loadDailySummary(date: string): Promise<DailySummary | null> {
  const key = `${KEYS.DAILY_SUMMARY}_${date}`;
  const data = await AsyncStorage.getItem(key);
  return data ? JSON.parse(data) : null;
}

// ─── Utilities ───

export function getTodayKey(): string {
  return new Date().toISOString().split('T')[0];
}

export function filterTodayEvents<T extends { timestamp: number }>(events: T[]): T[] {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return events.filter((e) => e.timestamp >= todayStart.getTime());
}
