// המיגרציות נארזות לתוך מודול (src/db/migrations.generated.ts), כי באירוח
// חסר-מצב אין תיקיית migrations ליד הקוד. קובצי ה-.sql נשארים המקור האמיתי.
//
// הבדיקה הזו נכשלת אם ערכו .sql ושכחו להריץ npm run build:migrations.
// בלעדיה, סכמה שעודכנה הייתה מגיעה לפריסה בלי השינוי ובלי שום אזהרה.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderGenerated, GENERATED_FILE, MIGRATIONS_DIR } from '../scripts/build-migrations.ts';
import { MIGRATIONS } from '../src/db/migrations.generated.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('הקובץ הנוצר תואם את קובצי ה-SQL', () => {
  const onDisk = readFileSync(GENERATED_FILE, 'utf8');
  assert.equal(
    onDisk,
    renderGenerated(),
    'src/db/migrations.generated.ts אינו מעודכן. הריצו: npm run build:migrations',
  );
});

test('כל קובץ .sql נמצא במודול, באותו סדר ועם אותו תוכן', () => {
  const names = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  assert.deepEqual(
    MIGRATIONS.map((m) => m.name),
    names,
  );

  for (const { name, sql } of MIGRATIONS) {
    assert.equal(sql, readFileSync(join(MIGRATIONS_DIR, name), 'utf8'), `תוכן ${name} שונה`);
  }
});

test('אין קריאת דיסק למיגרציות בזמן ריצה', () => {
  const source = readFileSync(join(ROOT, 'src', 'db', 'index.ts'), 'utf8');
  assert.ok(!source.includes('readdirSync'), 'src/db/index.ts עדיין סורק תיקייה');
  assert.ok(!source.includes('readFileSync'), 'src/db/index.ts עדיין קורא קובץ');
});
