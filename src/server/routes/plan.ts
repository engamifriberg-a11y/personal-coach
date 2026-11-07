import type { Route } from '../http.ts';
import { HttpError, badRequest, notFound } from '../http.ts';
import * as repo from '../../db/repo.ts';
import { requireUser } from '../auth.ts';
import { evaluateSafety } from '../../domain/safety.ts';
import { buildWeeklyPlan, diffPlans } from '../../domain/plan-engine.ts';
import { getExercise } from '../../content/exercises.ts';
import { explainPlan } from '../../ai/explain.ts';
import { createAiProvider } from '../../ai/provider.ts';
import { describeRule } from '../../domain/sources.ts';

const { provider: aiProvider, statusHe: aiStatusHe } = createAiProvider();

export const planRoutes: Route[] = [
  {
    method: 'POST',
    path: '/api/plan/generate',
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
      if (!safety.allowTrainingPlan) {
        // לא נוצרת תוכנית. מוסבר מה נדרש כדי להמשיך.
        throw new HttpError(409, 'לא ניתן לייצר תוכנית אימונים במצב הנוכחי.', {
          safety,
          whatIsNeededHe: safety.messagesHe,
        });
      }

      const previous = repo.getActivePlan(db, u.id);
      const version = repo.nextPlanVersion(db, u.id);
      const plan = buildWeeklyPlan({ profile, safety, version });

      let diff = null;
      if (previous) {
        diff = diffPlans(previous, plan);
        if (diff.requiresApproval) {
          // שינוי מהותי: התוכנית נשמרת כממתינה לאישור ואינה מחליפה את הפעילה.
          plan.status = 'pending_approval';
          repo.savePlan(db, plan);
          const diffId = repo.savePlanDiff(db, u.id, diff, false);
          repo.audit(db, 'plan.pending_approval', u.id, { version });
          return {
            plan,
            diff,
            diffId,
            requiresApproval: true,
            messageHe:
              'התוכנית החדשה שונה מהותית מהתוכנית הנוכחית, ולכן היא ממתינה לאישור שלך. ' +
              'אפשר לראות בדיוק מה משתנה ומדוע, ולאשר או להישאר עם התוכנית הקיימת.',
            aiStatusHe,
          };
        }
        repo.savePlanDiff(db, u.id, diff, true);
      }

      repo.supersedePlans(db, u.id);
      plan.status = 'active';
      repo.savePlan(db, plan);
      repo.audit(db, 'plan.generated', u.id, { version });

      const explanation = await explainPlan(plan, aiProvider, { aiAllowed: Boolean(u.consentAiAt) });

      return {
        plan,
        diff,
        requiresApproval: false,
        explanation,
        rules: plan.appliedRuleIds.map((id) => describeRule(id)),
        aiStatusHe,
      };
    },
  },
  {
    method: 'POST',
    path: '/api/plan/approve/:diffId',
    auth: 'user',
    handler: ({ db, user, params }) => {
      const u = requireUser(user);
      const diffs = repo.listPlanDiffs(db, u.id);
      const target = diffs.find((d) => d.id === params.diffId);
      if (!target) throw notFound('בקשת השינוי לא נמצאה.');
      const pending = db
        .prepare("SELECT data_json FROM plans WHERE user_id = ? AND version = ? AND status = 'pending_approval'")
        .get(u.id, target.diff.toVersion) as { data_json: string } | undefined;
      if (!pending) throw notFound('לא נמצאה תוכנית הממתינה לאישור בגרסה הזו.');

      repo.supersedePlans(db, u.id);
      db.prepare("UPDATE plans SET status = 'active' WHERE user_id = ? AND version = ?").run(u.id, target.diff.toVersion);
      repo.approvePlanDiff(db, u.id, target.id);
      repo.audit(db, 'plan.approved', u.id, { version: target.diff.toVersion });
      return { plan: JSON.parse(pending.data_json), approved: true };
    },
  },
  {
    method: 'GET',
    path: '/api/plan/active',
    auth: 'user',
    handler: ({ db, user }) => {
      const u = requireUser(user);
      const plan = repo.getActivePlan(db, u.id);
      if (!plan) return { plan: null };
      // מצרפים את פרטי התרגילים כדי שהממשק לא יצטרך לאחד בעצמו.
      const exerciseIds = new Set<string>();
      for (const w of plan.workouts)
        for (const b of w.blocks) {
          for (const e of b.exercises) {
            exerciseIds.add(e.exerciseId);
            for (const alt of e.alternativeExerciseIds) exerciseIds.add(alt);
          }
        }
      const exercises = [...exerciseIds].map((id) => getExercise(id)).filter(Boolean);
      return { plan, exercises, rules: plan.appliedRuleIds.map((id) => describeRule(id)) };
    },
  },
  {
    method: 'GET',
    path: '/api/plan/versions',
    auth: 'user',
    handler: ({ db, user }) => {
      const u = requireUser(user);
      return { versions: repo.listPlanVersions(db, u.id), changes: repo.listPlanDiffs(db, u.id) };
    },
  },
];
