// שכבת repository.
//
// עקרון בידוד: כל פונקציה שנוגעת בנתוני משתמש מקבלת userId ומסננת לפיו ב-SQL עצמו.
// אין פונקציה שמחזירה ישות לפי מזהה בלבד בלי שיוך לבעלים.
//
// כל הפונקציות אסינכרוניות, כי הדרייבר יכול להיות מסד מעל HTTP.
// ה-SQL זהה בשני הדרייברים: Turso הוא SQLite.

import type { Db } from './index.ts';
import type { Statement } from './driver.ts';
import type {
  Measurement,
  NutritionPlan,
  PlanDiff,
  Role,
  User,
  UserProfile,
  WeeklyPlan,
  WorkoutSession,
} from '../domain/types.ts';

const nowIso = () => new Date().toISOString();

// ---------- משתמשים ----------

export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  role: Role;
  created_at: string;
  consent_health_data_at: string | null;
  consent_ai_at: string | null;
  deleted_at: string | null;
  is_demo: number;
  display_name: string | null;
  via_access_code: number;
};

export async function createUser(
  db: Db,
  args: {
    id: string;
    email: string;
    passwordHash: string;
    passwordSalt: string;
    role?: Role;
    isDemo?: boolean;
    displayName?: string;
    viaAccessCode?: boolean;
  },
): Promise<User> {
  const createdAt = nowIso();
  await db.run(
    `INSERT INTO users (id, email, password_hash, password_salt, role, created_at, is_demo, display_name, via_access_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      args.id,
      args.email.toLowerCase(),
      args.passwordHash,
      args.passwordSalt,
      args.role ?? 'user',
      createdAt,
      args.isDemo ? 1 : 0,
      args.displayName ?? null,
      args.viaAccessCode ? 1 : 0,
    ],
  );
  return {
    id: args.id,
    email: args.email.toLowerCase(),
    displayName: args.displayName ?? null,
    role: args.role ?? 'user',
    createdAt,
    consentHealthDataAt: null,
    consentAiAt: null,
    viaAccessCode: args.viaAccessCode === true,
  };
}

/** עדכון השם המוצג - בכניסה מהירה חוזרת עם אותו שם בכתיב שונה. */
export async function setDisplayName(db: Db, userId: string, displayName: string): Promise<void> {
  await db.run('UPDATE users SET display_name = ? WHERE id = ?', [displayName, userId]);
}

export async function findUserByEmail(db: Db, email: string): Promise<UserRow | null> {
  const row = await db.get('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL', [
    email.toLowerCase(),
  ]);
  return (row as UserRow | null) ?? null;
}

export async function findUserById(db: Db, id: string): Promise<UserRow | null> {
  const row = await db.get('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', [id]);
  return (row as UserRow | null) ?? null;
}

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name ?? null,
    role: row.role,
    createdAt: row.created_at,
    consentHealthDataAt: row.consent_health_data_at,
    consentAiAt: row.consent_ai_at,
    viaAccessCode: row.via_access_code === 1,
  };
}

export async function setConsents(
  db: Db,
  userId: string,
  args: { health?: boolean; ai?: boolean },
): Promise<void> {
  if (args.health !== undefined) {
    await db.run('UPDATE users SET consent_health_data_at = ? WHERE id = ?', [
      args.health ? nowIso() : null,
      userId,
    ]);
  }
  if (args.ai !== undefined) {
    await db.run('UPDATE users SET consent_ai_at = ? WHERE id = ?', [
      args.ai ? nowIso() : null,
      userId,
    ]);
  }
}

/** מחיקת חשבון: מסירה את כל נתוני המשתמש בפועל, לא רק מסמנת. הכול כיחידה אחת. */
export async function deleteUserData(db: Db, userId: string): Promise<void> {
  const tables = [
    'auth_sessions',
    'questionnaire_drafts',
    'profiles',
    'plans',
    'plan_changes',
    'workout_sessions',
    'measurements',
    'nutrition_plans',
  ];
  const statements: Statement[] = tables.map((table) => ({
    sql: `DELETE FROM ${table} WHERE user_id = ?`,
    params: [userId],
  }));
  statements.push({ sql: 'DELETE FROM audit_log WHERE user_id = ?', params: [userId] });
  statements.push({ sql: 'DELETE FROM users WHERE id = ?', params: [userId] });
  await db.batch(statements);
}

// ---------- סשנים ----------

export async function createAuthSession(
  db: Db,
  tokenHash: string,
  userId: string,
  ttlDays = 30,
): Promise<void> {
  const created = new Date();
  const expires = new Date(created.getTime() + ttlDays * 86400000);
  await db.run(
    'INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    [tokenHash, userId, created.toISOString(), expires.toISOString()],
  );
}

export async function findAuthSession(
  db: Db,
  tokenHash: string,
): Promise<{ user_id: string; expires_at: string } | null> {
  const row = await db.get('SELECT user_id, expires_at FROM auth_sessions WHERE token_hash = ?', [
    tokenHash,
  ]);
  return (row as { user_id: string; expires_at: string } | null) ?? null;
}

export async function deleteAuthSession(db: Db, tokenHash: string): Promise<void> {
  await db.run('DELETE FROM auth_sessions WHERE token_hash = ?', [tokenHash]);
}

export async function purgeExpiredSessions(db: Db): Promise<void> {
  await db.run('DELETE FROM auth_sessions WHERE expires_at < ?', [nowIso()]);
}

// ---------- טיוטת שאלון ----------

export async function saveDraft(db: Db, userId: string, step: number, data: unknown): Promise<void> {
  await db.run(
    `INSERT INTO questionnaire_drafts (user_id, step, data_json, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET step = excluded.step, data_json = excluded.data_json, updated_at = excluded.updated_at`,
    [userId, step, JSON.stringify(data), nowIso()],
  );
}

export async function getDraft(db: Db, userId: string): Promise<{ step: number; data: any } | null> {
  const row = await db.get('SELECT step, data_json FROM questionnaire_drafts WHERE user_id = ?', [
    userId,
  ]);
  return row ? { step: Number(row.step), data: JSON.parse(String(row.data_json)) } : null;
}

export async function clearDraft(db: Db, userId: string): Promise<void> {
  await db.run('DELETE FROM questionnaire_drafts WHERE user_id = ?', [userId]);
}

// ---------- פרופיל ----------

export async function saveProfile(db: Db, profile: UserProfile): Promise<void> {
  await db.run(
    `INSERT INTO profiles (user_id, data_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`,
    [profile.userId, JSON.stringify(profile), profile.updatedAt],
  );
}

export async function getProfile(db: Db, userId: string): Promise<UserProfile | null> {
  const row = await db.get('SELECT data_json FROM profiles WHERE user_id = ?', [userId]);
  return row ? (JSON.parse(String(row.data_json)) as UserProfile) : null;
}

// ---------- תוכניות אימון ----------

export async function savePlan(db: Db, plan: WeeklyPlan): Promise<void> {
  await db.run(
    'INSERT INTO plans (id, user_id, version, status, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [plan.id, plan.userId, plan.version, plan.status, JSON.stringify(plan), plan.createdAt],
  );
}

export async function supersedePlans(db: Db, userId: string): Promise<void> {
  await db.run("UPDATE plans SET status = 'superseded' WHERE user_id = ? AND status = 'active'", [
    userId,
  ]);
}

export async function getActivePlan(db: Db, userId: string): Promise<WeeklyPlan | null> {
  const row = await db.get(
    "SELECT data_json FROM plans WHERE user_id = ? AND status = 'active' ORDER BY version DESC LIMIT 1",
    [userId],
  );
  return row ? (JSON.parse(String(row.data_json)) as WeeklyPlan) : null;
}

export async function getPlanForUser(
  db: Db,
  userId: string,
  planId: string,
): Promise<WeeklyPlan | null> {
  const row = await db.get('SELECT data_json FROM plans WHERE id = ? AND user_id = ?', [
    planId,
    userId,
  ]);
  return row ? (JSON.parse(String(row.data_json)) as WeeklyPlan) : null;
}

/** תוכנית בגרסה מסוימת ובמצב מסוים - לשימוש בזרימת האישור. */
export async function getPlanByVersion(
  db: Db,
  userId: string,
  version: number,
  status?: string,
): Promise<WeeklyPlan | null> {
  const row = status
    ? await db.get('SELECT data_json FROM plans WHERE user_id = ? AND version = ? AND status = ?', [
        userId,
        version,
        status,
      ])
    : await db.get('SELECT data_json FROM plans WHERE user_id = ? AND version = ?', [userId, version]);
  return row ? (JSON.parse(String(row.data_json)) as WeeklyPlan) : null;
}

export async function activatePlanVersion(db: Db, userId: string, version: number): Promise<void> {
  await db.batch([
    {
      sql: "UPDATE plans SET status = 'superseded' WHERE user_id = ? AND status = 'active'",
      params: [userId],
    },
    {
      sql: "UPDATE plans SET status = 'active' WHERE user_id = ? AND version = ?",
      params: [userId, version],
    },
  ]);
}

export async function listPlanVersions(
  db: Db,
  userId: string,
): Promise<Array<{ version: number; status: string; createdAt: string }>> {
  const rows = await db.all(
    'SELECT version, status, created_at FROM plans WHERE user_id = ? ORDER BY version DESC',
    [userId],
  );
  return rows.map((r) => ({
    version: Number(r.version),
    status: String(r.status),
    createdAt: String(r.created_at),
  }));
}

export async function nextPlanVersion(db: Db, userId: string): Promise<number> {
  const row = await db.get('SELECT MAX(version) AS v FROM plans WHERE user_id = ?', [userId]);
  return Number(row?.v ?? 0) + 1;
}

export async function savePlanDiff(
  db: Db,
  userId: string,
  diff: PlanDiff,
  approved: boolean,
): Promise<string> {
  const id = crypto.randomUUID();
  await db.run(
    `INSERT INTO plan_changes (id, user_id, from_version, to_version, diff_json, approved_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      diff.fromVersion,
      diff.toVersion,
      JSON.stringify(diff),
      approved ? nowIso() : null,
      nowIso(),
    ],
  );
  return id;
}

export async function listPlanDiffs(
  db: Db,
  userId: string,
): Promise<Array<{ id: string; diff: PlanDiff; approvedAt: string | null }>> {
  const rows = await db.all(
    'SELECT id, diff_json, approved_at FROM plan_changes WHERE user_id = ? ORDER BY created_at DESC',
    [userId],
  );
  return rows.map((r) => ({
    id: String(r.id),
    diff: JSON.parse(String(r.diff_json)) as PlanDiff,
    approvedAt: r.approved_at ?? null,
  }));
}

export async function approvePlanDiff(db: Db, userId: string, id: string): Promise<boolean> {
  const res = await db.run('UPDATE plan_changes SET approved_at = ? WHERE id = ? AND user_id = ?', [
    nowIso(),
    id,
    userId,
  ]);
  return res.changes > 0;
}

// ---------- אימונים ----------

export async function saveWorkoutSession(db: Db, session: WorkoutSession): Promise<void> {
  await db.run(
    `INSERT INTO workout_sessions
       (id, user_id, plan_id, plan_version, day_index, status, started_at, updated_at, completed_at, data_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       updated_at = excluded.updated_at,
       completed_at = excluded.completed_at,
       data_json = excluded.data_json`,
    [
      session.id,
      session.userId,
      session.planId,
      session.planVersion,
      session.dayIndex,
      session.status,
      session.startedAt,
      session.updatedAt,
      session.completedAt ?? null,
      JSON.stringify(session),
    ],
  );
}

export async function getWorkoutSession(
  db: Db,
  userId: string,
  id: string,
): Promise<WorkoutSession | null> {
  const row = await db.get('SELECT data_json FROM workout_sessions WHERE id = ? AND user_id = ?', [
    id,
    userId,
  ]);
  return row ? (JSON.parse(String(row.data_json)) as WorkoutSession) : null;
}

/** האימון הפתוח האחרון - לשחזור אחרי סגירת האפליקציה. */
export async function getOpenWorkoutSession(db: Db, userId: string): Promise<WorkoutSession | null> {
  const row = await db.get(
    `SELECT data_json FROM workout_sessions
     WHERE user_id = ? AND status IN ('in_progress','paused')
     ORDER BY updated_at DESC LIMIT 1`,
    [userId],
  );
  return row ? (JSON.parse(String(row.data_json)) as WorkoutSession) : null;
}

export async function listWorkoutSessions(
  db: Db,
  userId: string,
  limit = 50,
): Promise<WorkoutSession[]> {
  const rows = await db.all(
    'SELECT data_json FROM workout_sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT ?',
    [userId, limit],
  );
  return rows.map((r) => JSON.parse(String(r.data_json)) as WorkoutSession);
}

export async function findPreviousCompletedSession(
  db: Db,
  userId: string,
  dayIndex: number,
  beforeIso: string,
): Promise<WorkoutSession | null> {
  const row = await db.get(
    `SELECT data_json FROM workout_sessions
     WHERE user_id = ? AND day_index = ? AND status = 'completed' AND started_at < ?
     ORDER BY started_at DESC LIMIT 1`,
    [userId, dayIndex, beforeIso],
  );
  return row ? (JSON.parse(String(row.data_json)) as WorkoutSession) : null;
}

// ---------- מדידות ----------

export async function addMeasurement(db: Db, m: Measurement): Promise<void> {
  await db.run(
    `INSERT INTO measurements (id, user_id, taken_at, weight_kg, waist_cm, hip_cm, chest_cm, arm_cm, thigh_cm, photo_ref, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      m.id,
      m.userId,
      m.takenAt,
      m.weightKg ?? null,
      m.waistCm ?? null,
      m.hipCm ?? null,
      m.chestCm ?? null,
      m.armCm ?? null,
      m.thighCm ?? null,
      m.photoRef ?? null,
      m.note ?? null,
    ],
  );
}

export async function listMeasurements(db: Db, userId: string): Promise<Measurement[]> {
  const rows = await db.all('SELECT * FROM measurements WHERE user_id = ? ORDER BY taken_at ASC', [
    userId,
  ]);
  return rows.map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    takenAt: String(r.taken_at),
    weightKg: r.weight_kg ?? undefined,
    waistCm: r.waist_cm ?? undefined,
    hipCm: r.hip_cm ?? undefined,
    chestCm: r.chest_cm ?? undefined,
    armCm: r.arm_cm ?? undefined,
    thighCm: r.thigh_cm ?? undefined,
    photoRef: r.photo_ref ?? undefined,
    note: r.note ?? undefined,
  }));
}

export async function deleteMeasurement(db: Db, userId: string, id: string): Promise<boolean> {
  const res = await db.run('DELETE FROM measurements WHERE id = ? AND user_id = ?', [id, userId]);
  return res.changes > 0;
}

// ---------- תזונה ----------

export async function saveNutritionPlan(db: Db, plan: NutritionPlan): Promise<void> {
  await db.run(
    'INSERT INTO nutrition_plans (id, user_id, version, data_json, created_at) VALUES (?, ?, ?, ?, ?)',
    [plan.id, plan.userId, plan.version, JSON.stringify(plan), plan.createdAt],
  );
}

export async function getLatestNutritionPlan(db: Db, userId: string): Promise<NutritionPlan | null> {
  const row = await db.get(
    'SELECT data_json FROM nutrition_plans WHERE user_id = ? ORDER BY version DESC LIMIT 1',
    [userId],
  );
  return row ? (JSON.parse(String(row.data_json)) as NutritionPlan) : null;
}

export async function nextNutritionVersion(db: Db, userId: string): Promise<number> {
  const row = await db.get('SELECT MAX(version) AS v FROM nutrition_plans WHERE user_id = ?', [
    userId,
  ]);
  return Number(row?.v ?? 0) + 1;
}

// ---------- מדיה וביקורת תוכן (ניהול) ----------

export type MediaRow = {
  id: string;
  exercise_id: string;
  variant_id: string | null;
  path: string;
  kind: string;
  source: string;
  owner: string;
  license: string;
  verified: number;
  ai_generated: number;
  checked_at: string | null;
};

export async function upsertMediaAsset(
  db: Db,
  args: {
    exerciseId: string;
    variantId?: string | null;
    path: string;
    kind?: string;
    source: string;
    owner: string;
    license: string;
    verified: boolean;
    aiGenerated: boolean;
    updatedBy: string;
  },
): Promise<string> {
  const existing = await db.get(
    "SELECT id FROM media_assets WHERE exercise_id = ? AND COALESCE(variant_id, '') = COALESCE(?, '')",
    [args.exerciseId, args.variantId ?? null],
  );
  const id = existing ? String(existing.id) : crypto.randomUUID();
  const now = nowIso();

  if (existing) {
    await db.run(
      `UPDATE media_assets SET path=?, kind=?, source=?, owner=?, license=?, verified=?, ai_generated=?,
        checked_at=?, updated_by=?, updated_at=? WHERE id=?`,
      [
        args.path,
        args.kind ?? 'video',
        args.source,
        args.owner,
        args.license,
        args.verified ? 1 : 0,
        args.aiGenerated ? 1 : 0,
        args.verified ? now : null,
        args.updatedBy,
        now,
        id,
      ],
    );
  } else {
    await db.run(
      `INSERT INTO media_assets (id, exercise_id, variant_id, path, kind, source, owner, license, verified, ai_generated, checked_at, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        args.exerciseId,
        args.variantId ?? null,
        args.path,
        args.kind ?? 'video',
        args.source,
        args.owner,
        args.license,
        args.verified ? 1 : 0,
        args.aiGenerated ? 1 : 0,
        args.verified ? now : null,
        args.updatedBy,
        now,
      ],
    );
  }
  return id;
}

export async function listMediaAssets(db: Db): Promise<MediaRow[]> {
  return (await db.all('SELECT * FROM media_assets ORDER BY exercise_id')) as MediaRow[];
}

export async function getMediaForExercise(db: Db, exerciseId: string): Promise<MediaRow | null> {
  const row = await db.get(
    'SELECT * FROM media_assets WHERE exercise_id = ? AND variant_id IS NULL',
    [exerciseId],
  );
  return (row as MediaRow | null) ?? null;
}

export async function setContentReview(
  db: Db,
  args: { exerciseId: string; reviewed: boolean; reviewerName: string; note?: string },
): Promise<void> {
  await db.run(
    `INSERT INTO content_reviews (exercise_id, reviewed, reviewer_name, reviewed_at, note)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(exercise_id) DO UPDATE SET reviewed=excluded.reviewed, reviewer_name=excluded.reviewer_name,
       reviewed_at=excluded.reviewed_at, note=excluded.note`,
    [
      args.exerciseId,
      args.reviewed ? 1 : 0,
      args.reviewerName,
      args.reviewed ? nowIso() : null,
      args.note ?? null,
    ],
  );
}

export async function listContentReviews(
  db: Db,
): Promise<Array<{ exerciseId: string; reviewed: boolean; reviewerName: string | null }>> {
  const rows = await db.all('SELECT exercise_id, reviewed, reviewer_name FROM content_reviews');
  return rows.map((r) => ({
    exerciseId: String(r.exercise_id),
    reviewed: Number(r.reviewed) === 1,
    reviewerName: r.reviewer_name ?? null,
  }));
}

// ---------- יומן ----------

/** יומן פעולות בלי נתוני בריאות. meta מוגבל למפתחות טכניים. */
export async function audit(
  db: Db,
  action: string,
  userId?: string,
  meta?: Record<string, string | number>,
): Promise<void> {
  await db.run('INSERT INTO audit_log (id, user_id, action, at, meta) VALUES (?, ?, ?, ?, ?)', [
    crypto.randomUUID(),
    userId ?? null,
    action,
    nowIso(),
    meta ? JSON.stringify(meta) : null,
  ]);
}

export async function listAuditLog(db: Db, limit = 200): Promise<Row[]> {
  return db.all('SELECT id, user_id, action, at, meta FROM audit_log ORDER BY at DESC LIMIT ?', [
    limit,
  ]);
}

export async function countUsers(db: Db): Promise<number> {
  const row = await db.get('SELECT COUNT(*) AS c FROM users');
  return Number(row?.c ?? 0);
}

type Row = Record<string, any>;

/** ייצוא כל נתוני המשתמש - לזכות הגישה והניוד. */
export async function exportUserData(db: Db, userId: string) {
  const user = await findUserById(db, userId);
  const planRows = await db.all('SELECT data_json FROM plans WHERE user_id = ? ORDER BY version', [
    userId,
  ]);
  const nutritionRows = await db.all(
    'SELECT data_json FROM nutrition_plans WHERE user_id = ? ORDER BY version',
    [userId],
  );

  return {
    exportedAt: nowIso(),
    account: user
      ? { id: user.id, email: user.email, displayName: user.display_name, createdAt: user.created_at, role: user.role }
      : null,
    consents: user
      ? { healthData: user.consent_health_data_at, ai: user.consent_ai_at }
      : { healthData: null, ai: null },
    profile: await getProfile(db, userId),
    plans: planRows.map((r) => JSON.parse(String(r.data_json))),
    nutritionPlans: nutritionRows.map((r) => JSON.parse(String(r.data_json))),
    workoutSessions: await listWorkoutSessions(db, userId, 1000),
    measurements: await listMeasurements(db, userId),
  };
}

/** האם קיים חשבון מנהל - משמש לאתחול ראשוני בפריסה בלי גישת shell. */
export async function countAdmins(db: Db): Promise<number> {
  const row = await db.get("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND deleted_at IS NULL");
  return Number(row?.c ?? 0);
}
