import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNutritionPlan, planContainsAllergen, isFoodAllowed, suggestMealTimings } from '../src/domain/nutrition-plan.ts';
import { computeMacroTarget, estimateEnergy } from '../src/domain/energy.ts';
import { evaluateSafety } from '../src/domain/safety.ts';
import { FOODS, requireFood } from '../src/content/foods.ts';
import type { UserProfile } from '../src/domain/types.ts';

function profile(over: Partial<UserProfile> = {}): UserProfile {
  return {
    userId: 'u1', ageYears: 30, heightCm: 175, weightKg: 78, sex: 'female', sexSkipped: false,
    primaryGoal: 'fat_loss_recomp', secondaryGoals: [], experience: 'novice', dailyActivity: 'moderate',
    sessionsPerWeek: 3, minutesPerSession: 45, location: 'gym', equipment: ['dumbbells'],
    likedExerciseIds: [], avoidedExerciseIds: [], limitations: [], healthFlags: [],
    wakeTime: '06:30', sleepTime: '22:30', workStart: '09:00', workEnd: '17:00',
    preferredTrainingTime: '18:30', dietPatterns: [], allergens: [], mealsPerDay: 4,
    prepMinutesPerDay: 30, budgetLevel: 'medium', updatedAt: new Date().toISOString(), ...over,
  };
}

function build(p: UserProfile) {
  const energy = estimateEnergy(p);
  const macros = computeMacroTarget(p, energy, evaluateSafety(p));
  return buildNutritionPlan({ profile: p, macros, energy });
}

test('לכל פריט מזון יש מקור נתונים ומצב (גולמי/מבושל)', () => {
  assert.ok(FOODS.length >= 40);
  for (const f of FOODS) {
    assert.equal(f.dataSourceId, 'usda_fdc', `${f.id}: חסר מקור`);
    assert.ok(f.dataSourceRef.length > 0, `${f.id}: חסרה הפניה למקור`);
    assert.ok(['raw', 'cooked', 'as_sold'].includes(f.state), `${f.id}: חסר מצב`);
    assert.ok(f.nameHe && f.nameEn);
  }
});

test('אלרגנים שהוגדרו אינם מופיעים בשום הצעת מזון או ברשימת הקניות', () => {
  const p = profile({ allergens: ['milk', 'tree_nuts', 'sesame'] });
  const plan = build(p);
  assert.equal(plan.blocked, false);
  assert.equal(planContainsAllergen(plan, p.allergens), false);
  for (const item of plan.shoppingList) {
    const f = requireFood(item.foodId);
    assert.equal(f.allergens.some((a) => p.allergens.includes(a)), false, `${f.nameHe} הגיע לרשימת הקניות`);
  }
});

test('תפריט טבעוני אינו מכיל פריטים מן החי', () => {
  const plan = build(profile({ dietPatterns: ['vegan'] }));
  for (const day of plan.days) {
    for (const { meal } of day.meals) {
      for (const c of meal.components) {
        assert.ok(requireFood(c.foodId).tags.includes('vegan'), `${c.foodId} אינו טבעוני`);
      }
    }
  }
});

test('תפריט בלי גלוטן מסנן חיטה', () => {
  const plan = build(profile({ dietPatterns: ['gluten_free'] }));
  assert.equal(planContainsAllergen(plan, ['wheat_gluten']), false);
});

test('חישובי התזונה תואמים למנות וליחידות (ערכים לכל 100 גרם)', () => {
  const plan = build(profile());
  for (const day of plan.days) {
    let kcal = 0;
    let protein = 0;
    for (const { meal } of day.meals) {
      for (const c of meal.components) {
        const f = requireFood(c.foodId);
        kcal += (f.kcal * c.grams) / 100;
        protein += (f.proteinG * c.grams) / 100;
      }
    }
    assert.ok(Math.abs(Math.round(kcal) - day.totals.kcal) <= 1, `אנרגיה: ${kcal} מול ${day.totals.kcal}`);
    assert.ok(Math.abs(Math.round(protein) - day.totals.proteinG) <= 1, 'חלבון אינו תואם לסכום המנות');
  }
});

test('סך האנרגיה היומי בתפריט קרוב ליעד', () => {
  const p = profile();
  const plan = build(p);
  for (const day of plan.days) {
    const ratio = day.totals.kcal / plan.macros.kcal;
    assert.ok(ratio > 0.8 && ratio < 1.25, `יום ${day.dayIndex}: ${day.totals.kcal} מול יעד ${plan.macros.kcal}`);
  }
});

test('רשימת קניות מצרפת את כל הפריטים של השבוע', () => {
  const plan = build(profile());
  const manual = new Map<string, number>();
  for (const day of plan.days)
    for (const { meal } of day.meals)
      for (const c of meal.components) manual.set(c.foodId, (manual.get(c.foodId) ?? 0) + c.grams);
  assert.equal(plan.shoppingList.length, manual.size);
  for (const item of plan.shoppingList) {
    assert.equal(item.grams, Math.round(manual.get(item.foodId)!));
    assert.ok(item.nameHe.includes('('), 'שם הפריט צריך לכלול את המצב (גולמי/מבושל)');
  }
});

test('תזמון ארוחות נגזר משעות היום וגמיש', () => {
  const p = profile();
  const plan = build(p);
  const timings = plan.days[0]!.meals.map((m) => m.timing);
  for (const t of timings) {
    assert.equal(t.flexible, true);
    assert.ok(/^\d{2}:\d{2}$/.test(t.suggestedTime));
    assert.ok(t.reasonHe.length > 0);
  }
  const minutes = timings.map((t) => Number(t.suggestedTime.slice(0, 2)) * 60 + Number(t.suggestedTime.slice(3)));
  assert.ok(minutes[0]! >= 6 * 60 + 30, 'הארוחה הראשונה אחרי הקימה');
  assert.ok(Math.max(...minutes) <= 22 * 60 + 30, 'הארוחה האחרונה לפני השינה');
});

test('הערות התפריט מבהירות שאין שעה שהיא תנאי לתוצאה, ואין המלצה לצום או לתוספים', () => {
  const plan = build(profile());
  const text = plan.notesHe.join(' ') + plan.macros.safetyNotesHe.join(' ');
  assert.ok(text.includes('אין להציג שעה מסוימת כתנאי') || text.includes('לא תנאי') || text.includes('הצעה גמישה'));
  assert.ok(text.includes('צום'), 'הכלל על צום ותוספים צריך להופיע');
  assert.equal(/המלצה לצום לסירוגין|קחו תוסף|מומלץ לצום/.test(text), false);
});

test('מצב חסום מחזיר תוכנית ריקה עם הסבר ובלי מספרים', () => {
  const plan = build(profile({ healthFlags: ['eating_disorder_history'] }));
  assert.equal(plan.blocked, true);
  assert.equal(plan.days.length, 0);
  assert.ok(plan.blockedReasonsHe.length > 0);
});

test('isFoodAllowed מסנן לפי אלרגן ולפי העדפה', () => {
  const milk = requireFood('milk_3');
  assert.equal(isFoodAllowed(milk, ['milk'], []), false);
  assert.equal(isFoodAllowed(milk, [], ['vegan']), false);
  assert.equal(isFoodAllowed(requireFood('lentils_cooked'), [], ['vegan']), true);
});

test('תקציב חסכוני אינו כולל פריטים יקרים', () => {
  const plan = build(profile({ budgetLevel: 'low' }));
  for (const item of plan.shoppingList) {
    assert.notEqual(requireFood(item.foodId).costLevel, 'high', `${item.nameHe} יקר מדי לתקציב חסכוני`);
  }
});

test('suggestMealTimings מתחשב בשעת האימון', () => {
  const p = profile({ preferredTrainingTime: '19:00', mealsPerDay: 4 });
  const plan = build(p);
  const reasons = plan.days[0]!.meals.map((m) => m.timing.reasonHe).join(' ');
  assert.ok(reasons.includes('אימון'), 'צריכה להיות התייחסות לאימון בתזמון');
  // בדיקה ישירה של הפונקציה
  const timings = suggestMealTimings(p, plan.days[0]!.meals.map((m) => m.meal));
  assert.equal(timings.length, plan.days[0]!.meals.length);
});
