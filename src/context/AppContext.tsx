import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserProfile, MealLog, UserGoal, FoodItem, DailySummary } from '../types';
import { getProfile, saveProfile, getMeals, saveMeal, deleteMeal, getDailySummary, getTodayKey } from '../utils/storage';

interface AppState {
  profile: UserProfile | null;
  meals: MealLog[];
  todaySummary: DailySummary;
  isLoading: boolean;
  updateProfile: (profile: UserProfile) => Promise<void>;
  addMeal: (foodItem: FoodItem, mealType: MealLog['mealType']) => Promise<void>;
  removeMeal: (id: string) => Promise<void>;
  refreshData: () => Promise<void>;
}

const defaultSummary: DailySummary = {
  date: getTodayKey(),
  meals: [],
  totalCalories: 0,
  totalProtein: 0,
  totalCarbs: 0,
  totalFat: 0,
  gradeBreakdown: { A: 0, B: 0, C: 0, D: 0, F: 0 },
};

const AppContext = createContext<AppState>({
  profile: null,
  meals: [],
  todaySummary: defaultSummary,
  isLoading: true,
  updateProfile: async () => {},
  addMeal: async () => {},
  removeMeal: async () => {},
  refreshData: async () => {},
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [todaySummary, setTodaySummary] = useState<DailySummary>(defaultSummary);
  const [isLoading, setIsLoading] = useState(true);

  const refreshData = useCallback(async () => {
    const [p, m] = await Promise.all([getProfile(), getMeals()]);
    setProfile(p);
    setMeals(m);
    setTodaySummary(getDailySummary(m, getTodayKey()));
  }, []);

  useEffect(() => {
    refreshData().finally(() => setIsLoading(false));
  }, [refreshData]);

  const updateProfile = async (p: UserProfile) => {
    await saveProfile(p);
    setProfile(p);
  };

  const addMeal = async (foodItem: FoodItem, mealType: MealLog['mealType']) => {
    const meal: MealLog = {
      id: `meal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      foodItem,
      timestamp: Date.now(),
      mealType,
    };
    await saveMeal(meal);
    await refreshData();
  };

  const removeMeal = async (id: string) => {
    await deleteMeal(id);
    await refreshData();
  };

  return (
    <AppContext.Provider
      value={{ profile, meals, todaySummary, isLoading, updateProfile, addMeal, removeMeal, refreshData }}
    >
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
