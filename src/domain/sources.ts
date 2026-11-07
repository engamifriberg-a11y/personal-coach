// מרשם מקורות מקצועיים + כללים.
//
// כלל יסוד של המוצר: אין סף מספרי בקוד ללא מקור מתועד.
// כל כלל נושא: מזהה, תיאור, מקור, גרסה, תאריך בדיקה ומצב ביקורת.
// כלל במצב 'pending_review' מסומן בממשק ואינו מוצג כמאושר מקצועית.

export type ReviewState = 'reviewed' | 'pending_review';

export type Source = {
  id: string;
  titleHe: string;
  citation: string;
  url?: string;
  /** תאריך שבו המקור נבדק על ידינו (ISO date). */
  checkedAt: string;
};

export type Rule = {
  id: string;
  titleHe: string;
  /** הסף או ההחלטה במילים - מה הכלל קובע בפועל. */
  statementHe: string;
  sourceIds: string[];
  version: string;
  reviewState: ReviewState;
  reviewNoteHe?: string;
};

export const SOURCES: Record<string, Source> = {
  who_pa_2020: {
    id: 'who_pa_2020',
    titleHe: 'הנחיות ארגון הבריאות העולמי לפעילות גופנית והתנהגות יושבנית, 2020',
    citation:
      'Bull FC, Al-Ansari SS, Biddle S, et al. World Health Organization 2020 guidelines on physical activity and sedentary behaviour. Br J Sports Med. 2020;54(24):1451-1462. doi:10.1136/bjsports-2020-102955',
    url: 'https://doi.org/10.1136/bjsports-2020-102955',
    checkedAt: '2026-11-06',
  },
  mifflin_1990: {
    id: 'mifflin_1990',
    titleHe: 'נוסחת מיפלין-סנט ג׳ור לאומדן הוצאה אנרגטית במנוחה',
    citation:
      'Mifflin MD, St Jeor ST, Hill LA, Scott BJ, Daugherty SA, Koh YO. A new predictive equation for resting energy expenditure in healthy individuals. Am J Clin Nutr. 1990;51(2):241-247. doi:10.1093/ajcn/51.2.241',
    url: 'https://doi.org/10.1093/ajcn/51.2.241',
    checkedAt: '2026-11-06',
  },
  frankenfield_2005: {
    id: 'frankenfield_2005',
    titleHe: 'סקירה שיטתית: השוואת נוסחאות אומדן קצב מטבולי במנוחה',
    citation:
      'Frankenfield D, Roth-Yousey L, Compher C. Comparison of predictive equations for resting metabolic rate in healthy nonobese and obese adults: a systematic review. J Am Diet Assoc. 2005;105(5):775-789. doi:10.1016/j.jada.2005.02.005',
    url: 'https://doi.org/10.1016/j.jada.2005.02.005',
    checkedAt: '2026-11-06',
  },
  parq_plus: {
    id: 'parq_plus',
    titleHe: 'PAR-Q+ - שאלון מוכנות לפעילות גופנית לכל אדם, ותהליך ePARmed-X+',
    citation:
      'Warburton DER, Jamnik VK, Bredin SSD, Gledhill N, et al. The Physical Activity Readiness Questionnaire for Everyone (PAR-Q+) and electronic Physical Activity Readiness Medical Examination (ePARmed-X+). Health & Fitness Journal of Canada.',
    url: 'https://eparmedx.com/',
    checkedAt: '2026-11-06',
  },
  usda_fdc: {
    id: 'usda_fdc',
    titleHe: 'מאגר הערכים התזונתיים של USDA - FoodData Central',
    citation:
      'U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov. נתוני הרכב מזון של USDA הם נחלת הכלל ואינם מוגנים בזכויות יוצרים; USDA מבקש לציין את FoodData Central כמקור.',
    url: 'https://fdc.nal.usda.gov/',
    checkedAt: '2026-11-06',
  },
};

export const RULES: Record<string, Rule> = {
  // ---------- בטיחות וסינון ----------
  'safety.adults_only': {
    id: 'safety.adults_only',
    titleHe: 'גרסה ראשונה למבוגרים בלבד',
    statementHe: 'המערכת אינה מייצרת תוכניות אימון או תזונה למי שגילו פחות מ-18.',
    sourceIds: [],
    version: '1.0.0',
    reviewState: 'reviewed',
    reviewNoteHe: 'החלטת מוצר, לא סף פיזיולוגי. נגזרת מהגדרת תחום השימוש.',
  },
  'safety.red_flag_symptoms': {
    id: 'safety.red_flag_symptoms',
    titleHe: 'תסמיני דגל אדום - עצירה והפניה',
    statementHe:
      'כאב בחזה, עילפון או סחרחורת, וקוצר נשימה חריג - עוצרים יצירת המלצות ומפנים להערכה מקצועית לפני תחילת פעילות. אם התסמין מופיע בזמן אימון: הפסקה מיידית ופנייה לעזרה.',
    sourceIds: ['parq_plus'],
    version: '1.0.0',
    reviewState: 'pending_review',
    reviewNoteHe:
      'הניסוח מבוסס על עקרון הסינון המקדים של PAR-Q+. טרם עבר ביקורת של גורם מקצועי מטעמנו.',
  },
  'safety.pregnancy_clearance': {
    id: 'safety.pregnancy_clearance',
    titleHe: 'הריון והנקה - נדרשת התאמה מקצועית',
    statementHe:
      'בהריון או בהנקה המערכת אינה מייצרת יעדי קלוריות או גרעון, ואינה מייצרת תוכנית אימונים אוטומטית. מוצגת הנחיה לפנות למטפל ולהתאמה אישית.',
    sourceIds: ['who_pa_2020', 'parq_plus'],
    version: '1.0.0',
    reviewState: 'pending_review',
    reviewNoteHe:
      'ארגון הבריאות העולמי כולל המלצות ייחודיות להריון ולתקופה שלאחר הלידה; ההתאמה הפרטנית דורשת גורם מקצועי. נדרשת ביקורת לפני הפעלה בייצור.',
  },
  'safety.eating_disorder_history': {
    id: 'safety.eating_disorder_history',
    titleHe: 'היסטוריה של הפרעות אכילה',
    statementHe:
      'לא מוצגים יעדי קלוריות, גרעון, ספירת מאקרו, יעדי משקל או מעקב משקל יזום. התוכנית התזונתית מוחלפת בהפניה לליווי מקצועי. תוכנית אימונים אפשרית במתכונת מוגבלת, בלי מסגור של ירידה במשקל.',
    sourceIds: [],
    version: '1.0.0',
    reviewState: 'pending_review',
    reviewNoteHe:
      'כלל הגנה מוצרי. נדרשת ביקורת של דיאטן קליני ושל גורם בתחום בריאות הנפש לפני הפעלה בייצור.',
  },
  'safety.recent_surgery': {
    id: 'safety.recent_surgery',
    titleHe: 'ניתוח בשלושת החודשים האחרונים',
    statementHe:
      'לא נוצרת תוכנית אוטומטית. נדרש אישור הגורם המטפל, ואפשר לקבל תוכנית ניידות קלה בלבד לאחר אישור מפורש.',
    sourceIds: ['parq_plus'],
    version: '1.0.0',
    reviewState: 'pending_review',
  },
  'safety.active_injury_area': {
    id: 'safety.active_injury_area',
    titleHe: 'פציעה פעילה - הגבלת דפוסי תנועה',
    statementHe:
      'מגבלה בדרגה severe באזור מסוים חוסמת דפוסי תנועה שמעמיסים את אותו אזור; דרגה moderate מורידה עצימות ומעבירה לחלופות עם עומס נמוך יותר.',
    sourceIds: [],
    version: '1.0.0',
    reviewState: 'pending_review',
    reviewNoteHe: 'מיפוי דפוס תנועה לאזור עומס נקבע על ידינו; נדרשת ביקורת של פיזיותרפיסט.',
  },
  'safety.cardiac_restricted': {
    id: 'safety.cardiac_restricted',
    titleHe: 'מצב לבבי מדווח או יתר לחץ דם לא מאוזן',
    statementHe:
      'נדרש אישור רפואי. עד לקבלתו: מצב מוגבל עם תקרת עצימות RPE 5, בלי אימוני עצימות גבוהה ובלי מאמץ מקסימלי.',
    sourceIds: ['parq_plus'],
    version: '1.0.0',
    reviewState: 'pending_review',
    reviewNoteHe: 'תקרת ה-RPE היא החלטת זהירות מוצרית ולא סף מתוך מקור. דורשת ביקורת מקצועית.',
  },
  'safety.max_rpe_beginner': {
    id: 'safety.max_rpe_beginner',
    titleHe: 'תקרת עצימות למתחיל',
    statementHe:
      'מתחיל מתחיל בעצימות RPE 5-7 (כלומר 3-4 חזרות במילואים) ואינו מקבל סטים עד כיבוש בשבועות הראשונים.',
    sourceIds: [],
    version: '1.0.0',
    reviewState: 'pending_review',
    reviewNoteHe:
      'מבוסס פרקטיקה מקובלת של אימון התנגדות למתחילים. אינו סף מתוך מקור מצוטט; מסומן כממתין לביקורת.',
  },

  // ---------- נפח ופעילות אירובית ----------
  'plan.aerobic_target_who': {
    id: 'plan.aerobic_target_who',
    titleHe: 'יעד פעילות אירובית שבועי',
    statementHe:
      'יעד ההתקדמות הוא 150-300 דקות פעילות בעצימות מתונה בשבוע, או 75-150 דקות בעצימות מרץ, או שילוב שקול. יעד זה מוצג כיעד להתקדמות ואינו עומס פתיחה חובה למתחיל.',
    sourceIds: ['who_pa_2020'],
    version: '2020',
    reviewState: 'reviewed',
  },
  'plan.strength_days_who': {
    id: 'plan.strength_days_who',
    titleHe: 'אימוני התנגדות - תדירות מומלצת',
    statementHe:
      'פעילות לחיזוק שרירים בעצימות מתונה ומעלה, לכלל קבוצות השרירים הגדולות, לפחות פעמיים בשבוע.',
    sourceIds: ['who_pa_2020'],
    version: '2020',
    reviewState: 'reviewed',
  },
  'plan.beginner_rampup': {
    id: 'plan.beginner_rampup',
    titleHe: 'עלייה הדרגתית למתחיל',
    statementHe:
      'מתחיל מתחיל בכ-40% מיעד הדקות האירוביות ומתקדם בהדרגה. "מעט פעילות טוב ממצב של היעדר פעילות" - אין להציג את יעד ההתקדמות כדרישת פתיחה.',
    sourceIds: ['who_pa_2020'],
    version: '1.0.0',
    reviewState: 'pending_review',
    reviewNoteHe:
      'עקרון ההדרגתיות מגיע מהנחיות WHO; אחוז הפתיחה (40%) נקבע על ידינו וממתין לביקורת.',
  },
  'plan.progression_double': {
    id: 'plan.progression_double',
    titleHe: 'פרוגרסיה כפולה',
    statementHe:
      'כאשר המשתמש משלים את כל הסטים בקצה העליון של טווח החזרות, בעצימות המתאימה וללא כאב - מוצעת עלייה הדרגתית בעומס. קודם חזרות, אחר כך משקל.',
    sourceIds: [],
    version: '1.0.0',
    reviewState: 'pending_review',
    reviewNoteHe: 'פרקטיקה מקובלת (double progression). מסומן כממתין לביקורת מקצועית.',
  },
  'plan.reassess_triggers': {
    id: 'plan.reassess_triggers',
    titleHe: 'טריגרים להערכה מחדש',
    statementHe:
      'דיווח על כאב, עייפות חריגה, או ירידה מתמשכת בביצועים בשני אימונים עוקבים ומעלה - מפעילים הערכה מחדש והורדת עומס, ולא העלאה.',
    sourceIds: [],
    version: '1.0.0',
    reviewState: 'pending_review',
  },

  // ---------- תזונה ----------
  'nutrition.energy_formula': {
    id: 'nutrition.energy_formula',
    titleHe: 'נוסחת אומדן אנרגיה',
    statementHe:
      'BMR מחושב לפי מיפלין-סנט ג׳ור: גברים 10×משקל + 6.25×גובה − 5×גיל + 5; נשים 10×משקל + 6.25×גובה − 5×גיל − 161. TDEE = BMR × מקדם פעילות.',
    sourceIds: ['mifflin_1990', 'frankenfield_2005'],
    version: '1990',
    reviewState: 'reviewed',
  },
  'nutrition.uncertainty_range': {
    id: 'nutrition.uncertainty_range',
    titleHe: 'טווח אי־ודאות באומדן אנרגיה',
    statementHe:
      'האומדן מוצג כטווח של ±10% סביב ה-TDEE, ולא כמספר בודד. כשנתון המין לא נמסר, הטווח מורחב ל-±15% ומשקף את שתי הנוסחאות.',
    sourceIds: ['mifflin_1990', 'frankenfield_2005'],
    version: '1.0.0',
    reviewState: 'pending_review',
    reviewNoteHe:
      'הסקירה של Frankenfield ועמיתיו מתארת את מיפלין-סנט ג׳ור כנוסחה שצפויה לדיוק של עד 10% מהמדידה בחלק גדול מהמקרים; רוחב הטווח שבחרנו להציג הוא החלטה מוצרית וממתין לביקורת דיאטן.',
  },
  'nutrition.deficit_bounds': {
    id: 'nutrition.deficit_bounds',
    titleHe: 'תקרת גרעון קלורי ורצפת אנרגיה',
    statementHe:
      'גרעון מוגבל ל-10-20% מה-TDEE. יעד האנרגיה לא יורד מתחת ל-BMR המחושב, ולא מתחת לרצפות הזהירות של המוצר (1500 קק"ל לגברים, 1200 לנשים, 1300 כשהמין לא נמסר).',
    sourceIds: [],
    version: '1.0.0',
    reviewState: 'pending_review',
    reviewNoteHe:
      'רצפות האנרגיה והאחוזים הם ספי זהירות מוצריים שלא נלקחו ממקור מצוטט. חובה ביקורת של דיאטן קליני לפני שימוש בייצור. ראו docs/STATUS.md.',
  },
  'nutrition.surplus_bounds': {
    id: 'nutrition.surplus_bounds',
    titleHe: 'תקרת עודף קלורי לבניית מסה',
    statementHe: 'עודף מוגבל ל-5-15% מה-TDEE.',
    sourceIds: [],
    version: '1.0.0',
    reviewState: 'pending_review',
  },
  'nutrition.rate_realism': {
    id: 'nutrition.rate_realism',
    titleHe: 'בחינת מציאותיות של קצב שינוי משקל',
    statementHe:
      'קצב שינוי מבוקש שחורג מכ-1% ממשקל הגוף בשבוע מסומן כלא מציאותי. מוצגת חלופה ולא הבטחה לתוצאה או למועד.',
    sourceIds: [],
    version: '1.0.0',
    reviewState: 'pending_review',
    reviewNoteHe: 'סף מוצרי. דורש ביקורת של דיאטן קליני.',
  },
  'nutrition.data_source': {
    id: 'nutrition.data_source',
    titleHe: 'מקור נתוני ערכים תזונתיים',
    statementHe:
      'ערכי המזון נגזרים ממאגר USDA FoodData Central, ולכל פריט נשמר מזהה מקור. יש לציין האם הכמות מתייחסת למצב גולמי או מבושל.',
    sourceIds: ['usda_fdc'],
    version: '1.0.0',
    reviewState: 'pending_review',
    reviewNoteHe:
      'הערכים בקובץ src/content/foods.ts הוזנו ידנית כקבוצת זרע מייצגת ולא יובאו אוטומטית מ-FDC. נדרש ייבוא מאומת מול המאגר לפני שימוש בייצור.',
  },
  'nutrition.no_auto_fasting_or_supplements': {
    id: 'nutrition.no_auto_fasting_or_supplements',
    titleHe: 'אין המלצה אוטומטית לצום, תוספים או דיאטות קיצוניות',
    statementHe:
      'המערכת אינה מציעה מיוזמתה צום לסירוגין, תוספי תזונה או הגבלות קיצוניות, ואינה נותנת הוראות לשינוי תרופות.',
    sourceIds: [],
    version: '1.0.0',
    reviewState: 'reviewed',
    reviewNoteHe:
      'מדיניות מוצר ולא סף פיזיולוגי: זו הגבלה על מה שהמערכת מציעה, ולכן אינה דורשת מקור מקצועי.',
  },
  'nutrition.meal_timing_flexible': {
    id: 'nutrition.meal_timing_flexible',
    titleHe: 'תזמון ארוחות כהצעה גמישה',
    statementHe:
      'שעות הארוחות נגזרות משעות הקימה, העבודה, האימון והשינה, וניתנות לשינוי. אין להציג שעה מסוימת כתנאי לירידה במשקל או לבניית שריר.',
    sourceIds: [],
    version: '1.0.0',
    reviewState: 'reviewed',
    reviewNoteHe:
      'מדיניות מוצר: הכלל מגדיר מה אסור להציג כהבטחה, ואינו קובע סף מספרי, ולכן אינו דורש מקור מקצועי.',
  },
};

export function getRule(id: string): Rule {
  const rule = RULES[id];
  if (!rule) throw new Error(`כלל לא מוגדר במרשם: ${id}`);
  return rule;
}

/** מחזיר את המקורות המלאים עבור כלל - לשימוש בממשק ובמסמכי המסירה. */
export function describeRule(id: string): {
  rule: Rule;
  sources: Source[];
  approved: boolean;
} {
  const rule = getRule(id);
  return {
    rule,
    sources: rule.sourceIds.map((sid) => SOURCES[sid]).filter((s): s is Source => Boolean(s)),
    approved: rule.reviewState === 'reviewed',
  };
}

/** כללים שטרם עברו ביקורת מקצועית - מוצגים בממשק ובמסמך STATUS. */
export function pendingReviewRules(): Rule[] {
  return Object.values(RULES).filter((r) => r.reviewState === 'pending_review');
}
