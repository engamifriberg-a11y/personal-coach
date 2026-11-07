// אומדן אנרגיה ויעדי מאקרו.
//
// כל מספר כאן מגיע מכלל במרשם src/domain/sources.ts.
// ספים שאינם מתוך מקור מצוטט מסומנים reviewState='pending_review' שם, ומוצגים בממשק כממתינים לביקורת.

import type {
  DailyActivity,
  EnergyEstimate,
  MacroTarget,
  PrimaryGoal,
  SafetyDecision,
  Sex,
  UserProfile,
} from './types.ts';
import { getRule } from './sources.ts';

/** מקדמי פעילות נלווים לנוסחת מיפלין-סנט ג׳ור, כפי שהם בשימוש מקובל. */
export const ACTIVITY_FACTORS: Record<DailyActivity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const ACTIVITY_LABELS_HE: Record<DailyActivity, string> = {
  sedentary: 'יושבני - עבודה במשרד, מעט הליכה',
  light: 'פעילות קלה - 1-3 אימונים בשבוע או הליכה יומית',
  moderate: 'פעילות בינונית - 3-5 אימונים בשבוע',
  active: 'פעיל - 6-7 אימונים בשבוע או עבודה פיזית',
  very_active: 'פעיל מאוד - עבודה פיזית כבדה או שני אימונים ביום',
};

export function bmrMifflin(sex: Exclude<Sex, 'unspecified'>, weightKg: number, heightCm: number, ageYears: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  return sex === 'male' ? base + 5 : base - 161;
}

/**
 * אומדן אנרגיה עם טווח אי־ודאות.
 * כשהמין לא נמסר: מחשבים את שתי הנוסחאות, לוקחים ממוצע ומרחיבים את הטווח.
 */
export function estimateEnergy(input: {
  sex: Sex;
  sexSkipped: boolean;
  weightKg: number;
  heightCm: number;
  ageYears: number;
  dailyActivity: DailyActivity;
}): EnergyEstimate {
  const formulaRule = getRule('nutrition.energy_formula');
  const rangeRule = getRule('nutrition.uncertainty_range');
  const factor = ACTIVITY_FACTORS[input.dailyActivity];

  const assumptions: string[] = [
    `נוסחה: ${formulaRule.statementHe}`,
    `מקדם פעילות שנבחר: ${factor} (${ACTIVITY_LABELS_HE[input.dailyActivity]}).`,
    'הנוסחה פותחה על מבוגרים בריאים ואינה מתחשבת בהרכב גוף. אצל אנשים עם מסת שריר גבוהה היא נוטה להמעיט באומדן.',
    'האומדן אינו מבוסס על מדידה שלך אלא על נוסחה ממוצעת. הכיול האמיתי נעשה מהמעקב בפועל לאורך 2-3 שבועות.',
  ];

  let bmr: number;
  let rangePct: number;

  if (input.sexSkipped || input.sex === 'unspecified') {
    const male = bmrMifflin('male', input.weightKg, input.heightCm, input.ageYears);
    const female = bmrMifflin('female', input.weightKg, input.heightCm, input.ageYears);
    bmr = (male + female) / 2;
    rangePct = 0.15;
    assumptions.push(
      'לא נמסר נתון המין, שהוא אחד הקלטים של הנוסחה. לכן חישבנו את שני הגרסאות ולקחנו את הממוצע, ' +
        `והטווח המוצג רחב יותר (±15%). לשם השוואה: הגרסאות עצמן נותנות ${Math.round(female)} עד ${Math.round(male)} קק"ל במנוחה.`,
    );
  } else {
    bmr = bmrMifflin(input.sex, input.weightKg, input.heightCm, input.ageYears);
    rangePct = 0.1;
  }

  const tdee = bmr * factor;
  return {
    bmrKcal: Math.round(bmr),
    tdeeKcal: Math.round(tdee),
    tdeeRangeKcal: [Math.round(tdee * (1 - rangePct)), Math.round(tdee * (1 + rangePct))],
    method: 'Mifflin-St Jeor (1990) × מקדם פעילות',
    methodSourceId: 'mifflin_1990',
    activityFactor: factor,
    assumptionsHe: assumptions,
    uncertaintyNoteHe:
      `זהו אומדן ולא מדידה. ${rangeRule.statementHe} ` +
      'השתמשו בטווח כנקודת פתיחה, ועדכנו לפי מה שקורה בפועל במשקל, בהרגשה ובביצועים.',
  };
}

/** רצפות אנרגיה - ספי זהירות מוצריים, מתועדים בכלל nutrition.deficit_bounds. */
const ENERGY_FLOORS_KCAL: Record<'male' | 'female' | 'unspecified', number> = {
  male: 1500,
  female: 1200,
  unspecified: 1300,
};

export function computeMacroTarget(
  profile: Pick<
    UserProfile,
    'primaryGoal' | 'weightKg' | 'sex' | 'sexSkipped' | 'experience' | 'dietPatterns'
  >,
  energy: EnergyEstimate,
  safety: SafetyDecision,
): MacroTarget {
  if (!safety.allowNutritionPlan) {
    return {
      kcal: 0,
      kcalRange: [0, 0],
      proteinG: 0,
      fatG: 0,
      carbsG: 0,
      rationaleHe: [],
      safetyNotesHe: safety.messagesHe,
      blocked: true,
    };
  }

  const deficitRule = getRule('nutrition.deficit_bounds');
  const surplusRule = getRule('nutrition.surplus_bounds');
  const rationale: string[] = [];
  const safetyNotes: string[] = [];

  let adjustmentPct = 0;
  switch (profile.primaryGoal) {
    case 'weight_loss':
      adjustmentPct = -0.18;
      rationale.push('יעד ראשי: ירידה במשקל. נבחר גרעון של 18% מהאומדן - בתוך הטווח של 10-20%.');
      break;
    case 'fat_loss_recomp':
      adjustmentPct = -0.1;
      rationale.push('יעד ראשי: הפחתת שומן וחיטוב. גרעון מתון של 10% כדי לשמור על מסת שריר ועל איכות האימונים.');
      break;
    case 'muscle_gain':
      adjustmentPct = 0.1;
      rationale.push('יעד ראשי: בניית מסת שריר. עודף של 10% מהאומדן - בתוך הטווח של 5-15%.');
      break;
    case 'strength':
      adjustmentPct = 0.05;
      rationale.push('יעד ראשי: שיפור כוח. עודף קטן של 5% לתמיכה בהתאוששות.');
      break;
    case 'endurance':
      adjustmentPct = 0;
      rationale.push('יעד ראשי: סיבולת. יעד האנרגיה סביב רמת האיזון, עם דגש על זמינות פחמימה סביב האימונים.');
      break;
    case 'maintain':
      adjustmentPct = 0;
      rationale.push('יעד ראשי: שמירה על כושר. יעד האנרגיה סביב רמת האיזון.');
      break;
  }

  let kcal = energy.tdeeKcal * (1 + adjustmentPct);

  // רצפת BMR
  if (kcal < energy.bmrKcal) {
    kcal = energy.bmrKcal;
    safetyNotes.push(
      'יעד האנרגיה הועלה כדי לא לרדת מתחת לאומדן ההוצאה במנוחה. ירידה מתחת לרמה הזו לאורך זמן פוגעת ' +
        'בהתאוששות, בהורמונים ובמסת שריר, והיא לא מזרזת את התהליך בפועל.',
    );
  }
  // רצפת זהירות
  const floorKey: 'male' | 'female' | 'unspecified' =
    profile.sexSkipped || profile.sex === 'unspecified' ? 'unspecified' : profile.sex;
  const floor = ENERGY_FLOORS_KCAL[floorKey];
  if (kcal < floor) {
    kcal = floor;
    safetyNotes.push(
      `יעד האנרגיה הועלה לרצפת הזהירות של ${floor} קק"ל. ${deficitRule.statementHe} ` +
        'יעד נמוך מזה דורש ליווי של דיאטן קליני ואינו נבנה כאן אוטומטית.',
    );
  }

  kcal = Math.round(kcal / 10) * 10;

  // חלבון: טווח פרקטי לפי יעד, מוצג כטווח ולא כאמת מדויקת.
  const proteinPerKg =
    profile.primaryGoal === 'muscle_gain' || profile.primaryGoal === 'strength'
      ? 1.8
      : profile.primaryGoal === 'weight_loss' || profile.primaryGoal === 'fat_loss_recomp'
        ? 1.9
        : 1.5;
  const proteinG = Math.round(proteinPerKg * profile.weightKg);
  rationale.push(
    `יעד חלבון: כ-${proteinPerKg} גרם לכל ק"ג משקל גוף (${proteinG} גרם ביום). ` +
      'בגרעון קלורי חלבון גבוה יותר עוזר לשמור על מסת שריר ועל תחושת שובע.',
  );

  // שומן: 25% מהקלוריות, לא פחות מ-0.6 ג'/ק"ג.
  const fatKcal = kcal * 0.25;
  const fatG = Math.max(Math.round(fatKcal / 9), Math.round(0.6 * profile.weightKg));
  rationale.push(`יעד שומן: ${fatG} גרם - כ-25% מהאנרגיה, עם רצפה של 0.6 גרם לק"ג לתמיכה בתפקוד הורמונלי.`);

  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
  rationale.push(`היתר פחמימה: ${carbsG} גרם - מקור האנרגיה העיקרי לאיכות האימונים.`);

  if (profile.dietPatterns.includes('vegan')) {
    rationale.push(
      'בתפריט טבעוני נשים דגש על שילוב מקורות חלבון (קטניות עם דגנים, טופו, סייטן, חלבון סויה) ' +
        'ועל מעקב אחר B12, ברזל, אבץ ואומגה 3. את הצורך בתוספים קובע גורם מקצועי, לא האפליקציה.',
    );
  }

  safetyNotes.push(getRule('nutrition.no_auto_fasting_or_supplements').statementHe);
  safetyNotes.push(
    'המספרים האלה הם נקודת פתיחה בתוך טווח אי־ודאות של האומדן, ולא יעד מדויק. ' +
      'אם אחרי 2-3 שבועות המשקל והביצועים לא נעים בכיוון שתכננו - מעדכנים את היעד, לא מחמירים את הגרעון.',
  );

  return {
    kcal,
    kcalRange: [Math.round((kcal * 0.95) / 10) * 10, Math.round((kcal * 1.05) / 10) * 10],
    proteinG,
    fatG,
    carbsG,
    rationaleHe: rationale,
    safetyNotesHe: safetyNotes,
    blocked: false,
  };
}

/** מזהי הכללים שהופעלו בחישוב - לתיעוד ולהצגה בממשק. */
export const ENERGY_RULE_IDS = [
  'nutrition.energy_formula',
  'nutrition.uncertainty_range',
  'nutrition.deficit_bounds',
  'nutrition.surplus_bounds',
  'nutrition.no_auto_fasting_or_supplements',
];
