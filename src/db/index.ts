// שכבת מסד הנתונים.
//
// המימוש כאן הוא SQLite דרך המודול המובנה node:sqlite - אפס תלויות חיצוניות,
// עובד מיד ובלי התקנה. כל הגישה עוברת דרך הפונקציות בקובץ repo.ts,
// כך שמעבר ל-PostgreSQL דורש מימוש חלופי של אותו ממשק בלבד.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export type Db = DatabaseSync;

let instance: Db | null = null;

export function openDb(path?: string): Db {
  const driver = process.env.DB_DRIVER ?? 'sqlite';
  if (driver !== 'sqlite') {
    throw new Error(
      `DB_DRIVER=${driver} אינו ממומש בגרסה הזו. מתאם PostgreSQL הוא חיבור חיצוני שטרם חובר - ראו docs/STATUS.md. ` +
        'כדי להמשיך עם SQLite יש להגדיר DB_DRIVER=sqlite.',
    );
  }
  const file = path ?? process.env.SQLITE_PATH ?? './data/coach.db';
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}

export function getDb(): Db {
  if (!instance) {
    instance = openDb();
    migrate(instance);
  }
  return instance;
}

/** לשימוש בבדיקות: מסד בזיכרון, נקי בכל הרצה. */
export function createTestDb(): Db {
  const db = openDb(':memory:');
  migrate(db);
  return db;
}

export function migrate(db: Db): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  );`);
  const dir = join(HERE, 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  const already = new Set(
    (db.prepare('SELECT name FROM schema_migrations').all() as Array<{ name: string }>).map((r) => r.name),
  );
  for (const f of files) {
    if (already.has(f)) continue;
    db.exec(readFileSync(join(dir, f), 'utf8'));
    db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(f, new Date().toISOString());
    applied.push(f);
  }
  return applied;
}

export function closeDb(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
