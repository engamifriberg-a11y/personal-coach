// עטיפה לשכבת ה-AI: בונה את העובדות המצומצמות ואת הניסוח המקומי.
// הניסוח המקומי הוא התוצר המלא - ה-AI רק משפר ניסוח, ולכן המוצר שלם גם בלעדיו.

import type { AiProvider, AiResult } from './provider.ts';
import type { WeeklyPlan, MacroTarget, EnergyEstimate } from '../domain/types.ts';
import { goalLabelHe, experienceLabelHe } from '../domain/plan-engine.ts';

/** האם המשתמש אישר שימוש ב-AI. ללא הסכמה - לא יוצא דבר מחוץ לשרת. */
export type AiConsent = { aiAllowed: boolean };

export async function explainPlan(
  plan: WeeklyPlan,
  provider: AiProvider,
  consent: AiConsent,
): Promise<AiResult> {
  const fallbackHe =
    `${plan.rationale.summaryHe} ` +
    `בשבוע הראשון יש ${plan.weeklyAerobicMinutesPrescribed} דקות פעילות אירובית, ` +
    `כצעד בדרך ליעד של ${plan.weeklyAerobicMinutesTarget} דקות. ` +
    'התוכנית תתעדכן לפי מה שתדווחו באימונים - לא לפי לוח זמנים שנקבע מראש.';

  if (!consent.aiAllowed) {
    return { textHe: fallbackHe, provider: 'none', degraded: false, reason: 'no_ai_consent' };
  }

  return provider.explain({
    kind: 'plan_summary',
    fallbackHe,
    facts: {
      goal: goalLabelHe(plan.rationale.primaryGoal),
      experience: experienceLabelHe(plan.rationale.effectiveExperience),
      sessions_per_week: plan.rationale.sessionsPerWeek,
      minutes_per_session: plan.rationale.minutesPerSession,
      split: plan.rationale.split,
      aerobic_minutes_now: plan.weeklyAerobicMinutesPrescribed,
      aerobic_minutes_target: plan.weeklyAerobicMinutesTarget,
      limitations_count: plan.rationale.limitationsApplied.length,
      equipment: plan.rationale.equipmentApplied,
    },
  });
}

export async function explainNutrition(
  energy: EnergyEstimate,
  macros: MacroTarget,
  provider: AiProvider,
  consent: AiConsent,
): Promise<AiResult> {
  const fallbackHe = macros.blocked
    ? 'לא נבנו יעדי תזונה במצב הזה. ההסבר המלא מופיע בהודעות הבטיחות.'
    : `אומדן ההוצאה היומית שלך הוא בטווח ${energy.tdeeRangeKcal[0]}-${energy.tdeeRangeKcal[1]} קלוריות, ` +
      `ויעד הפתיחה הוא כ-${macros.kcal} קלוריות ביום: ${macros.proteinG} גרם חלבון, ` +
      `${macros.fatG} גרם שומן ו-${macros.carbsG} גרם פחמימה. ` +
      'אלה מספרי פתיחה בתוך טווח אי־ודאות, ומכאן מכיילים לפי מה שקורה בפועל.';

  if (macros.blocked || !consent.aiAllowed) {
    return { textHe: fallbackHe, provider: 'none', degraded: false, reason: macros.blocked ? 'blocked' : 'no_ai_consent' };
  }

  return provider.explain({
    kind: 'progress_note',
    fallbackHe,
    facts: {
      tdee_low: energy.tdeeRangeKcal[0],
      tdee_high: energy.tdeeRangeKcal[1],
      target_kcal: macros.kcal,
      protein_g: macros.proteinG,
      fat_g: macros.fatG,
      carbs_g: macros.carbsG,
      method: energy.method,
    },
  });
}
