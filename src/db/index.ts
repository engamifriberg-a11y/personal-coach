// בחירת הדרייבר והרצת מיגרציות.
//
// DB_DRIVER=sqlite (ברירת מחדל) - קובץ מקומי. פיתוח, בדיקות, שרת עם דיסק.
// DB_DRIVER=turso                - SQLite מנוהל מעל HTTP. אירוח בלי דיסק מתמיד.
//
// אותן מיגרציות ואותו SQL בשני המקרים.

import type { DbDriver } from './driver.ts';
import { createSqliteDriver } from './driver-sqlite.ts';
import { createTursoDriver } from './driver-turso.ts';
import { MIGRATIONS } from './migrations.generated.ts';

export type Db = DbDriver;
export type { DbDriver } from './driver.ts';

let instance: Db | null = null;
let migrated: Promise<void> | null = null;

/**
 * מה מוגדר ומה חסר, בלי לזרוק ובלי לחשוף סודות.
 * מאפשר לבדיקת הבריאות ולשכבת ה-API להסביר חיבור חסר במקום להתרסק.
 */
export function describeDbConfig(): {
  kind: string;
  ready: boolean;
  missing: string[];
  detailHe: string;
} {
  const kind = (process.env.DB_DRIVER ?? 'sqlite').toLowerCase();

  if (kind === 'turso' || kind === 'libsql') {
    const missing: string[] = [];
    if (!process.env.TURSO_DATABASE_URL?.trim()) missing.push('TURSO_DATABASE_URL');
    if (!process.env.TURSO_AUTH_TOKEN?.trim()) missing.push('TURSO_AUTH_TOKEN');
    return {
      kind: 'turso',
      ready: missing.length === 0,
      missing,
      detailHe: missing.length
        ? `מסד הנתונים טרם חובר. חסר: ${missing.join(', ')}. ההוראות ב-docs/DEPLOY.md`
        : 'פרטי החיבור ל-Turso מוגדרים',
    };
  }

  if (kind !== 'sqlite') {
    return {
      kind,
      ready: false,
      missing: ['DB_DRIVER'],
      detailHe: `DB_DRIVER=${kind} אינו נתמך. הערכים הנתמכים: sqlite, turso.`,
    };
  }

  // אירוח חסר-מצב (Vercel Functions) מקבל מערכת קבצים חדשה בכל הפעלה.
  // קובץ SQLite שם ייראה כעובד ויאבד כל נתון. עדיף להיכשל בגלוי.
  if (process.env.VERCEL) {
    return {
      kind: 'sqlite',
      ready: false,
      missing: ['DB_DRIVER=turso', 'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'],
      detailHe:
        'באירוח הזה אין דיסק מתמיד, ולכן קובץ SQLite היה מאבד כל נתון. ' +
        'נדרש DB_DRIVER=turso עם פרטי החיבור.',
    };
  }

  return { kind: 'sqlite', ready: true, missing: [], detailHe: 'קובץ מקומי' };
}

export function createDriver(): Db {
  const kind = (process.env.DB_DRIVER ?? 'sqlite').toLowerCase();

  const config = describeDbConfig();
  if (!config.ready) throw new Error(config.detailHe);

  if (kind === 'turso' || kind === 'libsql') {
    const url = process.env.TURSO_DATABASE_URL?.trim();
    const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
    if (!url || !authToken) {
      throw new Error(
        'DB_DRIVER=turso דורש גם TURSO_DATABASE_URL וגם TURSO_AUTH_TOKEN. ' +
          'אפשר לקבל אותם בלוח הבקרה של Turso. ראו docs/DEPLOY.md',
      );
    }
    return createTursoDriver({
      url,
      authToken,
      timeoutMs: Number(process.env.DB_TIMEOUT_MS ?? 15000),
    });
  }

  if (kind !== 'sqlite') {
    throw new Error(`DB_DRIVER=${kind} אינו נתמך. הערכים הנתמכים: sqlite, turso.`);
  }

  return createSqliteDriver(process.env.SQLITE_PATH ?? './data/coach.db');
}

/** מופע משותף לכל התהליך, עם מיגרציות שמורצות פעם אחת. */
export async function getDb(): Promise<Db> {
  if (!instance) instance = createDriver();
  if (!migrated) migrated = migrate(instance);
  await migrated;
  return instance;
}

/** לשימוש בבדיקות: מסד נקי בזיכרון. */
export async function createTestDb(): Promise<Db> {
  const db = createSqliteDriver(':memory:');
  await migrate(db);
  return db;
}

export async function migrate(db: Db): Promise<string[]> {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  );`);

  const alreadyRows = await db.all('SELECT name FROM schema_migrations');
  const already = new Set(alreadyRows.map((r) => String(r.name)));

  const applied: string[] = [];
  for (const { name, sql } of MIGRATIONS) {
    if (already.has(name)) continue;
    await db.exec(sql);
    await db.run('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)', [
      name,
      new Date().toISOString(),
    ]);
    applied.push(name);
  }
  return applied;
}

export async function closeDb(): Promise<void> {
  if (instance) {
    await instance.close();
    instance = null;
    migrated = null;
  }
}
