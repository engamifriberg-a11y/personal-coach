// הכנת תיקיית האתר לפריסה סטטית.
//
// האייקונים משותפים בין האתר לאפליקציה ויושבים ב-public/icons, ולכן הם מועתקים
// ל-www/icons בזמן הבנייה. www/icons מוחרג מגיט - הוא תוצר ולא מקור.
//
// הרצה: npm run build:site

import { cp, mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FROM = join(ROOT, 'public', 'icons');
const TO = join(ROOT, 'www', 'icons');

await mkdir(TO, { recursive: true });
await cp(FROM, TO, { recursive: true });

const files = await readdir(TO);
console.log(`הועתקו ${files.length} אייקונים ל-www/icons`);

const pages = (await readdir(join(ROOT, 'www'))).filter((f) => f.endsWith('.html'));
console.log(`עמודי האתר: ${pages.join(', ')}`);
