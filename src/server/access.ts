// כניסה מהירה: שם חופשי + קוד גישה משותף.
//
// למה זה קיים: כדי לפתוח את האפליקציה לקבוצה מוגדרת בלי תהליך הרשמה.
// כל שם מקבל חשבון נפרד עם בידוד נתונים מלא, כך ששני אנשים עם שמות שונים
// לא רואים זה את נתוני זה.
//
// מגבלת אבטחה שחייבת להיות גלויה: קוד הגישה משותף, ולכן מי שמכיר אותו יכול
// להיכנס בכל שם - כולל שם שמישהו אחר כבר השתמש בו. זה מתאים לבדיקה בקרב
// אנשים שסומכים זה על זה, ולא לשימוש ציבורי. לשימוש אמיתי: חשבון עם אימייל וסיסמה.
// מתועד ב-docs/STATUS.md

import { createHash, timingSafeEqual } from 'node:crypto';
import { badRequest } from './http.ts';

// אין קוד ברירת מחדל בקוד המקור: סוד בקוד הוא סוד שדולף לכל מי שרואה את המאגר.
// הקוד מוגדר אצל מי שמריץ את השרת, דרך משתנה הסביבה ACCESS_CODE.
let warned = false;

export function accessCode(): string | null {
  const fromEnv = process.env.ACCESS_CODE;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.trim();
  if (!warned) {
    warned = true;
    console.warn(
      '[access] ACCESS_CODE אינו מוגדר, ולכן הכניסה המהירה כבויה. ' +
        'כדי להפעיל אותה: ACCESS_CODE=<הקוד שלך> בקובץ .env או במשתני הסביבה של הפריסה.',
    );
  }
  return null;
}

/** כניסה מהירה פעילה רק כשהיא לא כובתה במפורש וגם הוגדר קוד. */
export function quickAccessEnabled(): boolean {
  if ((process.env.QUICK_ACCESS ?? 'on').toLowerCase() === 'off') return false;
  return accessCode() !== null;
}

/** השוואה בזמן קבוע, כדי לא לדלוף מידע על הקוד דרך זמני תגובה. */
export function verifyAccessCode(input: string): boolean {
  const code = accessCode();
  if (code === null) return false;
  const expected = Buffer.from(code, 'utf8');
  const given = Buffer.from(String(input ?? ''), 'utf8');
  // משווים גיבובים כדי שאורך הקלט לא יחשוף את אורך הקוד
  const a = createHash('sha256').update(expected).digest();
  const b = createHash('sha256').update(given).digest();
  return timingSafeEqual(a, b);
}

export type QuickIdentity = { email: string; displayName: string };

/**
 * גזירת מזהה יציב מהשם שהוזן.
 * אותו שם (אחרי נרמול) מחזיר תמיד את אותו חשבון, כך שאפשר לחזור ולהמשיך.
 * השם עצמו נשמר בנפרד בשדה display_name, כולל עברית ורווחים.
 */
export function identityFromName(rawName: string): QuickIdentity {
  const displayName = String(rawName ?? '').trim().replace(/\s+/g, ' ');
  if (displayName.length < 2) throw badRequest('צריך שם באורך שני תווים לפחות.');
  if (displayName.length > 40) throw badRequest('השם ארוך מדי - עד 40 תווים.');

  const normalized = displayName.normalize('NFKC').toLowerCase();
  const hash = createHash('sha256').update(`quick-access:${normalized}`).digest('hex').slice(0, 16);
  return { email: `u-${hash}@access.local`, displayName };
}

/** האם החשבון נוצר דרך כניסה מהירה - משמש להצגת ההסתייגות בממשק. */
export function isQuickAccessEmail(email: string): boolean {
  return email.endsWith('@access.local');
}
