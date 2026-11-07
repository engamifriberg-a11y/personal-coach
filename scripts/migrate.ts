// הרצת מיגרציות. בטוח להרצה חוזרת.
// עובד גם מול SQLite מקומי וגם מול Turso, לפי DB_DRIVER.

import { createDriver, migrate } from '../src/db/index.ts';

const db = createDriver();
console.log(`מסד נתונים: ${db.describeHe}`);

const applied = await migrate(db);
if (applied.length === 0) console.log('מסד הנתונים מעודכן. לא נדרשו מיגרציות.');
else console.log(`הורצו מיגרציות: ${applied.join(', ')}`);

await db.close();
