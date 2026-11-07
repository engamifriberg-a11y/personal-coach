// בדיקות רינדור של מסכי הלקוח מול שרת אמיתי, עם שכבת DOM מינימלית.
// מאמתות שכל מסך ליבה נבנה בלי שגיאה, ושהתוכן מהשרת אכן מופיע בעברית על המסך.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { installDom } from './dom-stub.ts';

process.env.SQLITE_PATH = ':memory:';
process.env.SESSION_SECRET = 'ui-test-secret';
process.env.AI_PROVIDER = 'none';
process.env.NODE_ENV = 'test';

const { createApp } = await import('../src/server/index.ts');

let server: Server;
let dom: ReturnType<typeof installDom>;
let screens: typeof import('../public/screens-core.js');
let more: typeof import('../public/screens-more.js');

const PROFILE = {
  ageYears: 29, heightCm: 172, weightKg: 70, sex: 'female', sexSkipped: false,
  primaryGoal: 'muscle_gain', secondaryGoals: [], experience: 'novice', dailyActivity: 'moderate',
  sessionsPerWeek: 3, minutesPerSession: 45, location: 'gym',
  equipment: ['bodyweight', 'dumbbells', 'bench', 'machines', 'cables', 'mat', 'cardio_machine'],
  likedExerciseIds: [], avoidedExerciseIds: [], limitations: [], healthFlags: [],
  wakeTime: '07:00', sleepTime: '23:00', preferredTrainingTime: '18:00',
  dietPatterns: [], allergens: ['peanuts'], mealsPerDay: 4, prepMinutesPerDay: 30, budgetLevel: 'medium',
};

const ctx = { navigate: () => {}, onLeave: () => {} };

before(async () => {
  server = createApp();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  dom = installDom(`http://127.0.0.1:${port}`);

  // טעינת מודולי המסכים אחרי התקנת ה-DOM (הם משתמשים ב-document בזמן ריצה)
  screens = await import('../public/screens-core.js');
  more = await import('../public/screens-more.js');

  const { api, refreshMe } = await import('../public/api.js');
  await api.post('/api/auth/register', {
    email: 'ui@demo.local', password: 'Password12345', consentHealthData: true, consentAi: false,
  });
  await api.post('/api/profile', PROFILE);
  await api.post('/api/plan/generate');
  await api.post('/api/nutrition/generate');
  await api.post('/api/measurements', { weightKg: 70, waistCm: 74 });
  await refreshMe();
});

after(() => {
  dom?.restore();
  server.close();
});

test('מסך הכניסה נבנה עם טופס והסכמות', async () => {
  const node = await screens.renderAuth(ctx as any);
  const text = node.textContent;
  assert.ok(text.includes('מאמן אישי'));
  assert.ok(text.includes('שמירת נתוני בריאות'));
  assert.ok(text.includes('18 ומעלה'), 'חייבת להיות הבהרה על קהל היעד');
  assert.ok(node.querySelectorAll('input').length >= 2);
});

test('הדשבורד מציג את האימון הבא, ארוחות היום והתמדה', async () => {
  const node = await screens.renderDashboard(ctx as any);
  const text = node.textContent;
  assert.ok(text.includes('האימון') || text.includes('אימון'));
  assert.ok(text.includes('דקות'));
  assert.ok(text.includes('הארוחות של היום'), 'חסר רכיב ארוחות היום');
  assert.ok(text.includes('התמדה'));
  assert.ok(node.querySelector('.hero'), 'חסר רכיב כותרת ראשית');
});

test('הלוח השבועי מציג שבעה ימים, כולל ימי מנוחה, ומקורות הכללים', async () => {
  const node = await screens.renderWeek(ctx as any);
  const days = node.querySelectorAll('.day');
  assert.equal(days.length, 7);
  assert.ok(node.querySelectorAll('.day--rest').length >= 1, 'חייבים להופיע ימי מנוחה');
  const text = node.textContent;
  assert.ok(text.includes('יעד אירובי'));
  assert.ok(text.includes('הכללים שהופעלו'), 'חייבת להיות שקיפות לגבי הכללים');
});

test('מסך אימון פעיל: טבלת סטים, טיימר מנוחה, החלפה ודיווח כאב', async () => {
  const plan = await (await import('../public/api.js')).api.get('/api/plan/active');
  const day = plan.plan.workouts[0].dayIndex;
  const node = await screens.renderWorkout(ctx as any, String(day));
  const text = node.textContent;
  assert.ok(node.querySelector('.timer'), 'חסר טיימר מנוחה');
  assert.ok(node.querySelectorAll('.set-grid').length > 0, 'חסרה טבלת סטים');
  assert.ok(text.includes('החלפת תרגיל'));
  assert.ok(text.includes('כאב'));
  assert.ok(text.includes('RPE'), 'חייבת להופיע הנחיית עצימות');
  assert.ok(text.includes('סיום אימון'));

  // שמירת סט דרך לחיצה על כפתור האישור בממשק
  const ok = node.querySelector('.set-grid__ok');
  assert.ok(ok, 'חסר כפתור שמירת סט');
  const weight = node.querySelectorAll('input')[0]!;
  weight.value = '20';
  ok!.dispatch('click');
  await new Promise((r) => setTimeout(r, 120));
  const open = await (await import('../public/api.js')).api.get('/api/workout/open');
  assert.ok(open.session, 'האימון צריך להיות פתוח ושמור בשרת');
});

test('ספריית התרגילים נטענת עם סינון ועם רשימת תרגילים', async () => {
  const node = await more.renderLibrary(ctx as any);
  await new Promise((r) => setTimeout(r, 150));
  const text = node.textContent;
  assert.ok(text.includes('סינון'));
  assert.ok(node.querySelectorAll('.list-item').length > 10, 'חסרים תרגילים ברשימה');
  assert.ok(text.includes('הוראות כתובות'), 'חייבת להיות הבהרה לגבי היעדר סרטונים');
});

test('מסך התזונה מציג אומדן, מאקרו, תפריט ורשימת קניות עם מקור הנתונים', async () => {
  const node = await more.renderNutrition(ctx as any);
  const text = node.textContent;
  assert.ok(text.includes('אומדן אנרגיה'));
  assert.ok(text.includes('טווח'), 'חייב להופיע טווח אי־ודאות');
  assert.ok(text.includes('יעדי מאקרו'));
  assert.ok(text.includes('רשימת קניות'));
  assert.ok(text.includes('FoodData Central'), 'חייב להופיע מקור נתוני התזונה');
  assert.ok(node.querySelectorAll('.meal-table').length > 0);
});

test('מסך המעקב מציג התמדה, מגמה וטופס מדידות', async () => {
  const node = await more.renderProgress(ctx as any);
  const text = node.textContent;
  assert.ok(text.includes('התמדה'));
  assert.ok(text.includes('מגמת משקל'));
  assert.ok(text.includes('מדידות'));
  assert.ok(node.querySelector('.ring'), 'חסר רכיב טבעת התקדמות');
});

test('מסך הפרופיל מציג הסכמות, גרסאות תוכנית, פרטיות ומחיקת חשבון', async () => {
  const node = await more.renderProfile(ctx as any);
  const text = node.textContent;
  assert.ok(text.includes('ui@demo.local'));
  assert.ok(text.includes('הסכמות'));
  assert.ok(text.includes('גרסאות התוכנית'));
  assert.ok(text.includes('פרטיות ואבטחה'));
  assert.ok(text.includes('מחיקת חשבון'));
  assert.ok(text.includes('ייצוא כל הנתונים'));
});

test('פאנל הניהול חסום למשתמש רגיל ומציג הודעה ברורה', async () => {
  const node = await more.renderAdmin(ctx as any);
  assert.ok(node.textContent.includes('מנהלי תוכן'), 'צריכה להופיע הודעת חוסר הרשאה');
});

test('השאלון נבנה עם סרגל שלבים ושומר טיוטה', async () => {
  const node = await screens.renderQuestionnaire(ctx as any);
  const text = node.textContent;
  assert.ok(node.querySelector('.steps'), 'חסר סרגל שלבים');
  assert.ok(text.includes('מה המטרה'));
  assert.ok(text.includes('נשמרות אוטומטית'));
  assert.ok(node.querySelectorAll('.chip').length > 4, 'חסרות אפשרויות בחירה');
});
