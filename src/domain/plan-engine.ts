// מנוע בניית תוכנית האימונים.
//
// זהו מנוע כללים דטרמיניסטי: אותו פרופיל מייצר את אותה תוכנית.
// אין כאן קריאות רשת ואין תלות ב-AI. שכבת ה-AI מנסחת הסברים על בסיס התוצר הזה בלבד.

import type {
  Equipment,
  Exercise,
  ExperienceLevel,
  IntensityPrescription,
  JointArea,
  MovementPattern,
  PlannedExercise,
  PlannedSet,
  PlannedWorkout,
  PlanRationale,
  PrimaryGoal,
  SafetyDecision,
  UserProfile,
  WeeklyPlan,
  WorkoutBlock,
} from './types.ts';
import { EXERCISES, getExercise, isAvailableWithEquipment, DEFAULT_EQUIPMENT_BY_LOCATION } from '../content/exercises.ts';
import { cappedMaxRpe, jointLabelHe } from './safety.ts';
import { findSubstitutes } from './substitution.ts';
import { getRule } from './sources.ts';

type WorkoutKind = 'full_body' | 'upper' | 'lower' | 'push' | 'pull' | 'legs' | 'conditioning';

const SLOTS: Record<WorkoutKind, MovementPattern[]> = {
  full_body: ['squat', 'horizontal_push', 'horizontal_pull', 'hinge', 'core_antiextension'],
  upper: ['horizontal_push', 'horizontal_pull', 'vertical_push', 'vertical_pull', 'arm_isolation', 'core_antirotation'],
  lower: ['squat', 'hinge', 'lunge', 'calf', 'core_antiextension'],
  push: ['horizontal_push', 'vertical_push', 'shoulder_isolation', 'arm_isolation', 'core_antiextension'],
  pull: ['vertical_pull', 'horizontal_pull', 'hinge', 'arm_isolation', 'core_antirotation'],
  legs: ['squat', 'hinge', 'lunge', 'calf', 'core_flexion'],
  conditioning: ['conditioning', 'core_antiextension'],
};

const KIND_TITLES_HE: Record<WorkoutKind, string> = {
  full_body: 'אימון כל הגוף',
  upper: 'פלג גוף עליון',
  lower: 'פלג גוף תחתון',
  push: 'דחיפה',
  pull: 'משיכה',
  legs: 'רגליים',
  conditioning: 'אירובי וליבה',
};

/** בחירת חלוקה לפי מספר אימונים בשבוע וניסיון. */
export function selectSplit(sessionsPerWeek: number, experience: ExperienceLevel): WorkoutKind[] {
  const n = Math.max(1, Math.min(6, Math.round(sessionsPerWeek)));
  if (experience === 'beginner') {
    // מתחיל: תדירות על דפוסי התנועה הבסיסיים עדיפה על פיצול מורכב.
    if (n <= 2) return Array(n).fill('full_body');
    if (n === 3) return ['full_body', 'full_body', 'full_body'];
    return ['full_body', 'lower', 'full_body', 'upper'].slice(0, n);
  }
  switch (n) {
    case 1:
      return ['full_body'];
    case 2:
      return ['upper', 'lower'];
    case 3:
      return ['full_body', 'upper', 'lower'];
    case 4:
      return ['upper', 'lower', 'upper', 'lower'];
    case 5:
      return ['upper', 'lower', 'push', 'pull', 'legs'];
    default:
      return ['push', 'pull', 'legs', 'push', 'pull', 'legs'];
  }
}

/** פריסת ימי האימון על פני השבוע, עם רווחי התאוששות. */
export function spreadDays(count: number): number[] {
  const layouts: Record<number, number[]> = {
    1: [0],
    2: [0, 3],
    3: [0, 2, 4],
    4: [0, 1, 3, 4],
    5: [0, 1, 2, 4, 5],
    6: [0, 1, 2, 3, 4, 5],
  };
  return layouts[Math.max(1, Math.min(6, count))] ?? [0];
}

type VolumeSpec = {
  sets: number;
  reps: [number, number];
  restSec: number;
  rir: [number, number];
};

function volumeForGoal(goal: PrimaryGoal, experience: ExperienceLevel): VolumeSpec {
  const base: Record<PrimaryGoal, VolumeSpec> = {
    strength: { sets: 4, reps: [4, 6], restSec: 180, rir: [2, 3] },
    muscle_gain: { sets: 4, reps: [8, 12], restSec: 90, rir: [1, 3] },
    weight_loss: { sets: 3, reps: [10, 15], restSec: 75, rir: [2, 3] },
    fat_loss_recomp: { sets: 3, reps: [8, 12], restSec: 75, rir: [1, 3] },
    endurance: { sets: 3, reps: [12, 20], restSec: 50, rir: [2, 4] },
    maintain: { sets: 3, reps: [8, 12], restSec: 75, rir: [2, 3] },
  };
  const spec = { ...base[goal] };
  if (experience === 'beginner') {
    spec.sets = Math.max(2, spec.sets - 1);
    spec.rir = [3, 4];
    // מתחיל לא מתחיל בטווח חזרות נמוך תחת עומס גבוה
    if (spec.reps[0] < 6) spec.reps = [6, 10];
    spec.restSec = Math.max(60, Math.min(spec.restSec, 120));
  } else if (experience === 'novice') {
    spec.rir = [2, 4];
  }
  return spec;
}

function intensityFor(spec: VolumeSpec, maxRpe: number): IntensityPrescription {
  const rpeLow = Math.min(maxRpe, 10 - spec.rir[1]);
  const rpeHigh = Math.min(maxRpe, 10 - spec.rir[0]);
  return {
    rpe: [rpeLow, rpeHigh],
    rir: spec.rir,
    explanationHe:
      `עצימות מטרה: RPE ${rpeLow}-${rpeHigh}, כלומר ${spec.rir[0]}-${spec.rir[1]} חזרות שהיית יכול לעשות ועצרת לפניהן (RIR). ` +
      'RPE הוא דירוג מאמץ מ-1 עד 10: ב-10 אי אפשר עוד חזרה אחת בטכניקה טובה. ' +
      'אם סיימת סט והרגשת שיש עוד הרבה בפנים - המשקל קל מדי; אם הטכניקה נשברה - כבד מדי.',
  };
}

const STARTING_LOAD_GUIDANCE_HE =
  'בחירת משקל פתיחה: קחו משקל שבו אתם משלימים את הקצה התחתון של טווח החזרות בטכניקה נקייה, ' +
  'ובסיום הסט מרגישים שנשארו 2-3 חזרות בפנים. אם השלמתם את הקצה העליון בקלות - העלו בסט הבא. ' +
  'אם לא הגעתם לקצה התחתון או שהטכניקה השתנתה - הורידו. אין לגזור משקל עבודה ממשקל הגוף.';

function estimateExerciseMinutes(p: PlannedSet, timeBased: boolean): number {
  const workSec = timeBased
    ? (p.durationSec ?? 40) * p.sets
    : ((p.repRange?.[1] ?? 10) * 3.5) * p.sets;
  const restSec = p.restSec * Math.max(0, p.sets - 1);
  return (workSec + restSec + 40) / 60; // 40 שניות מעבר והתארגנות
}

export type PlanInput = {
  profile: UserProfile;
  safety: SafetyDecision;
  version?: number;
};

export function buildWeeklyPlan(input: PlanInput): WeeklyPlan {
  const { profile, safety } = input;
  const appliedRuleIds: string[] = [];
  const notes: string[] = [];

  if (!safety.allowTrainingPlan) {
    throw new Error('מנוע הבטיחות חסם יצירת תוכנית אימונים. יש להציג את ההודעות מ-SafetyDecision.');
  }

  // --- ניסיון אפקטיבי: יעד שאפתני אינו מעלה את רמת הניסיון ---
  const effectiveExperience = profile.experience;
  if (profile.experience === 'beginner') {
    appliedRuleIds.push('safety.max_rpe_beginner', 'plan.beginner_rampup');
    notes.push(
      'התוכנית נבנתה כתוכנית למתחיל: פחות סטים, טווח חזרות בינוני ועצימות מרוסנת. ' +
        'גם אם היעד שלך שאפתני, התחלה מתקדמת מדי היא הדרך המהירה לפציעה ולנשירה. ' +
        'ההתקדמות תתווסף לפי הביצוע שלך בפועל.',
    );
  }

  const maxRpe = cappedMaxRpe(effectiveExperience, safety);
  const equipment: Equipment[] =
    profile.equipment.length > 0 ? profile.equipment : DEFAULT_EQUIPMENT_BY_LOCATION[profile.location];
  const sensitiveAreas: JointArea[] = profile.limitations
    .filter((l) => l.severity === 'moderate' || l.severity === 'severe')
    .map((l) => l.area);
  const severeAreas: JointArea[] = profile.limitations.filter((l) => l.severity === 'severe').map((l) => l.area);

  const split = selectSplit(profile.sessionsPerWeek, effectiveExperience);
  const days = spreadDays(split.length);
  const spec = volumeForGoal(profile.primaryGoal, effectiveExperience);

  if (safety.forbiddenPatterns.length > 0) {
    appliedRuleIds.push('safety.active_injury_area');
  }

  // --- יעד אירובי ---
  const aerobicRule = getRule('plan.aerobic_target_who');
  appliedRuleIds.push('plan.aerobic_target_who', 'plan.strength_days_who');
  const aerobicTarget =
    profile.primaryGoal === 'endurance' ? 300 : profile.primaryGoal === 'weight_loss' ? 250 : 150;
  const aerobicPrescribed =
    effectiveExperience === 'beginner' ? Math.round(aerobicTarget * 0.4) : Math.round(aerobicTarget * 0.7);
  notes.push(
    `יעד הפעילות האירובית: ${aerobicRule.statementHe} בשבוע הראשון נתחיל מ-${aerobicPrescribed} דקות ` +
      `ונתקדם בהדרגה לכיוון ${aerobicTarget} דקות, לפי ההתמדה וההרגשה.`,
  );

  const perSessionAerobic = Math.round(aerobicPrescribed / split.length);

  const workouts: PlannedWorkout[] = split.map((kind, i) => {
    const used = new Set<string>();
    const mainExercises: PlannedExercise[] = [];
    let order = 1;
    let minutesUsed = 0;
    const warmupMinutes = 6;
    const cooldownMinutes = 4;
    const aerobicMinutes = perSessionAerobic > 0 ? Math.min(perSessionAerobic, 25) : 0;
    const budget = profile.minutesPerSession - warmupMinutes - cooldownMinutes - aerobicMinutes;

    for (const pattern of SLOTS[kind]) {
      if (safety.forbiddenPatterns.includes(pattern)) {
        notes.push(
          `דילגנו על דפוס "${pattern}" ב${KIND_TITLES_HE[kind]} בגלל המגבלה שסימנת, ולא החלפנו אותו בעומס דומה על אותו אזור.`,
        );
        continue;
      }
      const chosen = pickExerciseForPattern(pattern, {
        equipment,
        safety,
        sensitiveAreas,
        severeAreas,
        liked: profile.likedExerciseIds,
        avoided: profile.avoidedExerciseIds,
        experience: effectiveExperience,
        used,
      });
      if (!chosen) continue;

      const prescription = buildPrescription(chosen, spec, maxRpe);
      const minutes = estimateExerciseMinutes(prescription, chosen.timeBased);
      if (minutesUsed + minutes > budget && mainExercises.length >= 3) break;
      minutesUsed += minutes;
      used.add(chosen.id);

      const alternatives = findSubstitutes(
        chosen.id,
        { equipment, safety, sensitiveAreas, avoidedExerciseIds: profile.avoidedExerciseIds },
        3,
      ).map((s) => s.exercise.id);

      mainExercises.push({
        order: order++,
        exerciseId: chosen.id,
        prescription,
        alternativeExerciseIds: alternatives,
        noteHe: noteForExercise(chosen, sensitiveAreas),
      });
    }

    const blocks: WorkoutBlock[] = [
      { kind: 'warmup', titleHe: 'חימום', exercises: buildWarmup(kind, equipment, safety, maxRpe) },
      { kind: 'main', titleHe: 'חלק עיקרי', exercises: mainExercises },
    ];

    if (aerobicMinutes > 0) {
      const cardio = pickConditioning(equipment, safety, sensitiveAreas);
      if (cardio) {
        blocks.push({
          kind: 'conditioning',
          titleHe: 'אירובי',
          exercises: [
            {
              order: 1,
              exerciseId: cardio.id,
              prescription: {
                sets: 1,
                durationSec: aerobicMinutes * 60,
                restSec: 0,
                intensity: {
                  rpe: [Math.min(4, maxRpe), Math.min(6, maxRpe)],
                  explanationHe:
                    'עצימות מתונה: אפשר לדבר במשפטים אבל לא לשיר. זו העצימות שמצטברת לכמות הפעילות השבועית המומלצת.',
                },
                startingLoadGuidanceHe: 'התחילו בקצב נוח; עדיף לסיים את הזמן המלא מאשר להתחיל חזק ולעצור.',
              },
              alternativeExerciseIds: ['brisk_walk', 'stationary_bike'].filter((id) => id !== cardio.id),
            },
          ],
        });
      }
    }

    blocks.push({
      kind: 'cooldown',
      titleHe: 'סיום הדרגתי',
      exercises: buildCooldown(kind, maxRpe),
    });

    const estimated =
      warmupMinutes +
      cooldownMinutes +
      aerobicMinutes +
      Math.round(mainExercises.reduce((sum, e) => sum + estimateExerciseMinutes(e.prescription, false), 0));

    return {
      dayIndex: days[i] ?? i,
      titleHe: KIND_TITLES_HE[kind],
      goalHe: goalTextForKind(kind, profile.primaryGoal),
      estimatedMinutes: Math.min(estimated, profile.minutesPerSession + 5),
      blocks,
    };
  });

  const rationale: PlanRationale = {
    primaryGoal: profile.primaryGoal,
    effectiveExperience,
    sessionsPerWeek: split.length,
    minutesPerSession: profile.minutesPerSession,
    split: split.map((k) => KIND_TITLES_HE[k]).join(' · '),
    limitationsApplied: profile.limitations.map((l) => `${jointLabelHe(l.area)} (${l.severity})`),
    equipmentApplied: equipment,
    summaryHe:
      `${split.length} אימונים בשבוע של עד ${profile.minutesPerSession} דקות, בחלוקה: ` +
      `${split.map((k) => KIND_TITLES_HE[k]).join(', ')}. ` +
      `הנפח והעצימות נקבעו לפי היעד "${goalLabelHe(profile.primaryGoal)}" ולפי רמת ניסיון "${experienceLabelHe(effectiveExperience)}", ` +
      `עם תקרת עצימות RPE ${maxRpe}. ` +
      (profile.limitations.length > 0
        ? `בחירת התרגילים סוננה לפי המגבלות שסימנת (${profile.limitations.map((l) => jointLabelHe(l.area)).join(', ')}).`
        : 'לא סימנת מגבלות שמחייבות סינון תרגילים.'),
  };

  return {
    id: crypto.randomUUID(),
    userId: profile.userId,
    version: input.version ?? 1,
    createdAt: new Date().toISOString(),
    status: 'active',
    rationale,
    workouts,
    weeklyAerobicMinutesTarget: aerobicTarget,
    weeklyAerobicMinutesPrescribed: aerobicPrescribed,
    notesHe: [...new Set(notes)],
    appliedRuleIds: [...new Set(appliedRuleIds)],
  };
}

type PickContext = {
  equipment: Equipment[];
  safety: SafetyDecision;
  /** אזורים עם מגבלה בינונית או חמורה - קנס בבחירה. */
  sensitiveAreas: JointArea[];
  /** אזורים עם מגבלה חמורה - חסימה מוחלטת, גם כעומס משני. */
  severeAreas: JointArea[];
  liked: string[];
  avoided: string[];
  experience: ExperienceLevel;
  used: Set<string>;
};

function pickExerciseForPattern(pattern: MovementPattern, ctx: PickContext): Exercise | null {
  const difficultyCap: Record<ExperienceLevel, number> = { beginner: 1, novice: 2, intermediate: 3, advanced: 3 };
  const order = { easy: 1, moderate: 2, hard: 3 };

  const candidates = EXERCISES.filter((ex) => {
    if (ex.pattern !== pattern) return false;
    if (ctx.used.has(ex.id)) return false;
    if (ctx.avoided.includes(ex.id)) return false;
    if (ctx.safety.forbiddenExerciseIds.includes(ex.id)) return false;
    if (!isAvailableWithEquipment(ex, ctx.equipment)) return false;
    if (order[ex.difficulty] > difficultyCap[ctx.experience]) return false;
    // מגבלה חמורה חוסמת גם עומס משני על אותו אזור, לא רק את דפוס התנועה העיקרי.
    if (ex.loadsJoints.some((j) => ctx.severeAreas.includes(j))) return false;
    return true;
  });

  if (candidates.length === 0) {
    // ניסיון שני: מרשים קושי גבוה יותר למי שאין לו ציוד מתאים בקושי הנמוך
    const relaxed = EXERCISES.filter(
      (ex) =>
        ex.pattern === pattern &&
        !ctx.used.has(ex.id) &&
        !ctx.avoided.includes(ex.id) &&
        !ctx.safety.forbiddenExerciseIds.includes(ex.id) &&
        !ex.loadsJoints.some((j) => ctx.severeAreas.includes(j)) &&
        isAvailableWithEquipment(ex, ctx.equipment),
    );
    if (relaxed.length === 0) return null;
    return relaxed.sort((a, b) => order[a.difficulty] - order[b.difficulty])[0] ?? null;
  }

  const scored = candidates.map((ex) => {
    let score = 0;
    if (ctx.liked.includes(ex.id)) score += 50;
    for (const area of ctx.sensitiveAreas) if (ex.loadsJoints.includes(area)) score -= 35;
    // העדפת תרגילים בסיסיים למתחיל
    if (ctx.experience === 'beginner' && ex.difficulty === 'easy') score += 15;
    if (ex.equipment.includes('machines') && ctx.sensitiveAreas.length > 0) score += 8;
    score -= order[ex.difficulty] * 2;
    return { ex, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.ex ?? null;
}

function buildPrescription(ex: Exercise, spec: VolumeSpec, maxRpe: number): PlannedSet {
  if (ex.timeBased) {
    const durationSec = ex.pattern === 'carry' ? 40 : 30;
    return {
      sets: spec.sets,
      durationSec,
      restSec: Math.max(45, spec.restSec - 15),
      intensity: intensityFor(spec, maxRpe),
      startingLoadGuidanceHe:
        'בתרגיל שנמדד בזמן: בחרו זמן או משקל שבו אתם שומרים על טכניקה עד השנייה האחרונה. ' +
        'אם הטכניקה נשברת לפני סוף הזמן - קצרו את הזמן ולא את הטכניקה.',
    };
  }
  return {
    sets: spec.sets,
    repRange: spec.reps,
    restSec: spec.restSec,
    intensity: intensityFor(spec, maxRpe),
    startingLoadGuidanceHe: STARTING_LOAD_GUIDANCE_HE,
  };
}

function noteForExercise(ex: Exercise, sensitiveAreas: JointArea[]): string | undefined {
  const overlap = ex.loadsJoints.filter((j) => sensitiveAreas.includes(j));
  if (overlap.length === 0) return undefined;
  return (
    `התרגיל מעמיס גם את ${overlap.map(jointLabelHe).join(' ו')}, שסימנת כרגיש. ` +
    'התחילו בעומס נמוך מהרגיל, ואם מופיע כאב - עברו לחלופה שמוצעת כאן.'
  );
}

function buildWarmup(
  kind: WorkoutKind,
  equipment: Equipment[],
  safety: SafetyDecision,
  maxRpe: number,
): PlannedExercise[] {
  const ids = ['light_cardio_warmup'];
  if (kind === 'lower' || kind === 'legs' || kind === 'full_body') ids.push('glute_bridge_warmup', 'ankle_mobility');
  if (kind === 'upper' || kind === 'push' || kind === 'pull' || kind === 'full_body') ids.push('arm_circles', 'cat_camel');
  return ids
    .map((id) => getExercise(id))
    .filter((ex): ex is Exercise => Boolean(ex))
    .filter((ex) => !safety.forbiddenPatterns.includes(ex.pattern))
    .map((ex, i) => ({
      order: i + 1,
      exerciseId: ex.id,
      prescription: {
        sets: 1,
        durationSec: ex.timeBased ? 60 : undefined,
        repRange: ex.timeBased ? undefined : ([8, 12] as [number, number]),
        restSec: 0,
        intensity: {
          rpe: [2, Math.min(4, maxRpe)],
          explanationHe: 'חימום בעצימות קלה. המטרה היא להעלות חום גוף וטווחי תנועה, לא ליצור מאמץ.',
        },
        startingLoadGuidanceHe: 'ללא עומס או בעומס קל מאוד.',
      },
      alternativeExerciseIds: [],
    }));
}

function buildCooldown(kind: WorkoutKind, maxRpe: number): PlannedExercise[] {
  const ids = kind === 'lower' || kind === 'legs' ? ['hip_flexor_stretch', 'cat_camel'] : ['thoracic_rotation', 'cat_camel'];
  return ids
    .map((id) => getExercise(id))
    .filter((ex): ex is Exercise => Boolean(ex))
    .map((ex, i) => ({
      order: i + 1,
      exerciseId: ex.id,
      prescription: {
        sets: 1,
        durationSec: 45,
        restSec: 0,
        intensity: {
          rpe: [1, Math.min(3, maxRpe)],
          explanationHe: 'סיום הדרגתי: הורדת דופק ומתיחות נוחות. לא נמתחים עד כאב.',
        },
        startingLoadGuidanceHe: 'ללא עומס.',
      },
      alternativeExerciseIds: [],
    }));
}

function pickConditioning(equipment: Equipment[], safety: SafetyDecision, sensitiveAreas: JointArea[]): Exercise | null {
  const candidates = EXERCISES.filter(
    (ex) =>
      ex.pattern === 'conditioning' &&
      isAvailableWithEquipment(ex, equipment) &&
      !safety.forbiddenPatterns.includes(ex.pattern),
  );
  const scored = candidates.map((ex) => {
    let score = ex.difficulty === 'easy' ? 10 : 0;
    for (const a of sensitiveAreas) if (ex.loadsJoints.includes(a)) score -= 20;
    return { ex, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.ex ?? null;
}

function goalTextForKind(kind: WorkoutKind, goal: PrimaryGoal): string {
  const goalText: Record<PrimaryGoal, string> = {
    weight_loss: 'שמירה על מסת שריר תוך הוצאת אנרגיה',
    fat_loss_recomp: 'שיפור הרכב הגוף',
    muscle_gain: 'גירוי לבניית מסת שריר',
    strength: 'שיפור כוח בדפוסי התנועה המרכזיים',
    endurance: 'שיפור סיבולת לב-ריאה ושרירית',
    maintain: 'שמירה על כושר ועל יכולת תנועה',
  };
  return `${KIND_TITLES_HE[kind]} - ${goalText[goal]}.`;
}

export function goalLabelHe(goal: PrimaryGoal): string {
  const map: Record<PrimaryGoal, string> = {
    weight_loss: 'ירידה במשקל',
    fat_loss_recomp: 'הפחתת שומן וחיטוב',
    muscle_gain: 'בניית מסת שריר',
    strength: 'שיפור כוח',
    endurance: 'שיפור סיבולת',
    maintain: 'שמירה על כושר',
  };
  return map[goal];
}

export function experienceLabelHe(level: ExperienceLevel): string {
  const map: Record<ExperienceLevel, string> = {
    beginner: 'מתחיל',
    novice: 'מתחיל מתקדם',
    intermediate: 'בינוני',
    advanced: 'מתקדם',
  };
  return map[level];
}

/** השוואת גרסאות תוכנית - מה השתנה ולמה. */
export function diffPlans(from: WeeklyPlan, to: WeeklyPlan) {
  const changes: Array<{
    kind: 'added' | 'removed' | 'changed';
    scope: 'workout' | 'exercise' | 'volume' | 'intensity' | 'aerobic';
    descriptionHe: string;
    reasonHe: string;
    ruleId?: string;
  }> = [];

  if (from.workouts.length !== to.workouts.length) {
    changes.push({
      kind: 'changed',
      scope: 'workout',
      descriptionHe: `מספר האימונים בשבוע שונה מ-${from.workouts.length} ל-${to.workouts.length}.`,
      reasonHe: 'שינוי בזמינות שהוזנה בפרופיל או התאמה לאחר הערכה מחדש.',
    });
  }

  const fromIds = new Set(collectExerciseIds(from));
  const toIds = new Set(collectExerciseIds(to));
  for (const id of toIds) {
    if (!fromIds.has(id)) {
      changes.push({
        kind: 'added',
        scope: 'exercise',
        descriptionHe: `נוסף תרגיל: ${getExercise(id)?.nameHe ?? id}.`,
        reasonHe: 'התאמה לציוד, למגבלות או להעדפות שהתעדכנו.',
      });
    }
  }
  for (const id of fromIds) {
    if (!toIds.has(id)) {
      changes.push({
        kind: 'removed',
        scope: 'exercise',
        descriptionHe: `הוסר תרגיל: ${getExercise(id)?.nameHe ?? id}.`,
        reasonHe: 'סינון לפי מגבלה, ציוד שאינו זמין או בקשה להימנע מהתרגיל.',
      });
    }
  }

  if (from.weeklyAerobicMinutesPrescribed !== to.weeklyAerobicMinutesPrescribed) {
    changes.push({
      kind: 'changed',
      scope: 'aerobic',
      descriptionHe: `דקות אירובי בשבוע: ${from.weeklyAerobicMinutesPrescribed} → ${to.weeklyAerobicMinutesPrescribed}.`,
      reasonHe: 'התקדמות הדרגתית לכיוון יעד הפעילות השבועי.',
      ruleId: 'plan.aerobic_target_who',
    });
  }

  // שינוי מהותי = שינוי בכמות האימונים או הסרה/הוספה של 3 תרגילים ומעלה
  const structural =
    from.workouts.length !== to.workouts.length ||
    changes.filter((c) => c.scope === 'exercise').length >= 3;

  return {
    fromVersion: from.version,
    toVersion: to.version,
    changes,
    requiresApproval: structural,
  };
}

function collectExerciseIds(plan: WeeklyPlan): string[] {
  const ids: string[] = [];
  for (const w of plan.workouts) {
    for (const b of w.blocks) {
      if (b.kind === 'main') for (const e of b.exercises) ids.push(e.exerciseId);
    }
  }
  return ids;
}
