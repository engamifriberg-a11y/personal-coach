// יצירת src/db/migrations.generated.ts מתוך src/db/migrations/*.sql
//
// למה: המיגרציות נקראו מהדיסק בזמן ריצה (readdirSync על תיקייה). באירוח
// חסר-מצב, שבו הקוד נארז לקובץ אחד, התיקייה הזו לא קיימת ליד הקובץ - והמסד
// היה עולה בלי סכמה. לכן ה-SQL נארז לתוך מודול, וקריאת הדיסק נעלמת לגמרי.
//
// קובצי ה-.sql נשארים המקור האמיתי. הקובץ הנוצר נשמר בגיט, ובדיקה
// (tests/migrations-generated.test.ts) נכשלת אם שכחו להריץ את הסקריפט.
//
// הרצה: npm run build:migrations

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = join(HERE, '..', 'src', 'db', 'migrations');
export const GENERATED_FILE = join(HERE, '..', 'src', 'db', 'migrations.generated.ts');

/** תוכן הקובץ הנוצר, כמחרוזת. מיוצא כדי שהבדיקה תשווה בלי לכתוב לדיסק. */
export function renderGenerated(): string {
  const names = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const entries = names
    .map((name) => {
      const sql = readFileSync(join(MIGRATIONS_DIR, name), 'utf8');
      return `  { name: ${JSON.stringify(name)}, sql: ${JSON.stringify(sql)} },`;
    })
    .join('\n');

  return [
    '// נוצר אוטומטית. אל תערכו כאן - ערכו את src/db/migrations/*.sql',
    '// ואז הריצו: npm run build:migrations',
    '//',
    '// ה-SQL נארז לתוך מודול כדי שלא תהיה קריאת דיסק בזמן ריצה. באירוח',
    '// חסר-מצב הקוד נארז לקובץ אחד, ותיקיית המיגרציות אינה קיימת לידו.',
    '',
    'export type Migration = { name: string; sql: string };',
    '',
    'export const MIGRATIONS: Migration[] = [',
    entries,
    '];',
    '',
  ].join('\n');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const content = renderGenerated();
  writeFileSync(GENERATED_FILE, content, 'utf8');
  const count = (content.match(/\{ name: /g) ?? []).length;
  console.log(`נוצר src/db/migrations.generated.ts: ${count} מיגרציות, ${content.length} תווים`);
}
