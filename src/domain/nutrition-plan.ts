// בניית תפריט שבועי, תזמון ארוחות ורשימת קניות.
//
// זהו מנוע כללים: בחירת המזון נעשית מסינון מפורש של אלרגנים, העדפות, תקציב וזמן הכנה,
// והכמויות מחושבות מול יעדי המאקרו. אין כאן יצירת מזון או ערכים "מהראש".

import type {
  Allergen,
  DailyMenu,
  DietPattern,
  FoodItem,
  MacroTarget,
  Meal,
  MealComponent,
  MealTiming,
  NutritionPlan,
  UserProfile,
} from './types.ts';
import { FOODS, getFood, requireFood, STATE_LABELS_HE } from '../content/foods.ts';
import { getRule } from './sources.ts';

// ---------- סינון מזון ----------

export function isFoodAllowed(food: FoodItem, allergens: Allergen[], patterns: DietPattern[]): boolean {
  if (food.allergens.some((a) => allergens.includes(a))) return false;
  for (const p of patterns) {
    switch (p) {
      case 'vegan':
        if (!food.tags.includes('vegan')) return false;
        break;
      case 'vegetarian':
        if (!food.tags.includes('vegetarian')) return false;
        break;
      case 'pescatarian':
        if (!food.tags.includes('pescatarian')) return false;
        break;
      case 'gluten_free':
        if (!food.tags.includes('gluten_free')) return false;
        break;
      case 'lactose_free':
        if (!food.tags.includes('lactose_free')) return false;
        break;
      case 'kosher':
      case 'halal':
        // המאגר שלנו אינו כולל בשר שאינו כשר/חלאל; הגבלת בשר-וחלב נאכפת ברמת הארוחה.
        break;
    }
  }
  return true;
}

function budgetAllows(food: FoodItem, budget: UserProfile['budgetLevel']): boolean {
  if (budget === 'high') return true;
  if (budget === 'medium') return food.costLevel !== 'high';
  return food.costLevel === 'low';
}

type Pools = {
  protein: FoodItem[];
  carb: FoodItem[];
  veg: FoodItem[];
  fat: FoodItem[];
  fruit: FoodItem[];
};

const CARB_IDS = [
  'white_rice_cooked', 'brown_rice_cooked', 'pasta_cooked', 'potato_cooked', 'sweet_potato',
  'oats_dry', 'bread_whole', 'pita_whole', 'couscous_cooked', 'quinoa_cooked', 'tortilla_corn',
];
const PROTEIN_IDS = [
  'chicken_breast', 'chicken_thigh', 'turkey_breast', 'beef_lean', 'salmon', 'tuna_can', 'tilapia',
  'egg', 'egg_white', 'cottage_5', 'greek_yogurt', 'white_cheese_5', 'tofu_firm', 'edamame',
  'lentils_cooked', 'chickpeas_cooked', 'black_beans', 'seitan', 'whey_protein', 'soy_protein_isolate',
];
const VEG_IDS = ['broccoli', 'mixed_salad', 'pepper_red', 'zucchini', 'spinach', 'carrot', 'cucumber', 'tomato', 'lettuce'];
const FAT_IDS = ['olive_oil', 'tahini', 'almonds', 'walnuts', 'peanut_butter', 'avocado'];
const FRUIT_IDS = ['banana', 'apple', 'orange', 'blueberries', 'date'];

/** פריטים שנחשבים "בשרי" ו"חלבי" לצורך הפרדה בכשרות. */
const MEAT_IDS = new Set(['chicken_breast', 'chicken_thigh', 'turkey_breast', 'beef_lean']);
const DAIRY_IDS = new Set(['cottage_5', 'greek_yogurt', 'white_cheese_5', 'milk_3', 'yellow_cheese_28', 'whey_protein']);

function buildPools(profile: UserProfile): Pools {
  const allow = (f: FoodItem) =>
    isFoodAllowed(f, profile.allergens, profile.dietPatterns) && budgetAllows(f, profile.budgetLevel);
  const pick = (ids: string[]) => ids.map((id) => getFood(id)).filter((f): f is FoodItem => Boolean(f) && allow(f!));
  return {
    protein: pick(PROTEIN_IDS),
    carb: pick(CARB_IDS),
    veg: pick(VEG_IDS),
    fat: pick(FAT_IDS),
    fruit: pick(FRUIT_IDS),
  };
}

// ---------- תבניות ארוחה ----------

type Template = {
  id: string;
  nameHe: string;
  slot: Meal['slot'];
  prepMinutes: number;
  instructionsHe: string[];
  /** חלקו היחסי של יעד היום בארוחה הזו. */
  share: number;
  includeFruit?: boolean;
};

function dailyTemplates(mealsPerDay: number, prepMinutesPerDay: number): Template[] {
  const quick = prepMinutesPerDay <= 30;
  const bank: Template[] = [
    {
      id: 'breakfast',
      nameHe: 'בוקר',
      slot: 'breakfast',
      prepMinutes: quick ? 8 : 15,
      instructionsHe: quick
        ? ['שלבו את מקור החלבון עם הפחמימה בקערה אחת.', 'הוסיפו פרי ואגוזים או טחינה לפי הכמות.']
        : ['בשלו את הפחמימה (למשל דייסת שיבולת שועל).', 'הוסיפו את מקור החלבון.', 'סיימו עם פרי ושומן.'],
      share: 0.25,
      includeFruit: true,
    },
    {
      id: 'lunch',
      nameHe: 'צהריים',
      slot: 'lunch',
      prepMinutes: quick ? 15 : 30,
      instructionsHe: [
        'בשלו או חממו את מקור החלבון עם תיבול בסיסי.',
        'הוסיפו את הפחמימה המבושלת.',
        'הוסיפו ירקות ושמן זית או טחינה.',
      ],
      share: 0.35,
    },
    {
      id: 'dinner',
      nameHe: 'ערב',
      slot: 'dinner',
      prepMinutes: quick ? 12 : 25,
      instructionsHe: ['הכינו את מקור החלבון.', 'הוסיפו פחמימה וירקות.', 'סיימו עם שומן לפי הכמות.'],
      share: 0.3,
    },
    {
      id: 'snack_1',
      nameHe: 'ביניים',
      slot: 'snack',
      prepMinutes: 3,
      instructionsHe: ['ארוחה קרה ללא בישול - מתאימה לעבודה או לדרך.'],
      share: 0.1,
      includeFruit: true,
    },
    {
      id: 'snack_2',
      nameHe: 'ביניים מאוחר',
      slot: 'snack',
      prepMinutes: 3,
      instructionsHe: ['חלבון ופרי, בלי בישול.'],
      share: 0.1,
      includeFruit: true,
    },
  ];
  const byId = new Map(bank.map((t) => [t.id, t]));
  // סדר הארוחות לפי מהלך היום, כולל ארוחות ביניים בין הארוחות העיקריות.
  // הסדר חשוב: ממנו נגזר תזמון השעות, כולל ארוחה לפני אימון.
  const orders: Record<number, string[]> = {
    2: ['breakfast', 'dinner'],
    3: ['breakfast', 'lunch', 'dinner'],
    4: ['breakfast', 'snack_1', 'lunch', 'dinner'],
    5: ['breakfast', 'snack_1', 'lunch', 'snack_2', 'dinner'],
    6: ['breakfast', 'snack_1', 'lunch', 'snack_2', 'dinner', 'snack_2'],
  };
  const n = Math.max(2, Math.min(6, Math.round(mealsPerDay)));
  const chosen = (orders[n] ?? orders[3]!).map((id, i) => {
    const t = byId.get(id)!;
    return { ...t, id: `${t.id}_${i}` };
  });
  const totalShare = chosen.reduce((s, t) => s + t.share, 0);
  return chosen.map((t) => ({ ...t, share: t.share / totalShare }));
}

function rotate<T>(arr: T[], offset: number): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[offset % arr.length];
}

function roundG(g: number): number {
  return Math.max(5, Math.round(g / 5) * 5);
}

/** מנות קבועות לפירות צפופים באנרגיה - תמר אינו תפוח. */
const FIXED_FRUIT_PORTIONS: Record<string, number> = {
  date: 30,
  blueberries: 100,
};

/** תקרת מנה לפריט חלבון אחד בארוחה. מעבר לזה הארוחה לא מעשית. */
const MAX_PROTEIN_PORTION_G = 250;

function householdHint(food: FoodItem, grams: number): string {
  if (food.id === 'egg') return `${Math.max(1, Math.round(grams / 55))} ביצים`;
  if (food.id === 'olive_oil') return `${Math.max(1, Math.round(grams / 9))} כפיות`;
  if (food.id === 'tahini') return `${Math.max(1, Math.round(grams / 15))} כפות`;
  if (food.id === 'peanut_butter') return `${Math.max(1, Math.round(grams / 16))} כפות`;
  if (food.id === 'banana') return `${Math.max(1, Math.round(grams / 120))} בננות`;
  if (food.id === 'apple') return `${Math.max(1, Math.round(grams / 180))} תפוחים`;
  if (food.id === 'bread_whole') return `${Math.max(1, Math.round(grams / 30))} פרוסות`;
  return `${grams} גרם (${STATE_LABELS_HE[food.state]})`;
}

/**
 * בניית ארוחה.
 *
 * סדר ההקצאה חשוב לדיוק: קודם פריטים בכמות קבועה (ירקות ופרי),
 * אחר כך חלבון, אחר כך שומן, ולבסוף פחמימה כמשלימה.
 * כך הסכום היומי נשאר קרוב ליעד ולא מצטבר מעליו.
 */
function buildMeal(
  template: Template,
  pools: Pools,
  macros: MacroTarget,
  dayIndex: number,
  kosher: boolean,
  mealIndex: number,
): Meal {
  const components: MealComponent[] = [];
  const targetProtein = macros.proteinG * template.share;
  const targetFat = macros.fatG * template.share;
  const targetCarbs = macros.carbsG * template.share;

  const targetKcal = macros.kcal * template.share;
  const sum = (key: 'proteinG' | 'fatG' | 'carbsG' | 'kcal') =>
    components.reduce((acc, c) => acc + (requireFood(c.foodId)[key] * c.grams) / 100, 0);

  // 1. פריטים בכמות קבועה: ירקות בארוחות העיקריות, ופרי היכן שמוגדר.
  const offset = dayIndex * 3 + mealIndex;
  if (template.slot === 'lunch' || template.slot === 'dinner') {
    const vegFood = rotate(pools.veg, offset + 2);
    if (vegFood) components.push({ foodId: vegFood.id, grams: 200, householdHe: 'כ-2 כוסות' });
  }
  if (template.includeFruit) {
    const fruit = rotate(pools.fruit, offset + 3);
    if (fruit) {
      const grams = FIXED_FRUIT_PORTIONS[fruit.id] ?? 120;
      components.push({ foodId: fruit.id, grams, householdHe: householdHint(fruit, grams) });
    }
  }

  // 2. חלבון - רוטציה כדי לגוון בין ימים וארוחות
  let proteinFood = rotate(pools.protein, offset);
  if (template.slot === 'breakfast') {
    const breakfastFriendly = pools.protein.filter((f) =>
      ['egg', 'egg_white', 'cottage_5', 'greek_yogurt', 'white_cheese_5', 'tofu_firm', 'whey_protein'].includes(f.id),
    );
    proteinFood = rotate(breakfastFriendly, dayIndex) ?? proteinFood;
  }
  if (template.slot === 'snack') {
    const snackFriendly = pools.protein.filter((f) =>
      ['cottage_5', 'greek_yogurt', 'tuna_can', 'edamame', 'whey_protein', 'white_cheese_5'].includes(f.id),
    );
    proteinFood = rotate(snackFriendly, dayIndex) ?? proteinFood;
  }

  if (proteinFood) {
    const need = Math.max(0, targetProtein - sum('proteinG'));
    // תקרת מנה: גם אם החשבון דורש יותר, מנה לא סבירה אינה מנה שמישהו יאכל.
    const grams = Math.min(roundG((need / Math.max(1, proteinFood.proteinG)) * 100), MAX_PROTEIN_PORTION_G);
    components.push({ foodId: proteinFood.id, grams, householdHe: householdHint(proteinFood, grams) });
  }

  // 3. שומן - משלים את מה שחסר אחרי החלבון. מקורות חלבון שמנים מצמצמים את התוספת.
  const needFat = targetFat - sum('fatG');
  if (needFat > 2) {
    let fatPool = pools.fat;
    if (kosher) {
      // הפרדת בשרי וחלבי בתוך אותה ארוחה.
      const hasMeat = components.some((c) => MEAT_IDS.has(c.foodId));
      const hasDairy = components.some((c) => DAIRY_IDS.has(c.foodId));
      if (hasMeat) fatPool = fatPool.filter((f) => !DAIRY_IDS.has(f.id));
      if (hasDairy) fatPool = fatPool.filter((f) => !MEAT_IDS.has(f.id));
    }
    const fatFood = rotate(fatPool, offset + 4);
    if (fatFood) {
      const grams = roundG((needFat / Math.max(1, fatFood.fatG)) * 100);
      components.push({ foodId: fatFood.id, grams, householdHe: householdHint(fatFood, grams) });
    }
  }

  // 4. פחמימה - הפריט המשלים: קודם לפי יעד הפחמימה, ואז נגזרת ממנו
  //    גם סגירת פער האנרגיה, כדי שהארוחה תתכנס ליעד ולא תצטבר מעליו.
  const carbPool =
    template.slot === 'breakfast'
      ? pools.carb.filter((f) => ['oats_dry', 'bread_whole', 'pita_whole'].includes(f.id))
      : pools.carb;
  const carbFood = rotate(carbPool.length > 0 ? carbPool : pools.carb, offset + 1);
  if (carbFood) {
    const byCarbs = (Math.max(0, targetCarbs - sum('carbsG')) / Math.max(1, carbFood.carbsG)) * 100;
    const byKcal = (Math.max(0, targetKcal - sum('kcal')) / Math.max(1, carbFood.kcal)) * 100;
    const grams = roundG(Math.min(byCarbs, byKcal));
    if (grams >= 10) {
      components.push({ foodId: carbFood.id, grams, householdHe: householdHint(carbFood, grams) });
    }
  }

  // 5. תיקון סופי: אם הארוחה עדיין מעל יעד האנרגיה (קורה כשמקור החלבון שומני),
  //    מקצצים את פריט השומן שהוספנו, ואחר כך את הפחמימה. לא נוגעים בחלבון ובירקות.
  const trimOrder = ['fat', 'carb'] as const;
  for (const role of trimOrder) {
    let excess = sum('kcal') - targetKcal;
    if (excess <= 15) break;
    const pool = role === 'fat' ? pools.fat : pools.carb;
    const idx = components.findIndex((c) => pool.some((f) => f.id === c.foodId));
    if (idx === -1) continue;
    const comp = components[idx]!;
    const food = requireFood(comp.foodId);
    const reduceG = Math.min(comp.grams - 5, (excess / Math.max(1, food.kcal)) * 100);
    if (reduceG <= 0) continue;
    const newGrams = roundG(comp.grams - reduceG);
    if (newGrams < 10) components.splice(idx, 1);
    else components[idx] = { foodId: comp.foodId, grams: newGrams, householdHe: householdHint(food, newGrams) };
  }

  return {
    id: `${template.id}_d${dayIndex}`,
    nameHe: template.nameHe,
    slot: template.slot,
    components,
    prepMinutes: template.prepMinutes,
    instructionsHe: [
      ...template.instructionsHe,
      'הכמויות בגרמים מתייחסות למצב שמצוין לכל פריט (גולמי / מבושל / כפי שנמכר). ' +
        'אורז ופסטה, למשל, נמדדים כאן מבושלים - משקל יבש יוצא כשליש מזה.',
    ],
    alternativesMealIds: [],
  };
}

function mealTotals(meal: Meal) {
  return meal.components.reduce(
    (acc, c) => {
      const f = requireFood(c.foodId);
      const k = c.grams / 100;
      acc.kcal += f.kcal * k;
      acc.proteinG += f.proteinG * k;
      acc.fatG += f.fatG * k;
      acc.carbsG += f.carbsG * k;
      acc.fiberG += f.fiberG * k;
      return acc;
    },
    { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0, fiberG: 0 },
  );
}

// ---------- תזמון ארוחות ----------

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10));
  return (h ?? 7) * 60 + (m ?? 0);
}
function toHHMM(min: number): string {
  const total = ((Math.round(min / 5) * 5) % 1440 + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function suggestMealTimings(profile: UserProfile, meals: Meal[]): MealTiming[] {
  const wake = toMinutes(profile.wakeTime);
  let sleep = toMinutes(profile.sleepTime);
  if (sleep <= wake) sleep += 24 * 60;
  const firstMeal = wake + 45;
  const lastMeal = sleep - 120;
  const span = Math.max(240, lastMeal - firstMeal);
  const n = meals.length;
  const training = profile.preferredTrainingTime ? toMinutes(profile.preferredTrainingTime) : null;

  return meals.map((meal, i) => {
    let time = firstMeal + (span / Math.max(1, n - 1)) * i;
    let reason =
      `מרווח נוח בין הקימה (${profile.wakeTime}) לשינה (${profile.sleepTime}), ` +
      'כדי שהארוחות יתפרסו על היום ולא יצטברו לסוף.';

    if (meal.slot === 'lunch' && profile.workStart && profile.workEnd) {
      const ws = toMinutes(profile.workStart);
      const we = toMinutes(profile.workEnd);
      const mid = (ws + we) / 2;
      if (mid > firstMeal && mid < lastMeal) {
        time = mid;
        reason = 'מתוזמן לאמצע יום העבודה, כדי שיהיה מעשי לעצור ולאכול.';
      }
    }
    if (training !== null) {
      if (meal.slot === 'snack' && Math.abs(time - (training - 90)) < 120) {
        time = training - 90;
        reason =
          'ארוחה קלה כשעה וחצי לפני האימון, כדי שתהיה אנרגיה בלי כבדות. אם זה לא נוח לכם - אפשר להזיז, ' +
          'וגם אימון בלי ארוחה לפניו הוא אפשרות לגיטימית אם ככה מרגיש טוב.';
      }
      if (meal.slot === 'dinner' && training < time && time - training < 240) {
        reason =
          'ארוחה אחרי האימון - נוחה להתאוששות, אבל אין "חלון" שנסגר. מה שקובע הוא הסך היומי, לא הדקות.';
      }
    }
    if (time > lastMeal) time = lastMeal;
    return { slot: meal.slot, suggestedTime: toHHMM(time), flexible: true, reasonHe: reason };
  });
}

// ---------- בניית התוכנית ----------

export function buildNutritionPlan(input: {
  profile: UserProfile;
  macros: MacroTarget;
  energy: NutritionPlan['energy'];
  version?: number;
}): NutritionPlan {
  const { profile, macros, energy } = input;
  const notes: string[] = [];

  if (macros.blocked) {
    return {
      id: crypto.randomUUID(),
      userId: profile.userId,
      version: input.version ?? 1,
      createdAt: new Date().toISOString(),
      energy,
      macros,
      days: [],
      shoppingList: [],
      notesHe: [],
      blocked: true,
      blockedReasonsHe: macros.safetyNotesHe,
    };
  }

  const pools = buildPools(profile);
  const kosher = profile.dietPatterns.includes('kosher') || profile.dietPatterns.includes('halal');
  const templates = dailyTemplates(profile.mealsPerDay, profile.prepMinutesPerDay);

  if (pools.protein.length < 2) {
    notes.push(
      'לפי ההעדפות, האלרגיות והתקציב שסימנת נשארו מעט מאוד מקורות חלבון במאגר, ולכן התפריט מוגבל וחזרתי. ' +
        'כדאי להרחיב את התקציב או לעדכן העדפות, או להיעזר בדיאטן להרחבת האפשרויות.',
    );
  }

  const days: DailyMenu[] = [];
  for (let d = 0; d < 7; d++) {
    const meals = templates.map((t, i) => buildMeal(t, pools, macros, d, kosher, i));
    const timings = suggestMealTimings(profile, meals);
    const totals = meals.reduce(
      (acc, m) => {
        const t = mealTotals(m);
        acc.kcal += t.kcal;
        acc.proteinG += t.proteinG;
        acc.fatG += t.fatG;
        acc.carbsG += t.carbsG;
        acc.fiberG += t.fiberG;
        return acc;
      },
      { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0, fiberG: 0 },
    );
    days.push({
      dayIndex: d,
      meals: meals.map((meal, i) => ({ meal, timing: timings[i]! })),
      totals: {
        kcal: Math.round(totals.kcal),
        proteinG: Math.round(totals.proteinG),
        fatG: Math.round(totals.fatG),
        carbsG: Math.round(totals.carbsG),
        fiberG: Math.round(totals.fiberG),
      },
    });
  }

  // רשימת קניות - צבירה שבועית
  const agg = new Map<string, number>();
  for (const day of days) {
    for (const { meal } of day.meals) {
      for (const c of meal.components) {
        agg.set(c.foodId, (agg.get(c.foodId) ?? 0) + c.grams);
      }
    }
  }
  const shoppingList = [...agg.entries()]
    .map(([foodId, grams]) => {
      const f = requireFood(foodId);
      return { foodId, nameHe: `${f.nameHe} (${STATE_LABELS_HE[f.state]})`, grams: Math.round(grams), costLevel: f.costLevel };
    })
    .sort((a, b) => b.grams - a.grams);

  notes.push(getRule('nutrition.meal_timing_flexible').statementHe);
  notes.push(
    'התפריט הוא דוגמה אחת מתוך הרבה. אפשר להחליף פריט בפריט דומה מאותה קטגוריה - המטרה היא הסך היומי, ' +
      'לא דיוק של כל ארוחה.',
  );
  notes.push(
    'סך האנרגיה היומי מכויל ליעד, אבל פירוט המאקרו יכול לסטות ממנו במקצת: מזון שלם נושא כמה מאקרו יחד, ' +
      'ולכן מקור חלבון שומני מעלה את החלבון מעל היעד ומוריד מעט מהפחמימה. זו סטייה מכוונת ולא שגיאה.',
  );
  notes.push(
    'סביב אימון: אם נוח לכם לאכול לפני - ארוחה קלה עם פחמימה וחלבון כשעה-שעתיים קודם עובדת טוב לרוב האנשים. ' +
      'אם לא נוח - אין חובה. אחרי האימון כדאי להגיע לארוחה עם חלבון במהלך השעות הבאות, בלי לחץ של דקות.',
  );
  if (profile.allergens.length > 0) {
    notes.push(
      `הפריטים שמכילים ${profile.allergens.length} אלרגנים שסימנת סוננו לחלוטין מהתפריט ומרשימת הקניות. ` +
        'עדיין חובה לקרוא תוויות: מוצרים מעובדים עשויים להכיל עקבות.',
    );
  }

  return {
    id: crypto.randomUUID(),
    userId: profile.userId,
    version: input.version ?? 1,
    createdAt: new Date().toISOString(),
    energy,
    macros,
    days,
    shoppingList,
    notesHe: notes,
    blocked: false,
    blockedReasonsHe: [],
  };
}

/** בדיקת עמידה באלרגנים - משמשת גם לבדיקות אוטומטיות. */
export function planContainsAllergen(plan: NutritionPlan, allergens: Allergen[]): boolean {
  for (const day of plan.days) {
    for (const { meal } of day.meals) {
      for (const c of meal.components) {
        const f = getFood(c.foodId);
        if (f && f.allergens.some((a) => allergens.includes(a))) return true;
      }
    }
  }
  return false;
}

export const ALL_FOODS = FOODS;
