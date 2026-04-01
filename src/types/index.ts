// ─── Wellness Module Types ───

export type WellnessModule = 'hydration' | 'movement' | 'eyes';

export type NotificationStyle = 'gentle' | 'balanced' | 'strict';

export type BreakType = 'full' | 'hydration' | 'movement' | 'visual' | 'opportunistic';

export type BeverageType = 'water' | 'coffee' | 'tea' | 'juice' | 'other';

export type PostureType = 'sitting' | 'standing';

export type DeskType = 'fixed' | 'standing';

export type EyewearType = 'glasses' | 'contacts' | 'neither';

export type OnboardingStep = 'welcome' | 'modules' | 'schedule' | 'desk' | 'notification' | 'complete';

// ─── User Profile ───

export interface UserProfile {
  name: string;
  workHoursStart: string; // "09:00"
  workHoursEnd: string; // "18:00"
  notificationStyle: NotificationStyle;
  deskType: DeskType;
  eyewear: EyewearType;
  enabledModules: WellnessModule[];
  dailyWaterGoal: number; // in glasses (250ml each)
  maxSittingMinutes: number;
  eyeBreakIntervalMinutes: number;
  onboardingComplete: boolean;
}

// ─── Hydration ───

export interface HydrationEvent {
  id: string;
  timestamp: number;
  amountMl: number;
  beverageType: BeverageType;
}

export interface HydrationState {
  events: HydrationEvent[];
  dailyTotalMl: number;
  dailyGoalMl: number;
  lastDrinkTimestamp: number | null;
  streakDays: number;
}

// ─── Movement / Posture ───

export interface PostureEvent {
  id: string;
  timestamp: number;
  postureType: PostureType;
  durationMinutes: number;
}

export interface MovementState {
  currentPosture: PostureType;
  postureStartTime: number;
  events: PostureEvent[];
  totalSittingMinutes: number;
  totalStandingMinutes: number;
  lastPostureChangeTimestamp: number | null;
  postureScore: number; // 0-100
}

// ─── Eye Care ───

export interface EyeBreakEvent {
  id: string;
  timestamp: number;
  durationSeconds: number;
  completed: boolean;
}

export interface EyeState {
  events: EyeBreakEvent[];
  lastBreakTimestamp: number | null;
  totalScreenMinutes: number;
  breaksTaken: number;
  screenSessionStart: number;
}

// ─── Break System ───

export interface BreakStep {
  icon: string;
  instruction: string;
  completed: boolean;
}

export interface BreakRoutine {
  type: BreakType;
  durationSeconds: number;
  steps: BreakStep[];
  screenDim: number; // 0-1 opacity
  title: string;
  subtitle: string;
}

// ─── Daily Summary ───

export interface DailySummary {
  date: string; // YYYY-MM-DD
  totalWaterMl: number;
  totalBreaks: number;
  avgPostureScore: number;
  totalScreenMinutes: number;
  sittingMinutes: number;
  standingMinutes: number;
  eyeBreaks: number;
  streakDays: number;
}

// ─── Insights ───

export interface WellnessInsight {
  icon: string;
  title: string;
  description: string;
  type: 'success' | 'warning' | 'tip';
}

// ─── Combined Wellness State ───

export interface WellnessState {
  hydration: HydrationState;
  movement: MovementState;
  eyes: EyeState;
  lastBreakTimestamp: number | null;
  focusMode: boolean;
  activeBreak: BreakRoutine | null;
}

// ─── Stretch / Exercise ───

export interface StretchExercise {
  id: string;
  name: string;
  description: string;
  durationSeconds: number;
  icon: string;
  category: 'neck' | 'shoulders' | 'wrists' | 'back' | 'legs' | 'eyes';
}
