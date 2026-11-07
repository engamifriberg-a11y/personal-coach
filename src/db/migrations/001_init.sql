-- מיגרציה 001: סכמה ראשונית.
-- נכתבה בתחביר נייטרלי כמה שאפשר. הערות המעבר ל-PostgreSQL מופיעות בסוף הקובץ.

CREATE TABLE IF NOT EXISTS users (
  id                      TEXT PRIMARY KEY,
  email                   TEXT NOT NULL UNIQUE,
  password_hash           TEXT NOT NULL,
  password_salt           TEXT NOT NULL,
  role                    TEXT NOT NULL DEFAULT 'user',
  created_at              TEXT NOT NULL,
  -- הסכמות מפורשות. בלי consent_health_data_at לא נשמרים נתוני בריאות.
  consent_health_data_at  TEXT,
  consent_ai_at           TEXT,
  deleted_at              TEXT,
  -- הפרדת נתוני דוגמה מנתוני משתמש אמיתי: חשבונות דמו מסומנים מפורשות.
  is_demo                 INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);

-- טיוטת שאלון: מאפשרת לעצור ולהמשיך מאוחר יותר.
CREATE TABLE IF NOT EXISTS questionnaire_drafts (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  step        INTEGER NOT NULL DEFAULT 0,
  data_json   TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data_json   TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plans (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  status      TEXT NOT NULL,
  data_json   TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plans_user ON plans(user_id, version);

CREATE TABLE IF NOT EXISTS plan_changes (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_version INTEGER,
  to_version  INTEGER NOT NULL,
  diff_json   TEXT NOT NULL,
  approved_at TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plan_changes_user ON plan_changes(user_id);

CREATE TABLE IF NOT EXISTS workout_sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id      TEXT NOT NULL,
  plan_version INTEGER NOT NULL,
  day_index    INTEGER NOT NULL,
  status       TEXT NOT NULL,
  started_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  completed_at TEXT,
  data_json    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON workout_sessions(user_id, started_at);

CREATE TABLE IF NOT EXISTS measurements (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  taken_at   TEXT NOT NULL,
  weight_kg  REAL,
  waist_cm   REAL,
  hip_cm     REAL,
  chest_cm   REAL,
  arm_cm     REAL,
  thigh_cm   REAL,
  -- הפניה לקובץ באחסון פרטי. התמונה עצמה אינה נשמרת במסד.
  photo_ref  TEXT,
  note       TEXT
);
CREATE INDEX IF NOT EXISTS idx_measurements_user ON measurements(user_id, taken_at);

CREATE TABLE IF NOT EXISTS nutrition_plans (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  data_json   TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nutrition_user ON nutrition_plans(user_id, version);

-- נכסי מדיה לתרגילים. מנוהל רק דרך פאנל הניהול, עם מקור ורישוי.
CREATE TABLE IF NOT EXISTS media_assets (
  id            TEXT PRIMARY KEY,
  exercise_id   TEXT NOT NULL,
  variant_id    TEXT,
  path          TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'video',
  source        TEXT NOT NULL,
  owner         TEXT NOT NULL,
  license       TEXT NOT NULL,
  verified      INTEGER NOT NULL DEFAULT 0,
  ai_generated  INTEGER NOT NULL DEFAULT 0,
  checked_at    TEXT,
  updated_by    TEXT,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_exercise ON media_assets(exercise_id);

-- סימון ביקורת מקצועית לתוכן תרגילים.
CREATE TABLE IF NOT EXISTS content_reviews (
  exercise_id   TEXT PRIMARY KEY,
  reviewed      INTEGER NOT NULL DEFAULT 0,
  reviewer_name TEXT,
  reviewed_at   TEXT,
  note          TEXT
);

-- יומן פעולות. במכוון: אין כאן נתוני בריאות, משקל, מגבלות או תוכן תזונתי.
CREATE TABLE IF NOT EXISTS audit_log (
  id       TEXT PRIMARY KEY,
  user_id  TEXT,
  action   TEXT NOT NULL,
  at       TEXT NOT NULL,
  meta     TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);

-- הערות מעבר ל-PostgreSQL:
--  * TEXT לתאריכים -> TIMESTAMPTZ; INTEGER לדגלים -> BOOLEAN.
--  * data_json TEXT -> JSONB (ואז אפשר לשאול בתוך ה-JSON).
--  * להוסיף Row Level Security לכל טבלה עם user_id, בנוסף לאכיפה בשכבת ה-repository.
--  * אין צורך בשינוי בשמות הטבלאות או בלוגיקת ה-repository.
