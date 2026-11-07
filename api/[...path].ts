// נקודת הכניסה ל-API באירוח Vercel Functions.
//
// אותו קוד שרת בדיוק: handleRequest מקבל (req, res) של node:http,
// וזו גם החתימה שפונקציית Node ב-Vercel מקבלת. אין כאן לוגיקה,
// רק חיבור - כדי שלא תיווצר גרסה שנייה של השרת שצריך לתחזק.
//
// הנתיב [...path] תופס כל בקשה תחת /api/, כולל נתיבים מרובי-מקטעים
// כמו /api/workout/123/set. הנכסים הסטטיים (האתר ומסגרת האפליקציה)
// מוגשים על ידי ה-CDN ולא עוברים דרך כאן.

import { handleRequest } from '../src/server/index.ts';

export default handleRequest;
