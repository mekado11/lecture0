import type { BreakType, BreakRoutine, WellnessState, StretchExercise, WellnessInsight } from '../types';

// ─── Break Orchestrator ───

export function determineBreakType(state: WellnessState): BreakType | null {
  if (state.focusMode || state.activeBreak) return null;

  const now = Date.now();
  const minBreakInterval = 5 * 60 * 1000; // 5 minutes between breaks

  if (state.lastBreakTimestamp && now - state.lastBreakTimestamp < minBreakInterval) {
    return null;
  }

  const hoursSinceLastDrink = state.hydration.lastDrinkTimestamp
    ? (now - state.hydration.lastDrinkTimestamp) / (1000 * 60 * 60)
    : 999;

  const hoursSinceLastPostureChange = state.movement.lastPostureChangeTimestamp
    ? (now - state.movement.lastPostureChangeTimestamp) / (1000 * 60 * 60)
    : 999;

  const minutesSinceLastEyeBreak = state.eyes.lastBreakTimestamp
    ? (now - state.eyes.lastBreakTimestamp) / (1000 * 60)
    : 999;

  const hydrationUrgent = hoursSinceLastDrink > 2;
  const movementUrgent = hoursSinceLastPostureChange > 1.5;
  const eyesUrgent = minutesSinceLastEyeBreak > 90;

  // Combined break if multiple issues
  const urgentCount = [hydrationUrgent, movementUrgent, eyesUrgent].filter(Boolean).length;
  if (urgentCount >= 2) return 'full';

  if (hydrationUrgent) return 'hydration';
  if (movementUrgent) return 'movement';
  if (eyesUrgent) return 'visual';

  // Opportunistic break check
  if (hoursSinceLastDrink > 1 && hoursSinceLastPostureChange > 0.75) {
    return 'opportunistic';
  }

  return null;
}

export function createBreakRoutine(type: BreakType): BreakRoutine {
  switch (type) {
    case 'full':
      return {
        type,
        durationSeconds: 120,
        title: 'Time to Reset',
        subtitle: 'A complete wellness moment for body and eyes',
        screenDim: 0.7,
        steps: [
          { icon: '🧍', instruction: 'Stand up from your chair', completed: false },
          { icon: '💧', instruction: 'Walk to get water', completed: false },
          { icon: '👁️', instruction: 'Look out a window at something 20+ feet away', completed: false },
          { icon: '🦾', instruction: 'Roll your shoulders back 5 times', completed: false },
        ],
      };
    case 'hydration':
      return {
        type,
        durationSeconds: 30,
        title: 'Hydration Check',
        subtitle: 'Your body needs water to stay sharp',
        screenDim: 0.0,
        steps: [
          { icon: '💧', instruction: 'Take 3-4 full sips of water', completed: false },
          { icon: '🌊', instruction: 'Notice how your throat feels', completed: false },
        ],
      };
    case 'movement':
      return {
        type,
        durationSeconds: 45,
        title: 'Movement Break',
        subtitle: 'Time to shift your body',
        screenDim: 0.3,
        steps: [
          { icon: '🧍', instruction: 'Stand or shift position', completed: false },
          { icon: '🔄', instruction: 'Do 3 shoulder rolls', completed: false },
          { icon: '↔️', instruction: 'Gently tilt your head side to side', completed: false },
        ],
      };
    case 'visual':
      return {
        type,
        durationSeconds: 20,
        title: 'Eye Break',
        subtitle: 'Give your eyes a moment to relax',
        screenDim: 0.5,
        steps: [
          { icon: '👁️', instruction: 'Look away from screen', completed: false },
          { icon: '🏔️', instruction: 'Focus on a distant object', completed: false },
          { icon: '😌', instruction: 'Blink slowly 10 times', completed: false },
        ],
      };
    case 'opportunistic':
      return {
        type,
        durationSeconds: 60,
        title: 'Quick Reset',
        subtitle: 'Perfect time for a wellness moment',
        screenDim: 0.2,
        steps: [
          { icon: '✨', instruction: 'Stand, stretch, hydrate', completed: false },
          { icon: '🌬️', instruction: 'Take 3 deep breaths', completed: false },
        ],
      };
  }
}

// ─── Stretch Library ───

export const STRETCHES: StretchExercise[] = [
  {
    id: 'neck-release',
    name: 'Neck Release',
    description: 'Slowly tilt your head to one side, hold for 10 seconds, then switch. Keep shoulders relaxed.',
    durationSeconds: 25,
    icon: '🦒',
    category: 'neck',
  },
  {
    id: 'shoulder-squeeze',
    name: 'Shoulder Blade Squeeze',
    description: 'Squeeze your shoulder blades together, hold for 5 seconds, release. Repeat 5 times.',
    durationSeconds: 30,
    icon: '🦋',
    category: 'shoulders',
  },
  {
    id: 'wrist-flexor',
    name: 'Wrist Flexor Stretch',
    description: 'Extend one arm, palm up. Use other hand to gently pull fingers back. Hold 15 seconds each side.',
    durationSeconds: 35,
    icon: '🤚',
    category: 'wrists',
  },
  {
    id: 'seated-twist',
    name: 'Seated Spinal Twist',
    description: 'Sit tall, place right hand on left knee. Gently twist to the left. Hold 15 seconds each side.',
    durationSeconds: 35,
    icon: '🔄',
    category: 'back',
  },
  {
    id: 'standing-reach',
    name: 'Standing Overhead Reach',
    description: 'Stand up, interlace fingers above head, and stretch upward. Lean gently to each side.',
    durationSeconds: 20,
    icon: '🙆',
    category: 'back',
  },
  {
    id: 'calf-raises',
    name: 'Calf Raises',
    description: 'Stand behind your chair. Rise up on your toes, hold for 2 seconds, lower. Repeat 10 times.',
    durationSeconds: 25,
    icon: '🦵',
    category: 'legs',
  },
  {
    id: 'eye-palming',
    name: 'Eye Palming',
    description: 'Rub palms together until warm. Cup them over closed eyes for 20 seconds. Breathe deeply.',
    durationSeconds: 25,
    icon: '🙌',
    category: 'eyes',
  },
  {
    id: 'figure-eight',
    name: 'Wrist Figure Eights',
    description: 'Interlace fingers and rotate wrists in figure-eight motions. 10 in each direction.',
    durationSeconds: 20,
    icon: '♾️',
    category: 'wrists',
  },
];

// ─── Insights Generator ───

export function generateInsights(
  hydrationPercent: number,
  postureScore: number,
  eyeBreaks: number,
  totalScreenMinutes: number,
): WellnessInsight[] {
  const insights: WellnessInsight[] = [];

  if (hydrationPercent >= 80) {
    insights.push({
      icon: '🎯',
      title: 'Hydration on Track',
      description: `You're at ${Math.round(hydrationPercent)}% of your daily water goal. Keep it up!`,
      type: 'success',
    });
  } else if (hydrationPercent < 50) {
    insights.push({
      icon: '⚠️',
      title: 'Drink More Water',
      description: `You've only reached ${Math.round(hydrationPercent)}% of your goal. Try keeping water within arm's reach.`,
      type: 'warning',
    });
  }

  if (postureScore >= 75) {
    insights.push({
      icon: '📈',
      title: 'Great Posture Day',
      description: `Posture score of ${postureScore}! Your back thanks you.`,
      type: 'success',
    });
  } else if (postureScore < 50) {
    insights.push({
      icon: '💡',
      title: 'Posture Tip',
      description: 'Try alternating between sitting and standing every 30-45 minutes.',
      type: 'tip',
    });
  }

  if (totalScreenMinutes > 240 && eyeBreaks < 4) {
    insights.push({
      icon: '⚠️',
      title: 'More Eye Breaks Needed',
      description: `${Math.round(totalScreenMinutes / 60)} hours of screen time with only ${eyeBreaks} breaks. Aim for one every 20 minutes.`,
      type: 'warning',
    });
  } else if (eyeBreaks >= 6) {
    insights.push({
      icon: '👁️',
      title: 'Eyes Well Rested',
      description: `${eyeBreaks} eye breaks today. Your vision hygiene is excellent!`,
      type: 'success',
    });
  }

  if (insights.length === 0) {
    insights.push({
      icon: '💡',
      title: 'Getting Started',
      description: 'Log your first water intake or take a break to see personalized insights.',
      type: 'tip',
    });
  }

  return insights;
}

// ─── Utility Calculations ───

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function getTimeSince(timestamp: number | null): string {
  if (!timestamp) return 'Never';
  const minutes = (Date.now() - timestamp) / (1000 * 60);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${Math.round(minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${Math.round(minutes % 60)}m ago`;
}

export function getHydrationColor(percent: number): string {
  if (percent >= 80) return '#38BDF8';
  if (percent >= 50) return '#818CF8';
  if (percent >= 25) return '#F59E0B';
  return '#EF4444';
}

export function getPostureColor(score: number): string {
  if (score >= 75) return '#34D399';
  if (score >= 50) return '#F59E0B';
  return '#EF4444';
}
