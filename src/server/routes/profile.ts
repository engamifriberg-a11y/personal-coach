import type { Route } from '../http.ts';
import { badRequest, num } from '../http.ts';
import * as repo from '../../db/repo.ts';
import { requireHealthConsent, requireUser } from '../auth.ts';
import { validateProfile, QUESTIONNAIRE_OPTIONS } from '../validate-profile.ts';
import { assessGoalRealism, evaluateSafety } from '../../domain/safety.ts';
import { estimateEnergy } from '../../domain/energy.ts';

export const profileRoutes: Route[] = [
  {
    method: 'GET',
    path: '/api/questionnaire/options',
    handler: () => QUESTIONNAIRE_OPTIONS,
  },
  {
    // שמירת טיוטה: מאפשרת לעצור באמצע ולהמשיך מאוחר יותר.
    method: 'POST',
    path: '/api/questionnaire/draft',
    auth: 'user',
    handler: ({ db, user, body }) => {
      const u = requireUser(user);
      requireHealthConsent(u);
      const step = num(body.step ?? 0, 'שלב', 0, 20);
      if (typeof body.data !== 'object' || body.data === null) throw badRequest('חסרים נתוני טיוטה.');
      repo.saveDraft(db, u.id, step, body.data);
      return { saved: true, step };
    },
  },
  {
    method: 'GET',
    path: '/api/questionnaire/draft',
    auth: 'user',
    handler: ({ db, user }) => {
      const u = requireUser(user);
      return repo.getDraft(db, u.id) ?? { step: 0, data: {} };
    },
  },
  {
    method: 'POST',
    path: '/api/profile',
    auth: 'user',
    handler: ({ db, user, body }) => {
      const u = requireUser(user);
      requireHealthConsent(u);
      const profile = validateProfile(u.id, body);
      repo.saveProfile(db, profile);
      repo.clearDraft(db, u.id);
      repo.audit(db, 'profile.saved', u.id);

      const safety = evaluateSafety({
        ageYears: profile.ageYears,
        healthFlags: profile.healthFlags,
        limitations: profile.limitations,
      });
      const realism = assessGoalRealism(profile);
      const energy = safety.allowNutritionPlan ? estimateEnergy(profile) : null;

      return {
        profile,
        safety,
        realism,
        energy,
        // הבהרה מחויבת: אין יצירת דיוק מדומה.
        precisionNoteHe:
          'גיל, גובה ומשקל לבדם אינם מספיקים לתוכנית מדויקת. הם מאפשרים נקודת פתיחה סבירה בלבד. ' +
          'הדיוק נבנה מההתאמות שנעשות לאורך הזמן: מה הצלחת לבצע, איך הגוף הגיב, ומה קרה במשקל ובהיקפים. ' +
          'תוכנית טובה היא כזו שמשתנה, לא כזו שנקבעה פעם אחת.',
      };
    },
  },
  {
    method: 'GET',
    path: '/api/profile',
    auth: 'user',
    handler: ({ db, user }) => {
      const u = requireUser(user);
      const profile = repo.getProfile(db, u.id);
      if (!profile) return { profile: null, safety: null };
      const safety = evaluateSafety({
        ageYears: profile.ageYears,
        healthFlags: profile.healthFlags,
        limitations: profile.limitations,
      });
      return { profile, safety, realism: assessGoalRealism(profile) };
    },
  },
];
