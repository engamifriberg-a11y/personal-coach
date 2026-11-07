// נתיבים של אתר התדמית.
import { readdir, stat } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Route } from '../http.ts';
import { libraryStats } from '../../content/exercises.ts';
import { pendingReviewRules } from '../../domain/sources.ts';
import { pingDriver } from '../../db/driver.ts';

const DOWNLOADS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'downloads');
const ALLOWED = new Set(['.apk', '.aab', '.ipa', '.zip']);

const LABELS: Record<string, string> = {
  '.apk': 'אנדרואיד - קובץ התקנה',
  '.aab': 'אנדרואיד - חבילה ל-Google Play',
  '.ipa': 'iOS - חבילת התקנה',
  '.zip': 'ארכיון',
};

function sizeHe(bytes: number): string {
  if (bytes < 1024) return `${bytes} בתים`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const siteRoutes: Route[] = [
  {
    /**
     * רשימת קובצי ההתקנה שקיימים בפועל בתיקיית downloads.
     * אין כאן קישור קבוע בקוד: תיקייה ריקה מחזירה רשימה ריקה,
     * והאתר מציג שאין קובץ במקום להציג קישור שבור.
     */
    method: 'GET',
    path: '/api/downloads',
    handler: async () => {
      let names: string[] = [];
      try {
        names = await readdir(DOWNLOADS_DIR);
      } catch {
        names = [];
      }
      const files = [];
      for (const name of names) {
        const ext = extname(name).toLowerCase();
        if (!ALLOWED.has(ext)) continue;
        try {
          const info = await stat(join(DOWNLOADS_DIR, name));
          if (!info.isFile()) continue;
          files.push({
            name: `${name} — ${LABELS[ext] ?? 'קובץ'}`,
            url: `/downloads/${encodeURIComponent(name)}`,
            bytes: info.size,
            sizeHe: sizeHe(info.size),
            updatedHe: info.mtime.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }),
          });
        } catch {
          continue;
        }
      }
      return {
        files,
        noteHe:
          files.length === 0
            ? 'אין כרגע קובץ התקנה. ההתקנה מהדפדפן נותנת אפליקציה מלאה; בנייה של APK דורשת Android SDK ונעשית על מכונת פיתוח.'
            : 'התקנה מקובץ APK דורשת אישור ידני באנדרואיד להתקנה ממקור שאינו החנות.',
      };
    },
  },
  {
    /**
     * בדיקת חיות למסד הנתונים.
     * הנתיב הזה הוא מה שמאמת את החיבור ל-Turso מיד אחרי פריסה, בקריאה אחת.
     * אינו חושף פרטי חיבור, טוקנים או נתוני משתמשים.
     */
    method: 'GET',
    path: '/api/health/db',
    handler: async ({ db, res }) => {
      const ping = await pingDriver(db);
      if (!ping.ok) {
        res.writeHead(503, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, driver: db.name, detailHe: ping.detailHe }));
        return;
      }
      return { ok: true, driver: db.name, detailHe: ping.detailHe };
    },
  },
  {
    /** נתונים פומביים לאתר, בלי לחשוף שום דבר על משתמשים. */
    method: 'GET',
    path: '/api/site-info',
    handler: async () => ({
      version: '0.1.0',
      library: libraryStats(),
      pendingReviewCount: pendingReviewRules().length,
      appUrl: '/app',
      disclaimerHe:
        'הנחיות אימון ותזונה כלליות למבוגרים בריאים מגיל 18 ומעלה. אינו אבחון, טיפול או ייעוץ רפואי.',
      copyrightHe: '© 2026 רון בר. כל הזכויות שמורות.',
    }),
  },
];
