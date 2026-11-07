// בחירת הדרייבר והרצת מיגרציות.
//
// DB_DRIVER=sqlite (ברירת מחדל) - קובץ מקומי. פיתוח, בדיקות, שרת עם דיסק.
// DB_DRIVER=turso                - SQLite מנוהל מעל HTTP. אירוח בלי דיסק מתמיד.
//
// אותן מיגרציות ואותו SQL בשני המקרים.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DbDriver } from './driver.ts';
import { createSqliteDriver } from './driver-sqlite.ts';
import { createTursoDriver } from './driver-turso.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

export type Db = DbDriver;
export type { DbDriver } from './driver.ts';

let instance: Db | null = null;
let migrated: Promise<void> | null = null;

export function createDriver(): Db {
  const kind = (process.env.DB_DRIVER ?? 'sqlite').toLowerCase();

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

  const dir = join(HERE, 'migrations');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const alreadyRows = await db.all('SELECT name FROM schema_migrations');
  const already = new Set(alreadyRows.map((r) => String(r.name)));

  const applied: string[] = [];
  for (const file of files) {
    if (already.has(file)) continue;
    await db.exec(readFileSync(join(dir, file), 'utf8'));
    await db.run('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)', [
      file,
      new Date().toISOString(),
    ]);
    applied.push(file);
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
