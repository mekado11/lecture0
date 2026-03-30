export type NutritionGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export type GradeLabel = 'Smart Choice' | 'Pretty Solid' | 'Watch It' | 'Junky' | 'Straight Trash';

export interface MacroBreakdown {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  saturatedFat: number;
}

export interface NutritionEstimate extends MacroBreakdown {
  confidenceLevel: 'low' | 'medium' | 'high';
  calorieRange: { min: number; max: number };
}

export interface FoodItem {
  id: string;
  name: string;
  description?: string;
  nutrition: NutritionEstimate;
  grade: NutritionGrade;
  gradeLabel: GradeLabel;
  verdict: string;
  explanation: string;
  alternatives: Alternative[];
  imageUri?: string;
}

export interface Alternative {
  name: string;
  description: string;
  estimatedCalories: number;
  grade: NutritionGrade;
  swapType: 'cooking-method' | 'side-swap' | 'drink-swap' | 'portion' | 'menu-pick';
}

export interface MenuItem {
  id: string;
  name: string;
  price?: string;
  description?: string;
}

export interface MealLog {
  id: string;
  foodItem: FoodItem;
  timestamp: number;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
}

export interface DailySummary {
  date: string;
  meals: MealLog[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  gradeBreakdown: Record<NutritionGrade, number>;
}

export type UserGoal =
  | 'lose-weight'
  | 'maintain-weight'
  | 'build-muscle'
  | 'reduce-sugar'
  | 'reduce-sodium'
  | 'eat-cleaner';

export interface UserProfile {
  name: string;
  goals: UserGoal[];
  onboardingComplete: boolean;
  dailyCalorieTarget?: number;
}

export const GOAL_LABELS: Record<UserGoal, string> = {
  'lose-weight': 'Lose Weight',
  'maintain-weight': 'Maintain Weight',
  'build-muscle': 'Build Muscle',
  'reduce-sugar': 'Reduce Sugar',
  'reduce-sodium': 'Reduce Sodium',
  'eat-cleaner': 'Eat Cleaner',
};

export const GRADE_INFO: Record<NutritionGrade, { label: GradeLabel; color: string; emoji: string }> = {
  A: { label: 'Smart Choice', color: '#22C55E', emoji: '💚' },
  B: { label: 'Pretty Solid', color: '#84CC16', emoji: '👍' },
  C: { label: 'Watch It', color: '#EAB308', emoji: '⚠️' },
  D: { label: 'Junky', color: '#F97316', emoji: '🍔' },
  F: { label: 'Straight Trash', color: '#EF4444', emoji: '🗑️' },
};
