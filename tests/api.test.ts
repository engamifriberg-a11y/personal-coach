// בדיקות מקצה לקצה מול שרת אמיתי: מסלול המשתמש, בידוד נתונים, שחזור אימון
// והתנהגות כשאין שירות AI.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';

process.env.SQLITE_PATH = ':memory:';
process.env.SESSION_SECRET = 'test-secret-for-e2e-only';
process.env.AI_PROVIDER = 'none';
process.env.NODE_ENV = 'test';

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

after(() => {
  server.close();
});

type Client = { cookie: string };

async function call(client: Client | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(client?.cookie ? { cookie: client.cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  if (client && setCookie) client.cookie = setCookie.split(';')[0]!;
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, body: json };
}

async function register(email: string, opts: { consentHealth?: boolean } = {}) {
  // הגבלת הקצב נבדקת בנפרד ב-site.test.ts. כאן כל הבדיקות יוצאות מאותה כתובת,
  // ולכן מאפסים את המונה כדי שהמגבלה לא תחסום את הבדיקות עצמן.
  resetAllLimits();
  const client: Client = { cookie: '' };
  const res = await call(client, 'POST', '/api/auth/register', {
    email,
    password: 'Password12345',
    consentHealthData: opts.consentHealth !== false,
    consentAi: false,
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return client;
}

const baseProfile = {
  ageYears: 34, heightCm: 176, weightKg: 84, sex: 'male', sexSkipped: false,
  primaryGoal: 'fat_loss_recomp', secondaryGoals: ['strength'],
  experience: 'beginner', dailyActivity: 'light',
  sessionsPerWeek: 3, minutesPerSession: 45,
  location: 'home', equipment: ['bodyweight', 'dumbbells', 'mat'],
  likedExerciseIds: [], avoidedExerciseIds: [],
  limitations: [], healthFlags: [],
  wakeTime: '06:45', sleepTime: '23:00', workStart: '09:00', workEnd: '18:00', preferredTrainingTime: '19:30',
  dietPatterns: [], allergens: ['tree_nuts'], mealsPerDay: 3, prepMinutesPerDay: 30, budgetLevel: 'medium',
};

test('הממשק מוגש בעברית ובכיוון RTL, עם קובצי PWA', async () => {
  const html = await fetch(`${base}/app`).then((r) => r.text());
  assert.ok(html.includes('lang="he"'));
  assert.ok(html.includes('dir="rtl"'));
  assert.ok(html.includes('viewport-fit=cover'), 'נדרש בשביל safe area באייפון');
  assert.ok(html.includes('apple-touch-icon'), 'נדרש להתקנה באייפון');
  assert.ok(html.includes('manifest.webmanifest'));

  const manifest = await fetch(`${base}/manifest.webmanifest`).then((r) => r.json());
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.dir, 'rtl');
  // האפליקציה יושבת תחת /app, והאתר תחת /
  assert.equal(manifest.start_url, '/app');
  assert.equal(manifest.scope, '/app');
  assert.ok(manifest.icons.some((i: any) => i.purpose === 'maskable'), 'נדרש אייקון maskable לאנדרואיד');

  const sw = await fetch(`${base}/sw.js`);
  assert.equal(sw.status, 200);
  assert.equal(sw.headers.get('service-worker-allowed'), '/');
});

test('מסלול מלא: הרשמה -> שאלון -> תוכנית שמתאימה לזמינות ולציוד', async () => {
  const client = await register('flow@demo.local');

  // שמירת טיוטה והמשך מאוחר יותר
  await call(client, 'POST', '/api/questionnaire/draft', { step: 2, data: { primaryGoal: 'strength' } });
  const draft = await call(client, 'GET', '/api/questionnaire/draft');
  assert.equal(draft.body.step, 2);
  assert.equal(draft.body.data.primaryGoal, 'strength');

  const saved = await call(client, 'POST', '/api/profile', baseProfile);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.ok(saved.body.precisionNoteHe.includes('אינם מספיקים'), 'חייבת להיות הבהרה שאין דיוק מדומה');
  assert.ok(saved.body.energy.tdeeRangeKcal[1] > saved.body.energy.tdeeRangeKcal[0]);

  const gen = await call(client, 'POST', '/api/plan/generate');
  assert.equal(gen.status, 200, JSON.stringify(gen.body));
  const plan = gen.body.plan;
  assert.equal(plan.workouts.length, 3);
  assert.ok(gen.body.explanation.textHe.length > 20);
  // בלי הסכמה ל-AI, הניסוח מקומי
  assert.equal(gen.body.explanation.provider, 'none');
  assert.ok(gen.body.rules.length > 0, 'חייבים להחזיר את הכללים שהופעלו');

  // כל התרגילים אפשריים עם הציוד שהוזן
  const active = await call(client, 'GET', '/api/plan/active');
  const byId = new Map(active.body.exercises.map((e: any) => [e.id, e]));
  for (const w of active.body.plan.workouts) {
    for (const b of w.blocks) {
      for (const pe of b.exercises) {
        const ex: any = byId.get(pe.exerciseId);
        if (!ex) continue;
        assert.ok(
          ex.equipment.length === 0 || ex.equipment.some((eq: string) => baseProfile.equipment.includes(eq)),
          `${ex.id} דורש ציוד שאין`,
        );
      }
    }
  }
});

test('הטיוטה דורשת הסכמה לשמירת נתוני בריאות', async () => {
  const client = await register('noconsent@demo.local', { consentHealth: false });
  const res = await call(client, 'POST', '/api/questionnaire/draft', { step: 0, data: { a: 1 } });
  assert.equal(res.status, 403);
  assert.ok(res.body.error.includes('הסכמה'));
  // לאחר מתן הסכמה - עובד
  await call(client, 'POST', '/api/consents', { consentHealthData: true });
  const ok = await call(client, 'POST', '/api/questionnaire/draft', { step: 0, data: { a: 1 } });
  assert.equal(ok.status, 200);
});

test('מגבלה שהוזנה משפיעה על בחירת התרגילים', async () => {
  const client = await register('limits@demo.local');
  await call(client, 'POST', '/api/profile', {
    ...baseProfile,
    limitations: [{ area: 'knee', severity: 'severe' }],
  });
  const gen = await call(client, 'POST', '/api/plan/generate');
  assert.equal(gen.status, 200);
  const active = await call(client, 'GET', '/api/plan/active');
  const byId = new Map(active.body.exercises.map((e: any) => [e.id, e]));
  for (const w of active.body.plan.workouts) {
    for (const b of w.blocks) {
      for (const pe of b.exercises) {
        const ex: any = byId.get(pe.exerciseId);
        if (!ex) continue;
        assert.ok(!ex.loadsJoints.includes('knee'), `${ex.id} מעמיס ברך חסומה`);
      }
    }
  }
});

test('דגל אדום עוצר יצירת תוכנית ומסביר מה נדרש', async () => {
  const client = await register('redflag@demo.local');
  const saved = await call(client, 'POST', '/api/profile', {
    ...baseProfile,
    healthFlags: ['chest_pain_at_rest_or_exertion'],
  });
  assert.equal(saved.body.safety.allowTrainingPlan, false);
  const gen = await call(client, 'POST', '/api/plan/generate');
  assert.equal(gen.status, 409);
  assert.ok(gen.body.details.whatIsNeededHe.join(' ').includes('רופא'));
});

test('יעד קיצוני מפעיל הסבר וחלופה', async () => {
  const client = await register('extreme@demo.local');
  const saved = await call(client, 'POST', '/api/profile', {
    ...baseProfile,
    targetWeightKg: 62,
    targetWeeks: 6,
  });
  assert.equal(saved.body.realism.realistic, false);
  assert.ok(saved.body.realism.suggestedWeeks > 6);
  assert.ok(saved.body.realism.messageHe.includes('חלופה'));
});

test('אימון נשמר וניתן להמשיך אותו אחרי רענון/סגירה', async () => {
  const client = await register('workout@demo.local');
  await call(client, 'POST', '/api/profile', baseProfile);
  await call(client, 'POST', '/api/plan/generate');
  const active = await call(client, 'GET', '/api/plan/active');
  const dayIndex = active.body.plan.workouts[0].dayIndex;

  const started = await call(client, 'POST', '/api/workout/start', { dayIndex });
  assert.equal(started.status, 200);
  const sessionId = started.body.session.id;
  const mainBlock = started.body.workout.blocks.find((b: any) => b.kind === 'main');
  const exerciseId = mainBlock.exercises[0].exerciseId;

  await call(client, 'POST', `/api/workout/${sessionId}/set`, {
    exerciseId, setNumber: 1, weightKg: 20, reps: 10, rpe: 7,
  });
  await call(client, 'POST', `/api/workout/${sessionId}/cursor`, { blockIndex: 1, exerciseIndex: 0, setNumber: 2 });

  // "רענון": שליפת האימון הפתוח מחדש
  const open = await call(client, 'GET', '/api/workout/open');
  assert.equal(open.body.session.id, sessionId);
  assert.equal(open.body.session.logs[0].sets[0].reps, 10);
  assert.equal(open.body.session.cursor.setNumber, 2);

  // התחלה מחדש של אותו יום מחזירה את אותו אימון ולא פותחת חדש
  const again = await call(client, 'POST', '/api/workout/start', { dayIndex });
  assert.equal(again.body.resumed, true);
  assert.equal(again.body.session.id, sessionId);

  const done = await call(client, 'POST', `/api/workout/${sessionId}/complete`, { sessionRpe: 7 });
  assert.equal(done.status, 200);
  assert.equal(done.body.summary.totalSets, 1);
  assert.ok(done.body.summary.comparisonHe.length > 0);
});

test('דיווח על תסמין דגל אדום בזמן אימון עוצר את האימון', async () => {
  const client = await register('symptom@demo.local');
  await call(client, 'POST', '/api/profile', baseProfile);
  await call(client, 'POST', '/api/plan/generate');
  const active = await call(client, 'GET', '/api/plan/active');
  const started = await call(client, 'POST', '/api/workout/start', { dayIndex: active.body.plan.workouts[0].dayIndex });
  const res = await call(client, 'POST', `/api/workout/${started.body.session.id}/symptom`, { symptom: 'chest_pain' });
  assert.equal(res.body.stop, true);
  assert.ok(res.body.messageHe.includes('עצרו את האימון'));
  assert.equal(res.body.session.status, 'abandoned');
});

test('משתמש אינו יכול לקרוא או לשנות נתונים של משתמש אחר', async () => {
  const a = await register('owner@demo.local');
  const b = await register('intruder@demo.local');
  await call(a, 'POST', '/api/profile', baseProfile);
  await call(a, 'POST', '/api/plan/generate');
  const activeA = await call(a, 'GET', '/api/plan/active');
  const startedA = await call(a, 'POST', '/api/workout/start', { dayIndex: activeA.body.plan.workouts[0].dayIndex });
  const sessionId = startedA.body.session.id;

  // קריאה
  const read = await call(b, 'GET', `/api/workout/${sessionId}`);
  assert.equal(read.status, 404, 'אסור לחשוף אימון של משתמש אחר');
  // כתיבה
  const write = await call(b, 'POST', `/api/workout/${sessionId}/set`, {
    exerciseId: 'pushup', setNumber: 1, reps: 10,
  });
  assert.equal(write.status, 404);
  // התוכנית של b ריקה
  const planB = await call(b, 'GET', '/api/plan/active');
  assert.equal(planB.body.plan, null);
  // בלי התחברות בכלל
  const anon = await call(null, 'GET', '/api/plan/active');
  assert.equal(anon.status, 401);
});

test('אלרגנים שהוגדרו אינם מופיעים בהצעות המזון', async () => {
  const client = await register('allergy@demo.local');
  await call(client, 'POST', '/api/profile', { ...baseProfile, allergens: ['tree_nuts', 'milk'] });
  const gen = await call(client, 'POST', '/api/nutrition/generate');
  assert.equal(gen.status, 200, JSON.stringify(gen.body));
  const plan = gen.body.plan;
  assert.equal(plan.blocked, false);
  const foods = await call(client, 'GET', '/api/foods');
  const byId = new Map(foods.body.foods.map((f: any) => [f.id, f]));
  for (const day of plan.days) {
    for (const m of day.meals) {
      for (const c of m.meal.components) {
        const f: any = byId.get(c.foodId);
        assert.ok(!f.allergens.includes('tree_nuts') && !f.allergens.includes('milk'), `${f.nameHe} מכיל אלרגן`);
      }
    }
  }
  assert.ok(gen.body.dataSource.citation.includes('FoodData Central'), 'חייב לציין את מקור הנתונים');
});

test('סרטונים: בלי נכס מאומת מוצגות הוראות כתובות ולא נגן שבור', async () => {
  const list = await call(null, 'GET', '/api/exercises?pattern=squat');
  assert.equal(list.status, 200);
  for (const ex of list.body.exercises) {
    if (!ex.mediaReady) {
      assert.ok(ex.mediaFallbackHe.length > 0, `${ex.id}: חסרה הודעת חלופה`);
      assert.ok(ex.stepsHe.length > 0, `${ex.id}: חסרות הוראות כתובות`);
      assert.equal(ex.media.path, null, 'אסור שיהיה קישור מומצא');
    }
    // תוכן שלא עבר ביקורת מסומן
    if (!ex.professionallyReviewed) assert.ok(ex.reviewNote);
  }
});

test('כשל בשירות AI אינו מוחק תוכנית קיימת', async () => {
  const client = await register('aifail@demo.local');
  await call(client, 'POST', '/api/profile', baseProfile);
  const first = await call(client, 'POST', '/api/plan/generate');
  const planVersion = first.body.plan.version;

  // מדמים ספק AI שבור: כתובת לא קיימת + הסכמה ל-AI
  process.env.AI_PROVIDER = 'anthropic';
  process.env.ANTHROPIC_API_KEY = 'invalid-key-for-test';
  await call(client, 'POST', '/api/consents', { consentAi: true });

  const nutrition = await call(client, 'POST', '/api/nutrition/generate');
  assert.equal(nutrition.status, 200, 'תזונה צריכה להיבנות גם כשה-AI נכשל');

  const stillThere = await call(client, 'GET', '/api/plan/active');
  assert.ok(stillThere.body.plan, 'התוכנית הקיימת חייבת להישאר');
  assert.equal(stillThere.body.plan.version, planVersion);

  process.env.AI_PROVIDER = 'none';
  delete process.env.ANTHROPIC_API_KEY;
});

test('שינוי מהותי בתוכנית ממתין לאישור ואינו מחליף את הפעילה', async () => {
  const client = await register('approve@demo.local');
  await call(client, 'POST', '/api/profile', { ...baseProfile, sessionsPerWeek: 3 });
  const v1 = await call(client, 'POST', '/api/plan/generate');
  assert.equal(v1.body.plan.status, 'active');

  await call(client, 'POST', '/api/profile', { ...baseProfile, sessionsPerWeek: 5 });
  const v2 = await call(client, 'POST', '/api/plan/generate');
  assert.equal(v2.body.requiresApproval, true);
  assert.ok(v2.body.diff.changes.length > 0);
  for (const c of v2.body.diff.changes) assert.ok(c.reasonHe, 'כל שינוי חייב סיבה');

  const stillV1 = await call(client, 'GET', '/api/plan/active');
  assert.equal(stillV1.body.plan.version, v1.body.plan.version);

  const approved = await call(client, 'POST', `/api/plan/approve/${v2.body.diffId}`);
  assert.equal(approved.status, 200);
  const nowV2 = await call(client, 'GET', '/api/plan/active');
  assert.equal(nowV2.body.plan.version, v2.body.plan.version);
});

test('הרשאות מנהל נאכפות בצד השרת', async () => {
  const user = await register('plainuser@demo.local');
  const res = await call(user, 'GET', '/api/admin/overview');
  assert.equal(res.status, 403);
  const media = await call(user, 'POST', '/api/admin/media', {
    exerciseId: 'pushup', path: 'x.mp4', source: 's', owner: 'o', license: 'l', verified: true,
  });
  assert.equal(media.status, 403);
});

test('ייצוא נתונים ומחיקת חשבון עובדים ומוחקים בפועל', async () => {
  const client = await register('deleteme@demo.local');
  await call(client, 'POST', '/api/profile', baseProfile);
  await call(client, 'POST', '/api/plan/generate');

  const exported = await call(client, 'GET', '/api/account/export');
  assert.equal(exported.status, 200);
  assert.ok(exported.body.profile);
  assert.ok(exported.body.plans.length >= 1);

  const wrongPw = await call(client, 'POST', '/api/account/delete', { password: 'nope', confirm: 'מחק את החשבון' });
  assert.equal(wrongPw.status, 400);

  const deleted = await call(client, 'POST', '/api/account/delete', {
    password: 'Password12345',
    confirm: 'מחק את החשבון',
  });
  assert.equal(deleted.status, 200);

  // הסשן בוטל והחשבון איננו
  const after2 = await call(client, 'GET', '/api/plan/active');
  assert.equal(after2.status, 401);
  const login = await call(null, 'POST', '/api/auth/login', { email: 'deleteme@demo.local', password: 'Password12345' });
  assert.equal(login.status, 401);
});

test('מטא: מוצג מספר הכללים שממתינים לביקורת מקצועית', async () => {
  const meta = await call(null, 'GET', '/api/meta');
  assert.ok(meta.body.pendingReviewCount > 0);
  assert.ok(meta.body.disclaimerHe.includes('אינה מהווה אבחון'));
  assert.ok(meta.body.libraryStats.total >= 40);
});
