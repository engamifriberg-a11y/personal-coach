import { randomUUID, randomBytes } from 'node:crypto';
import type { Route } from '../http.ts';
import { HttpError, badRequest, parseCookies, str } from '../http.ts';
import * as repo from '../../db/repo.ts';
import {
  SESSION_COOKIE,
  endSession,
  hashPassword,
  requireUser,
  startSession,
  validateEmail,
  validatePasswordStrength,
  verifyPassword,
} from '../auth.ts';
import { clearLimit, enforceLimit } from '../rate-limit.ts';
import { identityFromName, quickAccessEnabled, verifyAccessCode } from '../access.ts';

export const authRoutes: Route[] = [
  {
    method: 'POST',
    path: '/api/auth/register',
    handler: ({ db, req, res, body }) => {
      // מגבלה סבירה גם לכמה אנשים מאותה רשת, ועדיין חוסמת יצירת חשבונות בהמוניהם.
      enforceLimit(req, { scope: 'register', max: 15, windowMs: 60 * 60 * 1000 });
      const email = str(body.email, 'אימייל', { max: 254 }).toLowerCase();
      const password = str(body.password, 'סיסמה', { max: 200 });
      const emailError = validateEmail(email);
      if (emailError) throw badRequest(emailError);
      const pwError = validatePasswordStrength(password);
      if (pwError) throw badRequest(pwError);

      if (repo.findUserByEmail(db, email)) {
        throw new HttpError(409, 'קיים כבר חשבון עם האימייל הזה. אפשר להתחבר במקום להירשם.');
      }
      const { hash, salt } = hashPassword(password);
      const user = repo.createUser(db, { id: randomUUID(), email, passwordHash: hash, passwordSalt: salt });

      // הסכמות מפורשות מהטופס. ברירת המחדל היא ללא הסכמה.
      const consentHealth = body.consentHealthData === true;
      const consentAi = body.consentAi === true;
      repo.setConsents(db, user.id, { health: consentHealth, ai: consentAi });
      repo.audit(db, 'user.register', user.id, { consentHealth: consentHealth ? 1 : 0, consentAi: consentAi ? 1 : 0 });

      startSession(db, res, user.id);
      const row = repo.findUserById(db, user.id)!;
      return { user: repo.toUser(row) };
    },
  },
  {
    method: 'POST',
    path: '/api/auth/login',
    handler: ({ db, req, res, body }) => {
      enforceLimit(req, { scope: 'login', max: 10, windowMs: 15 * 60 * 1000 });
      const email = str(body.email, 'אימייל', { max: 254 }).toLowerCase();
      const password = str(body.password, 'סיסמה', { max: 200 });
      const row = repo.findUserByEmail(db, email);
      // הודעה אחידה כדי לא לחשוף אם האימייל קיים.
      const generic = new HttpError(401, 'האימייל או הסיסמה אינם נכונים.');
      if (!row) throw generic;
      if (!verifyPassword(password, row.password_hash, row.password_salt)) {
        repo.audit(db, 'user.login_failed', row.id);
        throw generic;
      }
      startSession(db, res, row.id);
      clearLimit(req, 'login');
      repo.audit(db, 'user.login', row.id);
      return { user: repo.toUser(row) };
    },
  },
  {
    /**
     * כניסה מהירה: שם חופשי + קוד גישה משותף.
     * כל שם מקבל חשבון נפרד, כך שבידוד הנתונים נשמר.
     * ראו ההסתייגות ב-src/server/access.ts.
     */
    method: 'POST',
    path: '/api/auth/access',
    handler: ({ db, req, res, body }) => {
      if (!quickAccessEnabled()) {
        throw new HttpError(404, 'כניסה מהירה אינה מופעלת במערכת הזו.');
      }
      // הקוד משותף, ולכן הגבלת הקצב כאן היא ההגנה המרכזית מפני ניחוש.
      enforceLimit(req, { scope: 'access', max: 10, windowMs: 15 * 60 * 1000 });

      const name = str(body.name, 'שם', { max: 60 });
      const code = str(body.code, 'קוד גישה', { max: 200 });

      if (!verifyAccessCode(code)) {
        repo.audit(db, 'access.failed');
        throw new HttpError(401, 'קוד הגישה אינו נכון.');
      }

      const identity = identityFromName(name);
      let row = repo.findUserByEmail(db, identity.email);
      let isNew = false;

      if (!row) {
        // סיסמה אקראית שאינה בשימוש: הכניסה נעשית רק דרך קוד הגישה.
        const { hash, salt } = hashPassword(randomBytes(32).toString('hex'));
        repo.createUser(db, {
          id: randomUUID(),
          email: identity.email,
          passwordHash: hash,
          passwordSalt: salt,
          displayName: identity.displayName,
          viaAccessCode: true,
        });
        row = repo.findUserByEmail(db, identity.email)!;
        isNew = true;
      } else if (row.display_name !== identity.displayName) {
        repo.setDisplayName(db, row.id, identity.displayName);
        row = repo.findUserById(db, row.id)!;
      }

      // הסכמה לשמירת נתוני בריאות נדרשת גם כאן - אין קיצור דרך סביבה.
      if (body.consentHealthData === true) {
        repo.setConsents(db, row.id, { health: true });
      }
      if (typeof body.consentAi === 'boolean') {
        repo.setConsents(db, row.id, { ai: body.consentAi });
      }

      startSession(db, res, row.id);
      clearLimit(req, 'access');
      repo.audit(db, isNew ? 'access.created' : 'access.login', row.id);

      const fresh = repo.findUserById(db, row.id)!;
      return {
        user: repo.toUser(fresh),
        isNew,
        noticeHe:
          'כניסה מהירה: הנתונים שלך נשמרים תחת השם שהזנת. ' +
          'שימו לב שכל מי שמכיר את קוד הגישה יכול להיכנס באותו שם, ולכן המצב הזה מתאים ' +
          'לשימוש בקרב אנשים שסומכים זה על זה ולא לשימוש ציבורי.',
      };
    },
  },
  {
    method: 'POST',
    path: '/api/auth/logout',
    handler: ({ db, req, res }) => {
      const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      endSession(db, res, token);
      return { ok: true };
    },
  },
  {
    method: 'GET',
    path: '/api/me',
    handler: ({ db, user }) => {
      if (!user) return { user: null, quickAccess: quickAccessEnabled() };
      const profile = repo.getProfile(db, user.id);
      const draft = repo.getDraft(db, user.id);
      return {
        user,
        quickAccess: quickAccessEnabled(),
        hasProfile: Boolean(profile),
        draftStep: draft?.step ?? null,
        hasActivePlan: Boolean(repo.getActivePlan(db, user.id)),
      };
    },
  },
  {
    method: 'POST',
    path: '/api/consents',
    auth: 'user',
    handler: ({ db, user, body }) => {
      const u = requireUser(user);
      const health = typeof body.consentHealthData === 'boolean' ? body.consentHealthData : undefined;
      const ai = typeof body.consentAi === 'boolean' ? body.consentAi : undefined;
      repo.setConsents(db, u.id, { health, ai });
      repo.audit(db, 'user.consents_updated', u.id);
      const row = repo.findUserById(db, u.id)!;
      return { user: repo.toUser(row) };
    },
  },
];
