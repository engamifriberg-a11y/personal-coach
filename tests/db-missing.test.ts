// מסד נתונים שלא חובר הוא המצב הראשון בכל פריסה חדשה.
// הדרישה היא להתקדם ולסמן את החיבור החסר במפורש, לא להתרסק.
//
// הבדיקות כאן מריצות את השרת עם DB_DRIVER=turso בלי פרטי חיבור -
// בדיוק מה שקורה אחרי פריסה לפני שהוגדרו המשתנים.
// הקובץ רץ בתהליך נפרד משאר הבדיקות, ולכן משתני הסביבה כאן אינם משפיעים עליהן.

process.env.DB_DRIVER = 'turso';
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';

const { createApp } = await import('../src/server/index.ts');
const { describeDbConfig } = await import('../src/db/index.ts');

let server: Server;
let base = '';

before(async () => {
  server = createApp();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('התצורה מדווחת מה חסר, בלי לזרוק', () => {
  const config = describeDbConfig();
  assert.equal(config.ready, false);
  assert.equal(config.kind, 'turso');
  assert.deepEqual(config.missing, ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN']);
  assert.match(config.detailHe, /טרם חובר/);
});

test('בדיקת הבריאות מחזירה 503 עם הסבר, ולא קורסת', async () => {
  const res = await fetch(`${base}/api/health/db`);
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.driver, 'turso');
  assert.match(body.detailHe, /TURSO_DATABASE_URL/);
  assert.deepEqual(body.missing, ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN']);
});

test('קריאת API רגילה מחזירה 503 עם dbReady: false ובעברית', async () => {
  const res = await fetch(`${base}/api/me`);
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.dbReady, false);
  assert.match(body.error, /מסד הנתונים טרם חובר/);
  assert.ok(Array.isArray(body.missing) && body.missing.length === 2);
});

test('התשובה אינה חושפת סודות או עקבות פנימיים', async () => {
  const res = await fetch(`${base}/api/me`);
  const text = await res.text();
  assert.ok(!/stack|at Object|node_modules|\/home\//i.test(text), `עקבה פנימית בתשובה: ${text}`);
});

test('האתר ומסגרת האפליקציה ממשיכים לעבוד בלי מסד', async () => {
  const home = await fetch(`${base}/`);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /רון בר/);

  const app = await fetch(`${base}/app`);
  assert.equal(app.status, 200);
  assert.match(await app.text(), /<div id="main"|id="main"/);
});

test('הרשמה נכשלת בהסבר, לא בשגיאה פנימית', async () => {
  const res = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'a@b.com', password: 'Str0ng-Pass-123' }),
  });
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.dbReady, false);
});
