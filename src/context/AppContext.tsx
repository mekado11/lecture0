import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type {
  UserProfile,
  WellnessState,
  HydrationEvent,
  PostureEvent,
  EyeBreakEvent,
  BeverageType,
  PostureType,
  BreakRoutine,
  BreakType,
} from '../types';
import {
  saveProfile,
  loadProfile,
  saveHydrationEvents,
  loadHydrationEvents,
  savePostureEvents,
  loadPostureEvents,
  saveEyeBreakEvents,
  loadEyeBreakEvents,
  filterTodayEvents,
} from '../utils/storage';
import { determineBreakType, createBreakRoutine } from '../utils/wellness';

// ─── Default Profile ───

export const DEFAULT_PROFILE: UserProfile = {
  name: '',
  workHoursStart: '09:00',
  workHoursEnd: '18:00',
  notificationStyle: 'balanced',
  deskType: 'fixed',
  eyewear: 'neither',
  enabledModules: ['hydration', 'movement', 'eyes'],
  dailyWaterGoal: 8,
  maxSittingMinutes: 45,
  eyeBreakIntervalMinutes: 20,
  onboardingComplete: false,
};

// ─── Context Interface ───

interface AppContextType {
  profile: UserProfile | null;
  wellness: WellnessState;
  isLoading: boolean;
  pendingBreak: BreakRoutine | null;

  // Profile
  updateProfile: (profile: UserProfile) => Promise<void>;

  // Hydration
  logWater: (amount?: number, beverage?: BeverageType) => Promise<void>;

  // Movement
  togglePosture: () => Promise<void>;
  setPosture: (posture: PostureType) => Promise<void>;

  // Eyes
  logEyeBreak: (durationSeconds?: number) => Promise<void>;

  // Breaks
  checkForBreak: () => void;
  dismissBreak: () => void;
  completeBreak: () => void;

  // Focus
  toggleFocusMode: () => void;

  // Data
  refreshData: () => Promise<void>;
}

const defaultWellness: WellnessState = {
  hydration: {
    events: [],
    dailyTotalMl: 0,
    dailyGoalMl: 2000,
    lastDrinkTimestamp: null,
    streakDays: 0,
  },
  movement: {
    currentPosture: 'sitting',
    postureStartTime: Date.now(),
    events: [],
    totalSittingMinutes: 0,
    totalStandingMinutes: 0,
    lastPostureChangeTimestamp: null,
    postureScore: 50,
  },
  eyes: {
    events: [],
    lastBreakTimestamp: null,
    totalScreenMinutes: 0,
    breaksTaken: 0,
    screenSessionStart: Date.now(),
  },
  lastBreakTimestamp: null,
  focusMode: false,
  activeBreak: null,
};

const AppContext = createContext<AppContextType>({
  profile: null,
  wellness: defaultWellness,
  isLoading: true,
  pendingBreak: null,
  updateProfile: async () => {},
  logWater: async () => {},
  togglePosture: async () => {},
  setPosture: async () => {},
  logEyeBreak: async () => {},
  checkForBreak: () => {},
  dismissBreak: () => {},
  completeBreak: () => {},
  toggleFocusMode: () => {},
  refreshData: async () => {},
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [wellness, setWellness] = useState<WellnessState>(defaultWellness);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingBreak, setPendingBreak] = useState<BreakRoutine | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Load Data ───

  const refreshData = useCallback(async () => {
    const [p, hydrationEvents, postureEvents, eyeEvents] = await Promise.all([
      loadProfile(),
      loadHydrationEvents(),
      loadPostureEvents(),
      loadEyeBreakEvents(),
    ]);

    if (p) setProfile(p);

    const todayHydration = filterTodayEvents(hydrationEvents);
    const todayPosture = filterTodayEvents(postureEvents);
    const todayEyes = filterTodayEvents(eyeEvents);

    const dailyTotalMl = todayHydration.reduce((sum, e) => sum + e.amountMl, 0);
    const totalSittingMinutes = todayPosture
      .filter((e) => e.postureType === 'sitting')
      .reduce((sum, e) => sum + e.durationMinutes, 0);
    const totalStandingMinutes = todayPosture
      .filter((e) => e.postureType === 'standing')
      .reduce((sum, e) => sum + e.durationMinutes, 0);

    const totalMinutes = totalSittingMinutes + totalStandingMinutes;
    const postureScore = totalMinutes > 0
      ? Math.min(100, Math.round((totalStandingMinutes / totalMinutes) * 100 + 50 * (todayPosture.length > 3 ? 1 : todayPosture.length / 3)))
      : 50;

    setWellness((prev) => ({
      ...prev,
      hydration: {
        events: todayHydration,
        dailyTotalMl: dailyTotalMl,
        dailyGoalMl: (p?.dailyWaterGoal ?? 8) * 250,
        lastDrinkTimestamp: todayHydration.length > 0
          ? todayHydration[todayHydration.length - 1].timestamp
          : null,
        streakDays: prev.hydration.streakDays,
      },
      movement: {
        ...prev.movement,
        events: todayPosture,
        totalSittingMinutes,
        totalStandingMinutes,
        postureScore,
        lastPostureChangeTimestamp: todayPosture.length > 0
          ? todayPosture[todayPosture.length - 1].timestamp
          : null,
      },
      eyes: {
        events: todayEyes,
        lastBreakTimestamp: todayEyes.length > 0
          ? todayEyes[todayEyes.length - 1].timestamp
          : null,
        totalScreenMinutes: (Date.now() - (prev.eyes.screenSessionStart || Date.now())) / (1000 * 60),
        breaksTaken: todayEyes.length,
        screenSessionStart: prev.eyes.screenSessionStart,
      },
    }));
  }, []);

  useEffect(() => {
    refreshData().finally(() => setIsLoading(false));
  }, [refreshData]);

  // ─── Periodic Break Check ───

  useEffect(() => {
    timerRef.current = setInterval(() => {
      if (!wellness.focusMode && !wellness.activeBreak && !pendingBreak) {
        const breakType = determineBreakType(wellness);
        if (breakType) {
          setPendingBreak(createBreakRoutine(breakType));
        }
      }
    }, 60 * 1000); // Check every minute

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [wellness, pendingBreak]);

  // ─── Profile ───

  const updateProfileHandler = async (p: UserProfile) => {
    await saveProfile(p);
    setProfile(p);
  };

  // ─── Hydration ───

  const logWater = async (amount = 250, beverage: BeverageType = 'water') => {
    const event: HydrationEvent = {
      id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      amountMl: amount,
      beverageType: beverage,
    };

    const allEvents = await loadHydrationEvents();
    allEvents.push(event);
    await saveHydrationEvents(allEvents);

    setWellness((prev) => ({
      ...prev,
      hydration: {
        ...prev.hydration,
        events: [...prev.hydration.events, event],
        dailyTotalMl: prev.hydration.dailyTotalMl + amount,
        lastDrinkTimestamp: event.timestamp,
      },
    }));
  };

  // ─── Movement ───

  const togglePosture = async () => {
    const newPosture: PostureType = wellness.movement.currentPosture === 'sitting' ? 'standing' : 'sitting';
    await setPostureHandler(newPosture);
  };

  const setPostureHandler = async (posture: PostureType) => {
    const now = Date.now();
    const elapsed = (now - wellness.movement.postureStartTime) / (1000 * 60);

    const event: PostureEvent = {
      id: `p_${now}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: now,
      postureType: wellness.movement.currentPosture,
      durationMinutes: Math.round(elapsed),
    };

    const allEvents = await loadPostureEvents();
    allEvents.push(event);
    await savePostureEvents(allEvents);

    setWellness((prev) => ({
      ...prev,
      movement: {
        ...prev.movement,
        currentPosture: posture,
        postureStartTime: now,
        events: [...prev.movement.events, event],
        totalSittingMinutes: prev.movement.totalSittingMinutes + (prev.movement.currentPosture === 'sitting' ? Math.round(elapsed) : 0),
        totalStandingMinutes: prev.movement.totalStandingMinutes + (prev.movement.currentPosture === 'standing' ? Math.round(elapsed) : 0),
        lastPostureChangeTimestamp: now,
      },
    }));
  };

  // ─── Eyes ───

  const logEyeBreak = async (durationSeconds = 20) => {
    const event: EyeBreakEvent = {
      id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      durationSeconds,
      completed: true,
    };

    const allEvents = await loadEyeBreakEvents();
    allEvents.push(event);
    await saveEyeBreakEvents(allEvents);

    setWellness((prev) => ({
      ...prev,
      eyes: {
        ...prev.eyes,
        events: [...prev.eyes.events, event],
        lastBreakTimestamp: event.timestamp,
        breaksTaken: prev.eyes.breaksTaken + 1,
      },
    }));
  };

  // ─── Break Management ───

  const checkForBreak = () => {
    const breakType = determineBreakType(wellness);
    if (breakType) {
      setPendingBreak(createBreakRoutine(breakType));
    }
  };

  const dismissBreak = () => {
    setPendingBreak(null);
  };

  const completeBreak = () => {
    setWellness((prev) => ({
      ...prev,
      lastBreakTimestamp: Date.now(),
    }));
    setPendingBreak(null);
  };

  // ─── Focus Mode ───

  const toggleFocusMode = () => {
    setWellness((prev) => ({
      ...prev,
      focusMode: !prev.focusMode,
    }));
    if (!wellness.focusMode) {
      setPendingBreak(null);
    }
  };

  return (
    <AppContext.Provider
      value={{
        profile,
        wellness,
        isLoading,
        pendingBreak,
        updateProfile: updateProfileHandler,
        logWater,
        togglePosture,
        setPosture: setPostureHandler,
        logEyeBreak,
        checkForBreak,
        dismissBreak,
        completeBreak,
        toggleFocusMode,
        refreshData,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
