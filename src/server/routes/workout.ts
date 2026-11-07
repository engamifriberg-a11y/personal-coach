import { randomUUID } from 'node:crypto';
import type { Route } from '../http.ts';
import { badRequest, enumVal, notFound, num, optNum, str } from '../http.ts';
import type { ExerciseLog, SetLog, WorkoutSession } from '../../domain/types.ts';
import type { Db } from '../../db/index.ts';
import * as repo from '../../db/repo.ts';
import { requireUser } from '../auth.ts';
import { evaluateSafety, IN_WORKOUT_STOP_MESSAGE_HE } from '../../domain/safety.ts';
import { findSubstitutes } from '../../domain/substitution.ts';
import { summarizeSession, suggestProgression } from '../../domain/progression.ts';
import type { ExerciseHistoryEntry } from '../../domain/progression.ts';
import { getExercise } from '../../content/exercises.ts';

async function loadSession(db: Db, userId: string, id: string): Promise<WorkoutSession> {
  const session = await repo.getWorkoutSession(db, userId, id);
  if (!session) throw notFound('האימון לא נמצא, או שאינו שייך לחשבון הזה.');
  return session;
}

function findLog(session: WorkoutSession, exerciseId: string): ExerciseLog {
  let log = session.logs.find((l) => l.exerciseId === exerciseId);
  if (!log) {
    log = { exerciseId, skipped: false, sets: [] };
    session.logs.push(log);
  }
  return log;
}

function touch(session: WorkoutSession): void {
  session.updatedAt = new Date().toISOString();
}

export const workoutRoutes: Route[] = [
  {
    method: 'POST',
    path: '/api/workout/start',
    auth: 'user',
    handler: async ({ db, user, body }) => {
      const u = requireUser(user);
      const plan = await repo.getActivePlan(db, u.id);
      if (!plan) throw badRequest('אין תוכנית פעילה. צריך קודם לייצר תוכנית.');
      const dayIndex = num(body.dayIndex, 'יום', 0, 6);
      const workout = plan.workouts.find((w) => w.dayIndex === dayIndex);
      if (!workout) throw badRequest('אין אימון מתוכנן ליום הזה.');

      // אם יש אימון פתוח - מחזירים אותו במקום לפתוח חדש (שחזור אחרי סגירת האפליקציה).
      const open = await repo.getOpenWorkoutSession(db, u.id);
      if (open && open.dayIndex === dayIndex) {
        return { session: open, workout, resumed: true };
      }

      const session: WorkoutSession = {
        id: randomUUID(),
        userId: u.id,
        planId: plan.id,
        planVersion: plan.version,
        dayIndex,
        status: 'in_progress',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        logs: [],
        cursor: { blockIndex: 0, exerciseIndex: 0, setNumber: 1 },
      };
      await repo.saveWorkoutSession(db, session);
      await repo.audit(db, 'workout.started', u.id, { dayIndex });
      return { session, workout, resumed: false };
    },
  },
  {
    method: 'GET',
    path: '/api/workout/open',
    auth: 'user',
    handler: async ({ db, user }) => {
      const u = requireUser(user);
      const session = await repo.getOpenWorkoutSession(db, u.id);
      if (!session) return { session: null };
      const plan = await repo.getPlanForUser(db, u.id, session.planId);
      const workout = plan?.workouts.find((w) => w.dayIndex === session.dayIndex) ?? null;
      return { session, workout };
    },
  },
  {
    method: 'GET',
    path: '/api/workout/:id',
    auth: 'user',
    handler: async ({ db, user, params }) => {
      const u = requireUser(user);
      const session = await loadSession(db, u.id, params.id!);
      const plan = await repo.getPlanForUser(db, u.id, session.planId);
      return { session, workout: plan?.workouts.find((w) => w.dayIndex === session.dayIndex) ?? null };
    },
  },
  {
    // שמירת סט. כל קריאה כאן היא שמירה אוטומטית - אין "שמור" ידני באמצע אימון.
    method: 'POST',
    path: '/api/workout/:id/set',
    auth: 'user',
    handler: async ({ db, user, params, body }) => {
      const u = requireUser(user);
      const session = await loadSession(db, u.id, params.id!);
      if (session.status === 'completed') throw badRequest('האימון הזה כבר הושלם.');
      const exerciseId = str(body.exerciseId, 'תרגיל', { max: 64 });
      if (!getExercise(exerciseId)) throw badRequest('תרגיל לא מוכר.');

      const set: SetLog = {
        setNumber: num(body.setNumber, 'מספר סט', 1, 20),
        weightKg: optNum(body.weightKg, 'משקל', 0, 500),
        reps: optNum(body.reps, 'חזרות', 0, 200),
        durationSec: optNum(body.durationSec, 'משך', 0, 7200),
        rpe: optNum(body.rpe, 'תחושת מאמץ', 1, 10),
        painReported: body.painReported === true,
        painNote:
          body.painNote === undefined || body.painNote === null || body.painNote === ''
            ? undefined
            : str(body.painNote, 'תיאור כאב', { max: 500 }),
        completedAt: new Date().toISOString(),
      };

      const log = findLog(session, exerciseId);
      const existingIdx = log.sets.findIndex((s) => s.setNumber === set.setNumber);
      if (existingIdx >= 0) log.sets[existingIdx] = set;
      else log.sets.push(set);
      log.sets.sort((a, b) => a.setNumber - b.setNumber);
      touch(session);
      await repo.saveWorkoutSession(db, session);

      const response: Record<string, unknown> = { session, saved: true };
      if (set.painReported) {
        response.painGuidanceHe =
          'רשמנו את הכאב. אל תמשיכו עם התרגיל הזה היום - החליפו אותו בחלופה או דלגו עליו. ' +
          'לא נעלה את העומס בתרגיל הזה עד שתדווחו שהוא מרגיש טוב. ' +
          'אם הכאב חד, מקרין, או מופיע גם במנוחה - כדאי לעבור הערכה אצל רופא או פיזיותרפיסט.';
      }
      return response;
    },
  },
  {
    // דיווח על תסמין בזמן אימון - תסמיני דגל אדום עוצרים את האימון.
    method: 'POST',
    path: '/api/workout/:id/symptom',
    auth: 'user',
    handler: async ({ db, user, params, body }) => {
      const u = requireUser(user);
      const session = await loadSession(db, u.id, params.id!);
      const symptom = enumVal(body.symptom, 'תסמין', [
        'chest_pain',
        'dizziness',
        'shortness_of_breath',
        'joint_pain',
        'other_discomfort',
      ] as const);
      const redFlag = symptom === 'chest_pain' || symptom === 'dizziness' || symptom === 'shortness_of_breath';

      if (redFlag) {
        session.status = 'abandoned';
        session.notesHe = `האימון הופסק בעקבות דיווח על תסמין: ${symptom}.`;
        touch(session);
        await repo.saveWorkoutSession(db, session);
        await repo.audit(db, 'workout.stopped_red_flag', u.id, { symptom });
        return { stop: true, messageHe: IN_WORKOUT_STOP_MESSAGE_HE, session };
      }

      session.notesHe = `${session.notesHe ?? ''} דיווח על אי־נוחות: ${symptom}.`.trim();
      touch(session);
      await repo.saveWorkoutSession(db, session);
      return {
        stop: false,
        messageHe:
          'תודה על הדיווח. לא נמשיך להעמיס את האזור הזה היום: החליפו את התרגיל בחלופה או דלגו עליו. ' +
          'אם אי־הנוחות חוזרת בכמה אימונים - נעדכן את התוכנית.',
        session,
      };
    },
  },
  {
    method: 'GET',
    path: '/api/workout/:id/substitutes/:exerciseId',
    auth: 'user',
    handler: async ({ db, user, params }) => {
      const u = requireUser(user);
      await loadSession(db, u.id, params.id!);
      const profile = await repo.getProfile(db, u.id);
      if (!profile) throw badRequest('חסר פרופיל.');
      const safety = evaluateSafety({
        ageYears: profile.ageYears,
        healthFlags: profile.healthFlags,
        limitations: profile.limitations,
      });
      const subs = findSubstitutes(
        params.exerciseId!,
        {
          equipment: profile.equipment,
          safety,
          sensitiveAreas: profile.limitations
            .filter((l) => l.severity !== 'mild')
            .map((l) => l.area),
          avoidedExerciseIds: profile.avoidedExerciseIds,
        },
        4,
      );
      return {
        substitutes: subs.map((s) => ({ exercise: s.exercise, reasonHe: s.reasonHe })),
        noteHe:
          'החלופות נבחרו לפי דפוס התנועה, הציוד שיש לך והמגבלות שסימנת - ולא רק לפי השריר. ' +
          'תרגיל שמרגיש לא נכון הוא סיבה טובה להחליף.',
      };
    },
  },
  {
    method: 'POST',
    path: '/api/workout/:id/substitute',
    auth: 'user',
    handler: async ({ db, user, params, body }) => {
      const u = requireUser(user);
      const session = await loadSession(db, u.id, params.id!);
      const from = str(body.exerciseId, 'תרגיל מקורי', { max: 64 });
      const to = str(body.newExerciseId, 'תרגיל חלופי', { max: 64 });
      if (!getExercise(to)) throw badRequest('התרגיל החלופי אינו קיים בספרייה.');
      const log = findLog(session, from);
      log.substitutedForExerciseId = from;
      log.exerciseId = to;
      touch(session);
      await repo.saveWorkoutSession(db, session);
      return { session, messageHe: `הוחלף ל${getExercise(to)!.nameHe}. ההחלפה נשמרה באימון הזה.` };
    },
  },
  {
    method: 'POST',
    path: '/api/workout/:id/skip',
    auth: 'user',
    handler: async ({ db, user, params, body }) => {
      const u = requireUser(user);
      const session = await loadSession(db, u.id, params.id!);
      const exerciseId = str(body.exerciseId, 'תרגיל', { max: 64 });
      const log = findLog(session, exerciseId);
      log.skipped = true;
      touch(session);
      await repo.saveWorkoutSession(db, session);
      return { session, messageHe: 'התרגיל סומן כמדולג. אימון חלקי עדיף על אימון שלא נעשה.' };
    },
  },
  {
    method: 'POST',
    path: '/api/workout/:id/cursor',
    auth: 'user',
    handler: async ({ db, user, params, body }) => {
      const u = requireUser(user);
      const session = await loadSession(db, u.id, params.id!);
      session.cursor = {
        blockIndex: num(body.blockIndex, 'בלוק', 0, 10),
        exerciseIndex: num(body.exerciseIndex, 'תרגיל', 0, 30),
        setNumber: num(body.setNumber, 'סט', 1, 20),
      };
      touch(session);
      await repo.saveWorkoutSession(db, session);
      return { ok: true };
    },
  },
  {
    method: 'POST',
    path: '/api/workout/:id/pause',
    auth: 'user',
    handler: async ({ db, user, params, body }) => {
      const u = requireUser(user);
      const session = await loadSession(db, u.id, params.id!);
      session.status = body.resume === true ? 'in_progress' : 'paused';
      touch(session);
      await repo.saveWorkoutSession(db, session);
      return { session };
    },
  },
  {
    method: 'POST',
    path: '/api/workout/:id/complete',
    auth: 'user',
    handler: async ({ db, user, params, body }) => {
      const u = requireUser(user);
      const session = await loadSession(db, u.id, params.id!);
      session.status = 'completed';
      session.completedAt = new Date().toISOString();
      session.sessionRpe = optNum(body.sessionRpe, 'תחושת מאמץ באימון', 1, 10);
      touch(session);
      await repo.saveWorkoutSession(db, session);
      await repo.audit(db, 'workout.completed', u.id, { dayIndex: session.dayIndex });

      const previous = await repo.findPreviousCompletedSession(db, u.id, session.dayIndex, session.startedAt);
      const summary = summarizeSession(session, previous);

      // המלצות התקדמות על בסיס היסטוריה אמיתית לכל תרגיל.
      const plan = await repo.getPlanForUser(db, u.id, session.planId);
      const history = await repo.listWorkoutSessions(db, u.id, 10);
      const suggestions = session.logs
        .filter((l) => !l.skipped && l.sets.length > 0)
        .map((log) => {
          const prescription = findPrescription(plan, session.dayIndex, log.exerciseId);
          if (!prescription) return null;
          const entries: ExerciseHistoryEntry[] = history
            .filter((s) => s.status === 'completed' || s.id === session.id)
            .map((s) => {
              const l = s.logs.find((x) => x.exerciseId === log.exerciseId);
              return l ? { sessionStartedAt: s.startedAt, log: l, prescription } : null;
            })
            .filter((e): e is ExerciseHistoryEntry => e !== null);
          return suggestProgression(entries);
        })
        .filter((s) => s !== null);

      return { session, summary, progression: suggestions };
    },
  },
  {
    method: 'GET',
    path: '/api/workout/history',
    auth: 'user',
    handler: async ({ db, user }) => {
      const u = requireUser(user);
      const sessions = await repo.listWorkoutSessions(db, u.id, 50);
      return {
        sessions: sessions.map((s) => ({
          id: s.id,
          dayIndex: s.dayIndex,
          status: s.status,
          startedAt: s.startedAt,
          completedAt: s.completedAt,
          totalSets: s.logs.reduce((n, l) => n + l.sets.length, 0),
          painReported: s.logs.some((l) => l.sets.some((x) => x.painReported)),
        })),
      };
    },
  },
];

function findPrescription(plan: any, dayIndex: number, exerciseId: string) {
  if (!plan) return null;
  const workout = plan.workouts.find((w: any) => w.dayIndex === dayIndex);
  if (!workout) return null;
  for (const block of workout.blocks) {
    for (const e of block.exercises) {
      if (e.exerciseId === exerciseId) return e.prescription;
    }
  }
  return null;
}
