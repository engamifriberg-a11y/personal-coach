import { randomUUID } from 'node:crypto';
import type { Route } from '../http.ts';
import { badRequest, notFound, optNum, str } from '../http.ts';
import type { Measurement } from '../../domain/types.ts';
import * as repo from '../../db/repo.ts';
import { requireHealthConsent, requireUser } from '../auth.ts';
import { analyzeWeightTrend } from '../../domain/progression.ts';
import { evaluateSafety } from '../../domain/safety.ts';

export const progressRoutes: Route[] = [
  {
    method: 'POST',
    path: '/api/measurements',
    auth: 'user',
    handler: ({ db, user, body }) => {
      const u = requireUser(user);
      requireHealthConsent(u);
      const profile = repo.getProfile(db, u.id);
      // מי שסימן היסטוריה של הפרעת אכילה לא מקבל מעקב משקל יזום.
      if (profile?.healthFlags.includes('eating_disorder_history') && body.weightKg !== undefined) {
        throw badRequest(
          'במצב שסימנת, מעקב משקל יזום דרך האפליקציה עלול להזיק יותר מלעזור, ולכן הוא כבוי. ' +
            'אפשר להמשיך לעקוב אחרי ביצועים באימונים ואחרי ההרגשה. ליווי בנושא הזה כדאי שייעשה עם גורם מקצועי.',
        );
      }

      const m: Measurement = {
        id: randomUUID(),
        userId: u.id,
        takenAt: body.takenAt ? str(body.takenAt, 'תאריך', { max: 40 }) : new Date().toISOString(),
        weightKg: optNum(body.weightKg, 'משקל', 25, 400),
        waistCm: optNum(body.waistCm, 'היקף מתניים', 40, 250),
        hipCm: optNum(body.hipCm, 'היקף אגן', 40, 250),
        chestCm: optNum(body.chestCm, 'היקף חזה', 40, 250),
        armCm: optNum(body.armCm, 'היקף זרוע', 15, 100),
        thighCm: optNum(body.thighCm, 'היקף ירך', 20, 120),
        photoRef:
          body.photoRef === undefined || body.photoRef === null || body.photoRef === ''
            ? undefined
            : str(body.photoRef, 'הפניית תמונה', { max: 300 }),
        note: body.note === undefined || body.note === null || body.note === '' ? undefined : str(body.note, 'הערה', { max: 500 }),
      };
      repo.addMeasurement(db, m);
      repo.audit(db, 'measurement.added', u.id);
      return { measurement: m };
    },
  },
  {
    method: 'DELETE',
    path: '/api/measurements/:id',
    auth: 'user',
    handler: ({ db, user, params }) => {
      const u = requireUser(user);
      const ok = repo.deleteMeasurement(db, u.id, params.id!);
      if (!ok) throw notFound('המדידה לא נמצאה.');
      return { deleted: true };
    },
  },
  {
    method: 'GET',
    path: '/api/progress',
    auth: 'user',
    handler: ({ db, user }) => {
      const u = requireUser(user);
      const measurements = repo.listMeasurements(db, u.id);
      const sessions = repo.listWorkoutSessions(db, u.id, 100);
      const completed = sessions.filter((s) => s.status === 'completed');
      const profile = repo.getProfile(db, u.id);
      const safety = profile
        ? evaluateSafety({
            ageYears: profile.ageYears,
            healthFlags: profile.healthFlags,
            limitations: profile.limitations,
          })
        : null;

      const trend = analyzeWeightTrend(measurements);

      // התמדה: אחוז השלמה מול התוכנית, בארבעה השבועות האחרונים.
      const fourWeeksAgo = Date.now() - 28 * 86400000;
      const recent = completed.filter((s) => new Date(s.startedAt).getTime() >= fourWeeksAgo);
      const plan = repo.getActivePlan(db, u.id);
      const planned = plan ? plan.workouts.length * 4 : 0;
      const adherencePct = planned > 0 ? Math.round((recent.length / planned) * 100) : null;

      // ביצועים: נפח לפי תרגיל לאורך זמן.
      const byExercise = new Map<string, Array<{ date: string; volume: number; topWeight: number }>>();
      for (const s of completed) {
        for (const log of s.logs) {
          if (log.skipped || log.sets.length === 0) continue;
          const volume = log.sets.reduce((sum, set) => sum + (set.weightKg ?? 0) * (set.reps ?? 0), 0);
          const topWeight = Math.max(0, ...log.sets.map((set) => set.weightKg ?? 0));
          const arr = byExercise.get(log.exerciseId) ?? [];
          arr.push({ date: s.startedAt.slice(0, 10), volume: Math.round(volume), topWeight });
          byExercise.set(log.exerciseId, arr);
        }
      }

      return {
        measurements,
        weightTrend: trend,
        adherence: {
          completedLast4Weeks: recent.length,
          plannedLast4Weeks: planned,
          percent: adherencePct,
          noteHe:
            'התמדה נמדדת לאורך שבועות, לא לפי שבוע בודד. 70% מהתוכנית לאורך חודשים עובד טוב יותר מ-100% ' +
            'לשבועיים ואז הפסקה.',
        },
        performance: [...byExercise.entries()].map(([exerciseId, points]) => ({ exerciseId, points })),
        measurementsNoteHe:
          'תמונות התקדמות הן אופציונליות לחלוטין ונשמרות באחסון פרטי. ' +
          'מומלץ למדוד היקפים אחת לשבועיים באותן נקודות, כי הם מספרים סיפור שהמשקל לבד מפספס.',
        eatingDisorderSafeMode: Boolean(profile?.healthFlags.includes('eating_disorder_history')),
        safety,
      };
    },
  },
];
