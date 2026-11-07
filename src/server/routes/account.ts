import type { Route } from '../http.ts';
import { badRequest, parseCookies, str } from '../http.ts';
import * as repo from '../../db/repo.ts';
import { SESSION_COOKIE, endSession, requireUser, verifyPassword } from '../auth.ts';
import { verifyAccessCode } from '../access.ts';

export const accountRoutes: Route[] = [
  {
    // ייצוא כל הנתונים של המשתמש, בפורמט קריא.
    method: 'GET',
    path: '/api/account/export',
    auth: 'user',
    handler: ({ db, user }) => {
      const u = requireUser(user);
      repo.audit(db, 'account.exported', u.id);
      return repo.exportUserData(db, u.id);
    },
  },
  {
    // מחיקת חשבון: מוחקת בפועל את כל הנתונים, כולל תוכניות, אימונים ומדידות.
    method: 'POST',
    path: '/api/account/delete',
    auth: 'user',
    handler: ({ db, req, res, user, body }) => {
      const u = requireUser(user);
      const row = repo.findUserById(db, u.id);
      if (!row) throw badRequest('החשבון לא נמצא.');

      // בחשבון כניסה מהירה אין סיסמה שהמשתמש בחר, ולכן האישור הוא בקוד הגישה.
      if (row.via_access_code === 1) {
        const code = str(body.password, 'קוד גישה', { max: 200 });
        if (!verifyAccessCode(code)) throw badRequest('קוד הגישה אינו נכון. לא בוצעה מחיקה.');
      } else {
        const password = str(body.password, 'סיסמה', { max: 200 });
        if (!verifyPassword(password, row.password_hash, row.password_salt)) {
          throw badRequest('הסיסמה אינה נכונה. לא בוצעה מחיקה.');
        }
      }
      if (body.confirm !== 'מחק את החשבון') {
        throw badRequest('כדי לאשר מחיקה יש לכתוב בדיוק: מחק את החשבון');
      }
      const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      endSession(db, res, token);
      repo.deleteUserData(db, u.id);
      return {
        deleted: true,
        messageHe:
          'החשבון וכל הנתונים שנשמרו בו נמחקו: פרופיל, תוכניות, אימונים, מדידות ותזונה. ' +
          'הפניות לתמונות נמחקו גם הן; אם העלית תמונות לאחסון חיצוני, יש להסירן שם.',
      };
    },
  },
  {
    method: 'GET',
    path: '/api/account/privacy',
    handler: () => ({
      itemsHe: [
        'נתוני בריאות נשמרים רק לאחר הסכמה מפורשת, וניתן לבטל אותה בכל רגע.',
        'נתוני הבריאות אינם נרשמים ביומני המערכת.',
        'סיסמאות נשמרות כגיבוב scrypt עם מלח ייחודי, ולא כטקסט.',
        'סודות ומפתחות קיימים בצד השרת בלבד ואינם נשלחים לדפדפן.',
        'שימוש ב-AI הוא אופציונלי. בלי הסכמה, אף נתון אינו יוצא לספק חיצוני.',
        'גם עם הסכמה, מה שנשלח לספק הוא עובדות מספריות בלבד: בלי שם, בלי אימייל, בלי מזהה משתמש ובלי טקסט רפואי חופשי.',
        'אפשר לייצא את כל הנתונים ואפשר למחוק את החשבון לחלוטין.',
        'תמונות התקדמות הן אופציונליות, פרטיות, ונשמרות כהפניה לאחסון פרטי ולא בתוך המסד.',
      ],
    }),
  },
];
