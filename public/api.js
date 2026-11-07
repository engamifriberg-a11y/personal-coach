// שכבת גישה ל-API + מצב אפליקציה.
// אין כאן שמירת סודות: הסשן הוא עוגיית HttpOnly שהדפדפן שולח אוטומטית.

export class ApiError extends Error {
  constructor(message, status, details, payload) {
    super(message);
    this.status = status;
    this.details = details;
    /** גוף התשובה המלא. נדרש כדי לזהות חיבור חסר (dbReady: false). */
    this.payload = payload ?? null;
  }
}

async function request(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) {
    throw new ApiError(
      payload?.error ?? 'משהו נכשל בבקשה לשרת.',
      res.status,
      payload?.details ?? null,
      payload,
    );
  }
  return payload;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body ?? {}),
  del: (path) => request('DELETE', path),
};

/** מצב גלובלי פשוט עם מנוי לשינויים. */
export const state = {
  user: null,
  profile: null,
  safety: null,
  plan: null,
  exercises: new Map(),
  meta: null,
  session: null,
  workout: null,
  theme: localStorage.getItem('coach_theme') || 'auto',
};

const listeners = new Set();
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function emit() {
  for (const fn of listeners) fn(state);
}

export async function refreshMe() {
  const data = await api.get('/api/me');
  state.user = data.user;
  state.hasProfile = data.hasProfile ?? false;
  state.hasActivePlan = data.hasActivePlan ?? false;
  state.draftStep = data.draftStep ?? null;
  return data;
}

export async function loadMeta() {
  if (state.meta) return state.meta;
  state.meta = await api.get('/api/meta');
  return state.meta;
}

export async function loadActivePlan() {
  const data = await api.get('/api/plan/active');
  state.plan = data.plan;
  if (data.exercises) for (const ex of data.exercises) state.exercises.set(ex.id, ex);
  state.planRules = data.rules ?? [];
  return data;
}

export async function loadProfile() {
  const data = await api.get('/api/profile');
  state.profile = data.profile;
  state.safety = data.safety;
  state.realism = data.realism;
  return data;
}

export function exerciseName(id) {
  return state.exercises.get(id)?.nameHe ?? id;
}

/**
 * תור שמירה מקומי לאימון פעיל.
 * אם הרשת נופלת באמצע אימון, הסטים נשמרים ב-localStorage ונשלחים כשהחיבור חוזר,
 * כך שסגירת האפליקציה או ניתוק לא מאבדים נתונים.
 */
const QUEUE_KEY = 'coach_pending_sets';

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}
function writeQueue(items) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-200)));
  } catch {
    /* אחסון מלא או חסום - ממשיכים בלי תור מקומי */
  }
}

export async function saveSet(sessionId, payload) {
  try {
    return await api.post(`/api/workout/${sessionId}/set`, payload);
  } catch (err) {
    const q = readQueue();
    q.push({ sessionId, payload, at: Date.now() });
    writeQueue(q);
    throw err;
  }
}

export async function flushQueue() {
  const q = readQueue();
  if (q.length === 0) return 0;
  const remaining = [];
  let sent = 0;
  for (const item of q) {
    try {
      await api.post(`/api/workout/${item.sessionId}/set`, item.payload);
      sent++;
    } catch {
      remaining.push(item);
    }
  }
  writeQueue(remaining);
  return sent;
}

export function pendingCount() {
  return readQueue().length;
}
