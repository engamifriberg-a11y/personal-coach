// ממשק הדרייבר למסד הנתונים.
//
// שני מימושים:
//   sqlite - node:sqlite על קובץ מקומי. פיתוח, בדיקות, והרצה על שרת עם דיסק.
//   turso  - SQLite מנוהל מעל HTTP. פריסה על אירוח בלי דיסק מתמיד.
//
// שני המימושים מקבלים את אותו SQL בדיוק: Turso הוא SQLite, ולכן אין
// הבדלי דיאלקט, אין תרגום placeholders ואין שאילתות כפולות לתחזק.
//
// הממשק אסינכרוני כי HTTP אסינכרוני. המימוש המקומי סינכרוני מתחת למכסה
// ופשוט מחזיר Promise שנפתר מיד.

/** ערך שאפשר להעביר כפרמטר לשאילתה. */
export type SqlValue = string | number | bigint | boolean | null | undefined | Uint8Array;

export type Row = Record<string, any>;

export type ExecuteResult = {
  /** מספר השורות שהשתנו. */
  changes: number;
  lastInsertRowid: number | bigint | null;
};

/** פקודה בודדת, לשימוש ב-batch. */
export type Statement = { sql: string; params?: SqlValue[] };

export type DbDriver = {
  readonly name: 'sqlite' | 'turso';
  /** תיאור קצר להצגה בלוג ההפעלה, בלי סודות. */
  readonly describeHe: string;

  /** שאילתה שמחזירה שורות. */
  all(sql: string, params?: SqlValue[]): Promise<Row[]>;
  /** שאילתה שמחזירה שורה אחת או null. */
  get(sql: string, params?: SqlValue[]): Promise<Row | null>;
  /** פקודה שמשנה נתונים. */
  run(sql: string, params?: SqlValue[]): Promise<ExecuteResult>;
  /** כמה פקודות כיחידה אחת. נכשלת אחת - אף אחת לא נשמרת. */
  batch(statements: Statement[]): Promise<void>;
  /** הרצת סקריפט SQL שלם (מיגרציות). */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
};

/** בדיקת חיות למסד - משמשת את נתיב הבריאות ואת אימות הפריסה. */
export async function pingDriver(driver: DbDriver): Promise<{ ok: boolean; detailHe: string }> {
  try {
    const row = await driver.get('SELECT 1 AS ok');
    if (row?.ok === 1) return { ok: true, detailHe: `המסד מגיב (${driver.name})` };
    return { ok: false, detailHe: `המסד החזיר תשובה לא צפויה (${driver.name})` };
  } catch (err) {
    return {
      ok: false,
      detailHe: `המסד אינו מגיב (${driver.name}): ${err instanceof Error ? err.message : 'שגיאה לא מזוהה'}`,
    };
  }
}
