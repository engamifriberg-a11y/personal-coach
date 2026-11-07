// נקודת הכניסה: ניתוב, ניווט תחתון, ערכת נושא, התקנה כאפליקציה ו-Service Worker.
import { state, refreshMe, flushQueue } from './api.js';
import { el, clear, toast, skeletonScreen } from './ui.js';
import { renderAuth, renderQuestionnaire, renderDashboard, renderWeek, renderWorkout } from './screens-core.js';
import { renderLibrary, renderNutrition, renderProgress, renderProfile, renderAdmin } from './screens-more.js';

const main = document.getElementById('main');
const topbar = document.getElementById('topbar');
const tabbar = document.getElementById('tabbar');
const titleEl = document.getElementById('screen-title');
const backBtn = document.getElementById('btn-back');
const themeBtn = document.getElementById('btn-theme');

// ----------------------------- ערכת נושא -----------------------------

function applyTheme(theme) {
  const resolved =
    theme === 'auto' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme;
  document.documentElement.setAttribute('data-theme', resolved);
  // שומרים meta אחד בלי media, כדי שצבע שורת המצב יתאים לבחירה הידנית ולא רק להעדפת המערכת.
  const metas = [...document.querySelectorAll('meta[name="theme-color"]')];
  metas.slice(1).forEach((m) => m.remove());
  if (metas[0]) {
    metas[0].removeAttribute('media');
    metas[0].setAttribute('content', resolved === 'light' ? '#f6f7fb' : '#0b0e14');
  }
}
applyTheme(state.theme);
themeBtn.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'light' ? 'dark' : 'light';
  state.theme = next;
  localStorage.setItem('coach_theme', next);
  applyTheme(next);
});

// ------------------------------- ניווט -------------------------------

const TABS = [
  { path: '/', label: 'בית', icon: 'M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z' },
  { path: '/week', label: 'שבוע', icon: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4' },
  { path: '/library', label: 'ספרייה', icon: 'M3 12h3m12 0h3M7 8h2v8H7zm8 0h2v8h-2zM9 12h6' },
  { path: '/nutrition', label: 'תזונה', icon: 'M7 3v8a3 3 0 0 0 6 0V3M10 11v10M17 3c1.5 2 1.5 5 0 7v11' },
  { path: '/progress', label: 'מעקב', icon: 'M4 19V5M4 19h16M8 16l4-6 3 3 4-7' },
  { path: '/profile', label: 'עוד', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 21a7 7 0 0 1 14 0' },
];

function buildTabs() {
  clear(tabbar);
  for (const tab of TABS) {
    const btn = el('button', {
      type: 'button',
      class: 'tab',
      dataset: { path: tab.path },
      onclick: () => navigate(tab.path),
    });
    btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${tab.icon}"/></svg>`;
    btn.append(el('span', { text: tab.label }), el('span', { class: 'tab__dot' }));
    tabbar.append(btn);
  }
}
buildTabs();

function markActiveTab(path) {
  for (const btn of tabbar.children) {
    const isActive = btn.dataset.path === path || (path.startsWith('/workout') && btn.dataset.path === '/week');
    if (isActive) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  }
}

const ROUTES = [
  { pattern: /^\/auth$/, title: 'כניסה', render: (ctx) => renderAuth(ctx), chrome: false },
  { pattern: /^\/questionnaire$/, title: 'שאלון התאמה', render: (ctx) => renderQuestionnaire(ctx), chrome: false },
  { pattern: /^\/$/, title: 'מאמן אישי', render: (ctx) => renderDashboard(ctx) },
  { pattern: /^\/week$/, title: 'לוח אימונים', render: (ctx) => renderWeek(ctx) },
  { pattern: /^\/workout\/(\d)$/, title: 'אימון פעיל', render: (ctx, m) => renderWorkout(ctx, m[1]), back: '/week' },
  { pattern: /^\/library$/, title: 'ספריית תרגילים', render: (ctx) => renderLibrary(ctx) },
  { pattern: /^\/nutrition$/, title: 'תזונה', render: (ctx) => renderNutrition(ctx) },
  { pattern: /^\/progress$/, title: 'מעקב התקדמות', render: (ctx) => renderProgress(ctx) },
  { pattern: /^\/profile$/, title: 'פרופיל והגדרות', render: (ctx) => renderProfile(ctx) },
  { pattern: /^\/admin$/, title: 'ניהול תוכן', render: (ctx) => renderAdmin(ctx), back: '/profile' },
];

let leaveHandlers = [];

export function navigate(path, replace = false) {
  if (replace) history.replaceState({}, '', `#${path}`);
  else history.pushState({}, '', `#${path}`);
  render(path);
}

const ctx = {
  navigate,
  onLeave: (fn) => leaveHandlers.push(fn),
};

async function render(path) {
  for (const fn of leaveHandlers) {
    try { fn(); } catch { /* התעלמות משגיאות ניקוי */ }
  }
  leaveHandlers = [];

  const route = ROUTES.find((r) => r.pattern.test(path)) ?? ROUTES.find((r) => r.pattern.test('/'));
  const match = path.match(route.pattern) ?? [];

  // שמירה על שער כניסה: בלי התחברות אפשר להגיע רק למסך הכניסה.
  if (!state.user && path !== '/auth') {
    navigate('/auth', true);
    return;
  }
  if (state.user && !state.hasProfile && path !== '/questionnaire' && path !== '/profile' && path !== '/library') {
    navigate('/questionnaire', true);
    return;
  }

  topbar.hidden = false;
  tabbar.hidden = route.chrome === false;
  titleEl.textContent = route.title;
  backBtn.hidden = !route.back;
  backBtn.onclick = () => navigate(route.back);
  markActiveTab(path);

  clear(main);
  main.append(skeletonScreen(3));
  try {
    const node = await route.render(ctx, match);
    clear(main);
    main.append(node);
  } catch (err) {
    clear(main);
    main.append(
      el('div', { class: 'stack' }, [
        el('div', { class: 'note note--danger' }, [
          el('span', { class: 'note__icon', text: '⚠' }),
          el('div', {}, [
            el('strong', { text: 'משהו נכשל בטעינת המסך. ' }),
            err?.message ?? 'שגיאה לא מזוהה.',
          ]),
        ]),
        el('button', { class: 'btn btn--primary btn--block', text: 'נסה שוב', onclick: () => render(path) }),
      ]),
    );
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
}

window.addEventListener('popstate', () => render(currentPath()));
function currentPath() {
  const hash = location.hash.replace(/^#/, '');
  return hash || '/';
}

// --------------------------- התקנה כאפליקציה ---------------------------

const banner = document.getElementById('install-banner');
const installText = document.getElementById('install-text');
const installAction = document.getElementById('install-action');
const installDismiss = document.getElementById('install-dismiss');
let deferredPrompt = null;

const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
const dismissed = localStorage.getItem('coach_install_dismissed') === '1';

installDismiss.addEventListener('click', () => {
  banner.hidden = true;
  localStorage.setItem('coach_install_dismissed', '1');
});

// אנדרואיד / כרום: התקנה בלחיצה אחת
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (isStandalone || dismissed) return;
  installText.textContent = 'אפשר להתקין את האפליקציה על הטלפון ולהשתמש בה כמו אפליקציה רגילה.';
  installAction.hidden = false;
  banner.hidden = false;
});

installAction.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  banner.hidden = true;
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;
  if (choice?.outcome === 'accepted') toast('האפליקציה מותקנת. אפשר לפתוח אותה מהמסך הראשי.', 'ok');
});

// iOS / iPadOS: אין beforeinstallprompt, ולכן מסבירים את הדרך הידנית
if (isIos && !isStandalone && !dismissed) {
  installText.textContent = 'להתקנה באייפון: לחצו על כפתור השיתוף בספארי, ואז "הוספה למסך הבית".';
  installAction.hidden = true;
  banner.hidden = false;
}

// ------------------------------ אתחול ------------------------------

async function boot() {
  try {
    await refreshMe();
  } catch {
    state.user = null;
  }
  render(currentPath());

  // שליחת סטים שנשמרו מקומית כשהחיבור חוזר
  window.addEventListener('online', async () => {
    const sent = await flushQueue().catch(() => 0);
    if (sent > 0) toast(`${sent} סטים נשלחו לשרת.`, 'ok');
  });

  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    } catch {
      // ללא Service Worker האפליקציה עובדת רגיל, רק בלי עבודה לא מקוונת
    }
  }
}

boot();
