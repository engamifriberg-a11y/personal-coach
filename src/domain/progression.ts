// מנוע התקדמות והערכה מחדש.
//
// כלל היסוד: התקדמות נגזרת מביצוע מתועד, לא מלוח זמנים ולא מהיעד.
// כאב, עייפות חריגה או ירידה מתמשכת בביצועים מפעילים הורדת עומס והערכה מחדש - לא העלאה.

import type { ExerciseLog, PlannedSet, WorkoutSession } from './types.ts';
import { getExercise } from '../content/exercises.ts';
import { getRule } from './sources.ts';

export type ProgressionAction =
  | 'increase_load'
  | 'increase_reps'
  | 'hold'
  | 'reduce_load'
  | 'reassess'
  | 'stop_and_refer';

export type ProgressionSuggestion = {
  exerciseId: string;
  action: ProgressionAction;
  /** שינוי מוצע באחוזים (חיובי = העלאה). null כשאין שינוי מספרי. */
  loadChangePct: number | null;
  messageHe: string;
  ruleId: string;
  /** האם נדרש אישור מהמשתמש לפני החלה. */
  requiresApproval: boolean;
};

/** תוספת מומלצת לפי סוג התרגיל: תרגילי פלג גוף עליון מתקדמים בצעדים קטנים יותר. */
function stepPctFor(exerciseId: string): number {
  const ex = getExercise(exerciseId);
  if (!ex) return 2.5;
  const lower = ['squat', 'hinge', 'lunge'];
  return lower.includes(ex.pattern) ? 5 : 2.5;
}

export type ExerciseHistoryEntry = {
  sessionStartedAt: string;
  log: ExerciseLog;
  prescription: PlannedSet;
};

/**
 * מחשב המלצת התקדמות לתרגיל בודד על בסיס היסטוריה (החדש ראשון).
 */
export function suggestProgression(history: ExerciseHistoryEntry[]): ProgressionSuggestion | null {
  if (history.length === 0) return null;
  const latest = history[0]!;
  const exerciseId = latest.log.exerciseId;
  const ex = getExercise(exerciseId);
  const name = ex?.nameHe ?? exerciseId;

  // 1. כאב - עוצר כל התקדמות.
  const painNow = latest.log.sets.some((s) => s.painReported);
  if (painNow) {
    return {
      exerciseId,
      action: 'stop_and_refer',
      loadChangePct: null,
      messageHe:
        `דיווחת על כאב ב${name}. לא נעלה עומס, ונוציא את התרגיל מהתוכנית עד שתחליטו איתנו מה הלאה. ` +
        'כאב בזמן תרגיל הוא מידע, לא משהו שצריך "לעבור". אם הכאב חוזר בתנועות יומיומיות או נמשך מעל כמה ימים - ' +
        'כדאי לעבור הערכה אצל פיזיותרפיסט או רופא.',
      ruleId: 'plan.reassess_triggers',
      requiresApproval: true,
    };
  }

  // 2. ירידה מתמשכת בביצועים - שני אימונים עוקבים ומעלה.
  if (history.length >= 3) {
    const volumes = history.slice(0, 3).map(totalVolume);
    if (volumes[0]! < volumes[1]! && volumes[1]! < volumes[2]!) {
      return {
        exerciseId,
        action: 'reassess',
        loadChangePct: -10,
        messageHe:
          `הביצועים ב${name} יורדים שלושה אימונים ברצף. זה בדרך כלל לא עניין של "לנסות יותר חזק": ` +
          'הסיבות הנפוצות הן שינה, לחץ, אכילה מתחת לצורך או נפח אימון גבוה מדי. ' +
          'נוריד כ-10% מהעומס לשבוע הקרוב, ואם זה לא מסתדר נעדכן גם את הנפח. ' +
          getRule('plan.reassess_triggers').statementHe,
        ruleId: 'plan.reassess_triggers',
        requiresApproval: true,
      };
    }
  }

  // 3. עייפות חריגה - RPE גבוה מהמתוכנן בפער משמעותי.
  const plannedTopRpe = latest.prescription.intensity.rpe?.[1];
  const reportedRpes = latest.log.sets.map((s) => s.rpe).filter((r): r is number => typeof r === 'number');
  const avgRpe = reportedRpes.length > 0 ? reportedRpes.reduce((a, b) => a + b, 0) / reportedRpes.length : null;
  if (plannedTopRpe && avgRpe !== null && avgRpe >= plannedTopRpe + 1) {
    return {
      exerciseId,
      action: 'reduce_load',
      loadChangePct: -5,
      messageHe:
        `ב${name} דירגת מאמץ ממוצע של ${avgRpe.toFixed(1)} כשהמתוכנן היה עד ${plannedTopRpe}. ` +
        'נוריד כ-5% כדי להחזיר את הסטים לטווח המתוכנן. עבודה קרוב לכישלון בכל סט מצטברת לעייפות ' +
        'ולא בהכרח לתוצאה טובה יותר.',
      ruleId: 'plan.reassess_triggers',
      requiresApproval: false,
    };
  }

  // 4. פרוגרסיה כפולה - השלמת כל הסטים בקצה העליון של הטווח.
  const range = latest.prescription.repRange;
  const completedSets = latest.log.sets.filter((s) => !latest.log.skipped);
  if (range && completedSets.length >= latest.prescription.sets) {
    const allAtTop = completedSets.every((s) => (s.reps ?? 0) >= range[1]);
    const inIntensity = avgRpe === null || !plannedTopRpe || avgRpe <= plannedTopRpe;
    if (allAtTop && inIntensity) {
      const step = stepPctFor(exerciseId);
      return {
        exerciseId,
        action: 'increase_load',
        loadChangePct: step,
        messageHe:
          `השלמת את כל ${latest.prescription.sets} הסטים ב${name} עם ${range[1]} חזרות, בעצימות המתוכננת וללא כאב. ` +
          `זה הסימן להעלות עומס: נציע תוספת של כ-${step}% ונחזור לקצה התחתון של טווח החזרות. ` +
          getRule('plan.progression_double').statementHe,
        ruleId: 'plan.progression_double',
        requiresApproval: false,
      };
    }
    const anyBelowBottom = completedSets.some((s) => (s.reps ?? 0) < range[0]);
    if (anyBelowBottom) {
      return {
        exerciseId,
        action: 'hold',
        loadChangePct: null,
        messageHe:
          `ב${name} עוד לא השלמת את הקצה התחתון של טווח החזרות בכל הסטים, ולכן נשארים על אותו עומס. ` +
          'אין שום בעיה בכך - עוד אימון או שניים באותו משקל זה בדיוק מה שבונה את הבסיס.',
        ruleId: 'plan.progression_double',
        requiresApproval: false,
      };
    }
  }

  // 5. התקדמות בחזרות בתרגילי זמן / משקל גוף
  if (latest.prescription.durationSec) {
    return {
      exerciseId,
      action: 'increase_reps',
      loadChangePct: null,
      messageHe:
        `ב${name} נתקדם בזמן ולא במשקל: נוסיף 5-10 שניות לסט כשהזמן הנוכחי נוח ובטכניקה שמורה.`,
      ruleId: 'plan.progression_double',
      requiresApproval: false,
    };
  }

  return {
    exerciseId,
    action: 'hold',
    loadChangePct: null,
    messageHe: `ב${name} נשארים על אותו עומס לאימון הבא ונראה איך מרגיש.`,
    ruleId: 'plan.progression_double',
    requiresApproval: false,
  };
}

function totalVolume(entry: ExerciseHistoryEntry): number {
  return entry.log.sets.reduce((sum, s) => {
    if (typeof s.weightKg === 'number' && typeof s.reps === 'number') return sum + s.weightKg * s.reps;
    if (typeof s.reps === 'number') return sum + s.reps;
    if (typeof s.durationSec === 'number') return sum + s.durationSec / 3;
    return sum;
  }, 0);
}

/** סיכום אימון והשוואה לאימון הקודם של אותו יום בתוכנית. */
export function summarizeSession(
  session: WorkoutSession,
  previous: WorkoutSession | null,
): {
  totalSets: number;
  totalVolumeKg: number;
  durationMinutes: number;
  comparisonHe: string;
  painReported: boolean;
} {
  const totalSets = session.logs.reduce((n, l) => n + l.sets.length, 0);
  const totalVolumeKg = session.logs.reduce(
    (sum, l) => sum + l.sets.reduce((s, set) => s + (set.weightKg ?? 0) * (set.reps ?? 0), 0),
    0,
  );
  const end = session.completedAt ? new Date(session.completedAt) : new Date(session.updatedAt);
  const durationMinutes = Math.max(1, Math.round((end.getTime() - new Date(session.startedAt).getTime()) / 60000));
  const painReported = session.logs.some((l) => l.sets.some((s) => s.painReported));

  let comparisonHe: string;
  if (!previous) {
    comparisonHe =
      'זה האימון הראשון שלך מהסוג הזה, אז אין עוד מה להשוות. מהאימון הבא נראה כאן את ההתקדמות.';
  } else {
    const prevVolume = previous.logs.reduce(
      (sum, l) => sum + l.sets.reduce((s, set) => s + (set.weightKg ?? 0) * (set.reps ?? 0), 0),
      0,
    );
    if (prevVolume === 0 && totalVolumeKg === 0) {
      const prevSets = previous.logs.reduce((n, l) => n + l.sets.length, 0);
      comparisonHe = `השלמת ${totalSets} סטים, לעומת ${prevSets} באימון הקודם.`;
    } else {
      const diff = totalVolumeKg - prevVolume;
      const pct = prevVolume > 0 ? (diff / prevVolume) * 100 : 0;
      comparisonHe =
        diff > 0
          ? `נפח העבודה עלה בכ-${Math.abs(Math.round(pct))}% לעומת האימון הקודם (${Math.round(totalVolumeKg)} ק"ג מול ${Math.round(prevVolume)} ק"ג).`
          : diff < 0
            ? `נפח העבודה ירד בכ-${Math.abs(Math.round(pct))}% לעומת האימון הקודם. ירידה באימון בודד היא דבר נורמלי ומושפעת משינה, אכילה ולחץ.`
            : 'נפח העבודה זהה לאימון הקודם.';
    }
  }
  if (painReported) {
    comparisonHe += ' דיווחת על כאב באימון הזה - נתייחס לכך בעדכון התוכנית ולא נעלה עומס.';
  }
  return { totalSets, totalVolumeKg: Math.round(totalVolumeKg), durationMinutes, comparisonHe, painReported };
}

/** ניתוח מגמה למדידות - בלי להסיק שינוי בשומן מתנודה בודדת. */
export function analyzeWeightTrend(points: Array<{ takenAt: string; weightKg?: number }>): {
  trendHe: string;
  movingAverage: Array<{ date: string; value: number }>;
} {
  const series = points
    .filter((p): p is { takenAt: string; weightKg: number } => typeof p.weightKg === 'number')
    .sort((a, b) => a.takenAt.localeCompare(b.takenAt));

  const window = 7;
  const movingAverage: Array<{ date: string; value: number }> = [];
  for (let i = 0; i < series.length; i++) {
    const slice = series.slice(Math.max(0, i - window + 1), i + 1);
    const avg = slice.reduce((s, p) => s + p.weightKg, 0) / slice.length;
    movingAverage.push({ date: series[i]!.takenAt.slice(0, 10), value: Math.round(avg * 10) / 10 });
  }

  if (series.length < 4) {
    return {
      trendHe:
        'יש מעט מדי מדידות כדי לדבר על מגמה. משקל הגוף זז בקילוגרמים בודדים בגלל מים, מלח, סיבים ושעת המדידה, ' +
        'ולכן מדידה אחת לא אומרת כמעט כלום. נחכה ל-2-3 שבועות של מדידות.',
      movingAverage,
    };
  }

  const first = movingAverage[0]!.value;
  const last = movingAverage[movingAverage.length - 1]!.value;
  const delta = last - first;
  const direction = Math.abs(delta) < 0.4 ? 'יציב' : delta > 0 ? 'עולה' : 'יורד';
  return {
    trendHe:
      `הממוצע הנע מראה מגמה ${direction} (${first} ק"ג → ${last} ק"ג). ` +
      'שימו לב: המגמה היא מה שחשוב, לא מדידה בודדת. שינוי במשקל אינו זהה לשינוי בשומן - ' +
      'גם מסת שריר, מים וגליקוגן נעים בתוך המספר הזה. ההיקפים והביצועים הם מדדים משלימים חשובים.',
    movingAverage,
  };
}
