// מנוע החלפת תרגילים.
// החלפה מתחשבת בדפוס התנועה, בציוד הזמין ובמגבלות - לא רק בשריר.

import type { Equipment, Exercise, JointArea, MovementPattern, SafetyDecision } from './types.ts';
import { EXERCISES, getExercise, isAvailableWithEquipment } from '../content/exercises.ts';

/** דפוסים שנחשבים חלופה סבירה זה לזה כשהדפוס המקורי חסום או לא אפשרי. */
const PATTERN_FALLBACKS: Record<MovementPattern, MovementPattern[]> = {
  squat: ['lunge', 'hinge'],
  hinge: ['squat', 'hip_isolation'],
  lunge: ['squat', 'hip_isolation'],
  horizontal_push: ['vertical_push'],
  vertical_push: ['horizontal_push'],
  horizontal_pull: ['vertical_pull'],
  vertical_pull: ['horizontal_pull'],
  core_antiextension: ['core_antirotation'],
  core_antirotation: ['core_antiextension'],
  core_flexion: ['core_antiextension'],
  carry: ['core_antirotation'],
  calf: ['conditioning'],
  arm_isolation: [],
  shoulder_isolation: ['horizontal_pull'],
  hip_isolation: ['hinge'],
  conditioning: [],
  mobility: [],
};

export type SubstitutionContext = {
  equipment: Equipment[];
  safety: SafetyDecision;
  /** אזורים שבהם למשתמש יש מגבלה בינונית - נעדיף חלופות שלא מעמיסות אותם. */
  sensitiveAreas: JointArea[];
  avoidedExerciseIds: string[];
};

function isEligible(ex: Exercise, ctx: SubstitutionContext, excludeId: string): boolean {
  if (ex.id === excludeId) return false;
  if (ctx.safety.forbiddenPatterns.includes(ex.pattern)) return false;
  if (ctx.safety.forbiddenExerciseIds.includes(ex.id)) return false;
  if (ctx.avoidedExerciseIds.includes(ex.id)) return false;
  if (!isAvailableWithEquipment(ex, ctx.equipment)) return false;
  return true;
}

function scoreCandidate(original: Exercise, candidate: Exercise, ctx: SubstitutionContext): number {
  let score = 0;
  // אותו דפוס תנועה - השיקול החזק ביותר.
  if (candidate.pattern === original.pattern) score += 100;
  else if (PATTERN_FALLBACKS[original.pattern]?.includes(candidate.pattern)) score += 45;
  // חפיפת שרירים עיקריים.
  const sharedPrimary = candidate.primaryMuscles.filter((m) => original.primaryMuscles.includes(m)).length;
  score += sharedPrimary * 18;
  const sharedSecondary = candidate.secondaryMuscles.filter((m) => original.secondaryMuscles.includes(m)).length;
  score += sharedSecondary * 4;
  // סוג המדידה (זמן/חזרות) - חשוב כדי לא לשבור את מרשם הסטים.
  if (candidate.timeBased === original.timeBased) score += 12;
  if (candidate.unilateral === original.unilateral) score += 6;
  // קושי דומה.
  const order = { easy: 0, moderate: 1, hard: 2 };
  score -= Math.abs(order[candidate.difficulty] - order[original.difficulty]) * 10;
  // קנס על עומס באזור רגיש.
  for (const area of ctx.sensitiveAreas) {
    if (candidate.loadsJoints.includes(area)) score -= 30;
  }
  // עדיפות קטנה לתרגיל שאינו דורש ציוד נדיר.
  if (candidate.equipment.includes('bodyweight')) score += 3;
  return score;
}

/** מחזיר חלופות מדורגות לתרגיל נתון. */
export function findSubstitutes(
  exerciseId: string,
  ctx: SubstitutionContext,
  limit = 3,
): Array<{ exercise: Exercise; score: number; reasonHe: string }> {
  const original = getExercise(exerciseId);
  if (!original) return [];
  return EXERCISES.filter((ex) => isEligible(ex, ctx, exerciseId))
    .map((ex) => ({ exercise: ex, score: scoreCandidate(original, ex, ctx) }))
    .filter((c) => c.score > 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((c) => ({
      ...c,
      reasonHe: buildReason(original, c.exercise, ctx),
    }));
}

function buildReason(original: Exercise, candidate: Exercise, ctx: SubstitutionContext): string {
  const parts: string[] = [];
  if (candidate.pattern === original.pattern) {
    parts.push('אותו דפוס תנועה');
  } else {
    parts.push(`דפוס תנועה קרוב במקום ${original.nameHe}`);
  }
  const shared = candidate.primaryMuscles.filter((m) => original.primaryMuscles.includes(m));
  if (shared.length > 0) parts.push('עובד על אותן קבוצות שרירים עיקריות');
  const relieved = ctx.sensitiveAreas.filter(
    (a) => original.loadsJoints.includes(a) && !candidate.loadsJoints.includes(a),
  );
  if (relieved.length > 0) parts.push('מפחית עומס על האזור שסימנת כרגיש');
  if (candidate.equipment.includes('bodyweight') && !original.equipment.includes('bodyweight')) {
    parts.push('לא דורש ציוד');
  }
  return parts.join(', ') + '.';
}

/** חלופה אוטומטית לשימוש בזמן אימון - מחזירה את המועמד הטוב ביותר. */
export function autoSubstitute(exerciseId: string, ctx: SubstitutionContext): Exercise | null {
  const subs = findSubstitutes(exerciseId, ctx, 1);
  return subs.length > 0 ? subs[0]!.exercise : null;
}
