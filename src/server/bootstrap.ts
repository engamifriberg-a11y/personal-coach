// אתחול בזמן עלייה.
//
// למה זה קיים: באירוח חינמי אין גישת shell, ולכן אי אפשר להריץ שם npm run seed.
// אם הוגדרו SEED_ADMIN_EMAIL ו-SEED_ADMIN_PASSWORD ואין עוד חשבון מנהל,
// הוא נוצר פעם אחת בעלייה הראשונה. אחרי זה הפעולה לא חוזרת.

import { randomUUID } from 'node:crypto';
import type { Db } from '../db/index.ts';
import * as repo from '../db/repo.ts';
import { hashPassword, validateEmail, validatePasswordStrength } from './auth.ts';

export async function ensureAdmin(db: Db): Promise<string | null> {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) return null;

  if ((await repo.countAdmins(db)) > 0) return null;

  const emailError = validateEmail(email);
  if (emailError) {
    console.error(`[bootstrap] SEED_ADMIN_EMAIL אינו תקין: ${emailError}`);
    return null;
  }
  const passwordError = validatePasswordStrength(password);
  if (passwordError) {
    console.error(`[bootstrap] SEED_ADMIN_PASSWORD חלש מדי: ${passwordError}`);
    return null;
  }
  if (await repo.findUserByEmail(db, email)) {
    console.error('[bootstrap] קיים משתמש עם האימייל הזה שאינו מנהל. לא בוצע שינוי.');
    return null;
  }

  const { hash, salt } = hashPassword(password);
  await repo.createUser(db, {
    id: randomUUID(),
    email,
    passwordHash: hash,
    passwordSalt: salt,
    role: 'admin',
  });
  await repo.audit(db, 'admin.bootstrapped');
  return email;
}
