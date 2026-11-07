import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bmrMifflin, estimateEnergy, computeMacroTarget, ACTIVITY_FACTORS } from '../src/domain/energy.ts';
import { evaluateSafety } from '../src/domain/safety.ts';
import type { UserProfile } from '../src/domain/types.ts';

// הערכים נבדקים מול הנוסחה המפורשת במקור (Mifflin & St Jeor, 1990).
test('מיפלין-סנט ג׳ור: גבר', () => {
  // 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780
  assert.equal(bmrMifflin('male', 80, 180, 30), 1780);
});

test('מיפלין-סנט ג׳ור: אישה', () => {
  // 10*65 + 6.25*165 - 5*30 - 161 = 650 + 1031.25 - 150 - 161 = 1370.25
  assert.equal(bmrMifflin('female', 65, 165, 30), 1370.25);
});

test('TDEE מוכפל במקדם הפעילות הנכון ומוצג כטווח, לא כמספר בודד', () => {
  const e = estimateEnergy({
    sex: 'male', sexSkipped: false, weightKg: 80, heightCm: 180, ageYears: 30, dailyActivity: 'moderate',
  });
  assert.equal(e.activityFactor, ACTIVITY_FACTORS.moderate);
  assert.equal(e.tdeeKcal, Math.round(1780 * 1.55));
  assert.ok(e.tdeeRangeKcal[0] < e.tdeeKcal && e.tdeeKcal < e.tdeeRangeKcal[1], 'הטווח צריך להקיף את האומדן');
  // ±10% כשהמין נמסר
  assert.equal(e.tdeeRangeKcal[0], Math.round(1780 * 1.55 * 0.9));
});

test('דילוג על נתון המין מרחיב את טווח אי־הוודאות ומסביר זאת', () => {
  const given = estimateEnergy({
    sex: 'male', sexSkipped: false, weightKg: 80, heightCm: 180, ageYears: 30, dailyActivity: 'light',
  });
  const skipped = estimateEnergy({
    sex: 'unspecified', sexSkipped: true, weightKg: 80, heightCm: 180, ageYears: 30, dailyActivity: 'light',
  });
  const givenWidth = given.tdeeRangeKcal[1] - given.tdeeRangeKcal[0];
  const skippedWidth = skipped.tdeeRangeKcal[1] - skipped.tdeeRangeKcal[0];
  assert.ok(skippedWidth > givenWidth, 'בלי הנתון הטווח חייב להיות רחב יותר');
  assert.ok(skipped.assumptionsHe.some((a) => a.includes('לא נמסר נתון המין')));
});

function profileFor(goal: UserProfile['primaryGoal'], over: Partial<UserProfile> = {}): UserProfile {
  return {
    userId: 'u1', ageYears: 30, heightCm: 180, weightKg: 80, sex: 'male', sexSkipped: false,
    primaryGoal: goal, secondaryGoals: [], experience: 'intermediate', dailyActivity: 'moderate',
    sessionsPerWeek: 3, minutesPerSession: 45, location: 'gym', equipment: ['dumbbells'],
    likedExerciseIds: [], avoidedExerciseIds: [], limitations: [], healthFlags: [],
    wakeTime: '07:00', sleepTime: '23:00', dietPatterns: [], allergens: [], mealsPerDay: 3,
    prepMinutesPerDay: 30, budgetLevel: 'medium', updatedAt: new Date().toISOString(), ...over,
  };
}

test('גרעון לירידה במשקל נשאר בתוך הטווח המתועד ולא יורד מתחת ל-BMR', () => {
  const p = profileFor('weight_loss');
  const e = estimateEnergy(p);
  const safety = evaluateSafety(p);
  const m = computeMacroTarget(p, e, safety);
  assert.ok(m.kcal < e.tdeeKcal, 'צריך להיות גרעון');
  assert.ok(m.kcal >= e.bmrKcal, 'יעד האנרגיה לא ירד מתחת לאומדן ההוצאה במנוחה');
  const deficitPct = (e.tdeeKcal - m.kcal) / e.tdeeKcal;
  assert.ok(deficitPct <= 0.2 + 1e-9, `הגרעון (${deficitPct}) לא יחרוג מ-20%`);
});

test('רצפת אנרגיה מופעלת למשתמש קטן עם יעד ירידה, עם הסבר', () => {
  const p = profileFor('weight_loss', { sex: 'female', weightKg: 48, heightCm: 152, ageYears: 60, dailyActivity: 'sedentary' });
  const e = estimateEnergy(p);
  const m = computeMacroTarget(p, e, evaluateSafety(p));
  assert.ok(m.kcal >= 1200, 'לא יורדים מתחת לרצפת הזהירות');
  assert.ok(m.safetyNotesHe.length > 0, 'חייב הסבר למה היעד הועלה');
});

test('סכום המאקרו תואם ליעד הקלוריות (בתוך סטייה של עיגול)', () => {
  for (const goal of ['muscle_gain', 'strength', 'endurance', 'maintain', 'fat_loss_recomp'] as const) {
    const p = profileFor(goal);
    const e = estimateEnergy(p);
    const m = computeMacroTarget(p, e, evaluateSafety(p));
    const fromMacros = m.proteinG * 4 + m.fatG * 9 + m.carbsG * 4;
    assert.ok(Math.abs(fromMacros - m.kcal) <= 12, `${goal}: ${fromMacros} מול ${m.kcal}`);
  }
});

test('עודף לבניית מסה אינו חורג מ-15%', () => {
  const p = profileFor('muscle_gain');
  const e = estimateEnergy(p);
  const m = computeMacroTarget(p, e, evaluateSafety(p));
  assert.ok((m.kcal - e.tdeeKcal) / e.tdeeKcal <= 0.15 + 1e-9);
});

test('חסימת בטיחות מחזירה יעד חסום בלי מספרים', () => {
  const p = profileFor('weight_loss', { healthFlags: ['pregnant'] });
  const e = estimateEnergy(p);
  const m = computeMacroTarget(p, e, evaluateSafety(p));
  assert.equal(m.blocked, true);
  assert.equal(m.kcal, 0);
  assert.ok(m.safetyNotesHe.length > 0);
});
