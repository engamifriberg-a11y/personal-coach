// שכבת repository.
//
// עקרון בידוד: כל פונקציה שנוגעת בנתוני משתמש מקבלת userId ומסננת לפיו ב-SQL עצמו.
// אין פונקציה שמחזירה ישות לפי מזהה בלבד בלי שיוך לבעלים.

import type { Db } from './index.ts';
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

export function createUser(
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
): User {
  const createdAt = nowIso();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, password_salt, role, created_at, is_demo, display_name, via_access_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    args.id,
    args.email.toLowerCase(),
    args.passwordHash,
    args.passwordSalt,
    args.role ?? 'user',
    createdAt,
    args.isDemo ? 1 : 0,
    args.displayName ?? null,
    args.viaAccessCode ? 1 : 0,
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
export function setDisplayName(db: Db, userId: string, displayName: string): void {
  db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(displayName, userId);
}

export function findUserByEmail(db: Db, email: string): UserRow | null {
  return (
    (db
      .prepare('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL')
      .get(email.toLowerCase()) as UserRow | undefined) ?? null
  );
}

export function findUserById(db: Db, id: string): UserRow | null {
  return (db.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL').get(id) as UserRow | undefined) ?? null;
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

export function setConsents(db: Db, userId: string, args: { health?: boolean; ai?: boolean }): void {
  if (args.health !== undefined) {
    db.prepare('UPDATE users SET consent_health_data_at = ? WHERE id = ?').run(args.health ? nowIso() : null, userId);
  }
  if (args.ai !== undefined) {
    db.prepare('UPDATE users SET consent_ai_at = ? WHERE id = ?').run(args.ai ? nowIso() : null, userId);
  }
}

/** מחיקת חשבון: מסירה את כל נתוני המשתמש בפועל, לא רק מסמנת. */
export function deleteUserData(db: Db, userId: string): void {
  for (const table of [
    'auth_sessions',
    'questionnaire_drafts',
    'profiles',
    'plans',
    'plan_changes',
    'workout_sessions',
    'measurements',
    'nutrition_plans',
  ]) {
    db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  db.prepare('DELETE FROM audit_log WHERE user_id = ?').run(userId);
}

// ---------- סשנים ----------

export function createAuthSession(db: Db, tokenHash: string, userId: string, ttlDays = 30): void {
  const created = new Date();
  const expires = new Date(created.getTime() + ttlDays * 86400000);
  db.prepare('INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    tokenHash,
    userId,
    created.toISOString(),
    expires.toISOString(),
  );
}

export function findAuthSession(db: Db, tokenHash: string): { user_id: string; expires_at: string } | null {
  return (
    (db.prepare('SELECT user_id, expires_at FROM auth_sessions WHERE token_hash = ?').get(tokenHash) as
      | { user_id: string; expires_at: string }
      | undefined) ?? null
  );
}

export function deleteAuthSession(db: Db, tokenHash: string): void {
  db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash);
}

export function purgeExpiredSessions(db: Db): void {
  db.prepare('DELETE FROM auth_sessions WHERE expires_at < ?').run(nowIso());
}

// ---------- טיוטת שאלון ----------

export function saveDraft(db: Db, userId: string, step: number, data: unknown): void {
  db.prepare(
    `INSERT INTO questionnaire_drafts (user_id, step, data_json, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET step = excluded.step, data_json = excluded.data_json, updated_at = excluded.updated_at`,
  ).run(userId, step, JSON.stringify(data), nowIso());
}

export function getDraft(db: Db, userId: string): { step: number; data: any } | null {
  const row = db.prepare('SELECT step, data_json FROM questionnaire_drafts WHERE user_id = ?').get(userId) as
    | { step: number; data_json: string }
    | undefined;
  return row ? { step: row.step, data: JSON.parse(row.data_json) } : null;
}

export function clearDraft(db: Db, userId: string): void {
  db.prepare('DELETE FROM questionnaire_drafts WHERE user_id = ?').run(userId);
}

// ---------- פרופיל ----------

export function saveProfile(db: Db, profile: UserProfile): void {
  db.prepare(
    `INSERT INTO profiles (user_id, data_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`,
  ).run(profile.userId, JSON.stringify(profile), profile.updatedAt);
}

export function getProfile(db: Db, userId: string): UserProfile | null {
  const row = db.prepare('SELECT data_json FROM profiles WHERE user_id = ?').get(userId) as
    | { data_json: string }
    | undefined;
  return row ? (JSON.parse(row.data_json) as UserProfile) : null;
}

// ---------- תוכניות אימון ----------

export function savePlan(db: Db, plan: WeeklyPlan): void {
  db.prepare(
    `INSERT INTO plans (id, user_id, version, status, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(plan.id, plan.userId, plan.version, plan.status, JSON.stringify(plan), plan.createdAt);
}

export function supersedePlans(db: Db, userId: string): void {
  db.prepare("UPDATE plans SET status = 'superseded' WHERE user_id = ? AND status = 'active'").run(userId);
}

export function getActivePlan(db: Db, userId: string): WeeklyPlan | null {
  const row = db
    .prepare("SELECT data_json FROM plans WHERE user_id = ? AND status = 'active' ORDER BY version DESC LIMIT 1")
    .get(userId) as { data_json: string } | undefined;
  return row ? (JSON.parse(row.data_json) as WeeklyPlan) : null;
}

export function getPlanForUser(db: Db, userId: string, planId: string): WeeklyPlan | null {
  const row = db.prepare('SELECT data_json FROM plans WHERE id = ? AND user_id = ?').get(planId, userId) as
    | { data_json: string }
    | undefined;
  return row ? (JSON.parse(row.data_json) as WeeklyPlan) : null;
}

export function listPlanVersions(db: Db, userId: string): Array<{ version: number; status: string; createdAt: string }> {
  return (
    db
      .prepare('SELECT version, status, created_at FROM plans WHERE user_id = ? ORDER BY version DESC')
      .all(userId) as Array<{ version: number; status: string; created_at: string }>
  ).map((r) => ({ version: r.version, status: r.status, createdAt: r.created_at }));
}

export function nextPlanVersion(db: Db, userId: string): number {
  const row = db.prepare('SELECT MAX(version) AS v FROM plans WHERE user_id = ?').get(userId) as
    | { v: number | null }
    | undefined;
  return (row?.v ?? 0) + 1;
}

export function savePlanDiff(db: Db, userId: string, diff: PlanDiff, approved: boolean): string {
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO plan_changes (id, user_id, from_version, to_version, diff_json, approved_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, userId, diff.fromVersion, diff.toVersion, JSON.stringify(diff), approved ? nowIso() : null, nowIso());
  return id;
}

export function listPlanDiffs(db: Db, userId: string): Array<{ id: string; diff: PlanDiff; approvedAt: string | null }> {
  return (
    db
      .prepare('SELECT id, diff_json, approved_at FROM plan_changes WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as Array<{ id: string; diff_json: string; approved_at: string | null }>
  ).map((r) => ({ id: r.id, diff: JSON.parse(r.diff_json) as PlanDiff, approvedAt: r.approved_at }));
}

export function approvePlanDiff(db: Db, userId: string, id: string): boolean {
  const res = db
    .prepare('UPDATE plan_changes SET approved_at = ? WHERE id = ? AND user_id = ?')
    .run(nowIso(), id, userId);
  return Number(res.changes) > 0;
}

// ---------- אימונים ----------

export function saveWorkoutSession(db: Db, session: WorkoutSession): void {
  db.prepare(
    `INSERT INTO workout_sessions
       (id, user_id, plan_id, plan_version, day_index, status, started_at, updated_at, completed_at, data_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       updated_at = excluded.updated_at,
       completed_at = excluded.completed_at,
       data_json = excluded.data_json`,
  ).run(
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
  );
}

export function getWorkoutSession(db: Db, userId: string, id: string): WorkoutSession | null {
  const row = db.prepare('SELECT data_json FROM workout_sessions WHERE id = ? AND user_id = ?').get(id, userId) as
    | { data_json: string }
    | undefined;
  return row ? (JSON.parse(row.data_json) as WorkoutSession) : null;
}

/** האימון הפתוח האחרון - לשחזור אחרי סגירת האפליקציה. */
export function getOpenWorkoutSession(db: Db, userId: string): WorkoutSession | null {
  const row = db
    .prepare(
      `SELECT data_json FROM workout_sessions
       WHERE user_id = ? AND status IN ('in_progress','paused')
       ORDER BY updated_at DESC LIMIT 1`,
    )
    .get(userId) as { data_json: string } | undefined;
  return row ? (JSON.parse(row.data_json) as WorkoutSession) : null;
}

export function listWorkoutSessions(db: Db, userId: string, limit = 50): WorkoutSession[] {
  return (
    db
      .prepare('SELECT data_json FROM workout_sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT ?')
      .all(userId, limit) as Array<{ data_json: string }>
  ).map((r) => JSON.parse(r.data_json) as WorkoutSession);
}

export function findPreviousCompletedSession(
  db: Db,
  userId: string,
  dayIndex: number,
  beforeIso: string,
): WorkoutSession | null {
  const row = db
    .prepare(
      `SELECT data_json FROM workout_sessions
       WHERE user_id = ? AND day_index = ? AND status = 'completed' AND started_at < ?
       ORDER BY started_at DESC LIMIT 1`,
    )
    .get(userId, dayIndex, beforeIso) as { data_json: string } | undefined;
  return row ? (JSON.parse(row.data_json) as WorkoutSession) : null;
}

// ---------- מדידות ----------

export function addMeasurement(db: Db, m: Measurement): void {
  db.prepare(
    `INSERT INTO measurements (id, user_id, taken_at, weight_kg, waist_cm, hip_cm, chest_cm, arm_cm, thigh_cm, photo_ref, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
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
  );
}

export function listMeasurements(db: Db, userId: string): Measurement[] {
  return (
    db.prepare('SELECT * FROM measurements WHERE user_id = ? ORDER BY taken_at ASC').all(userId) as Array<any>
  ).map((r) => ({
    id: r.id,
    userId: r.user_id,
    takenAt: r.taken_at,
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

export function deleteMeasurement(db: Db, userId: string, id: string): boolean {
  const res = db.prepare('DELETE FROM measurements WHERE id = ? AND user_id = ?').run(id, userId);
  return Number(res.changes) > 0;
}

// ---------- תזונה ----------

export function saveNutritionPlan(db: Db, plan: NutritionPlan): void {
  db.prepare('INSERT INTO nutrition_plans (id, user_id, version, data_json, created_at) VALUES (?, ?, ?, ?, ?)').run(
    plan.id,
    plan.userId,
    plan.version,
    JSON.stringify(plan),
    plan.createdAt,
  );
}

export function getLatestNutritionPlan(db: Db, userId: string): NutritionPlan | null {
  const row = db
    .prepare('SELECT data_json FROM nutrition_plans WHERE user_id = ? ORDER BY version DESC LIMIT 1')
    .get(userId) as { data_json: string } | undefined;
  return row ? (JSON.parse(row.data_json) as NutritionPlan) : null;
}

export function nextNutritionVersion(db: Db, userId: string): number {
  const row = db.prepare('SELECT MAX(version) AS v FROM nutrition_plans WHERE user_id = ?').get(userId) as
    | { v: number | null }
    | undefined;
  return (row?.v ?? 0) + 1;
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

export function upsertMediaAsset(
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
): string {
  const existing = db
    .prepare('SELECT id FROM media_assets WHERE exercise_id = ? AND IFNULL(variant_id, "") = IFNULL(?, "")')
    .get(args.exerciseId, args.variantId ?? null) as { id: string } | undefined;
  const id = existing?.id ?? crypto.randomUUID();
  const now = nowIso();
  if (existing) {
    db.prepare(
      `UPDATE media_assets SET path=?, kind=?, source=?, owner=?, license=?, verified=?, ai_generated=?,
        checked_at=?, updated_by=?, updated_at=? WHERE id=?`,
    ).run(
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
    );
  } else {
    db.prepare(
      `INSERT INTO media_assets (id, exercise_id, variant_id, path, kind, source, owner, license, verified, ai_generated, checked_at, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
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
    );
  }
  return id;
}

export function listMediaAssets(db: Db): MediaRow[] {
  return db.prepare('SELECT * FROM media_assets ORDER BY exercise_id').all() as MediaRow[];
}

export function getMediaForExercise(db: Db, exerciseId: string): MediaRow | null {
  return (
    (db
      .prepare('SELECT * FROM media_assets WHERE exercise_id = ? AND variant_id IS NULL')
      .get(exerciseId) as MediaRow | undefined) ?? null
  );
}

export function setContentReview(
  db: Db,
  args: { exerciseId: string; reviewed: boolean; reviewerName: string; note?: string },
): void {
  db.prepare(
    `INSERT INTO content_reviews (exercise_id, reviewed, reviewer_name, reviewed_at, note)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(exercise_id) DO UPDATE SET reviewed=excluded.reviewed, reviewer_name=excluded.reviewer_name,
       reviewed_at=excluded.reviewed_at, note=excluded.note`,
  ).run(args.exerciseId, args.reviewed ? 1 : 0, args.reviewerName, args.reviewed ? nowIso() : null, args.note ?? null);
}

export function listContentReviews(db: Db): Array<{ exerciseId: string; reviewed: boolean; reviewerName: string | null }> {
  return (
    db.prepare('SELECT exercise_id, reviewed, reviewer_name FROM content_reviews').all() as Array<{
      exercise_id: string;
      reviewed: number;
      reviewer_name: string | null;
    }>
  ).map((r) => ({ exerciseId: r.exercise_id, reviewed: r.reviewed === 1, reviewerName: r.reviewer_name }));
}

// ---------- יומן ----------

/** יומן פעולות בלי נתוני בריאות. meta מוגבל למפתחות טכניים. */
export function audit(db: Db, action: string, userId?: string, meta?: Record<string, string | number>): void {
  db.prepare('INSERT INTO audit_log (id, user_id, action, at, meta) VALUES (?, ?, ?, ?, ?)').run(
    crypto.randomUUID(),
    userId ?? null,
    action,
    nowIso(),
    meta ? JSON.stringify(meta) : null,
  );
}

/** ייצוא כל נתוני המשתמש - לזכות הגישה והניוד. */
export function exportUserData(db: Db, userId: string) {
  const user = findUserById(db, userId);
  return {
    exportedAt: nowIso(),
    account: user ? { id: user.id, email: user.email, createdAt: user.created_at, role: user.role } : null,
    consents: user
      ? { healthData: user.consent_health_data_at, ai: user.consent_ai_at }
      : { healthData: null, ai: null },
    profile: getProfile(db, userId),
    plans: (
      db.prepare('SELECT data_json FROM plans WHERE user_id = ? ORDER BY version').all(userId) as Array<{
        data_json: string;
      }>
    ).map((r) => JSON.parse(r.data_json)),
    nutritionPlans: (
      db.prepare('SELECT data_json FROM nutrition_plans WHERE user_id = ? ORDER BY version').all(userId) as Array<{
        data_json: string;
      }>
    ).map((r) => JSON.parse(r.data_json)),
    workoutSessions: listWorkoutSessions(db, userId, 1000),
    measurements: listMeasurements(db, userId),
  };
}
