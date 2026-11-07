// ספריית התרגילים המאוחדת + שאילתות סינון.
import type { Difficulty, Equipment, Exercise, MovementPattern, MuscleGroup } from '../domain/types.ts';
import { LOWER_BODY_EXERCISES } from './exercises-lower.ts';
import { UPPER_BODY_EXERCISES } from './exercises-upper.ts';
import { CORE_CARDIO_EXERCISES } from './exercises-core-cardio.ts';

export const EXERCISES: Exercise[] = [
  ...LOWER_BODY_EXERCISES,
  ...UPPER_BODY_EXERCISES,
  ...CORE_CARDIO_EXERCISES,
];

const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));

export function getExercise(id: string): Exercise | undefined {
  return BY_ID.get(id);
}

export function requireExercise(id: string): Exercise {
  const ex = BY_ID.get(id);
  if (!ex) throw new Error(`תרגיל לא קיים בספרייה: ${id}`);
  return ex;
}

export type ExerciseFilter = {
  pattern?: MovementPattern;
  muscle?: MuscleGroup;
  equipment?: Equipment[];
  difficulty?: Difficulty;
  search?: string;
  /** דפוסי תנועה אסורים לפי מנוע הבטיחות. */
  excludePatterns?: MovementPattern[];
  excludeIds?: string[];
};

/** האם התרגיל מתבצע עם הציוד הזמין (צריך שלפחות אפשרות ציוד אחת תהיה זמינה). */
export function isAvailableWithEquipment(ex: Exercise, available: Equipment[]): boolean {
  if (ex.equipment.length === 0) return true;
  return ex.equipment.some((eq) => available.includes(eq));
}

export function filterExercises(filter: ExerciseFilter): Exercise[] {
  const q = filter.search?.trim().toLowerCase();
  return EXERCISES.filter((ex) => {
    if (filter.pattern && ex.pattern !== filter.pattern) return false;
    if (filter.muscle && !ex.primaryMuscles.includes(filter.muscle) && !ex.secondaryMuscles.includes(filter.muscle))
      return false;
    if (filter.difficulty && ex.difficulty !== filter.difficulty) return false;
    if (filter.equipment && filter.equipment.length > 0 && !isAvailableWithEquipment(ex, filter.equipment)) return false;
    if (filter.excludePatterns?.includes(ex.pattern)) return false;
    if (filter.excludeIds?.includes(ex.id)) return false;
    if (q) {
      const hay = `${ex.nameHe} ${ex.nameEn}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** ציוד שזמין כברירת מחדל לפי מקום האימון. המשתמש יכול לצמצם או להרחיב. */
export const DEFAULT_EQUIPMENT_BY_LOCATION: Record<'home' | 'gym' | 'outdoor', Equipment[]> = {
  home: ['bodyweight', 'mat'],
  gym: [
    'bodyweight',
    'dumbbells',
    'barbell',
    'kettlebell',
    'bench',
    'machines',
    'cables',
    'pullup_bar',
    'cardio_machine',
    'mat',
    'step',
  ],
  outdoor: ['bodyweight', 'pullup_bar', 'jump_rope'],
};

export const EQUIPMENT_LABELS_HE: Record<Equipment, string> = {
  bodyweight: 'משקל גוף',
  dumbbells: 'משקולות יד',
  barbell: 'מוט',
  kettlebell: 'קטלבל',
  resistance_band: 'גומיות התנגדות',
  pullup_bar: 'מתח',
  bench: 'ספסל',
  machines: 'מכונות',
  cables: 'כבלים',
  trx: 'TRX',
  jump_rope: 'חבל קפיצה',
  cardio_machine: 'מכשיר אירובי',
  mat: 'מזרן',
  step: 'מדרגה',
};

export const MUSCLE_LABELS_HE: Record<MuscleGroup, string> = {
  quads: 'ארבע ראשי',
  hamstrings: 'ירך אחורית',
  glutes: 'ישבן',
  calves: 'תאומים',
  chest: 'חזה',
  back: 'גב',
  lats: 'גב רחב',
  traps: 'טרפז',
  shoulders: 'כתפיים',
  biceps: 'דו ראשי',
  triceps: 'תלת ראשי',
  core: 'ליבה',
  forearms: 'אמות',
  hip_flexors: 'כופפי ירך',
  adductors: 'מקרבי ירך',
  full_body: 'כל הגוף',
  cardiovascular: 'מערכת לב-ריאה',
};

export const PATTERN_LABELS_HE: Record<MovementPattern, string> = {
  squat: 'כפיפת רגליים',
  hinge: 'תנועת אגן',
  lunge: 'מספריים',
  horizontal_push: 'דחיפה אופקית',
  vertical_push: 'דחיפה אנכית',
  horizontal_pull: 'משיכה אופקית',
  vertical_pull: 'משיכה אנכית',
  core_antiextension: 'ליבה - התנגדות ליישור',
  core_antirotation: 'ליבה - התנגדות לסיבוב',
  core_flexion: 'ליבה - כפיפה',
  carry: 'נשיאה',
  calf: 'תאומים',
  arm_isolation: 'בידוד זרוע',
  shoulder_isolation: 'בידוד כתף',
  hip_isolation: 'בידוד ירך',
  conditioning: 'אירובי',
  mobility: 'ניידות וחימום',
};

export const DIFFICULTY_LABELS_HE: Record<Difficulty, string> = {
  easy: 'קל',
  moderate: 'בינוני',
  hard: 'מתקדם',
};

/** סטטיסטיקות לפאנל הניהול ולמסמך STATUS. */
export function libraryStats() {
  const withVerifiedMedia = EXERCISES.filter((e) => e.media.verified && e.media.path).length;
  return {
    total: EXERCISES.length,
    professionallyReviewed: EXERCISES.filter((e) => e.professionallyReviewed).length,
    withVerifiedMedia,
    withoutMedia: EXERCISES.length - withVerifiedMedia,
    patterns: [...new Set(EXERCISES.map((e) => e.pattern))].length,
  };
}
