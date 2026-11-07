// אימות והרשאות.
//
// סיסמאות: scrypt עם מלח ייחודי לכל משתמש (מודול crypto המובנה).
// סשנים: טוקן אקראי בעוגייה HttpOnly; במסד נשמר רק גיבוב של הטוקן.
// הרשאות נאכפות בצד השרת בלבד; הממשק אינו מקור אמת להרשאות.

import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import type { Db } from '../db/index.ts';
import type { User } from '../domain/types.ts';
import * as repo from '../db/repo.ts';
import { forbidden, unauthorized } from './http.ts';

const SCRYPT_KEYLEN = 64;
export const SESSION_COOKIE = 'coach_session';

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const candidate = scryptSync(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 10) return 'הסיסמה צריכה להיות באורך 10 תווים לפחות.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'הסיסמה צריכה לכלול אותיות וספרות לפחות.';
  }
  return null;
}

export function validateEmail(email: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return 'כתובת האימייל אינה תקינה.';
  return null;
}

function tokenHash(token: string): string {
  const secret = process.env.SESSION_SECRET ?? 'dev-only-insecure-secret';
  return createHash('sha256').update(`${secret}:${token}`).digest('hex');
}

export async function startSession(db: Db, res: ServerResponse, userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await repo.createAuthSession(db, tokenHash(token), userId, 30);
  const secure = (process.env.NODE_ENV ?? 'development') === 'production';
  // SameSite=Lax מגן על בקשות POST חוצות-אתר ברוב המצבים; ה-API גם דורש content-type JSON.
  setSessionCookie(res, token, secure);
  return token;
}

function setSessionCookie(res: ServerResponse, token: string, secure: boolean): void {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${30 * 86400}`,
  ];
  if (secure) parts.push('Secure');
  res.setHeader('set-cookie', parts.join('; '));
}

export async function endSession(db: Db, res: ServerResponse, token: string | undefined): Promise<void> {
  if (token) await repo.deleteAuthSession(db, tokenHash(token));
  res.setHeader('set-cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export async function resolveUser(db: Db, token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const session = await repo.findAuthSession(db, tokenHash(token));
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    await repo.deleteAuthSession(db, tokenHash(token));
    return null;
  }
  const row = await repo.findUserById(db, session.user_id);
  return row ? repo.toUser(row) : null;
}

export function requireUser(user: User | null): User {
  if (!user) throw unauthorized();
  return user;
}

export function requireAdmin(user: User | null): User {
  const u = requireUser(user);
  if (u.role !== 'admin') throw forbidden('הפעולה הזו מיועדת למנהלי תוכן בלבד.');
  return u;
}

/** נתוני בריאות נשמרים רק אם ניתנה הסכמה מפורשת. */
export function requireHealthConsent(user: User): void {
  if (!user.consentHealthDataAt) {
    throw forbidden(
      'כדי לשמור נתוני בריאות (גיל, משקל, מגבלות, פציעות) נדרשת הסכמה מפורשת. ' +
        'אפשר לאשר במסך ההגדרות, ואפשר גם לבטל בכל רגע ולמחוק את הנתונים.',
    );
  }
}
