// הפקת תצוגה מקדימה סטטית של העיצוב.
//
// הסקריפט מריץ את השרת האמיתי בזיכרון, יוצר משתמש דמו עם תוכנית ותפריט,
// מרנדר את מסכי הממשק האמיתיים דרך שכבת DOM מינימלית, וממיר את התוצאה ל-HTML אחד.
// המטרה: אפשר לראות את העיצוב בטלפון בלי להריץ שרת. התצוגה סטטית - הכפתורים אינם פעילים.
//
// הרצה:  node --experimental-strip-types --no-warnings scripts/make-preview.ts

import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installDom, serialize } from '../tests/dom-stub.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

process.env.SQLITE_PATH = ':memory:';
process.env.SESSION_SECRET = 'preview-only-secret';
process.env.AI_PROVIDER = 'none';
process.env.NODE_ENV = 'development';

const { createApp } = await import('../src/server/index.ts');
const server = createApp();
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
const addr = server.address();
const port = typeof addr === 'object' && addr ? addr.port : 0;

const dom = installDom(`http://127.0.0.1:${port}`);
const screens = await import('../public/screens-core.js');
const more = await import('../public/screens-more.js');
const { api, refreshMe } = await import('../public/api.js');

await api.post('/api/auth/register', {
  email: 'preview@demo.local',
  password: 'Password12345',
  consentHealthData: true,
  consentAi: false,
});
await api.post('/api/profile', {
  ageYears: 34, heightCm: 176, weightKg: 84, sex: 'male', sexSkipped: false,
  primaryGoal: 'fat_loss_recomp', secondaryGoals: ['strength'],
  experience: 'novice', dailyActivity: 'light',
  sessionsPerWeek: 3, minutesPerSession: 45, location: 'gym',
  equipment: ['bodyweight', 'dumbbells', 'barbell', 'bench', 'machines', 'cables', 'pullup_bar', 'cardio_machine', 'mat'],
  likedExerciseIds: [], avoidedExerciseIds: [],
  limitations: [{ area: 'knee', severity: 'mild' }], healthFlags: [],
  wakeTime: '06:45', sleepTime: '23:00', workStart: '09:00', workEnd: '18:00', preferredTrainingTime: '19:30',
  dietPatterns: ['kosher'], allergens: ['tree_nuts'], mealsPerDay: 4, prepMinutesPerDay: 30, budgetLevel: 'medium',
});
await api.post('/api/plan/generate');
await api.post('/api/nutrition/generate');

// מדידות לדוגמה כדי שהגרפים לא יהיו ריקים
const today = Date.now();
for (let i = 21; i >= 0; i -= 3) {
  await api.post('/api/measurements', {
    takenAt: new Date(today - i * 86400000).toISOString(),
    weightKg: Math.round((84 - (21 - i) * 0.12 + (i % 2 ? 0.4 : -0.3)) * 10) / 10,
    waistCm: Math.round((94 - (21 - i) * 0.08) * 10) / 10,
  });
}
await refreshMe();

const ctx = { navigate: () => {}, onLeave: () => {} } as any;
const plan = await api.get('/api/plan/active');
const firstDay = plan.plan.workouts[0].dayIndex;

const views: Array<{ id: string; label: string; title: string; node: any }> = [
  { id: 'dashboard', label: 'בית', title: 'מאמן אישי', node: await screens.renderDashboard(ctx) },
  { id: 'week', label: 'שבוע', title: 'לוח אימונים', node: await screens.renderWeek(ctx) },
  { id: 'workout', label: 'אימון', title: 'אימון פעיל', node: await screens.renderWorkout(ctx, String(firstDay)) },
  { id: 'library', label: 'ספרייה', title: 'ספריית תרגילים', node: await more.renderLibrary(ctx) },
  { id: 'nutrition', label: 'תזונה', title: 'תזונה', node: await more.renderNutrition(ctx) },
  { id: 'progress', label: 'מעקב', title: 'מעקב התקדמות', node: await more.renderProgress(ctx) },
];
// ספריית התרגילים נטענת אסינכרונית אחרי הרינדור
await new Promise((r) => setTimeout(r, 300));

const css = readFileSync(join(ROOT, 'public', 'styles.css'), 'utf8');

const ICONS: Record<string, string> = {
  dashboard: 'M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z',
  week: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  workout: 'M3 12h3m12 0h3M7 8h2v8H7zm8 0h2v8h-2zM9 12h6',
  library: 'M3 12h3m12 0h3M7 8h2v8H7zm8 0h2v8h-2zM9 12h6',
  nutrition: 'M7 3v8a3 3 0 0 0 6 0V3M10 11v10M17 3c1.5 2 1.5 5 0 7v11',
  progress: 'M4 19V5M4 19h16M8 16l4-6 3 3 4-7',
};

const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<title>מאמן אישי - תצוגה מקדימה של העיצוב</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#0b0e14">
<style>
${css}
.pv-note { margin: 0 0 14px; }
.pv-view { display: none; }
.pv-view.is-on { display: block; }
.workout-head { position: static; margin: 0 0 14px; }
</style>
</head>
<body>
<header class="topbar">
  <button class="icon-btn" aria-label="חזרה" type="button">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </button>
  <h1 class="topbar__title" id="pv-title">מאמן אישי</h1>
  <button class="icon-btn" id="pv-theme" type="button" aria-label="מעבר בין כהה לבהיר">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10l1.4 1.4m0-12.8l-1.4 1.4m-10 10L5.6 18.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/></svg>
  </button>
</header>

<main class="screen">
  <div class="note pv-note">
    <span class="note__icon" aria-hidden="true">ℹ</span>
    <div><strong>תצוגה מקדימה של העיצוב. </strong>המסכים האלה הופקו מקוד הממשק האמיתי ומנתוני דמו שנבנו
    על ידי מנוע הכללים - אבל זה צילום סטטי: הכפתורים, הטיימר והטפסים אינם פעילים כאן.
    לשימוש אמיתי מריצים את השרת לפי ה-README.</div>
  </div>
${views.map((v) => `  <div class="pv-view${v.id === 'dashboard' ? ' is-on' : ''}" id="pv-${v.id}" data-title="${v.title}">\n${serialize(v.node)}\n  </div>`).join('\n')}
</main>

<nav class="tabbar" aria-label="ניווט ראשי">
${views
  .map(
    (v) => `  <button class="tab" type="button" data-target="${v.id}"${v.id === 'dashboard' ? ' aria-current="page"' : ''}>
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[v.id]}"/></svg>
    <span>${v.label}</span><span class="tab__dot"></span>
  </button>`,
  )
  .join('\n')}
</nav>

<script>
(function () {
  var tabs = document.querySelectorAll('.tab');
  var title = document.getElementById('pv-title');
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var id = tab.dataset.target;
      document.querySelectorAll('.pv-view').forEach(function (v) { v.classList.remove('is-on'); });
      tabs.forEach(function (t) { t.removeAttribute('aria-current'); });
      var view = document.getElementById('pv-' + id);
      view.classList.add('is-on');
      tab.setAttribute('aria-current', 'page');
      title.textContent = view.dataset.title;
      window.scrollTo({ top: 0 });
    });
  });
  var themeBtn = document.getElementById('pv-theme');
  var dark = !window.matchMedia('(prefers-color-scheme: light)').matches;
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  themeBtn.addEventListener('click', function () {
    dark = !dark;
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    document.querySelector('meta[name=theme-color]').setAttribute('content', dark ? '#0b0e14' : '#f6f7fb');
  });
  // האקורדיונים נשארים פעילים כי details/summary הם HTML טהור
})();
</script>
</body>
</html>
`;

const out = join(ROOT, 'public', 'design-preview.html');
writeFileSync(out, html, 'utf8');
console.log(`נוצרה תצוגה מקדימה: ${out} (${Math.round(html.length / 1024)} KB)`);

dom.restore();
server.close();
process.exit(0);
