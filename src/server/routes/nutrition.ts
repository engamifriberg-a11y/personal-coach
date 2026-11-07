import type { Route } from '../http.ts';
import { badRequest } from '../http.ts';
import * as repo from '../../db/repo.ts';
import { requireUser } from '../auth.ts';
import { evaluateSafety } from '../../domain/safety.ts';
import { computeMacroTarget, estimateEnergy, ENERGY_RULE_IDS, ACTIVITY_LABELS_HE } from '../../domain/energy.ts';
import { buildNutritionPlan } from '../../domain/nutrition-plan.ts';
import { FOODS, ALLERGEN_LABELS_HE, STATE_LABELS_HE } from '../../content/foods.ts';
import { describeRule, SOURCES } from '../../domain/sources.ts';
import { explainNutrition } from '../../ai/explain.ts';
import { createAiProvider } from '../../ai/provider.ts';

const { provider: aiProvider } = createAiProvider();

export const nutritionRoutes: Route[] = [
  {
    method: 'POST',
    path: '/api/nutrition/generate',
    auth: 'user',
    handler: async ({ db, user }) => {
      const u = requireUser(user);
      const profile = repo.getProfile(db, u.id);
      if (!profile) throw badRequest('צריך קודם להשלים את השאלון.');

      const safety = evaluateSafety({
        ageYears: profile.ageYears,
        healthFlags: profile.healthFlags,
        limitations: profile.limitations,
      });
      const energy = estimateEnergy(profile);
      const macros = computeMacroTarget(profile, energy, safety);
      const version = repo.nextNutritionVersion(db, u.id);
      const plan = buildNutritionPlan({ profile, macros, energy, version });
      repo.saveNutritionPlan(db, plan);
      repo.audit(db, plan.blocked ? 'nutrition.blocked' : 'nutrition.generated', u.id, { version });

      const explanation = await explainNutrition(energy, macros, aiProvider, { aiAllowed: Boolean(u.consentAiAt) });

      return {
        plan,
        explanation,
        safety,
        rules: ENERGY_RULE_IDS.map((id) => describeRule(id)),
        dataSource: SOURCES.usda_fdc,
        activityLabelHe: ACTIVITY_LABELS_HE[profile.dailyActivity],
      };
    },
  },
  {
    method: 'GET',
    path: '/api/nutrition',
    auth: 'user',
    handler: ({ db, user }) => {
      const u = requireUser(user);
      const plan = repo.getLatestNutritionPlan(db, u.id);
      if (!plan) return { plan: null };
      const foodIds = new Set<string>();
      for (const day of plan.days)
        for (const { meal } of day.meals) for (const c of meal.components) foodIds.add(c.foodId);
      return {
        plan,
        foods: FOODS.filter((f) => foodIds.has(f.id)),
        dataSource: SOURCES.usda_fdc,
      };
    },
  },
  {
    method: 'GET',
    path: '/api/foods',
    handler: () => ({
      foods: FOODS,
      allergenLabelsHe: ALLERGEN_LABELS_HE,
      stateLabelsHe: STATE_LABELS_HE,
      dataSource: SOURCES.usda_fdc,
      noteHe:
        'הערכים מוצגים לכל 100 גרם, עם ציון האם הפריט נמדד גולמי, מבושל או כפי שנמכר. ' +
        'זהו מאגר זרע שהוזן ידנית ממקור ציבורי; לפני שימוש בייצור נדרש ייבוא מאומת מ-FoodData Central.',
    }),
  },
];
