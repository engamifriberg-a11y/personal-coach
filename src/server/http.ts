// עזרי HTTP: ניתוב, גוף בקשה, עוגיות ותשובות JSON.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Db } from '../db/index.ts';
import type { User } from '../domain/types.ts';

export type Ctx = {
  db: Db;
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  params: Record<string, string>;
  user: User | null;
  body: any;
};

export type Handler = (ctx: Ctx) => Promise<unknown> | unknown;

export type Route = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  handler: Handler;
  /** 'user' - דורש התחברות; 'admin' - דורש הרשאת מנהל; undefined - פתוח. */
  auth?: 'user' | 'admin';
};

export class HttpError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function badRequest(messageHe: string, details?: unknown): HttpError {
  return new HttpError(400, messageHe, details);
}
export function unauthorized(messageHe = 'נדרשת התחברות.'): HttpError {
  return new HttpError(401, messageHe);
}
export function forbidden(messageHe = 'אין לך הרשאה לפעולה הזו.'): HttpError {
  return new HttpError(403, messageHe);
}
export function notFound(messageHe = 'לא נמצא.'): HttpError {
  return new HttpError(404, messageHe);
}

export function json(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

export async function readBody(req: IncomingMessage, limitBytes = 1_000_000): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limitBytes) throw badRequest('גוף הבקשה גדול מדי.');
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    throw badRequest('גוף הבקשה אינו JSON תקין.');
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function setCookie(
  res: ServerResponse,
  name: string,
  value: string,
  opts: { maxAgeSec?: number; httpOnly?: boolean; secure?: boolean; sameSite?: 'Strict' | 'Lax' } = {},
): void {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/'];
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  parts.push(`SameSite=${opts.sameSite ?? 'Lax'}`);
  if (opts.secure) parts.push('Secure');
  if (opts.maxAgeSec !== undefined) parts.push(`Max-Age=${opts.maxAgeSec}`);
  const existing = res.getHeader('set-cookie');
  const list = Array.isArray(existing) ? existing : existing ? [String(existing)] : [];
  list.push(parts.join('; '));
  res.setHeader('set-cookie', list);
}

/** התאמת נתיב עם פרמטרים בסגנון /api/plan/:id */
export function matchPath(pattern: string, actual: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  const a = actual.split('/').filter(Boolean);
  if (p.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    const seg = p[i]!;
    if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(a[i]!);
    else if (seg !== a[i]) return null;
  }
  return params;
}

// ---------- ולידציה ----------

export function str(value: unknown, field: string, opts: { max?: number; min?: number } = {}): string {
  if (typeof value !== 'string') throw badRequest(`השדה ${field} חייב להיות טקסט.`);
  const v = value.trim();
  if (opts.min !== undefined && v.length < opts.min) throw badRequest(`השדה ${field} קצר מדי.`);
  if (opts.max !== undefined && v.length > opts.max) throw badRequest(`השדה ${field} ארוך מדי.`);
  return v;
}

export function num(value: unknown, field: string, min: number, max: number): number {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw badRequest(`השדה ${field} חייב להיות מספר.`);
  if (n < min || n > max) throw badRequest(`השדה ${field} חייב להיות בין ${min} ל-${max}.`);
  return n;
}

export function optNum(value: unknown, field: string, min: number, max: number): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return num(value, field, min, max);
}

export function enumVal<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw badRequest(`השדה ${field} אינו מכיל ערך חוקי.`);
  }
  return value as T;
}

export function enumList<T extends string>(value: unknown, field: string, allowed: readonly T[]): T[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw badRequest(`השדה ${field} חייב להיות רשימה.`);
  return value.map((v) => enumVal(v, field, allowed));
}

export function strList(value: unknown, field: string, maxItems = 100): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw badRequest(`השדה ${field} חייב להיות רשימה.`);
  if (value.length > maxItems) throw badRequest(`יותר מדי פריטים בשדה ${field}.`);
  return value.map((v) => str(v, field, { max: 200 }));
}

export function timeStr(value: unknown, field: string, fallback: string): string {
  if (value === undefined || value === null || value === '') return fallback;
  const v = str(value, field, { max: 5 });
  if (!/^\d{2}:\d{2}$/.test(v)) throw badRequest(`השדה ${field} חייב להיות בפורמט HH:MM.`);
  return v;
}
