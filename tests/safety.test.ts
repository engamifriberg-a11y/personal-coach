import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSafety, assessGoalRealism, cappedMaxRpe, JOINT_TO_PATTERNS } from '../src/domain/safety.ts';
import { pendingReviewRules, RULES, describeRule } from '../src/domain/sources.ts';

test('מתחת לגיל 18: חסימה מלאה של תוכנית אימון ותזונה', () => {
  const d = evaluateSafety({ ageYears: 16, healthFlags: [], limitations: [] });
  assert.equal(d.allowTrainingPlan, false);
  assert.equal(d.allowNutritionPlan, false);
  assert.ok(d.messagesHe[0].includes('18'));
  assert.ok(d.triggeredRuleIds.includes('safety.adults_only'));
});

test('כאב בחזה עוצר יצירת תוכנית ודורש אישור רפואי', () => {
  const d = evaluateSafety({ ageYears: 40, healthFlags: ['chest_pain_at_rest_or_exertion'], limitations: [] });
  assert.equal(d.allowTrainingPlan, false);
  assert.equal(d.requiresProfessionalClearance, true);
  assert.ok(d.messagesHe.join(' ').includes('רופא'));
});

test('הריון: אין יעדי אנרגיה ואין תוכנית אוטומטית', () => {
  const d = evaluateSafety({ ageYears: 31, healthFlags: ['pregnant'], limitations: [] });
  assert.equal(d.allowNutritionPlan, false);
  assert.equal(d.allowTrainingPlan, false);
  assert.ok(d.triggeredRuleIds.includes('safety.pregnancy_clearance'));
});

test('היסטוריה של הפרעת אכילה: אין תוכנית תזונה, אימון במצב מוגבל', () => {
  const d = evaluateSafety({ ageYears: 24, healthFlags: ['eating_disorder_history'], limitations: [] });
  assert.equal(d.allowNutritionPlan, false);
  assert.equal(d.allowTrainingPlan, true);
  assert.equal(d.restrictedMode, true);
  assert.ok(d.messagesHe.join(' ').includes('דיאטן'));
});

test('מצב לבבי מגביל עצימות ודורש אישור', () => {
  const d = evaluateSafety({ ageYears: 55, healthFlags: ['cardiac_condition'], limitations: [] });
  assert.equal(d.requiresProfessionalClearance, true);
  assert.ok(d.maxRpe <= 5);
});

test('מגבלה חמורה חוסמת את דפוסי התנועה של אותו אזור', () => {
  const d = evaluateSafety({
    ageYears: 35,
    healthFlags: [],
    limitations: [{ area: 'knee', severity: 'severe' }],
  });
  for (const p of JOINT_TO_PATTERNS.knee) {
    assert.ok(d.forbiddenPatterns.includes(p), `הדפוס ${p} היה צריך להיחסם`);
  }
  assert.equal(d.allowTrainingPlan, true, 'עדיין אפשר תוכנית - עם חלופות');
});

test('מגבלה בינונית מורידה תקרת עצימות אך אינה חוסמת', () => {
  const d = evaluateSafety({
    ageYears: 35, healthFlags: [], limitations: [{ area: 'shoulder', severity: 'moderate' }],
  });
  assert.equal(d.forbiddenPatterns.length, 0);
  assert.ok(d.maxRpe <= 7);
});

test('תקרת העצימות למתחיל נמוכה מזו של מתקדם', () => {
  const clean = evaluateSafety({ ageYears: 30, healthFlags: [], limitations: [] });
  assert.ok(cappedMaxRpe('beginner', clean) < cappedMaxRpe('advanced', clean));
});

test('יעד לא מציאותי מפעיל הסבר וחלופה - בלי הבטחת תוצאה', () => {
  const r = assessGoalRealism({ weightKg: 90, targetWeightKg: 70, targetWeeks: 8 });
  assert.equal(r.realistic, false);
  assert.ok(typeof r.suggestedWeeks === 'number' && r.suggestedWeeks > 8);
  assert.ok(r.messageHe.includes('חלופה'));
});

test('יעד סביר מאושר אך בלי התחייבות למועד', () => {
  const r = assessGoalRealism({ weightKg: 90, targetWeightKg: 84, targetWeeks: 16 });
  assert.equal(r.realistic, true);
  assert.ok(r.messageHe.includes('אי אפשר להתחייב'));
});

test('כל כלל במרשם נושא גרסה ומצב ביקורת, וכלל עם סף מספרי שאינו מצוטט מסומן כממתין', () => {
  for (const rule of Object.values(RULES)) {
    assert.ok(rule.version, `לכלל ${rule.id} חסרה גרסה`);
    assert.ok(['reviewed', 'pending_review'].includes(rule.reviewState));
    if (rule.reviewState === 'reviewed' && rule.sourceIds.length === 0) {
      // מותר רק להחלטות מוצר מוצהרות, ואז חייבת להיות הערה מפורשת
      assert.ok(rule.reviewNoteHe, `כלל ${rule.id} מסומן מאושר בלי מקור ובלי הערה`);
    }
  }
  assert.ok(pendingReviewRules().length > 0, 'חייבת להיות שקיפות לגבי מה שטרם נבדק');
});

test('describeRule מחזיר את המקורות המלאים', () => {
  const d = describeRule('nutrition.energy_formula');
  assert.ok(d.sources.length >= 1);
  assert.ok(d.sources[0].citation.includes('Mifflin'));
  assert.equal(d.approved, true);
});
