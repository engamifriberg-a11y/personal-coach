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
//
// למה הטעינה דינמית: מודול שנכשל בייבוא סטטי מפיל את הפונקציה לפני שהיא
// מריצה שורה אחת, והאירוח מחזיר 500 ריק בלי שום רמז. כאן הכישלון נתפס
// ומדווח, כדי שתקלת אתחול תהיה ניתנת לאבחון מהדפדפן.

type Req = { url?: string; [k: string]: unknown };
type Res = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
  [k: string]: unknown;
};

/** שם הפרמטר שבו vercel.json מעביר את הנתיב המקורי. */
const PATH_PARAM = '__path';

type Handler = (req: Req, res: Res) => unknown;

let serverPromise: Promise<Handler> | null = null;

function loadServer(): Promise<Handler> {
  if (!serverPromise) {
    serverPromise = import('../src/server/index.ts').then((m) => m.handleRequest as Handler);
  }
  return serverPromise;
}

export default async function handler(req: Req, res: Res) {
  let handleRequest: Handler;
  try {
    handleRequest = await loadServer();
  } catch (err) {
    // כישלון אתחול. נרשם במלואו ללוג, ומדווח בקצרה בתשובה רק כשהופעל
    // DEBUG_BOOT - אחרת ההודעה כללית, בלי נתיבים ובלי שמות מודולים.
    serverPromise = null;
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api] טעינת השרת נכשלה:', err);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        error: 'השרת לא הצליח לעלות. זו תקלת תצורה, לא תקלה בנתונים שלך.',
        bootFailure: true,
        detail: process.env.DEBUG_BOOT === '1' ? message : null,
      }),
    );
    return;
  }

  const url = new URL(typeof req.url === 'string' ? req.url : '/', 'http://localhost');
  const original = url.searchParams.get(PATH_PARAM);

  if (original && original.startsWith('/api/')) {
    url.searchParams.delete(PATH_PARAM);
    const query = url.searchParams.toString();
    req.url = original + (query ? `?${query}` : '');
  }

  return handleRequest(req, res);
}
