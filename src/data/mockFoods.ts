import { FoodItem, NutritionEstimate, Alternative } from '../types';
import { gradeNutrition, getVerdict, getExplanation } from '../utils/nutrition';

interface FoodTemplate {
  name: string;
  nutrition: NutritionEstimate;
  alternatives: Alternative[];
}

const FOOD_DATABASE: FoodTemplate[] = [
  {
    name: 'Double Cheeseburger with Fries',
    nutrition: {
      calories: 1150, protein: 42, carbs: 95, fat: 62, fiber: 4, sugar: 14, sodium: 1850, saturatedFat: 24,
      confidenceLevel: 'medium', calorieRange: { min: 950, max: 1350 },
    },
    alternatives: [
      { name: 'Single burger, no fries', description: 'Skip the double and ditch the fries', estimatedCalories: 480, grade: 'B', swapType: 'portion' },
      { name: 'Grilled chicken sandwich', description: 'Grilled over fried, way less fat', estimatedCalories: 420, grade: 'B', swapType: 'cooking-method' },
      { name: 'Side salad instead of fries', description: 'Swap the fries for greens', estimatedCalories: 750, grade: 'C', swapType: 'side-swap' },
      { name: 'Water instead of soda', description: 'Cut 200+ empty calories', estimatedCalories: 0, grade: 'A', swapType: 'drink-swap' },
    ],
  },
  {
    name: 'Grilled Chicken Salad',
    nutrition: {
      calories: 380, protein: 35, carbs: 18, fat: 16, fiber: 6, sugar: 5, sodium: 680, saturatedFat: 3,
      confidenceLevel: 'high', calorieRange: { min: 320, max: 440 },
    },
    alternatives: [
      { name: 'Ask for dressing on the side', description: 'Control how much goes on', estimatedCalories: 320, grade: 'A', swapType: 'portion' },
    ],
  },
  {
    name: 'Pepperoni Pizza (3 slices)',
    nutrition: {
      calories: 870, protein: 36, carbs: 90, fat: 40, fiber: 5, sugar: 9, sodium: 2100, saturatedFat: 16,
      confidenceLevel: 'medium', calorieRange: { min: 750, max: 990 },
    },
    alternatives: [
      { name: '2 slices instead of 3', description: 'Portion control is underrated', estimatedCalories: 580, grade: 'C', swapType: 'portion' },
      { name: 'Veggie pizza', description: 'More fiber, less saturated fat', estimatedCalories: 720, grade: 'C', swapType: 'menu-pick' },
      { name: 'Side salad with 1 slice', description: 'Fill up on greens first', estimatedCalories: 420, grade: 'B', swapType: 'side-swap' },
    ],
  },
  {
    name: 'Pad Thai with Shrimp',
    nutrition: {
      calories: 620, protein: 22, carbs: 78, fat: 24, fiber: 3, sugar: 18, sodium: 1350, saturatedFat: 4,
      confidenceLevel: 'medium', calorieRange: { min: 520, max: 720 },
    },
    alternatives: [
      { name: 'Stir-fried veggies with protein', description: 'More veggies, less noodles', estimatedCalories: 380, grade: 'B', swapType: 'menu-pick' },
      { name: 'Half portion', description: 'Restaurant portions are huge — split it', estimatedCalories: 310, grade: 'B', swapType: 'portion' },
    ],
  },
  {
    name: 'Caesar Salad with Croutons',
    nutrition: {
      calories: 470, protein: 12, carbs: 22, fat: 38, fiber: 3, sugar: 3, sodium: 980, saturatedFat: 8,
      confidenceLevel: 'medium', calorieRange: { min: 380, max: 560 },
    },
    alternatives: [
      { name: 'Vinaigrette instead of Caesar', description: 'Way less fat in the dressing', estimatedCalories: 280, grade: 'B', swapType: 'menu-pick' },
      { name: 'Add grilled chicken', description: 'Bump up the protein', estimatedCalories: 520, grade: 'B', swapType: 'menu-pick' },
    ],
  },
  {
    name: 'Fried Chicken Tenders with Ranch',
    nutrition: {
      calories: 780, protein: 38, carbs: 48, fat: 48, fiber: 1, sugar: 3, sodium: 1680, saturatedFat: 12,
      confidenceLevel: 'medium', calorieRange: { min: 680, max: 880 },
    },
    alternatives: [
      { name: 'Grilled chicken strips', description: 'Same protein, way less fat', estimatedCalories: 350, grade: 'A', swapType: 'cooking-method' },
      { name: 'Hot sauce instead of ranch', description: 'Flavor without the calories', estimatedCalories: 680, grade: 'C', swapType: 'side-swap' },
    ],
  },
  {
    name: 'Açaí Bowl',
    nutrition: {
      calories: 520, protein: 8, carbs: 88, fat: 14, fiber: 8, sugar: 62, sodium: 45, saturatedFat: 2,
      confidenceLevel: 'medium', calorieRange: { min: 420, max: 620 },
    },
    alternatives: [
      { name: 'Half-size bowl', description: 'These are sneaky calorie bombs', estimatedCalories: 260, grade: 'B', swapType: 'portion' },
      { name: 'Greek yogurt bowl', description: 'More protein, less sugar', estimatedCalories: 320, grade: 'A', swapType: 'menu-pick' },
    ],
  },
  {
    name: 'Loaded Nachos',
    nutrition: {
      calories: 1320, protein: 35, carbs: 110, fat: 82, fiber: 8, sugar: 6, sodium: 2400, saturatedFat: 32,
      confidenceLevel: 'low', calorieRange: { min: 1000, max: 1600 },
    },
    alternatives: [
      { name: 'Share with the table', description: 'Split this monster 3-4 ways', estimatedCalories: 440, grade: 'C', swapType: 'portion' },
      { name: 'Guac with veggies', description: 'Crunchy, fresh, way lighter', estimatedCalories: 250, grade: 'A', swapType: 'menu-pick' },
    ],
  },
  {
    name: 'Salmon with Rice and Vegetables',
    nutrition: {
      calories: 520, protein: 38, carbs: 42, fat: 18, fiber: 5, sugar: 4, sodium: 520, saturatedFat: 3,
      confidenceLevel: 'high', calorieRange: { min: 450, max: 590 },
    },
    alternatives: [
      { name: 'Extra veggies, less rice', description: 'More fiber, fewer carbs', estimatedCalories: 440, grade: 'A', swapType: 'side-swap' },
    ],
  },
  {
    name: 'Large Caramel Frappuccino',
    nutrition: {
      calories: 420, protein: 5, carbs: 68, fat: 16, fiber: 0, sugar: 58, sodium: 280, saturatedFat: 10,
      confidenceLevel: 'high', calorieRange: { min: 380, max: 460 },
    },
    alternatives: [
      { name: 'Iced coffee with splash of milk', description: 'Fraction of the calories', estimatedCalories: 30, grade: 'A', swapType: 'drink-swap' },
      { name: 'Small size', description: 'If you must, go small', estimatedCalories: 280, grade: 'D', swapType: 'portion' },
      { name: 'Cold brew, no sugar', description: 'All the caffeine, none of the sugar', estimatedCalories: 5, grade: 'A', swapType: 'drink-swap' },
    ],
  },
];

const MENU_ITEMS_DATABASE: FoodTemplate[] = [
  ...FOOD_DATABASE,
  {
    name: 'BBQ Bacon Burger',
    nutrition: {
      calories: 980, protein: 45, carbs: 68, fat: 55, fiber: 3, sugar: 22, sodium: 1950, saturatedFat: 20,
      confidenceLevel: 'medium', calorieRange: { min: 850, max: 1100 },
    },
    alternatives: [
      { name: 'Turkey burger', description: 'Leaner patty, still tasty', estimatedCalories: 550, grade: 'B', swapType: 'menu-pick' },
      { name: 'Skip the bacon', description: 'Saves you fat and sodium', estimatedCalories: 780, grade: 'C', swapType: 'portion' },
    ],
  },
  {
    name: 'Fish Tacos (3)',
    nutrition: {
      calories: 540, protein: 28, carbs: 48, fat: 24, fiber: 4, sugar: 5, sodium: 880, saturatedFat: 5,
      confidenceLevel: 'medium', calorieRange: { min: 450, max: 630 },
    },
    alternatives: [
      { name: 'Grilled fish instead of fried', description: 'Crispy is great but grilled is cleaner', estimatedCalories: 410, grade: 'A', swapType: 'cooking-method' },
    ],
  },
  {
    name: 'Chicken Alfredo Pasta',
    nutrition: {
      calories: 1050, protein: 48, carbs: 85, fat: 55, fiber: 3, sugar: 6, sodium: 1600, saturatedFat: 28,
      confidenceLevel: 'medium', calorieRange: { min: 900, max: 1200 },
    },
    alternatives: [
      { name: 'Chicken with marinara', description: 'Red sauce over white, way less fat', estimatedCalories: 620, grade: 'B', swapType: 'menu-pick' },
      { name: 'Half portion', description: 'Restaurants serve 2x what you need', estimatedCalories: 525, grade: 'C', swapType: 'portion' },
    ],
  },
  {
    name: 'Garden Veggie Wrap',
    nutrition: {
      calories: 380, protein: 14, carbs: 45, fat: 16, fiber: 7, sugar: 5, sodium: 720, saturatedFat: 4,
      confidenceLevel: 'medium', calorieRange: { min: 320, max: 440 },
    },
    alternatives: [
      { name: 'Lettuce wrap instead of tortilla', description: 'Cut the carbs', estimatedCalories: 220, grade: 'A', swapType: 'menu-pick' },
    ],
  },
  {
    name: 'Mozzarella Sticks (6)',
    nutrition: {
      calories: 660, protein: 28, carbs: 50, fat: 40, fiber: 2, sugar: 4, sodium: 1350, saturatedFat: 18,
      confidenceLevel: 'medium', calorieRange: { min: 560, max: 760 },
    },
    alternatives: [
      { name: 'Bruschetta', description: 'Way lighter starter', estimatedCalories: 220, grade: 'B', swapType: 'menu-pick' },
      { name: 'Edamame', description: 'Protein-rich, low-fat snack', estimatedCalories: 180, grade: 'A', swapType: 'menu-pick' },
    ],
  },
];

let callCounter = 0;

export function analyzeFoodPhoto(_imageUri: string): FoodItem {
  const template = FOOD_DATABASE[callCounter % FOOD_DATABASE.length];
  callCounter++;
  return buildFoodItem(template);
}

export function getMenuItems(_imageUri: string): { restaurantName: string; items: FoodItem[] } {
  // Simulate extracting menu items from a photo
  const shuffled = [...MENU_ITEMS_DATABASE].sort(() => Math.random() - 0.5);
  const items = shuffled.slice(0, 6 + Math.floor(Math.random() * 4)).map(buildFoodItem);

  return {
    restaurantName: randomRestaurantName(),
    items,
  };
}

function buildFoodItem(template: FoodTemplate): FoodItem {
  const result = gradeNutrition(template.nutrition);
  return {
    id: `food_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: template.name,
    nutrition: template.nutrition,
    grade: result.grade,
    gradeLabel: result.label,
    verdict: getVerdict(result.grade),
    explanation: getExplanation(template.nutrition, result.grade),
    alternatives: template.alternatives,
  };
}

function randomRestaurantName(): string {
  const names = [
    "Tony's Grill & Bar",
    "The Corner Kitchen",
    "Urban Bites Cafe",
    "Maple Street Diner",
    "Sunset Boulevard Eats",
  ];
  return names[Math.floor(Math.random() * names.length)];
}
