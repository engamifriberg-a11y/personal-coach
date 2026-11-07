// ולידציה של השאלון -> UserProfile.
// כלל: שום שדה גזעי/אתני אינו נאסף ואינו קיים בטיפוס. התאמות תרבותיות נגזרות
// מהעדפות התזונה שהמשתמש מציין בעצמו (כשרות, טבעונות וכו').

import type {
  Allergen,
  DailyActivity,
  DietPattern,
  Equipment,
  ExperienceLevel,
  HealthFlag,
  JointArea,
  Limitation,
  PrimaryGoal,
  Sex,
  TrainingLocation,
  UserProfile,
} from '../domain/types.ts';
import { badRequest, enumList, enumVal, num, optNum, str, strList, timeStr } from './http.ts';
import { getExercise } from '../content/exercises.ts';

const SEXES = ['male', 'female', 'unspecified'] as const;
const GOALS = ['weight_loss', 'fat_loss_recomp', 'muscle_gain', 'strength', 'endurance', 'maintain'] as const;
const EXPERIENCE = ['beginner', 'novice', 'intermediate', 'advanced'] as const;
const ACTIVITY = ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const;
const LOCATIONS = ['home', 'gym', 'outdoor'] as const;
const EQUIPMENT = [
  'bodyweight', 'dumbbells', 'barbell', 'kettlebell', 'resistance_band', 'pullup_bar',
  'bench', 'machines', 'cables', 'trx', 'jump_rope', 'cardio_machine', 'mat', 'step',
] as const;
const JOINTS = ['knee', 'hip', 'lower_back', 'shoulder', 'elbow', 'wrist', 'neck', 'ankle'] as const;
const SEVERITIES = ['mild', 'moderate', 'severe'] as const;
const DIETS = [
  'omnivore', 'vegetarian', 'vegan', 'pescatarian', 'kosher', 'halal', 'gluten_free', 'lactose_free',
] as const;
const ALLERGENS = [
  'milk', 'eggs', 'peanuts', 'tree_nuts', 'sesame', 'soy', 'wheat_gluten', 'fish', 'shellfish',
] as const;
const HEALTH_FLAGS = [
  'pregnant', 'breastfeeding', 'eating_disorder_history', 'cardiac_condition', 'uncontrolled_hypertension',
  'diabetes', 'chest_pain_at_rest_or_exertion', 'dizziness_or_fainting', 'unusual_shortness_of_breath',
  'recent_surgery_3m', 'active_injury', 'chronic_kidney_disease', 'medication_affecting_exercise',
  'under_18', 'none_of_the_above',
] as const;

export const QUESTIONNAIRE_OPTIONS = {
  sexes: SEXES,
  goals: GOALS,
  experience: EXPERIENCE,
  activity: ACTIVITY,
  locations: LOCATIONS,
  equipment: EQUIPMENT,
  joints: JOINTS,
  severities: SEVERITIES,
  diets: DIETS,
  allergens: ALLERGENS,
  healthFlags: HEALTH_FLAGS,
};

function validateLimitations(value: unknown): Limitation[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw badRequest('השדה מגבלות חייב להיות רשימה.');
  if (value.length > 12) throw badRequest('יותר מדי מגבלות ברשימה.');
  return value.map((raw) => {
    if (typeof raw !== 'object' || raw === null) throw badRequest('מגבלה אינה בפורמט תקין.');
    const r = raw as Record<string, unknown>;
    return {
      area: enumVal<JointArea>(r.area, 'אזור מגבלה', JOINTS),
      severity: enumVal(r.severity, 'חומרת מגבלה', SEVERITIES),
      note: r.note === undefined || r.note === null || r.note === '' ? undefined : str(r.note, 'הערה', { max: 500 }),
    };
  });
}

function validateExerciseIds(value: unknown, field: string): string[] {
  const ids = strList(value, field, 60);
  const unknown = ids.filter((id) => !getExercise(id));
  if (unknown.length > 0) throw badRequest(`מזהי תרגילים לא מוכרים ב${field}: ${unknown.join(', ')}`);
  return ids;
}

export function validateProfile(userId: string, body: any): UserProfile {
  const sexSkipped = body.sexSkipped === true;
  const sex: Sex = sexSkipped ? 'unspecified' : enumVal<Sex>(body.sex, 'מין', SEXES);

  const healthFlags = enumList<HealthFlag>(body.healthFlags, 'דגלי בריאות', HEALTH_FLAGS).filter(
    (f) => f !== 'none_of_the_above',
  );

  const primaryGoal = enumVal<PrimaryGoal>(body.primaryGoal, 'יעד ראשי', GOALS);
  const secondaryGoals = enumList<PrimaryGoal>(body.secondaryGoals, 'יעדים משניים', GOALS).filter(
    (g) => g !== primaryGoal,
  );

  const location = enumVal<TrainingLocation>(body.location, 'מקום אימון', LOCATIONS);
  const equipment = enumList<Equipment>(body.equipment, 'ציוד', EQUIPMENT);

  const ageYears = num(body.ageYears, 'גיל', 10, 100);

  return {
    userId,
    ageYears,
    heightCm: num(body.heightCm, 'גובה', 120, 230),
    weightKg: num(body.weightKg, 'משקל', 30, 300),
    sex,
    sexSkipped,
    primaryGoal,
    secondaryGoals,
    targetWeightKg: optNum(body.targetWeightKg, 'משקל יעד', 30, 300),
    targetWeeks: optNum(body.targetWeeks, 'טווח זמן בשבועות', 1, 260),
    experience: enumVal<ExperienceLevel>(body.experience, 'ניסיון', EXPERIENCE),
    dailyActivity: enumVal<DailyActivity>(body.dailyActivity, 'רמת פעילות יומית', ACTIVITY),
    sessionsPerWeek: num(body.sessionsPerWeek, 'אימונים בשבוע', 1, 6),
    minutesPerSession: num(body.minutesPerSession, 'דקות לאימון', 15, 180),
    location,
    equipment,
    likedExerciseIds: validateExerciseIds(body.likedExerciseIds, 'תרגילים אהובים'),
    avoidedExerciseIds: validateExerciseIds(body.avoidedExerciseIds, 'תרגילים להימנעות'),
    limitations: validateLimitations(body.limitations),
    healthFlags: ageYears < 18 ? [...new Set([...healthFlags, 'under_18' as HealthFlag])] : healthFlags,
    medicationsNote:
      body.medicationsNote === undefined || body.medicationsNote === null || body.medicationsNote === ''
        ? undefined
        : str(body.medicationsNote, 'תרופות', { max: 1000 }),
    wakeTime: timeStr(body.wakeTime, 'שעת קימה', '07:00'),
    sleepTime: timeStr(body.sleepTime, 'שעת שינה', '23:00'),
    workStart: body.workStart ? timeStr(body.workStart, 'תחילת עבודה', '09:00') : undefined,
    workEnd: body.workEnd ? timeStr(body.workEnd, 'סוף עבודה', '17:00') : undefined,
    preferredTrainingTime: body.preferredTrainingTime
      ? timeStr(body.preferredTrainingTime, 'שעת אימון מועדפת', '18:00')
      : undefined,
    dietPatterns: enumList<DietPattern>(body.dietPatterns, 'העדפות תזונה', DIETS),
    allergens: enumList<Allergen>(body.allergens, 'אלרגנים', ALLERGENS),
    mealsPerDay: num(body.mealsPerDay ?? 3, 'ארוחות ביום', 2, 6),
    prepMinutesPerDay: num(body.prepMinutesPerDay ?? 30, 'זמן הכנה', 5, 240),
    budgetLevel: enumVal(body.budgetLevel ?? 'medium', 'תקציב', ['low', 'medium', 'high'] as const),
    updatedAt: new Date().toISOString(),
  };
}
