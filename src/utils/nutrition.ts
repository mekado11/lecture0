import { NutritionEstimate, NutritionGrade, GradeLabel, UserGoal } from '../types';

interface GradeResult {
  grade: NutritionGrade;
  label: GradeLabel;
  score: number;
}

export function gradeNutrition(
  nutrition: NutritionEstimate,
  goals: UserGoal[] = []
): GradeResult {
  let score = 50; // Start neutral

  // Calorie density (assuming single meal)
  if (nutrition.calories < 400) score += 15;
  else if (nutrition.calories < 600) score += 8;
  else if (nutrition.calories < 800) score -= 5;
  else if (nutrition.calories < 1200) score -= 15;
  else score -= 25;

  // Protein (higher is generally better)
  if (nutrition.protein > 30) score += 10;
  else if (nutrition.protein > 20) score += 5;
  else if (nutrition.protein < 10) score -= 5;

  // Fiber
  if (nutrition.fiber > 8) score += 10;
  else if (nutrition.fiber > 4) score += 5;
  else if (nutrition.fiber < 2) score -= 5;

  // Sugar penalty
  if (nutrition.sugar > 40) score -= 20;
  else if (nutrition.sugar > 25) score -= 12;
  else if (nutrition.sugar > 15) score -= 5;
  else if (nutrition.sugar < 5) score += 5;

  // Sodium penalty (mg)
  if (nutrition.sodium > 2000) score -= 20;
  else if (nutrition.sodium > 1500) score -= 12;
  else if (nutrition.sodium > 1000) score -= 5;
  else if (nutrition.sodium < 400) score += 5;

  // Saturated fat penalty
  if (nutrition.saturatedFat > 15) score -= 15;
  else if (nutrition.saturatedFat > 10) score -= 8;
  else if (nutrition.saturatedFat > 6) score -= 3;
  else if (nutrition.saturatedFat < 3) score += 5;

  // Goal-specific adjustments
  for (const goal of goals) {
    switch (goal) {
      case 'lose-weight':
        if (nutrition.calories > 600) score -= 8;
        if (nutrition.calories < 400) score += 5;
        break;
      case 'build-muscle':
        if (nutrition.protein > 30) score += 8;
        if (nutrition.protein < 15) score -= 8;
        break;
      case 'reduce-sugar':
        if (nutrition.sugar > 15) score -= 10;
        if (nutrition.sugar < 5) score += 8;
        break;
      case 'reduce-sodium':
        if (nutrition.sodium > 800) score -= 10;
        if (nutrition.sodium < 400) score += 8;
        break;
      case 'eat-cleaner':
        if (nutrition.fiber > 6) score += 5;
        if (nutrition.saturatedFat > 8) score -= 8;
        if (nutrition.sugar > 20) score -= 8;
        break;
    }
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  // Map score to grade
  let grade: NutritionGrade;
  let label: GradeLabel;

  if (score >= 75) {
    grade = 'A';
    label = 'Smart Choice';
  } else if (score >= 60) {
    grade = 'B';
    label = 'Pretty Solid';
  } else if (score >= 45) {
    grade = 'C';
    label = 'Watch It';
  } else if (score >= 30) {
    grade = 'D';
    label = 'Junky';
  } else {
    grade = 'F';
    label = 'Straight Trash';
  }

  return { grade, label, score };
}

const VERDICTS: Record<NutritionGrade, string[]> = {
  A: [
    "This is actually a smart pick.",
    "Look at you making good choices.",
    "Your body thanks you for this one.",
    "Nailed it. This is solid fuel.",
  ],
  B: [
    "Not bad at all. You're doing alright.",
    "Pretty solid choice. Keep it up.",
    "This works. No guilt needed here.",
    "Respectable. You clearly thought about this.",
  ],
  C: [
    "Not terrible, but don't make this a habit.",
    "It's… fine. Could be better, could be worse.",
    "You're walking a thin line here.",
    "Proceed with mild caution.",
  ],
  D: [
    "You're flirting with chaos.",
    "Your arteries just flinched.",
    "This is a choice. A bold one.",
    "We're not judging… but also, maybe reconsider.",
  ],
  F: [
    "This is straight-up nutritional anarchy.",
    "Your body filed a formal complaint.",
    "This meal has zero chill.",
    "Legend has it, a dietitian just felt a disturbance.",
  ],
};

export function getVerdict(grade: NutritionGrade): string {
  const options = VERDICTS[grade];
  return options[Math.floor(Math.random() * options.length)];
}

export function getExplanation(
  nutrition: NutritionEstimate,
  grade: NutritionGrade,
  goals: UserGoal[] = []
): string {
  const parts: string[] = [];

  if (nutrition.calories > 800) {
    parts.push(`At ${nutrition.calories} calories, this is a heavy meal`);
  } else if (nutrition.calories < 350) {
    parts.push(`Only ${nutrition.calories} calories — pretty light`);
  }

  if (nutrition.sugar > 30) {
    parts.push(`${nutrition.sugar}g of sugar is a lot — that's like ${Math.round(nutrition.sugar / 4)} teaspoons`);
  }

  if (nutrition.sodium > 1500) {
    parts.push(`${nutrition.sodium}mg sodium is way above what one meal should have`);
  }

  if (nutrition.saturatedFat > 12) {
    parts.push(`high in saturated fat at ${nutrition.saturatedFat}g`);
  }

  if (nutrition.protein > 30) {
    parts.push(`good protein at ${nutrition.protein}g`);
  }

  if (nutrition.fiber > 6) {
    parts.push(`solid fiber content at ${nutrition.fiber}g`);
  }

  // Goal-specific notes
  for (const goal of goals) {
    if (goal === 'lose-weight' && nutrition.calories > 600) {
      parts.push("over your ideal calorie range for weight loss");
    }
    if (goal === 'build-muscle' && nutrition.protein < 20) {
      parts.push("could use more protein for your muscle goals");
    }
    if (goal === 'reduce-sugar' && nutrition.sugar > 10) {
      parts.push("higher sugar than ideal for your goals");
    }
  }

  if (parts.length === 0) {
    if (grade === 'A' || grade === 'B') {
      return "Balanced macros with nothing too extreme. A reasonable choice.";
    }
    return "A mix of good and not-so-good. Moderation is key.";
  }

  // Capitalize first part
  parts[0] = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  return parts.join('. ') + '.';
}

export function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return Math.round(n).toString();
}
