// שרת HTTP: הגשת הממשק (PWA) ו-API.
// אפס תלויות חיצוניות - מודול http המובנה של Node.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Route } from './http.ts';
import { HttpError, json, matchPath, parseCookies, readBody } from './http.ts';
import { SESSION_COOKIE, requireAdmin, requireUser, resolveUser } from './auth.ts';
import { getDb, closeDb, describeDbConfig } from '../db/index.ts';
import * as repo from '../db/repo.ts';
import { authRoutes } from './routes/auth.ts';
import { profileRoutes } from './routes/profile.ts';
import { planRoutes } from './routes/plan.ts';
import { workoutRoutes } from './routes/workout.ts';
import { nutritionRoutes } from './routes/nutrition.ts';
import { progressRoutes } from './routes/progress.ts';
import { libraryRoutes } from './routes/library.ts';
import { adminRoutes } from './routes/admin.ts';
import { accountRoutes } from './routes/account.ts';
import { siteRoutes } from './routes/site.ts';
import { createAiProvider } from '../ai/provider.ts';
import { ensureAdmin } from './bootstrap.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
/** נכסי האפליקציה (PWA) - מוגשים תחת / ותחת /app */
const PUBLIC_DIR = join(ROOT, 'public');
/** אתר התדמית - עמוד הבית, הורדה, שקיפות ופרטיות */
const WWW_DIR = join(ROOT, 'www');
/** קובצי התקנה שהועלו ידנית. ריק = אין מה להוריד, והאתר אומר זאת */
const DOWNLOADS_DIR = join(ROOT, 'downloads');

const ALL_ROUTES: Route[] = [
  ...authRoutes,
  ...profileRoutes,
  ...planRoutes,
  ...workoutRoutes,
  ...nutritionRoutes,
  ...progressRoutes,
  ...libraryRoutes,
  ...adminRoutes,
  ...accountRoutes,
  ...siteRoutes,
];

// נתיבים ללא פרמטרים נבדקים ראשונים, כדי ש-/api/workout/open לא ייפול ל-/api/workout/:id
const ROUTES = [...ALL_ROUTES].sort((a, b) => Number(a.path.includes(':')) - Number(b.path.includes(':')));

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
};

/** נרמול נתיב בקשה לנתיב יחסי בטוח, בלי יציאה מהתיקייה. */
function safeRel(pathname: string): string {
  return normalize(decodeURIComponent(pathname))
    .replace(/^(\.\.[/\\])+/, '')
    .replace(/^[/\\]+/, '');
}

async function sendFile(baseDir: string, rel: string, res: any, download = false): Promise<boolean> {
  const file = join(baseDir, rel);
  if (!file.startsWith(baseDir)) return false;
  try {
    const info = await stat(file);
    if (!info.isFile()) return false;
    const body = await readFile(file);
    const ext = extname(file);
    const headers: Record<string, string> = {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'content-length': String(body.length),
    };
    // ה-Service Worker ודפי ה-HTML לא נשמרים במטמון, כדי שעדכונים יגיעו מיד.
    const noCache = rel === 'sw.js' || ext === '.html';
    headers['cache-control'] = noCache ? 'no-cache' : 'public, max-age=3600';
    if (rel === 'sw.js') headers['service-worker-allowed'] = '/';
    if (download) headers['content-disposition'] = `attachment; filename="${encodeURIComponent(rel)}"`;
    res.writeHead(200, headers);
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

/**
 * הגשת האתר.
 *  /            -> www/index.html        (אתר התדמית)
 *  /download    -> www/download.html     (גם בלי סיומת)
 *  /app, /app/* -> public/index.html     (האפליקציה, ניווט פנימי ב-hash)
 *  נכסים        -> public/ (styles.css, app.js, icons, manifest, sw.js) או www/
 */
async function serveStatic(pathname: string, res: any): Promise<boolean> {
  // האפליקציה: כל נתיב תחת /app מקבל את מסגרת ה-SPA
  if (pathname === '/app' || pathname === '/app/' || pathname.startsWith('/app/')) {
    return sendFile(PUBLIC_DIR, 'index.html', res);
  }

  // קובצי התקנה שהועלו ידנית
  if (pathname.startsWith('/downloads/')) {
    const rel = safeRel(pathname.slice('/downloads/'.length));
    if (!rel || !ALLOWED_DOWNLOAD_EXT.has(extname(rel).toLowerCase())) return false;
    return sendFile(DOWNLOADS_DIR, rel, res, true);
  }

  const rel = pathname === '/' ? 'index.html' : safeRel(pathname);

  // 1. אתר התדמית, כולל השלמת .html לנתיב נקי
  if (await sendFile(WWW_DIR, rel, res)) return true;
  if (!extname(rel) && (await sendFile(WWW_DIR, `${rel}.html`, res))) return true;

  // 2. נכסי האפליקציה
  if (await sendFile(PUBLIC_DIR, rel, res)) return true;

  return false;
}

const ALLOWED_DOWNLOAD_EXT = new Set(['.apk', '.aab', '.ipa', '.zip']);

/** ניקוי סשנים שפג תוקפם, פעם אחת לכל הרצה של התהליך. */
let purgeOnce: Promise<void> | null = null;
/** יצירת חשבון מנהל, פעם אחת לכל מופע. נדרש באירוח ללא עלייה מסודרת (Functions). */
let adminOnce: Promise<unknown> | null = null;

/**
 * טיפול בבקשה אחת. מיוצא בנפרד מהשרת עצמו כדי שאפשר יהיה להרכיב אותו
 * גם כפונקציה חסרת-מצב (Vercel Functions), שבה אין תהליך שעולה ונשאר.
 */
export async function handleRequest(req: any, res: any): Promise<void> {
  {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    // כותרות אבטחה בסיסיות. CSP מצומצם: אין סקריפטים חיצוניים ואין inline.
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('x-frame-options', 'DENY');
    // script-src מוגבל ל-'self' בלי inline ובלי eval. ה-DOM נבנה אצלנו דרך textContent בלבד,
    // ולכן אין נתיב להזרקת HTML. style-src כולל 'unsafe-inline' בגלל סגנונות inline בודדים
    // בממשק; זה פריט הקשחה מתועד ב-docs/STATUS.md ולא כוונה לטווח ארוך.
    res.setHeader(
      'content-security-policy',
      "default-src 'self'; img-src 'self' data: blob:; media-src 'self' https:; " +
        "style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; " +
        "frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
    );

    try {
      if (!url.pathname.startsWith('/api/')) {
        const served = await serveStatic(url.pathname, res);
        if (served) return;
        // נתיב לא מוכר -> עמוד הבית של האתר
        const fallback = await serveStatic('/', res);
        if (fallback) return;
        json(res, 404, { error: 'לא נמצא.' });
        return;
      }

      // המסד נפתח בעצלתיים ונשמר במופע אחד; המיגרציות רצות פעם אחת.
      let db;
      try {
        db = await getDb();
      } catch (err) {
        // חיבור חסר או שגוי. זה מצב צפוי בפריסה חדשה, ולכן התשובה מסבירה
        // מה חסר במקום להחזיר שגיאה פנימית עירומה. אין כאן שום סוד.
        const config = describeDbConfig();
        console.error('[server] מסד הנתונים לא נפתח:', err instanceof Error ? err.message : err);
        if (url.pathname === '/api/health/db') {
          json(res, 503, {
            ok: false,
            driver: config.kind,
            detailHe: config.detailHe,
            missing: config.missing,
          });
          return;
        }
        json(res, 503, {
          error: config.ready
            ? 'מסד הנתונים אינו מגיב כרגע. הנתונים שלך לא נפגעו.'
            : config.detailHe,
          dbReady: false,
          missing: config.missing,
        });
        return;
      }

      // יצירת חשבון המנהל. באירוח חסר-מצב אין עלייה מסודרת, ולכן זה קורה כאן.
      if (!adminOnce && process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD) {
        adminOnce = ensureAdmin(db).catch((err) => {
          console.error('[bootstrap] יצירת חשבון מנהל נכשלה:', err instanceof Error ? err.message : err);
          return null;
        });
      }

      if (!purgeOnce) {
        purgeOnce = repo.purgeExpiredSessions(db).catch((err) => {
          console.error('[server] ניקוי סשנים נכשל:', err instanceof Error ? err.message : err);
        });
      }

      const method = (req.method ?? 'GET').toUpperCase();
      for (const route of ROUTES) {
        if (route.method !== method) continue;
        const params = matchPath(route.path, url.pathname);
        if (!params) continue;

        const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
        const user = await resolveUser(db, token);
        if (route.auth === 'user') requireUser(user);
        if (route.auth === 'admin') requireAdmin(user);

        const body = method === 'GET' || method === 'DELETE' ? {} : await readBody(req);
        const result = await route.handler({ db, req, res, url, params, user, body });
        if (!res.headersSent) json(res, 200, result ?? { ok: true });
        return;
      }
      json(res, 404, { error: 'נתיב API לא קיים.' });
    } catch (err) {
      if (err instanceof HttpError) {
        json(res, err.status, { error: err.message, details: err.details ?? null });
        return;
      }
      // שגיאה לא צפויה: לא מחזירים פרטים פנימיים למשתמש ולא רושמים נתוני בריאות.
      console.error('[server] unexpected error:', err instanceof Error ? err.message : err);
      if (!res.headersSent) json(res, 500, { error: 'שגיאה פנימית. הנתונים שלך לא נפגעו.' });
    }
  }
}

export function createApp() {
  return createServer(handleRequest);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const port = Number(process.env.PORT ?? 3000);
  const { statusHe } = createAiProvider();

  // המסד נפתח והמיגרציות רצות לפני שהשרת מקבל בקשות, כדי שבקשה ראשונה
  // לא תיתקל בסכמה חסרה. כאן גם נוצר חשבון מנהל אם הוגדר ואין עוד כזה.
  const bootDb = await getDb();
  const seededAdmin = await ensureAdmin(bootDb).catch((err) => {
    console.error('[bootstrap] יצירת חשבון מנהל נכשלה:', err instanceof Error ? err.message : err);
    return null;
  });

  const server = createApp();

  // כיבוי מסודר: פריסה מחדש שולחת SIGTERM. סגירת החיבור למסד מבצעת
  // checkpoint ל-WAL, כדי שלא יישארו נתונים בקובץ היומן בלבד.
  let shuttingDown = false;
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`\n  התקבל ${signal} - סוגר חיבורים ושומר את המסד`);
      server.close(() => {
        closeDb()
          .catch((err) => console.error('[shutdown] סגירת המסד נכשלה:', err instanceof Error ? err.message : err))
          .finally(() => process.exit(0));
      });
      // רשת תקועה לא תמנע כיבוי
      setTimeout(() => process.exit(0), 8000).unref();
    });
  }

  server.listen(port, () => {
    console.log(`\n  מאמן אישי - השרת עלה`);
    console.log(`  אתר:          http://localhost:${port}/`);
    console.log(`  אפליקציה:     http://localhost:${port}/app`);
    console.log(`  הורדה:        http://localhost:${port}/download`);
    console.log(`  מסד נתונים:   ${bootDb.describeHe}`);
    if (seededAdmin) console.log(`  חשבון מנהל:   נוצר עבור ${seededAdmin} - יש לשנות סיסמה מיד`);
    console.log(`  שכבת AI:      ${statusHe}`);
    console.log(
      `  מדיה:         ${process.env.MEDIA_BASE_URL ? process.env.MEDIA_BASE_URL : 'לא הוגדר MEDIA_BASE_URL - יוצגו הוראות כתובות במקום סרטונים'}\n`,
    );
  });
}
