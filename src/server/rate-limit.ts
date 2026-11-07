// הגבלת קצב בזיכרון, בלי תלויות.
//
// נדרש במיוחד בנתיבי אימות: קוד גישה משותף הוא יעד נוח לניחוש,
// והגבלת קצב היא מה שהופכת ניחוש אוטומטי ללא מעשי.
//
// מגבלה מוכרת: המצב נשמר בזיכרון התהליך. בפריסה עם כמה תהליכים או מכונות
// נדרש מאגר משותף (Redis או טבלה במסד). מתועד ב-docs/STATUS.md

import type { IncomingMessage } from 'node:http';
import { HttpError } from './http.ts';

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/** זיהוי המבקש. מאחורי reverse proxy יש להגדיר TRUST_PROXY=1 כדי לכבד X-Forwarded-For. */
export function clientKey(req: IncomingMessage): string {
  if (process.env.TRUST_PROXY === '1') {
    const forwarded = req.headers['x-forwarded-for'];
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    if (first) return first.split(',')[0]!.trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

export type LimitOptions = {
  /** מזהה הנתיב, כדי שמגבלות לא יתערבבו בין נתיבים. */
  scope: string;
  max: number;
  windowMs: number;
};

/**
 * סופר ניסיון. חריגה זורקת 429 עם הודעה בעברית וכמה זמן להמתין.
 */
export function enforceLimit(req: IncomingMessage, opts: LimitOptions): void {
  const now = Date.now();
  sweep(now);
  const key = `${opts.scope}:${clientKey(req)}`;
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return;
  }

  bucket.count++;
  if (bucket.count > opts.max) {
    const waitSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    const waitHe = waitSec >= 60 ? `${Math.ceil(waitSec / 60)} דקות` : `${waitSec} שניות`;
    throw new HttpError(429, `יותר מדי ניסיונות. נסו שוב בעוד ${waitHe}.`);
  }
}

/** איפוס מוצלח: התחברות שהצליחה מנקה את המונה. */
export function clearLimit(req: IncomingMessage, scope: string): void {
  buckets.delete(`${scope}:${clientKey(req)}`);
}

/** לשימוש בבדיקות בלבד. */
export function resetAllLimits(): void {
  buckets.clear();
}
