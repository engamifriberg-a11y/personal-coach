// בדיקות האתר: הגשת העמודים, הפרדה בין האתר לאפליקציה,
// רשימת קובצי ההתקנה, וכניסה מהירה עם קוד גישה.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';

process.env.SQLITE_PATH = ':memory:';
process.env.SESSION_SECRET = 'site-test-secret';
process.env.AI_PROVIDER = 'none';
process.env.NODE_ENV = 'test';
process.env.QUICK_ACCESS = 'on';
process.env.ACCESS_CODE = 'TestCode2026';

const { createApp } = await import('../src/server/index.ts');
const { resetAllLimits } = await import('../src/server/rate-limit.ts');

let server: Server;
let base = '';

before(async () => {
  server = createApp();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  base = `http://127.0.0.1:${port}`;
});

after(() => server.close());

async function call(cookie: string | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  const setCookie = res.headers.get('set-cookie');
  return { status: res.status, body: json, cookie: setCookie ? setCookie.split(';')[0]! : cookie };
}

// ------------------------------ הגשת האתר ------------------------------

test('עמוד הבית של האתר מוגש בשורש, בעברית ועם זכויות יוצרים', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/html/);
  const html = await res.text();
  assert.ok(html.includes('lang="he"'));
  assert.ok(html.includes('dir="rtl"'));
  assert.ok(html.includes('© 2026 רון בר. כל הזכויות שמורות.'), 'חסרה שורת זכויות היוצרים');
  assert.ok(html.includes('הורדה והתקנה'));
  // האתר אינו טוען את ה-manifest של האפליקציה
  assert.ok(!html.includes('manifest.webmanifest'));
});

test('כל עמודי האתר נגישים, גם בלי סיומת .html, וכולם נושאים זכויות יוצרים', async () => {
  for (const path of ['/download', '/download.html', '/transparency', '/privacy']) {
    const res = await fetch(`${base}${path}`);
    assert.equal(res.status, 200, `${path} לא נמצא`);
    const html = await res.text();
    assert.ok(html.includes('© 2026 רון בר'), `${path}: חסרה שורת זכויות יוצרים`);
    assert.ok(html.includes('lang="he"'), `${path}: חסרה הגדרת שפה`);
  }
});

test('נכסי האתר והאפליקציה מוגשים מאותו שורש', async () => {
  for (const [path, type] of [
    ['/site.css', /text\/css/],
    ['/site.js', /javascript/],
    ['/styles.css', /text\/css/],
    ['/app.js', /javascript/],
    ['/icons/icon-192.png', /image\/png/],
    ['/manifest.webmanifest', /manifest/],
  ] as Array<[string, RegExp]>) {
    const res = await fetch(`${base}${path}`);
    assert.equal(res.status, 200, `${path} לא נמצא`);
    assert.match(res.headers.get('content-type') ?? '', type, `${path}: סוג תוכן שגוי`);
  }
});

test('האפליקציה מוגשת תחת /app, וכל נתיב פנימי מקבל את מסגרת ה-SPA', async () => {
  for (const path of ['/app', '/app/', '/app/anything/deep']) {
    const html = await fetch(`${base}${path}`).then((r) => r.text());
    assert.ok(html.includes('manifest.webmanifest'), `${path}: לא הוגשה מסגרת האפליקציה`);
    assert.ok(html.includes('apple-touch-icon'), `${path}: חסרים תגי Apple`);
  }
});

test('נתיב לא מוכר מחזיר את עמוד הבית של האתר ולא את האפליקציה', async () => {
  const html = await fetch(`${base}/no-such-page`).then((r) => r.text());
  assert.ok(html.includes('הורדה והתקנה'));
  assert.ok(!html.includes('manifest.webmanifest'));
});

test('קובצי HTML אינם נשמרים במטמון, וה-Service Worker מקבל הרשאת scope', async () => {
  const home = await fetch(`${base}/`);
  assert.equal(home.headers.get('cache-control'), 'no-cache');
  const sw = await fetch(`${base}/sw.js`);
  assert.equal(sw.headers.get('service-worker-allowed'), '/');
  const css = await fetch(`${base}/site.css`);
  assert.match(css.headers.get('cache-control') ?? '', /max-age/);
});

// ---------------------------- קובצי התקנה ----------------------------

test('רשימת ההורדות מחזירה מה שקיים בפועל, בלי קישורים מומצאים', async () => {
  const res = await call(null, 'GET', '/api/downloads');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.files));
  // התיקייה מכילה רק README, שאינו סוג קובץ מותר להצגה
  assert.equal(res.body.files.length, 0);
  assert.ok(res.body.noteHe.includes('Android SDK'), 'צריך להסביר למה אין קובץ');
});

test('בקשת קובץ הורדה שאינו מסוג מותר נדחית', async () => {
  const res = await fetch(`${base}/downloads/README.md`);
  // נופל לעמוד הבית ולא מגיש את הקובץ
  const html = await res.text();
  assert.ok(!html.includes('# תיקיית קובצי התקנה'), 'אסור להגיש קבצים שאינם קובצי התקנה');
});

test('ניסיון לצאת מתיקיית ההורדות נחסם', async () => {
  const res = await fetch(`${base}/downloads/..%2F..%2Fpackage.json`);
  const text = await res.text();
  assert.ok(!text.includes('"name": "coach-app"'), 'דליפת קובץ מחוץ לתיקייה');
});

test('מידע פומבי לאתר אינו חושף נתוני משתמשים', async () => {
  const res = await call(null, 'GET', '/api/site-info');
  assert.equal(res.status, 200);
  assert.ok(res.body.library.total >= 40);
  assert.ok(res.body.pendingReviewCount > 0);
  assert.ok(res.body.copyrightHe.includes('רון בר'));
  assert.equal(JSON.stringify(res.body).includes('@'), false, 'אין לחשוף כתובות');
});

// ----------------------------- כניסה מהירה -----------------------------

test('כניסה מהירה: כל שם עובד עם הקוד הנכון, ואותו שם חוזר לאותם נתונים', async () => {
  resetAllLimits();
  const first = await call(null, 'POST', '/api/auth/access', {
    name: 'רון',
    code: 'TestCode2026',
    consentHealthData: true,
  });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.isNew, true);
  assert.equal(first.body.user.displayName, 'רון');
  assert.equal(first.body.user.viaAccessCode, true);
  assert.ok(first.body.user.consentHealthDataAt, 'ההסכמה הייתה צריכה להישמר');
  assert.ok(first.body.noticeHe.includes('קוד הגישה'), 'צריכה להופיע ההסתייגות');

  // שמירת פרופיל, ואז כניסה חוזרת עם אותו שם
  const profile = await call(first.cookie, 'POST', '/api/profile', {
    ageYears: 30, heightCm: 180, weightKg: 80, sex: 'male', sexSkipped: false,
    primaryGoal: 'muscle_gain', experience: 'novice', dailyActivity: 'moderate',
    sessionsPerWeek: 3, minutesPerSession: 45, location: 'home',
    equipment: ['bodyweight'], wakeTime: '07:00', sleepTime: '23:00',
    mealsPerDay: 3, prepMinutesPerDay: 30, budgetLevel: 'medium',
  });
  assert.equal(profile.status, 200, JSON.stringify(profile.body));

  resetAllLimits();
  const second = await call(null, 'POST', '/api/auth/access', { name: '  רון  ', code: 'TestCode2026' });
  assert.equal(second.status, 200);
  assert.equal(second.body.isNew, false, 'אותו שם צריך להחזיר את אותו חשבון');
  const me = await call(second.cookie, 'GET', '/api/profile');
  assert.ok(me.body.profile, 'הנתונים של אותו שם צריכים לחזור');
  assert.equal(me.body.profile.weightKg, 80);
});

test('כניסה מהירה: שמות שונים מקבלים חשבונות מופרדים', async () => {
  resetAllLimits();
  const a = await call(null, 'POST', '/api/auth/access', { name: 'דנה', code: 'TestCode2026', consentHealthData: true });
  resetAllLimits();
  const b = await call(null, 'POST', '/api/auth/access', { name: 'יוסי', code: 'TestCode2026', consentHealthData: true });
  assert.notEqual(a.body.user.id, b.body.user.id);

  await call(a.cookie, 'POST', '/api/profile', {
    ageYears: 28, heightCm: 165, weightKg: 60, sex: 'female', sexSkipped: false,
    primaryGoal: 'endurance', experience: 'beginner', dailyActivity: 'light',
    sessionsPerWeek: 2, minutesPerSession: 30, location: 'outdoor',
    equipment: ['bodyweight'], wakeTime: '06:00', sleepTime: '22:00',
    mealsPerDay: 3, prepMinutesPerDay: 20, budgetLevel: 'low',
  });
  const bProfile = await call(b.cookie, 'GET', '/api/profile');
  assert.equal(bProfile.body.profile, null, 'משתמש אחר לא רואה את הפרופיל');
});

test('כניסה מהירה: קוד שגוי נדחה, ושם קצר מדי נדחה', async () => {
  resetAllLimits();
  const wrong = await call(null, 'POST', '/api/auth/access', { name: 'מישהו', code: 'לא נכון' });
  assert.equal(wrong.status, 401);
  assert.ok(wrong.body.error.includes('קוד הגישה'));

  resetAllLimits();
  const shortName = await call(null, 'POST', '/api/auth/access', { name: 'א', code: 'TestCode2026' });
  assert.equal(shortName.status, 400);
});

test('הגבלת קצב חוסמת ניחוש של קוד הגישה', async () => {
  resetAllLimits();
  let blocked = 0;
  let lastError = '';
  for (let i = 0; i < 14; i++) {
    const res = await call(null, 'POST', '/api/auth/access', { name: `נסיון${i}`, code: 'ניחוש שגוי' });
    if (res.status === 429) {
      blocked++;
      lastError = res.body.error;
    }
  }
  assert.ok(blocked > 0, 'חייבת להיות חסימה אחרי ניסיונות חוזרים');
  assert.ok(lastError.includes('נסו שוב בעוד'), 'ההודעה צריכה לומר מתי לנסות שוב');
  resetAllLimits();
});

test('כניסה מהירה כבויה מחזירה 404 כשההגדרה מכובה', async () => {
  process.env.QUICK_ACCESS = 'off';
  resetAllLimits();
  const res = await call(null, 'POST', '/api/auth/access', { name: 'מישהו', code: 'TestCode2026' });
  assert.equal(res.status, 404);
  const me = await call(null, 'GET', '/api/me');
  assert.equal(me.body.quickAccess, false);
  process.env.QUICK_ACCESS = 'on';
});

test('מחיקת חשבון כניסה מהירה מאומתת בקוד הגישה', async () => {
  resetAllLimits();
  const login = await call(null, 'POST', '/api/auth/access', {
    name: 'למחיקה', code: 'TestCode2026', consentHealthData: true,
  });
  assert.equal(login.status, 200);

  const wrong = await call(login.cookie, 'POST', '/api/account/delete', {
    password: 'קוד שגוי', confirm: 'מחק את החשבון',
  });
  assert.equal(wrong.status, 400);

  const deleted = await call(login.cookie, 'POST', '/api/account/delete', {
    password: 'TestCode2026', confirm: 'מחק את החשבון',
  });
  assert.equal(deleted.status, 200);

  const after = await call(login.cookie, 'GET', '/api/profile');
  assert.equal(after.status, 401, 'הסשן היה צריך להתבטל');
});

test('הגבלת קצב מוחלת גם על התחברות עם אימייל', async () => {
  resetAllLimits();
  let saw429 = false;
  for (let i = 0; i < 14; i++) {
    const res = await call(null, 'POST', '/api/auth/login', {
      email: 'nobody@demo.local', password: 'WrongPassword123',
    });
    if (res.status === 429) saw429 = true;
  }
  assert.ok(saw429, 'התחברות חוזרת ונכשלת צריכה להיחסם');
  resetAllLimits();
});
