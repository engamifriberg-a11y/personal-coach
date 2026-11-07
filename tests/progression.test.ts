import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestProgression, summarizeSession, analyzeWeightTrend } from '../src/domain/progression.ts';
import type { ExerciseHistoryEntry } from '../src/domain/progression.ts';
import type { PlannedSet, SetLog, WorkoutSession } from '../src/domain/types.ts';

const prescription: PlannedSet = {
  sets: 3,
  repRange: [8, 12],
  restSec: 90,
  intensity: { rpe: [7, 9], rir: [1, 3], explanationHe: 'RPE 7-9' },
  startingLoadGuidanceHe: 'בחרו משקל לפי ביצוע ותחושה.',
};

function set(n: number, over: Partial<SetLog> = {}): SetLog {
  return { setNumber: n, weightKg: 40, reps: 10, rpe: 8, painReported: false, completedAt: new Date().toISOString(), ...over };
}

function entry(sets: SetLog[], at = '2026-11-01T10:00:00.000Z'): ExerciseHistoryEntry {
  return {
    sessionStartedAt: at,
    log: { exerciseId: 'db_bench_press', skipped: false, sets },
    prescription,
  };
}

test('השלמת כל הסטים בקצה העליון בעצימות המתוכננת -> הצעה להעלות עומס', () => {
  const s = suggestProgression([entry([set(1, { reps: 12 }), set(2, { reps: 12 }), set(3, { reps: 12 })])]);
  assert.equal(s?.action, 'increase_load');
  assert.ok((s?.loadChangePct ?? 0) > 0);
  assert.equal(s?.ruleId, 'plan.progression_double');
  assert.ok(s?.messageHe.includes('ללא כאב'));
});

test('ביצוע מתחת לקצה התחתון -> שמירה על אותו עומס, בטון תומך', () => {
  const s = suggestProgression([entry([set(1, { reps: 7 }), set(2, { reps: 8 }), set(3, { reps: 8 })])]);
  assert.equal(s?.action, 'hold');
  assert.equal(s?.loadChangePct, null);
});

test('דיווח כאב עוצר כל התקדמות ומפנה להערכה', () => {
  const s = suggestProgression([entry([set(1, { reps: 12, painReported: true })])]);
  assert.equal(s?.action, 'stop_and_refer');
  assert.equal(s?.requiresApproval, true);
  assert.ok(s?.messageHe.includes('פיזיותרפיסט') || s?.messageHe.includes('רופא'));
});

test('עייפות חריגה (RPE מעל המתוכנן) -> הורדת עומס ולא העלאה', () => {
  const s = suggestProgression([entry([set(1, { reps: 12, rpe: 10 }), set(2, { reps: 12, rpe: 10 }), set(3, { reps: 12, rpe: 10 })])]);
  assert.equal(s?.action, 'reduce_load');
  assert.ok((s?.loadChangePct ?? 0) < 0);
});

test('ירידה בביצועים בשלושה אימונים עוקבים -> הערכה מחדש', () => {
  const history: ExerciseHistoryEntry[] = [
    entry([set(1, { weightKg: 30, reps: 8 })], '2026-11-05T10:00:00.000Z'),
    entry([set(1, { weightKg: 35, reps: 9 })], '2026-11-03T10:00:00.000Z'),
    entry([set(1, { weightKg: 40, reps: 10 })], '2026-11-01T10:00:00.000Z'),
  ];
  const s = suggestProgression(history);
  assert.equal(s?.action, 'reassess');
  assert.equal(s?.requiresApproval, true);
  assert.ok(s?.messageHe.includes('שינה') || s?.messageHe.includes('לחץ'));
});

test('תרגיל שנמדד בזמן מתקדם בזמן ולא במשקל', () => {
  const timed: ExerciseHistoryEntry = {
    sessionStartedAt: '2026-11-01T10:00:00.000Z',
    log: { exerciseId: 'plank', skipped: false, sets: [{ setNumber: 1, durationSec: 40, painReported: false, completedAt: '' }] },
    prescription: { sets: 3, durationSec: 40, restSec: 60, intensity: { explanationHe: '' }, startingLoadGuidanceHe: '' },
  };
  const s = suggestProgression([timed]);
  assert.equal(s?.action, 'increase_reps');
});

function session(over: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: 's1', userId: 'u1', planId: 'p1', planVersion: 1, dayIndex: 0, status: 'completed',
    startedAt: '2026-11-06T10:00:00.000Z', updatedAt: '2026-11-06T10:45:00.000Z',
    completedAt: '2026-11-06T10:45:00.000Z',
    logs: [{ exerciseId: 'db_bench_press', skipped: false, sets: [set(1), set(2), set(3)] }],
    cursor: { blockIndex: 0, exerciseIndex: 0, setNumber: 1 },
    ...over,
  };
}

test('סיכום אימון מחשב סטים, נפח ומשך, ומשווה לאימון קודם', () => {
  const previous = session({
    id: 's0',
    logs: [{ exerciseId: 'db_bench_press', skipped: false, sets: [set(1, { weightKg: 35 }), set(2, { weightKg: 35 })] }],
  });
  const s = summarizeSession(session(), previous);
  assert.equal(s.totalSets, 3);
  assert.equal(s.totalVolumeKg, 1200);
  assert.equal(s.durationMinutes, 45);
  assert.ok(s.comparisonHe.includes('עלה'));
});

test('אימון ראשון מסביר שאין עוד מה להשוות', () => {
  const s = summarizeSession(session(), null);
  assert.ok(s.comparisonHe.includes('הראשון'));
});

test('דיווח כאב מופיע בסיכום ומונע העלאת עומס', () => {
  const s = summarizeSession(session({ logs: [{ exerciseId: 'db_bench_press', skipped: false, sets: [set(1, { painReported: true })] }] }), null);
  assert.equal(s.painReported, true);
  assert.ok(s.comparisonHe.includes('לא נעלה עומס'));
});

test('מגמת משקל: מעט מדידות -> לא מסיקים מגמה', () => {
  const t = analyzeWeightTrend([
    { takenAt: '2026-11-01', weightKg: 80 },
    { takenAt: '2026-11-02', weightKg: 79 },
  ]);
  assert.ok(t.trendHe.includes('מעט מדי'));
});

test('מגמת משקל: ממוצע נע, ואין הסקה על שומן מתנודה בודדת', () => {
  const points = Array.from({ length: 14 }, (_, i) => ({
    takenAt: `2026-11-${String(i + 1).padStart(2, '0')}`,
    weightKg: 80 - i * 0.1 + (i % 2 === 0 ? 0.6 : -0.6),
  }));
  const t = analyzeWeightTrend(points);
  assert.equal(t.movingAverage.length, 14);
  assert.ok(t.trendHe.includes('שינוי במשקל אינו זהה לשינוי בשומן'));
});
