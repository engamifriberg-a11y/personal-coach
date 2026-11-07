// בדיקות שכבת הנתונים: שני הדרייברים מתנהגים אותו דבר.
//
// דרייבר Turso נבדק מול מימוש מקומי של פרוטוקול ה-HTTP שלו (tests/fake-turso.ts),
// כך שמיפוי הפרמטרים, קריאת השורות, batch והשגיאות מכוסים.
// מה שאינו מכוסה: ההתנהגות של השירות המנוהל עצמו בפועל.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createSqliteDriver } from '../src/db/driver-sqlite.ts';
import { createTursoDriver, splitSqlScript } from '../src/db/driver-turso.ts';
import { migrate } from '../src/db/index.ts';
import * as repo from '../src/db/repo.ts';
import { startFakeTurso, type FakeTurso } from './fake-turso.ts';
import type { DbDriver } from '../src/db/driver.ts';
import { pingDriver } from '../src/db/driver.ts';

let fake: FakeTurso;
let turso: DbDriver;
let sqlite: DbDriver;

before(async () => {
  fake = await startFakeTurso();
  turso = createTursoDriver({ url: fake.url, authToken: fake.authToken });
  sqlite = createSqliteDriver(':memory:');
  await migrate(sqlite);
  await migrate(turso);
});

after(async () => {
  await sqlite.close();
  await turso.close();
  await fake.close();
});

// ---------------------------- פיצול סקריפט SQL ----------------------------

test('פיצול סקריפט מיגרציה מתעלם מהערות ומנקודה-פסיק בתוך מחרוזת', () => {
  const script = `
    -- הערה עם ; בתוכה
    CREATE TABLE a (id TEXT PRIMARY KEY);
    /* הערת בלוק;
       בשתי שורות */
    INSERT INTO a (id) VALUES ('יש; בפנים');
  `;
  const parts = splitSqlScript(script);
  assert.equal(parts.length, 2);
  assert.ok(parts[0]!.startsWith('CREATE TABLE a'));
  assert.ok(parts[1]!.includes("'יש; בפנים'"));
});

test('סקריפט ריק או הערות בלבד אינם מייצרים פקודות', () => {
  assert.deepEqual(splitSqlScript('   '), []);
  assert.deepEqual(splitSqlScript('-- כלום\n/* גם כלום */'), []);
});

// ------------------------------- שקילות ---------------------------------

test('שני הדרייברים מריצים את אותן מיגרציות ומגיעים לאותה סכמה', async () => {
  for (const db of [sqlite, turso]) {
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
    const names = tables.map((t) => String(t.name));
    for (const expected of ['users', 'plans', 'workout_sessions', 'measurements', 'audit_log']) {
      assert.ok(names.includes(expected), `${db.name}: חסרה הטבלה ${expected}`);
    }
    const applied = await db.all('SELECT name FROM schema_migrations ORDER BY name');
    assert.equal(applied.length, 2, `${db.name}: מספר מיגרציות שגוי`);
  }
});

test('מיגרציה חוזרת אינה מריצה שוב את מה שכבר הורץ', async () => {
  assert.deepEqual(await migrate(turso), []);
  assert.deepEqual(await migrate(sqlite), []);
});

test('ping מחזיר תשובה חיובית משני הדרייברים', async () => {
  for (const db of [sqlite, turso]) {
    const result = await pingDriver(db);
    assert.equal(result.ok, true, `${db.name}: ${result.detailHe}`);
  }
});

test('טיפוסי פרמטרים נשמרים ומוחזרים זהה בשני הדרייברים', async () => {
  for (const db of [sqlite, turso]) {
    await db.exec('CREATE TABLE IF NOT EXISTS t_types (k TEXT PRIMARY KEY, i INTEGER, f REAL, s TEXT, n TEXT)');
    await db.run('DELETE FROM t_types');
    await db.run('INSERT INTO t_types (k, i, f, s, n) VALUES (?, ?, ?, ?, ?)', [
      'row1',
      42,
      3.5,
      'טקסט בעברית',
      null,
    ]);
    const row = await db.get('SELECT * FROM t_types WHERE k = ?', ['row1']);
    assert.equal(row?.i, 42, `${db.name}: integer`);
    assert.equal(row?.f, 3.5, `${db.name}: real`);
    assert.equal(row?.s, 'טקסט בעברית', `${db.name}: text`);
    assert.equal(row?.n, null, `${db.name}: null`);
  }
});

test('boolean ו-undefined מומרים לערכים שהמסד מבין', async () => {
  for (const db of [sqlite, turso]) {
    await db.run('DELETE FROM t_types');
    await db.run('INSERT INTO t_types (k, i, s) VALUES (?, ?, ?)', ['bool', true, undefined]);
    const row = await db.get('SELECT i, s FROM t_types WHERE k = ?', ['bool']);
    assert.equal(row?.i, 1);
    assert.equal(row?.s, null);
  }
});

test('run מחזיר את מספר השורות שהשתנו', async () => {
  for (const db of [sqlite, turso]) {
    await db.run('DELETE FROM t_types');
    await db.run('INSERT INTO t_types (k, i) VALUES (?, ?)', ['a', 1]);
    await db.run('INSERT INTO t_types (k, i) VALUES (?, ?)', ['b', 2]);
    const res = await db.run('UPDATE t_types SET i = 9 WHERE i < ?', [5]);
    assert.equal(res.changes, 2, `${db.name}: changes`);
    const none = await db.run('UPDATE t_types SET i = 0 WHERE k = ?', ['no-such-key']);
    assert.equal(none.changes, 0, `${db.name}: אפס שינויים`);
  }
});

test('get על שורה שאינה קיימת מחזיר null, ו-all מחזיר מערך ריק', async () => {
  for (const db of [sqlite, turso]) {
    assert.equal(await db.get('SELECT * FROM users WHERE id = ?', ['no-such-user']), null);
    assert.deepEqual(await db.all('SELECT * FROM users WHERE id = ?', ['no-such-user']), []);
  }
});

test('batch הוא יחידה אחת: פקודה שנכשלת מבטלת את כולן', async () => {
  for (const db of [sqlite, turso]) {
    await db.run('DELETE FROM t_types');
    await assert.rejects(
      db.batch([
        { sql: 'INSERT INTO t_types (k, i) VALUES (?, ?)', params: ['ok1', 1] },
        { sql: 'INSERT INTO t_types (k, i) VALUES (?, ?)', params: ['ok1', 2] }, // מפתח כפול
      ]),
      `${db.name}: batch עם שגיאה היה צריך להיכשל`,
    );
    const rows = await db.all('SELECT * FROM t_types');
    assert.equal(rows.length, 0, `${db.name}: אסור שיישמר חלק מה-batch`);
  }
});

test('batch מצליח שומר את כל הפקודות', async () => {
  for (const db of [sqlite, turso]) {
    await db.run('DELETE FROM t_types');
    await db.batch([
      { sql: 'INSERT INTO t_types (k, i) VALUES (?, ?)', params: ['x', 1] },
      { sql: 'INSERT INTO t_types (k, i) VALUES (?, ?)', params: ['y', 2] },
    ]);
    const rows = await db.all('SELECT k FROM t_types ORDER BY k');
    assert.deepEqual(rows.map((r) => r.k), ['x', 'y']);
  }
});

test('שאילתה שגויה מחזירה שגיאה ברורה ולא תשובה שקטה', async () => {
  for (const db of [sqlite, turso]) {
    await assert.rejects(db.all('SELECT * FROM table_that_does_not_exist'), `${db.name}`);
  }
});

// ------------------------- שכבת ה-repository ----------------------------

test('מסלול repository מלא עובד מול שני הדרייברים באופן זהה', async () => {
  for (const db of [sqlite, turso]) {
    const id = randomUUID();
    const email = `u-${id.slice(0, 8)}@test.local`;

    const created = await repo.createUser(db, {
      id,
      email,
      passwordHash: 'hash',
      passwordSalt: 'salt',
      displayName: 'רון',
      viaAccessCode: true,
    });
    assert.equal(created.displayName, 'רון', `${db.name}: שם מוצג`);

    const found = await repo.findUserByEmail(db, email);
    assert.ok(found, `${db.name}: המשתמש לא נמצא`);
    assert.equal(found!.via_access_code, 1, `${db.name}: דגל כניסה מהירה`);
    assert.equal(repo.toUser(found!).viaAccessCode, true);

    await repo.setConsents(db, id, { health: true, ai: false });
    const withConsent = await repo.findUserById(db, id);
    assert.ok(withConsent!.consent_health_data_at, `${db.name}: הסכמה לא נשמרה`);
    assert.equal(withConsent!.consent_ai_at, null);

    await repo.saveDraft(db, id, 3, { primaryGoal: 'strength' });
    const draft = await repo.getDraft(db, id);
    assert.equal(draft?.step, 3, `${db.name}: שלב הטיוטה`);
    assert.equal(draft?.data.primaryGoal, 'strength');

    // כתיבה חוזרת (ON CONFLICT)
    await repo.saveDraft(db, id, 5, { primaryGoal: 'endurance' });
    assert.equal((await repo.getDraft(db, id))?.step, 5, `${db.name}: upsert של טיוטה`);

    await repo.addMeasurement(db, {
      id: randomUUID(),
      userId: id,
      takenAt: new Date().toISOString(),
      weightKg: 80.5,
      waistCm: 90,
    });
    const measurements = await repo.listMeasurements(db, id);
    assert.equal(measurements.length, 1, `${db.name}: מדידות`);
    assert.equal(measurements[0]!.weightKg, 80.5, `${db.name}: משקל עשרוני`);

    await repo.audit(db, 'test.action', id, { n: 1 });
    assert.ok((await repo.listAuditLog(db, 10)).length > 0, `${db.name}: יומן`);

    assert.ok((await repo.countUsers(db)) >= 1, `${db.name}: מספר משתמשים`);

    // מחיקה: batch שמסיר הכול
    await repo.deleteUserData(db, id);
    assert.equal(await repo.findUserById(db, id), null, `${db.name}: המשתמש לא נמחק`);
    assert.equal((await repo.listMeasurements(db, id)).length, 0, `${db.name}: מדידות לא נמחקו`);
    assert.equal(await repo.getDraft(db, id), null, `${db.name}: טיוטה לא נמחקה`);
  }
});

test('בידוד נתונים נשמר בשכבת ה-repository בשני הדרייברים', async () => {
  for (const db of [sqlite, turso]) {
    const a = randomUUID();
    const b = randomUUID();
    for (const [id, name] of [[a, 'א'], [b, 'ב']] as const) {
      await repo.createUser(db, {
        id,
        email: `${id.slice(0, 8)}@iso.local`,
        passwordHash: 'h',
        passwordSalt: 's',
        displayName: name,
      });
    }
    await repo.saveDraft(db, a, 1, { secret: 'של א' });
    assert.equal(await repo.getDraft(db, b), null, `${db.name}: דליפה בין משתמשים`);

    await repo.deleteUserData(db, a);
    await repo.deleteUserData(db, b);
  }
});

test('הדרייבר מאחד כמה פקודות לבקשת HTTP אחת', async () => {
  const before = fake.requestCount();
  await turso.batch([
    { sql: 'INSERT INTO t_types (k, i) VALUES (?, ?)', params: ['one-req-1', 1] },
    { sql: 'INSERT INTO t_types (k, i) VALUES (?, ?)', params: ['one-req-2', 2] },
  ]);
  assert.equal(fake.requestCount() - before, 1, 'batch צריך להיות בקשה אחת');
  await turso.run('DELETE FROM t_types');
});

test('טוקן שגוי נדחה ומייצר שגיאה מובנת', async () => {
  const bad = createTursoDriver({ url: fake.url, authToken: 'wrong-token' });
  await assert.rejects(bad.get('SELECT 1'), /HTTP 401|שגיאה/);
  const ping = await pingDriver(bad);
  assert.equal(ping.ok, false);
  assert.ok(ping.detailHe.includes('אינו מגיב'));
});

test('כתובת שאינה זמינה מחזירה שגיאה ולא תלייה', async () => {
  const dead = createTursoDriver({
    url: 'http://127.0.0.1:1',
    authToken: 'x',
    timeoutMs: 1500,
  });
  await assert.rejects(dead.get('SELECT 1'));
});

test('כתובת libsql:// מתורגמת ל-https', async () => {
  const driver = createTursoDriver({ url: 'libsql://example-org.turso.io', authToken: 'x' });
  assert.ok(driver.describeHe.includes('example-org.turso.io'));
  assert.ok(!driver.describeHe.includes('libsql://'));
});
