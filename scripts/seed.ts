// זריעת נתונים ראשוניים.
//
// ברירת מחדל: יצירת חשבון מנהל תוכן בלבד.
// עם הדגל --demo נוצר גם חשבון דמו עם פרופיל ותוכנית. חשבונות דמו מסומנים is_demo=1
// ומופרדים לחלוטין מנתוני משתמש אמיתי.

import { randomUUID } from 'node:crypto';
import { createDriver, migrate } from '../src/db/index.ts';
import * as repo from '../src/db/repo.ts';
import { hashPassword } from '../src/server/auth.ts';
import { evaluateSafety } from '../src/domain/safety.ts';
import { buildWeeklyPlan } from '../src/domain/plan-engine.ts';
import { estimateEnergy, computeMacroTarget } from '../src/domain/energy.ts';
import { buildNutritionPlan } from '../src/domain/nutrition-plan.ts';
import type { UserProfile } from '../src/domain/types.ts';

const db = await createDriver();
await migrate(db);
console.log(`מסד נתונים: ${db.describeHe}`);

const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com').toLowerCase();
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin!2345';

if (!await repo.findUserByEmail(db, adminEmail)) {
  const { hash, salt } = hashPassword(adminPassword);
  await repo.createUser(db, { id: randomUUID(), email: adminEmail, passwordHash: hash, passwordSalt: salt, role: 'admin' });
  console.log(`נוצר חשבון מנהל: ${adminEmail}`);
  console.log('יש לשנות את הסיסמה לפני שימוש אמיתי.');
} else {
  console.log(`חשבון המנהל ${adminEmail} קיים כבר.`);
}

if (process.argv.includes('--demo')) {
  const demoEmail = 'demo@demo.local';
  let row = await repo.findUserByEmail(db, demoEmail);
  if (!row) {
    const { hash, salt } = hashPassword('Demo!12345');
    await repo.createUser(db, {
      id: randomUUID(),
      email: demoEmail,
      passwordHash: hash,
      passwordSalt: salt,
      isDemo: true,
    });
    row = await repo.findUserByEmail(db, demoEmail)!;
    await repo.setConsents(db, row.id, { health: true, ai: false });
  }
  const userId = row.id;

  const profile: UserProfile = {
    userId,
    ageYears: 34,
    heightCm: 176,
    weightKg: 84,
    sex: 'male',
    sexSkipped: false,
    primaryGoal: 'fat_loss_recomp',
    secondaryGoals: ['strength'],
    targetWeightKg: 78,
    targetWeeks: 20,
    experience: 'beginner',
    dailyActivity: 'light',
    sessionsPerWeek: 3,
    minutesPerSession: 45,
    location: 'home',
    equipment: ['bodyweight', 'dumbbells', 'mat', 'resistance_band'],
    likedExerciseIds: [],
    avoidedExerciseIds: [],
    limitations: [{ area: 'knee', severity: 'mild', note: 'אי־נוחות קלה בירידה לעומק' }],
    healthFlags: [],
    wakeTime: '06:45',
    sleepTime: '23:15',
    workStart: '09:00',
    workEnd: '18:00',
    preferredTrainingTime: '19:30',
    dietPatterns: ['kosher'],
    allergens: ['tree_nuts'],
    mealsPerDay: 4,
    prepMinutesPerDay: 30,
    budgetLevel: 'medium',
    updatedAt: new Date().toISOString(),
  };
  await repo.saveProfile(db, profile);

  const safety = evaluateSafety(profile);
  const plan = buildWeeklyPlan({ profile, safety, version: await repo.nextPlanVersion(db, userId) });
  await repo.supersedePlans(db, userId);
  await repo.savePlan(db, plan);

  const energy = estimateEnergy(profile);
  const macros = computeMacroTarget(profile, energy, safety);
  const nutrition = buildNutritionPlan({
    profile,
    macros,
    energy,
    version: await repo.nextNutritionVersion(db, userId),
  });
  await repo.saveNutritionPlan(db, nutrition);

  console.log(`\nנוצר חשבון דמו (מסומן is_demo=1): ${demoEmail} / Demo!12345`);
  console.log(`  תוכנית: ${plan.workouts.length} אימונים בשבוע, גרסה ${plan.version}`);
  console.log(`  תזונה: ${nutrition.blocked ? 'חסום לפי כללי בטיחות' : `${nutrition.macros.kcal} קק"ל ביום`}`);
}

await db.close();
