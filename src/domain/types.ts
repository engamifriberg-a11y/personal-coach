// טיפוסי הליבה של המוצר.
// הערה ארכיטקטונית: כל הטיפוסים כאן הם "חוזה" בין מנוע הכללים, שכבת ה-API והממשק.
// שכבת ה-AI מקבלת את הטיפוסים האלה לקריאה בלבד ולעולם אינה מייצרת אותם.

export type Sex = 'male' | 'female' | 'unspecified';

export type PrimaryGoal =
  | 'weight_loss'
  | 'fat_loss_recomp'
  | 'muscle_gain'
  | 'strength'
  | 'endurance'
  | 'maintain';

export type ExperienceLevel = 'beginner' | 'novice' | 'intermediate' | 'advanced';

export type DailyActivity = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

export type TrainingLocation = 'home' | 'gym' | 'outdoor';

export type Equipment =
  | 'bodyweight'
  | 'dumbbells'
  | 'barbell'
  | 'kettlebell'
  | 'resistance_band'
  | 'pullup_bar'
  | 'bench'
  | 'machines'
  | 'cables'
  | 'trx'
  | 'jump_rope'
  | 'cardio_machine'
  | 'mat'
  | 'step';

export type MovementPattern =
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'horizontal_push'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'core_antiextension'
  | 'core_antirotation'
  | 'core_flexion'
  | 'carry'
  | 'calf'
  | 'arm_isolation'
  | 'shoulder_isolation'
  | 'hip_isolation'
  | 'conditioning'
  | 'mobility';

export type MuscleGroup =
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'chest'
  | 'back'
  | 'lats'
  | 'traps'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'core'
  | 'forearms'
  | 'hip_flexors'
  | 'adductors'
  | 'full_body'
  | 'cardiovascular';

export type Difficulty = 'easy' | 'moderate' | 'hard';

export type JointArea =
  | 'knee'
  | 'hip'
  | 'lower_back'
  | 'shoulder'
  | 'elbow'
  | 'wrist'
  | 'neck'
  | 'ankle';

/** הגבלה שהמשתמש הזין: אזור + חומרה. משפיעה ישירות על בחירת תרגילים. */
export type Limitation = {
  area: JointArea;
  severity: 'mild' | 'moderate' | 'severe';
  note?: string;
};

export type DietPattern =
  | 'omnivore'
  | 'vegetarian'
  | 'vegan'
  | 'pescatarian'
  | 'kosher'
  | 'halal'
  | 'gluten_free'
  | 'lactose_free';

export type Allergen =
  | 'milk'
  | 'eggs'
  | 'peanuts'
  | 'tree_nuts'
  | 'sesame'
  | 'soy'
  | 'wheat_gluten'
  | 'fish'
  | 'shellfish';

/** דגלי בריאות מהשאלון. חלקם חוסמים יצירת המלצות עד להערכה מקצועית. */
export type HealthFlag =
  | 'pregnant'
  | 'breastfeeding'
  | 'eating_disorder_history'
  | 'cardiac_condition'
  | 'uncontrolled_hypertension'
  | 'diabetes'
  | 'chest_pain_at_rest_or_exertion'
  | 'dizziness_or_fainting'
  | 'unusual_shortness_of_breath'
  | 'recent_surgery_3m'
  | 'active_injury'
  | 'chronic_kidney_disease'
  | 'medication_affecting_exercise'
  | 'under_18'
  | 'none_of_the_above';

export type UserProfile = {
  userId: string;
  // --- דמוגרפיה בסיסית ---
  ageYears: number;
  heightCm: number;
  weightKg: number;
  /** נדרש לנוסחת מיפלין-סנט ג'ור. אפשר לדלג -> אומדן בטווח רחב יותר. */
  sex: Sex;
  sexSkipped: boolean;
  // --- יעדים ---
  primaryGoal: PrimaryGoal;
  secondaryGoals: PrimaryGoal[];
  targetWeightKg?: number;
  targetWeeks?: number;
  // --- ניסיון וזמינות ---
  experience: ExperienceLevel;
  dailyActivity: DailyActivity;
  sessionsPerWeek: number;
  minutesPerSession: number;
  location: TrainingLocation;
  equipment: Equipment[];
  likedExerciseIds: string[];
  avoidedExerciseIds: string[];
  // --- בריאות ---
  limitations: Limitation[];
  healthFlags: HealthFlag[];
  medicationsNote?: string;
  // --- סדר יום ---
  wakeTime: string; // "07:00"
  sleepTime: string; // "23:00"
  workStart?: string;
  workEnd?: string;
  preferredTrainingTime?: string;
  // --- תזונה ---
  dietPatterns: DietPattern[];
  allergens: Allergen[];
  mealsPerDay: number;
  prepMinutesPerDay: number;
  budgetLevel: 'low' | 'medium' | 'high';
  updatedAt: string;
};

// ---------- ספריית תרגילים ----------

export type MediaAsset = {
  /** נתיב יחסי תחת MEDIA_BASE_URL, או null אם אין נכס מאומת. אין קישורים מומצאים. */
  path: string | null;
  kind: 'video' | 'animation' | 'image_sequence';
  /** בעלות ורישוי - חובה לכל נכס. */
  source: string | null;
  owner: string | null;
  license: string | null;
  /** האם נכס זה עבר אימות ידני שהוא תואם בדיוק לגרסת התרגיל. */
  verified: boolean;
  /** האם הנכס נוצר על ידי AI. אסור להציג כ"נבדק מקצועית". */
  aiGenerated: boolean;
  checkedAt: string | null;
};

export type ExerciseVariant = {
  id: string;
  nameHe: string;
  nameEn: string;
  /** הסבר מה שונה בגרסה הזו. */
  howItDiffersHe: string;
  media: MediaAsset;
};

export type Exercise = {
  id: string;
  nameHe: string;
  nameEn: string;
  pattern: MovementPattern;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  equipment: Equipment[];
  difficulty: Difficulty;
  /** דו-צדדי (unilateral=false) או חד-צדדי */
  unilateral: boolean;
  /** האם התרגיל נמדד בזמן ולא בחזרות */
  timeBased: boolean;
  stepsHe: string[];
  breathingHe: string;
  commonMistakesHe: string[];
  safetyNotesHe: string[];
  /** אזורים שהתרגיל מעמיס. אם למשתמש יש מגבלה באזור כזה -> סינון/החלפה. */
  loadsJoints: JointArea[];
  easierVariant: ExerciseVariant | null;
  harderVariant: ExerciseVariant | null;
  media: MediaAsset;
  /** האם התוכן עבר ביקורת של מאמן מוסמך. תוכן שלא עבר יסומן בממשק. */
  professionallyReviewed: boolean;
  reviewNote?: string;
};

// ---------- תוכנית אימונים ----------

export type IntensityPrescription = {
  /** RPE 1-10 (Rating of Perceived Exertion) */
  rpe?: [number, number];
  /** RIR - Reps In Reserve */
  rir?: [number, number];
  explanationHe: string;
};

export type PlannedSet = {
  sets: number;
  repRange?: [number, number];
  durationSec?: number;
  restSec: number;
  intensity: IntensityPrescription;
  /** הנחיה לבחירת משקל פתיחה - מבוססת ביצוע ותחושה, לא משקל גוף. */
  startingLoadGuidanceHe: string;
};

export type PlannedExercise = {
  order: number;
  exerciseId: string;
  variantId?: string;
  prescription: PlannedSet;
  /** חלופות שעברו סינון לפי ציוד ומגבלות. */
  alternativeExerciseIds: string[];
  noteHe?: string;
};

export type WorkoutBlock = {
  kind: 'warmup' | 'main' | 'conditioning' | 'cooldown';
  titleHe: string;
  exercises: PlannedExercise[];
};

export type PlannedWorkout = {
  dayIndex: number; // 0 = ראשון
  titleHe: string;
  goalHe: string;
  estimatedMinutes: number;
  blocks: WorkoutBlock[];
};

export type WeeklyPlan = {
  id: string;
  userId: string;
  version: number;
  createdAt: string;
  status: 'active' | 'pending_approval' | 'superseded';
  /** סיכום ההיגיון שהוביל לתוכנית - מנוע הכללים, לא AI. */
  rationale: PlanRationale;
  workouts: PlannedWorkout[];
  weeklyAerobicMinutesTarget: number;
  weeklyAerobicMinutesPrescribed: number;
  notesHe: string[];
  /** מזהי הכללים שהופעלו, לצורך תיעוד ומעקב. */
  appliedRuleIds: string[];
};

export type PlanRationale = {
  primaryGoal: PrimaryGoal;
  effectiveExperience: ExperienceLevel;
  sessionsPerWeek: number;
  minutesPerSession: number;
  split: string;
  limitationsApplied: string[];
  equipmentApplied: Equipment[];
  summaryHe: string;
};

export type PlanDiff = {
  fromVersion: number;
  toVersion: number;
  changes: Array<{
    kind: 'added' | 'removed' | 'changed';
    scope: 'workout' | 'exercise' | 'volume' | 'intensity' | 'aerobic';
    descriptionHe: string;
    reasonHe: string;
    ruleId?: string;
  }>;
  requiresApproval: boolean;
};

// ---------- ביצוע אימון ----------

export type SetLog = {
  setNumber: number;
  weightKg?: number;
  reps?: number;
  durationSec?: number;
  rpe?: number;
  painReported: boolean;
  painNote?: string;
  completedAt: string;
};

export type ExerciseLog = {
  exerciseId: string;
  variantId?: string;
  substitutedForExerciseId?: string;
  skipped: boolean;
  sets: SetLog[];
};

export type WorkoutSession = {
  id: string;
  userId: string;
  planId: string;
  planVersion: number;
  dayIndex: number;
  status: 'in_progress' | 'paused' | 'completed' | 'abandoned';
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  logs: ExerciseLog[];
  /** אינדקס התרגיל הנוכחי - משוחזר אחרי סגירת האפליקציה. */
  cursor: { blockIndex: number; exerciseIndex: number; setNumber: number };
  sessionRpe?: number;
  notesHe?: string;
};

// ---------- מעקב ----------

export type Measurement = {
  id: string;
  userId: string;
  takenAt: string;
  weightKg?: number;
  waistCm?: number;
  hipCm?: number;
  chestCm?: number;
  armCm?: number;
  thighCm?: number;
  /** תמונות התקדמות - פרטיות, אופציונליות, מאוחסנות בנפרד. */
  photoRef?: string;
  note?: string;
};

// ---------- תזונה ----------

export type EnergyEstimate = {
  bmrKcal: number;
  tdeeKcal: number;
  /** טווח אי־ודאות - לא מציגים מספר בודד כאמת. */
  tdeeRangeKcal: [number, number];
  method: string;
  methodSourceId: string;
  activityFactor: number;
  assumptionsHe: string[];
  uncertaintyNoteHe: string;
};

export type MacroTarget = {
  kcal: number;
  kcalRange: [number, number];
  proteinG: number;
  fatG: number;
  carbsG: number;
  rationaleHe: string[];
  safetyNotesHe: string[];
  blocked: boolean;
};

export type FoodItem = {
  id: string;
  nameHe: string;
  nameEn: string;
  /** per 100g */
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  fiberG: number;
  /** האם הערכים מתייחסים למצב גולמי או מבושל. */
  state: 'raw' | 'cooked' | 'as_sold';
  allergens: Allergen[];
  tags: Array<'vegan' | 'vegetarian' | 'pescatarian' | 'kosher_pareve' | 'kosher_dairy' | 'kosher_meat' | 'gluten_free' | 'lactose_free'>;
  costLevel: 'low' | 'medium' | 'high';
  /** מקור נתוני התזונה - חובה. */
  dataSourceId: string;
  dataSourceRef: string;
};

export type MealComponent = {
  foodId: string;
  grams: number;
  /** תיאור ביתי מקביל, לנוחות. */
  householdHe?: string;
};

export type Meal = {
  id: string;
  nameHe: string;
  slot: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'pre_workout' | 'post_workout';
  components: MealComponent[];
  prepMinutes: number;
  instructionsHe: string[];
  alternativesMealIds: string[];
};

export type MealTiming = {
  slot: Meal['slot'];
  suggestedTime: string;
  flexible: true;
  reasonHe: string;
};

export type DailyMenu = {
  dayIndex: number;
  meals: Array<{ meal: Meal; timing: MealTiming }>;
  totals: { kcal: number; proteinG: number; fatG: number; carbsG: number; fiberG: number };
};

export type NutritionPlan = {
  id: string;
  userId: string;
  version: number;
  createdAt: string;
  energy: EnergyEstimate;
  macros: MacroTarget;
  days: DailyMenu[];
  shoppingList: Array<{ foodId: string; nameHe: string; grams: number; costLevel: string }>;
  notesHe: string[];
  blocked: boolean;
  blockedReasonsHe: string[];
};

// ---------- בטיחות ----------

export type SafetyDecision = {
  /** האם מותר לייצר תוכנית אימונים אוטומטית. */
  allowTrainingPlan: boolean;
  /** האם מותר לייצר יעדי אנרגיה/תפריט. */
  allowNutritionPlan: boolean;
  /** מצב ביניים: תוכנית מוגבלת בלבד. */
  restrictedMode: boolean;
  requiresProfessionalClearance: boolean;
  /** הודעות למשתמש - מה נדרש כדי להמשיך. */
  messagesHe: string[];
  /** איסורים ממוקדים על דפוסי תנועה / תרגילים. */
  forbiddenPatterns: MovementPattern[];
  forbiddenExerciseIds: string[];
  maxRpe: number;
  triggeredRuleIds: string[];
};

export type Role = 'user' | 'admin';

export type User = {
  id: string;
  email: string;
  /** השם שהמשתמש הזין בכניסה מהירה. ריק בחשבון אימייל רגיל. */
  displayName: string | null;
  role: Role;
  createdAt: string;
  consentHealthDataAt: string | null;
  consentAiAt: string | null;
  /** נוצר דרך קוד גישה משותף - מוצג בממשק עם ההסתייגות המתאימה. */
  viaAccessCode: boolean;
};
