import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklyPlan, selectSplit, diffPlans } from '../src/domain/plan-engine.ts';
import { evaluateSafety, JOINT_TO_PATTERNS } from '../src/domain/safety.ts';
import { findSubstitutes } from '../src/domain/substitution.ts';
import { getExercise, EXERCISES, libraryStats } from '../src/content/exercises.ts';
import type { UserProfile, WeeklyPlan } from '../src/domain/types.ts';

function profile(over: Partial<UserProfile> = {}): UserProfile {
  return {
    userId: 'u1', ageYears: 32, heightCm: 178, weightKg: 82, sex: 'male', sexSkipped: false,
    primaryGoal: 'muscle_gain', secondaryGoals: [], experience: 'intermediate', dailyActivity: 'moderate',
    sessionsPerWeek: 4, minutesPerSession: 60, location: 'gym',
    equipment: ['bodyweight', 'dumbbells', 'barbell', 'bench', 'machines', 'cables', 'pullup_bar', 'cardio_machine', 'mat'],
    likedExerciseIds: [], avoidedExerciseIds: [], limitations: [], healthFlags: [],
    wakeTime: '07:00', sleepTime: '23:00', dietPatterns: [], allergens: [], mealsPerDay: 3,
    prepMinutesPerDay: 30, budgetLevel: 'medium', updatedAt: new Date().toISOString(), ...over,
  };
}

function mainExercises(plan: WeeklyPlan) {
  return plan.workouts.flatMap((w) => w.blocks.filter((b) => b.kind === 'main').flatMap((b) => b.exercises));
}

test('הספרייה כוללת לפחות 40 תרגילים ומכסה מגוון דפוסי תנועה', () => {
  const s = libraryStats();
  assert.ok(s.total >= 40, `יש רק ${s.total} תרגילים`);
  assert.ok(s.patterns >= 10);
  // לכל תרגיל יש את כל שדות החובה
  for (const ex of EXERCISES) {
    assert.ok(ex.nameHe && ex.nameEn, `${ex.id}: חסר שם`);
    assert.ok(ex.stepsHe.length > 0, `${ex.id}: חסרות הוראות`);
    assert.ok(ex.breathingHe, `${ex.id}: חסרה הנחיית נשימה`);
    assert.ok(ex.commonMistakesHe.length > 0, `${ex.id}: חסרות טעויות נפוצות`);
    assert.ok(ex.primaryMuscles.length > 0, `${ex.id}: חסרות קבוצות שרירים`);
  }
});

test('תוכנית מותאמת לזמינות ולציוד שהוזן', () => {
  const p = profile({ sessionsPerWeek: 3, minutesPerSession: 30, location: 'home', equipment: ['bodyweight', 'mat'] });
  const plan = buildWeeklyPlan({ profile: p, safety: evaluateSafety(p) });
  assert.equal(plan.workouts.length, 3);
  for (const w of plan.workouts) {
    assert.ok(w.estimatedMinutes <= 35, `אימון של ${w.estimatedMinutes} דקות חורג מהזמן שהוזן`);
  }
  for (const pe of mainExercises(plan)) {
    const ex = getExercise(pe.exerciseId)!;
    assert.ok(
      ex.equipment.length === 0 || ex.equipment.some((e) => ['bodyweight', 'mat'].includes(e)),
      `${ex.id} דורש ציוד שלא קיים: ${ex.equipment.join(',')}`,
    );
  }
});

test('מתחיל עם יעד שאפתני אינו מקבל תוכנית מתקדמת', () => {
  const p = profile({
    experience: 'beginner', primaryGoal: 'strength', sessionsPerWeek: 6, minutesPerSession: 90,
    targetWeightKg: 95, targetWeeks: 8,
  });
  const plan = buildWeeklyPlan({ profile: p, safety: evaluateSafety(p) });
  for (const pe of mainExercises(plan)) {
    const ex = getExercise(pe.exerciseId)!;
    assert.notEqual(ex.difficulty, 'hard', `מתחיל קיבל תרגיל מתקדם: ${ex.id}`);
    const top = pe.prescription.intensity.rpe?.[1] ?? 0;
    assert.ok(top <= 7, `עצימות ${top} גבוהה מדי למתחיל`);
    assert.ok((pe.prescription.repRange?.[0] ?? 99) >= 6, 'מתחיל לא מתחיל בטווח חזרות נמוך');
  }
  assert.ok(plan.notesHe.join(' ').includes('מתחיל'));
  assert.ok(plan.weeklyAerobicMinutesPrescribed < plan.weeklyAerobicMinutesTarget, 'מתחיל מתחיל מתחת ליעד');
});

test('מגבלה חמורה משפיעה בפועל על בחירת התרגילים', () => {
  const p = profile({ limitations: [{ area: 'knee', severity: 'severe' }] });
  const safety = evaluateSafety(p);
  const plan = buildWeeklyPlan({ profile: p, safety });
  for (const pe of mainExercises(plan)) {
    const ex = getExercise(pe.exerciseId)!;
    assert.ok(!JOINT_TO_PATTERNS.knee.includes(ex.pattern), `${ex.id} בדפוס חסום`);
    assert.ok(!ex.loadsJoints.includes('knee'), `${ex.id} מעמיס ברך חסומה`);
  }
  assert.ok(plan.rationale.limitationsApplied.length > 0);
});

test('לכל תרגיל בחלק העיקרי יש הנחיות סטים, עצימות וחלופות', () => {
  const p = profile();
  const plan = buildWeeklyPlan({ profile: p, safety: evaluateSafety(p) });
  const list = mainExercises(plan);
  assert.ok(list.length > 0);
  for (const pe of list) {
    assert.ok(pe.prescription.sets >= 2);
    assert.ok(pe.prescription.repRange || pe.prescription.durationSec);
    assert.ok(pe.prescription.restSec > 0);
    assert.ok(pe.prescription.intensity.explanationHe.includes('RPE'));
    assert.ok(pe.prescription.startingLoadGuidanceHe.length > 20);
    assert.ok(
      !pe.prescription.startingLoadGuidanceHe.includes('משקל גוף שלך כפול'),
      'אסור לגזור משקל עבודה ממשקל הגוף',
    );
    assert.ok(pe.alternativeExerciseIds.length > 0, `אין חלופות ל-${pe.exerciseId}`);
  }
});

test('כל אימון כולל חימום וסיום הדרגתי', () => {
  const p = profile();
  const plan = buildWeeklyPlan({ profile: p, safety: evaluateSafety(p) });
  for (const w of plan.workouts) {
    assert.ok(w.blocks.some((b) => b.kind === 'warmup' && b.exercises.length > 0), 'חסר חימום');
    assert.ok(w.blocks.some((b) => b.kind === 'cooldown' && b.exercises.length > 0), 'חסר סיום');
  }
});

test('התוכנית משלבת התנגדות ואירובי לפי היעד', () => {
  const endurance = profile({ primaryGoal: 'endurance' });
  const strength = profile({ primaryGoal: 'strength' });
  const ePlan = buildWeeklyPlan({ profile: endurance, safety: evaluateSafety(endurance) });
  const sPlan = buildWeeklyPlan({ profile: strength, safety: evaluateSafety(strength) });
  assert.ok(ePlan.weeklyAerobicMinutesTarget > sPlan.weeklyAerobicMinutesTarget);
  assert.ok(ePlan.workouts.some((w) => w.blocks.some((b) => b.kind === 'conditioning')));
});

test('חלוקה לפי מספר אימונים - מתחיל מקבל אימוני כל הגוף', () => {
  assert.deepEqual(selectSplit(3, 'beginner'), ['full_body', 'full_body', 'full_body']);
  assert.deepEqual(selectSplit(4, 'intermediate'), ['upper', 'lower', 'upper', 'lower']);
  assert.equal(selectSplit(6, 'advanced').length, 6);
});

test('מנוע ההחלפות מכבד דפוס תנועה, ציוד ומגבלות', () => {
  const p = profile({ equipment: ['bodyweight', 'mat'], limitations: [{ area: 'shoulder', severity: 'severe' }] });
  const safety = evaluateSafety(p);
  const subs = findSubstitutes('bodyweight_squat', {
    equipment: p.equipment, safety, sensitiveAreas: ['shoulder'], avoidedExerciseIds: [],
  });
  assert.ok(subs.length > 0);
  for (const s of subs) {
    assert.ok(!safety.forbiddenPatterns.includes(s.exercise.pattern));
    assert.ok(s.exercise.equipment.some((e) => ['bodyweight', 'mat'].includes(e)));
    assert.ok(s.reasonHe.length > 0, 'חלופה צריכה הסבר');
  }
});

test('תרגיל שהמשתמש ביקש להימנע ממנו אינו נכנס לתוכנית', () => {
  const first = buildWeeklyPlan({ profile: profile(), safety: evaluateSafety(profile()) });
  const avoided = mainExercises(first)[0]!.exerciseId;
  const p = profile({ avoidedExerciseIds: [avoided] });
  const plan = buildWeeklyPlan({ profile: p, safety: evaluateSafety(p) });
  assert.ok(!mainExercises(plan).some((pe) => pe.exerciseId === avoided));
});

test('מנוע הכללים דטרמיניסטי: אותו פרופיל מייצר את אותם תרגילים', () => {
  const p = profile();
  const a = buildWeeklyPlan({ profile: p, safety: evaluateSafety(p) });
  const b = buildWeeklyPlan({ profile: p, safety: evaluateSafety(p) });
  assert.deepEqual(
    mainExercises(a).map((x) => x.exerciseId),
    mainExercises(b).map((x) => x.exerciseId),
  );
});

test('השוואת גרסאות מסמנת שינוי מהותי כדורש אישור', () => {
  const p1 = profile({ sessionsPerWeek: 3 });
  const p2 = profile({ sessionsPerWeek: 5 });
  const a = buildWeeklyPlan({ profile: p1, safety: evaluateSafety(p1), version: 1 });
  const b = buildWeeklyPlan({ profile: p2, safety: evaluateSafety(p2), version: 2 });
  const diff = diffPlans(a, b);
  assert.equal(diff.requiresApproval, true);
  assert.ok(diff.changes.length > 0);
  for (const c of diff.changes) assert.ok(c.reasonHe.length > 0, 'כל שינוי צריך הסבר');
});

test('מנוע הבטיחות חוסם יצירת תוכנית כשאסור', () => {
  const p = profile({ healthFlags: ['chest_pain_at_rest_or_exertion'] });
  assert.throws(() => buildWeeklyPlan({ profile: p, safety: evaluateSafety(p) }));
});
