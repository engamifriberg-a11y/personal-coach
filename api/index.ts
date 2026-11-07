// נקודת הכניסה ל-API באירוח Vercel Functions.
//
// אותו קוד שרת בדיוק: handleRequest מקבל (req, res) של node:http, וזו גם
// החתימה שפונקציית Node ב-Vercel מקבלת. אין כאן לוגיקה, רק חיבור - כדי שלא
// תיווצר גרסה שנייה של השרת שצריך לתחזק.
//
// למה קובץ בשם index ולא קובץ catch-all: בפרויקט בלי framework, Vercel מזהה
// קבצים ב-api/ לפי שם פשוט. הניתוב של כל /api/* לכאן נעשה ב-vercel.json,
// שמעביר את הנתיב המקורי בפרמטר __path. השרת חייב לראות את הנתיב המקורי,
// אחרת כל הבקשות היו נראות לו כמו /api/index.

import { handleRequest } from '../src/server/index.ts';

/** שם הפרמטר שבו vercel.json מעביר את הנתיב המקורי. */
const PATH_PARAM = '__path';

export default function handler(req: any, res: any) {
  const url = new URL(typeof req.url === 'string' ? req.url : '/', 'http://localhost');
  const original = url.searchParams.get(PATH_PARAM);

  if (original && original.startsWith('/api/')) {
    url.searchParams.delete(PATH_PARAM);
    const query = url.searchParams.toString();
    req.url = original + (query ? `?${query}` : '');
  }

  return handleRequest(req, res);
}
