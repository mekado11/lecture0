import AsyncStorage from '@react-native-async-storage/async-storage';
import { MealLog, UserProfile, DailySummary } from '../types';

const KEYS = {
  PROFILE: 'rj_profile',
  MEALS: 'rj_meals',
};

// Profile
export async function getProfile(): Promise<UserProfile | null> {
  const data = await AsyncStorage.getItem(KEYS.PROFILE);
  return data ? JSON.parse(data) : null;
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  await AsyncStorage.setItem(KEYS.PROFILE, JSON.stringify(profile));
}

// Meals
export async function getMeals(): Promise<MealLog[]> {
  const data = await AsyncStorage.getItem(KEYS.MEALS);
  return data ? JSON.parse(data) : [];
}

export async function saveMeal(meal: MealLog): Promise<void> {
  const meals = await getMeals();
  meals.push(meal);
  await AsyncStorage.setItem(KEYS.MEALS, JSON.stringify(meals));
}

export async function deleteMeal(id: string): Promise<void> {
  const meals = await getMeals();
  const filtered = meals.filter((m) => m.id !== id);
  await AsyncStorage.setItem(KEYS.MEALS, JSON.stringify(filtered));
}

export function getTodayKey(): string {
  return new Date().toISOString().split('T')[0];
}

export function getDailySummary(meals: MealLog[], date: string): DailySummary {
  const dayStart = new Date(date).getTime();
  const dayEnd = dayStart + 86400000;

  const dayMeals = meals.filter(
    (m) => m.timestamp >= dayStart && m.timestamp < dayEnd
  );

  const totalCalories = dayMeals.reduce((s, m) => s + m.foodItem.nutrition.calories, 0);
  const totalProtein = dayMeals.reduce((s, m) => s + m.foodItem.nutrition.protein, 0);
  const totalCarbs = dayMeals.reduce((s, m) => s + m.foodItem.nutrition.carbs, 0);
  const totalFat = dayMeals.reduce((s, m) => s + m.foodItem.nutrition.fat, 0);

  const gradeBreakdown = { A: 0, B: 0, C: 0, D: 0, F: 0 } as Record<string, number>;
  dayMeals.forEach((m) => {
    gradeBreakdown[m.foodItem.grade] = (gradeBreakdown[m.foodItem.grade] || 0) + 1;
  });

  return {
    date,
    meals: dayMeals,
    totalCalories,
    totalProtein,
    totalCarbs,
    totalFat,
    gradeBreakdown: gradeBreakdown as DailySummary['gradeBreakdown'],
  };
}
