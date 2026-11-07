// api/index.ts הוא החיבור בין Vercel לשרת. הוא קטן, אבל אם הוא שוגה בנתיב
// כל ה-API נופל - ולא היה אפשר לדעת את זה בלי לפרוס.
//
// Vercel בפרויקט בלי framework מזהה רק שמות קבצים פשוטים ב-api/, ולכן הניתוב
// של /api/* נעשה ב-vercel.json והנתיב המקורי מגיע בפרמטר __path.
// הבדיקות כאן מריצות את אותה פונקציה מעל node:http ומוודאות שהשרת רואה את
// הנתיב הנכון, ושפרמטר העזר אינו דולף לשאילתה שהשרת קורא.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const handler = (await import('../api/index.ts')).default;

let server: Server;
let base = '';

before(async () => {
  server = createServer((req, res) => handler(req, res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('הנתיב המקורי מ-__path הוא מה שהשרת מנתב לפיו', async () => {
  const res = await fetch(`${base}/api/index?__path=/api/site-info`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.library, 'התשובה אינה של /api/site-info');
  assert.match(body.copyrightHe, /רון בר/);
});

test('בלי __path הנתיב נשאר כפי שהגיע', async () => {
  const res = await fetch(`${base}/api/site-info`);
  assert.equal(res.status, 200);
  assert.ok((await res.json()).library);
});

test('שאילתה אמיתית נשמרת, ופרמטר העזר מוסר', async () => {
  // /api/meta אינו משתמש בשאילתה, ולכן נבדק כאן שהבקשה עוברת ומגיעה ליעד
  // הנכון גם כששני סוגי הפרמטרים מעורבבים.
  const res = await fetch(`${base}/api/index?__path=/api/meta&foo=bar`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.rules ?? body.sources ?? body.goals, 'התשובה אינה של /api/meta');
});

test('נתיב לא קיים מחזיר 404 של ה-API, לא 404 של האירוח', async () => {
  const res = await fetch(`${base}/api/index?__path=/api/no-such-route`);
  assert.equal(res.status, 404);
  assert.match((await res.json()).error, /נתיב API/);
});

test('__path שאינו מתחיל ב-/api/ מתעלמים ממנו', async () => {
  // הגנה מפני ניסיון להגיע לנתיב סטטי דרך הפונקציה.
  const res = await fetch(`${base}/api/index?__path=/../../etc/passwd`);
  assert.equal(res.status, 404);
  const text = await res.text();
  assert.ok(!text.includes('root:'), 'דליפת קובץ מערכת');
});

test('vercel.json מנתב את כל /api/* לפונקציה, עם הנתיב המקורי', () => {
  const config = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
  const rule = config.rewrites.find((r: { source: string }) => r.source === '/api/(.*)');
  assert.ok(rule, 'אין כלל ניתוב ל-/api/*');
  assert.equal(rule.destination, '/api/index?__path=/api/$1');
});
