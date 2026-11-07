// מנוע בטיחות. זו שכבת ההחלטה הראשונה, לפני כל יצירת תוכנית.
//
// עקרון: שכבת ה-AI אינה יכולה לעקוף את התוצאה של הקובץ הזה.
// ה-API קורא ל-evaluateSafety() ומעביר את ה-SafetyDecision למנוע הכללים;
// מנוע הכללים מסנן תרגילים לפי ההחרגות, ושכבת ה-AI מקבלת רק טקסט לנסח.

import type {
  HealthFlag,
  JointArea,
  Limitation,
  MovementPattern,
  SafetyDecision,
  UserProfile,
} from './types.ts';

/** מיפוי אזור גוף -> דפוסי תנועה שמעמיסים אותו. בסיס להחרגות. */
export const JOINT_TO_PATTERNS: Record<JointArea, MovementPattern[]> = {
  knee: ['squat', 'lunge', 'calf'],
  hip: ['squat', 'hinge', 'lunge', 'hip_isolation'],
  lower_back: ['hinge', 'squat', 'core_flexion', 'carry'],
  shoulder: ['vertical_push', 'horizontal_push', 'vertical_pull', 'shoulder_isolation'],
  elbow: ['horizontal_push', 'vertical_push', 'arm_isolation'],
  wrist: ['horizontal_push', 'vertical_push', 'carry'],
  neck: ['vertical_push', 'core_flexion'],
  ankle: ['squat', 'lunge', 'calf', 'conditioning'],
};

/** תסמינים שמחייבים עצירה מיידית של האימון ופנייה לעזרה. */
export const STOP_NOW_SYMPTOMS: HealthFlag[] = [
  'chest_pain_at_rest_or_exertion',
  'dizziness_or_fainting',
  'unusual_shortness_of_breath',
];

const CLEARANCE_REQUIRED: HealthFlag[] = [
  'cardiac_condition',
  'uncontrolled_hypertension',
  'chronic_kidney_disease',
  'recent_surgery_3m',
];

export type SafetyInput = {
  ageYears: number;
  healthFlags: HealthFlag[];
  limitations: Limitation[];
};

export function evaluateSafety(input: SafetyInput): SafetyDecision {
  const flags = new Set(input.healthFlags);
  const decision: SafetyDecision = {
    allowTrainingPlan: true,
    allowNutritionPlan: true,
    restrictedMode: false,
    requiresProfessionalClearance: false,
    messagesHe: [],
    forbiddenPatterns: [],
    forbiddenExerciseIds: [],
    maxRpe: 9,
    triggeredRuleIds: [],
  };

  // --- גיל ---
  if (input.ageYears < 18 || flags.has('under_18')) {
    decision.allowTrainingPlan = false;
    decision.allowNutritionPlan = false;
    decision.triggeredRuleIds.push('safety.adults_only');
    decision.messagesHe.push(
      'הגרסה הזו של האפליקציה מיועדת לבני 18 ומעלה, ולכן איננו מייצרים כאן תוכנית אימונים או תזונה. ' +
        'מתחת לגיל 18 ההתאמה צריכה להיעשות עם מאמן שעובד עם בני נוער ובתיאום עם ההורה או האפוטרופוס.',
    );
    return decision; // חסימה מוחלטת - אין טעם להמשיך הערכה
  }

  // --- דגלים אדומים תסמיניים ---
  const activeRedFlags = STOP_NOW_SYMPTOMS.filter((s) => flags.has(s));
  if (activeRedFlags.length > 0) {
    decision.allowTrainingPlan = false;
    decision.requiresProfessionalClearance = true;
    decision.triggeredRuleIds.push('safety.red_flag_symptoms');
    decision.messagesHe.push(
      'סימנתָ תסמינים שמחייבים בדיקה לפני תחילת פעילות: ' +
        activeRedFlags.map(symptomLabelHe).join(', ') +
        '. לכן איננו מייצרים כרגע תוכנית אימונים. כדי להמשיך נדרש אישור של רופא. ' +
        'אם תסמין כזה מופיע עכשיו או מופיע בזמן מאמץ - הפסיקו את הפעילות ופנו לעזרה רפואית.',
    );
  }

  // --- הריון והנקה ---
  if (flags.has('pregnant') || flags.has('breastfeeding')) {
    decision.allowNutritionPlan = false;
    decision.allowTrainingPlan = false;
    decision.requiresProfessionalClearance = true;
    decision.triggeredRuleIds.push('safety.pregnancy_clearance');
    decision.messagesHe.push(
      'בהריון או בהנקה ההתאמה של אימון ושל צרכי אנרגיה היא פרטנית ומשתנה לאורך הזמן, ' +
        'ולכן איננו מייצרים כאן יעדי קלוריות או תוכנית אימונים אוטומטית. ' +
        'אפשר להמשיך להשתמש בספריית התרגילים ובמעקב, ולבנות תוכנית עם גורם מקצועי שמלווה אותך.',
    );
  }

  // --- היסטוריה של הפרעות אכילה ---
  if (flags.has('eating_disorder_history')) {
    decision.allowNutritionPlan = false;
    decision.restrictedMode = true;
    decision.triggeredRuleIds.push('safety.eating_disorder_history');
    decision.messagesHe.push(
      'ציינתָ היסטוריה של הפרעת אכילה. במצב כזה המערכת לא מציגה יעדי קלוריות, ספירת מאקרו, ' +
        'יעדי משקל או מעקב משקל יזום, כי אלה עלולים להזיק יותר מלעזור. ' +
        'תוכנית האימונים תיבנה סביב תחושה, יכולת ובריאות, בלי מסגור של ירידה במשקל. ' +
        'לליווי תזונתי מומלץ דיאטן קליני עם ניסיון בתחום.',
    );
  }

  // --- מצבים הדורשים אישור ---
  const clearance = CLEARANCE_REQUIRED.filter((f) => flags.has(f));
  if (clearance.length > 0) {
    decision.requiresProfessionalClearance = true;
    decision.restrictedMode = true;
    decision.maxRpe = Math.min(decision.maxRpe, 5);
    if (flags.has('recent_surgery_3m')) {
      decision.allowTrainingPlan = false;
      decision.triggeredRuleIds.push('safety.recent_surgery');
      decision.messagesHe.push(
        'עברתָ ניתוח בשלושת החודשים האחרונים. איננו מייצרים תוכנית אוטומטית לפני אישור של הגורם המטפל, ' +
          'כי האישור תלוי בסוג הניתוח ובשלב ההחלמה.',
      );
    }
    if (flags.has('cardiac_condition') || flags.has('uncontrolled_hypertension')) {
      decision.triggeredRuleIds.push('safety.cardiac_restricted');
      decision.messagesHe.push(
        'ציינתָ מצב לבבי או לחץ דם שאינו מאוזן. עד לאישור רפואי התוכנית תוגבל לעצימות מתונה, ' +
          'בלי מאמץ מקסימלי ובלי אימוני עצימות גבוהה.',
      );
    }
    if (flags.has('chronic_kidney_disease')) {
      decision.allowNutritionPlan = false;
      decision.messagesHe.push(
        'מחלת כליות כרונית מחייבת התאמה תזונתית קלינית, בעיקר בחלבון ובמינרלים, ' +
          'ולכן איננו מייצרים כאן יעדי תזונה. נדרש ליווי של דיאטן קליני.',
      );
    }
  }

  if (flags.has('diabetes')) {
    decision.requiresProfessionalClearance = true;
    decision.messagesHe.push(
      'ציינתָ סוכרת. אפשר להתאמן, אך תכנון פחמימות ותזמון מול תרופות דורשים ליווי מקצועי. ' +
        'איננו נותנים הוראות לשינוי תרופות, ובשינוי בהרגלי אימון או אכילה כדאי לעדכן את הצוות המטפל.',
    );
  }

  if (flags.has('medication_affecting_exercise')) {
    decision.messagesHe.push(
      'ציינתָ תרופות שעשויות להשפיע על פעילות או על תזונה. איננו משנים מינון ואיננו נותנים הוראות לגבי תרופות. ' +
        'אם מופיעה תגובה חריגה בזמן אימון - עצרו והתייעצו.',
    );
  }

  // --- מגבלות ופציעות ---
  for (const lim of input.limitations) {
    const patterns = JOINT_TO_PATTERNS[lim.area] ?? [];
    if (lim.severity === 'severe') {
      decision.forbiddenPatterns.push(...patterns);
      decision.triggeredRuleIds.push('safety.active_injury_area');
      decision.messagesHe.push(
        `סימנתָ מגבלה חמורה באזור ${jointLabelHe(lim.area)}. תרגילים שמעמיסים את האזור הזה לא ייכללו בתוכנית, ` +
          'ובמקומם ייבחרו חלופות. אם המגבלה חדשה או מחמירה - כדאי לעבור הערכה פיזיותרפית.',
      );
    } else if (lim.severity === 'moderate') {
      decision.maxRpe = Math.min(decision.maxRpe, 7);
      decision.triggeredRuleIds.push('safety.active_injury_area');
      decision.messagesHe.push(
        `סימנתָ מגבלה בדרגה בינונית באזור ${jointLabelHe(lim.area)}. העצימות תוגבל והעדפה תינתן לחלופות ` +
          'עם עומס נמוך יותר על האזור. כל תרגיל שמעורר כאב - עצרו והחליפו.',
      );
    }
  }

  if (flags.has('active_injury')) {
    decision.maxRpe = Math.min(decision.maxRpe, 7);
    decision.triggeredRuleIds.push('safety.active_injury_area');
  }

  decision.forbiddenPatterns = [...new Set(decision.forbiddenPatterns)];
  decision.triggeredRuleIds = [...new Set(decision.triggeredRuleIds)];

  if (decision.messagesHe.length === 0) {
    decision.messagesHe.push(
      'לא סימנתָ מצבים שמחייבים עצירה. שימו לב: שאלון אינו תחליף לבדיקה. ' +
        'אם מופיעים כאב בחזה, סחרחורת או קוצר נשימה חריג - הפסיקו את האימון ופנו לעזרה.',
    );
  }

  return decision;
}

/** תקרת עצימות לפי ניסיון, בשילוב עם מגבלות הבטיחות. */
export function cappedMaxRpe(experience: UserProfile['experience'], decision: SafetyDecision): number {
  const byExperience = experience === 'beginner' ? 7 : experience === 'novice' ? 8 : 9;
  return Math.min(byExperience, decision.maxRpe);
}

/** הודעת עצירה בזמן אימון - מוצגת כשמדווח כאב או תסמין. */
export const IN_WORKOUT_STOP_MESSAGE_HE =
  'עצרו את האימון עכשיו. כאב בחזה, סחרחורת, עילפון או קוצר נשימה חריג הם סימנים שדורשים בדיקה ' +
  'ולא משהו ש"עוברים דרכו". שבו, הפסיקו את המאמץ, ואם התסמין נמשך או מחמיר - פנו לעזרה רפואית מיידית. ' +
  'אל תמשיכו את האימון היום.';

export function symptomLabelHe(flag: HealthFlag): string {
  switch (flag) {
    case 'chest_pain_at_rest_or_exertion':
      return 'כאב בחזה במנוחה או במאמץ';
    case 'dizziness_or_fainting':
      return 'סחרחורת או עילפון';
    case 'unusual_shortness_of_breath':
      return 'קוצר נשימה חריג';
    default:
      return flag;
  }
}

export function jointLabelHe(area: JointArea): string {
  const map: Record<JointArea, string> = {
    knee: 'הברך',
    hip: 'הירך',
    lower_back: 'הגב התחתון',
    shoulder: 'הכתף',
    elbow: 'המרפק',
    wrist: 'שורש היד',
    neck: 'הצוואר',
    ankle: 'הקרסול',
  };
  return map[area];
}

/** בדיקת מציאותיות של יעד משקל ולוח זמנים. אין הבטחת תוצאה או מועד. */
export function assessGoalRealism(profile: {
  weightKg: number;
  targetWeightKg?: number;
  targetWeeks?: number;
}): { realistic: boolean; messageHe: string; suggestedWeeks?: number; ruleId: string } {
  const ruleId = 'nutrition.rate_realism';
  if (!profile.targetWeightKg || !profile.targetWeeks || profile.targetWeeks <= 0) {
    return {
      realistic: true,
      messageHe:
        'לא הגדרת יעד משקל ולוח זמנים, ולכן נעבוד לפי יעד הביצועים וההרגשה. ' +
        'זו גם אפשרות טובה: שינוי בהרכב הגוף לא תמיד נראה על המשקל.',
      ruleId,
    };
  }
  const deltaKg = Math.abs(profile.targetWeightKg - profile.weightKg);
  if (deltaKg < 0.5) {
    return { realistic: true, messageHe: 'יעד המשקל קרוב למשקל הנוכחי - נתמקד בשמירה ובשיפור ביצועים.', ruleId };
  }
  const weeklyRateKg = deltaKg / profile.targetWeeks;
  const weeklyRatePct = (weeklyRateKg / profile.weightKg) * 100;
  // סף מוצרי: עד כ-1% ממשקל הגוף בשבוע. מתועד בכלל nutrition.rate_realism.
  if (weeklyRatePct <= 1.0) {
    return {
      realistic: true,
      messageHe:
        `הקצב שביקשת הוא כ-${weeklyRateKg.toFixed(2)} ק"ג בשבוע. זה בתוך טווח שנחשב סביר לנסות, ` +
        'אבל חשוב להבין שאי אפשר להתחייב לתוצאה או למועד: הקצב בפועל תלוי בשינה, בלחץ, בהתמדה ובגורמים אישיים.',
      ruleId,
    };
  }
  const suggestedWeeks = Math.ceil(deltaKg / (profile.weightKg * 0.0075));
  return {
    realistic: false,
    messageHe:
      `כדי להגיע ל-${profile.targetWeightKg} ק"ג בתוך ${profile.targetWeeks} שבועות נדרש קצב של כ-` +
      `${weeklyRateKg.toFixed(2)} ק"ג בשבוע, שהם כ-${weeklyRatePct.toFixed(1)}% ממשקל הגוף בשבוע. ` +
      'קצב כזה בדרך כלל דורש גרעון חד, והוא מקושר לאובדן מסת שריר, לעייפות ולנשירה מהתהליך. ' +
      `חלופה: אותו יעד בפריסה של כ-${suggestedWeeks} שבועות, או יעד ביניים קרוב יותר שנעדכן בהמשך. ` +
      'התוכנית תיבנה לפי החלופה הזו, ואפשר לשנות זאת בהגדרות.',
    suggestedWeeks,
    ruleId,
  };
}
