// בניית תיקיית האתר הסטטי לפריסה (Vercel או כל אירוח סטטי אחר).
//
// התוצר נכתב ל-dist-site/ ואינו נוגע ב-www/, כך שהרצה מקומית ממשיכה להגיש
// את www/ ישירות מהשרת. dist-site/ מוחרג מגיט.
//
// APP_URL: כשהאפליקציה רצה על כתובת אחרת מהאתר (למשל האתר ב-Vercel
// והאפליקציה ב-Railway), כל הקישורים ל-/app באתר הבנוי יוצבעו לשם.
// בלי APP_URL הקישורים נשארים /app, ואירוח סטטי יציג את עמוד ההמתנה.
//
// הרצה: npm run build:site

import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WWW = join(ROOT, 'www');
const ICONS = join(ROOT, 'public', 'icons');
const OUT = join(ROOT, 'dist-site');

const appUrl = (process.env.APP_URL ?? '').trim().replace(/\/$/, '');

await rm(OUT, { recursive: true, force: true });
await mkdir(join(OUT, 'icons'), { recursive: true });

// 1. אייקונים - משותפים בין האתר לאפליקציה
await cp(ICONS, join(OUT, 'icons'), { recursive: true });

// 2. קבצי האתר. ב-HTML מוחלפים קישורי /app כשהוגדר APP_URL.
const entries = await readdir(WWW, { withFileTypes: true });
let rewritten = 0;
for (const entry of entries) {
  if (!entry.isFile()) continue;
  const source = join(WWW, entry.name);

  if (!entry.name.endsWith('.html')) {
    await cp(source, join(OUT, entry.name));
    continue;
  }

  let html = await readFile(source, 'utf8');
  if (appUrl) {
    const before = html;
    html = html.replaceAll('href="/app"', `href="${appUrl}" rel="noopener"`);
    if (html !== before) rewritten++;
  }
  await writeFile(join(OUT, entry.name), html, 'utf8');
}

const files = await readdir(OUT);
const icons = await readdir(join(OUT, 'icons'));
console.log(`האתר נבנה ל-dist-site: ${files.filter((f) => f.endsWith('.html')).length} עמודים, ${icons.length} אייקונים`);
console.log(
  appUrl
    ? `קישורי האפליקציה הוצבעו ל-${appUrl} (${rewritten} עמודים)`
    : 'APP_URL לא הוגדר: הקישורים נשארו /app, ועמוד ההמתנה יוצג באירוח סטטי',
);
