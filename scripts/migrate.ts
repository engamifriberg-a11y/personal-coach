// הרצת מיגרציות. בטוח להרצה חוזרת.
import { openDb, migrate } from '../src/db/index.ts';

const db = openDb();
const applied = migrate(db);
if (applied.length === 0) console.log('מסד הנתונים מעודכן. לא נדרשו מיגרציות.');
else console.log(`הורצו מיגרציות: ${applied.join(', ')}`);
db.close();
