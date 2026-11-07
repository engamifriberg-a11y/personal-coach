// דרייבר SQLite מקומי, מעל המודול המובנה node:sqlite.
// בלי תלויות חיצוניות. משמש בפיתוח, בכל הבדיקות, ובהרצה על שרת עם דיסק מתמיד.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DbDriver, ExecuteResult, Row, SqlValue, Statement } from './driver.ts';

/** node:sqlite אינו מקבל undefined או boolean - ממירים למה שהוא מבין. */
function normalize(params: SqlValue[] = []): Array<string | number | bigint | null | Uint8Array> {
  return params.map((p) => {
    if (p === undefined || p === null) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });
}

export function createSqliteDriver(path: string): DbDriver {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  // WAL משפר מקביליות קריאה-כתיבה; foreign_keys נדרש לאכיפת ON DELETE CASCADE
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');

  return {
    name: 'sqlite',
    describeHe: `SQLite מקומי: ${path}`,

    async all(sql, params) {
      return db.prepare(sql).all(...normalize(params)) as Row[];
    },

    async get(sql, params) {
      const row = db.prepare(sql).get(...normalize(params));
      return (row as Row | undefined) ?? null;
    },

    async run(sql, params): Promise<ExecuteResult> {
      const res = db.prepare(sql).run(...normalize(params));
      return {
        changes: Number(res.changes ?? 0),
        lastInsertRowid: res.lastInsertRowid ?? null,
      };
    },

    async batch(statements: Statement[]) {
      db.exec('BEGIN');
      try {
        for (const st of statements) db.prepare(st.sql).run(...normalize(st.params));
        db.exec('COMMIT');
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch {
          /* אם ה-ROLLBACK נכשל, השגיאה המקורית חשובה יותר */
        }
        throw err;
      }
    },

    async exec(sql) {
      db.exec(sql);
    },

    async close() {
      db.close();
    },
  };
}
