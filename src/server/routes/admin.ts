import type { Route } from '../http.ts';
import { badRequest, str } from '../http.ts';
import * as repo from '../../db/repo.ts';
import { requireAdmin } from '../auth.ts';
import { EXERCISES, getExercise, libraryStats } from '../../content/exercises.ts';
import { RULES, pendingReviewRules } from '../../domain/sources.ts';
import { createAiProvider } from '../../ai/provider.ts';

const { statusHe: aiStatusHe } = createAiProvider();

export const adminRoutes: Route[] = [
  {
    method: 'GET',
    path: '/api/admin/overview',
    auth: 'admin',
    handler: async ({ db }) => {
      const media = await repo.listMediaAssets(db);
      const reviews = await repo.listContentReviews(db);
      const userCount = await repo.countUsers(db);
      return {
        library: libraryStats(),
        users: userCount,
        mediaAssets: media.length,
        verifiedMedia: media.filter((m) => m.verified === 1).length,
        aiGeneratedMedia: media.filter((m) => m.ai_generated === 1).length,
        reviewedExercises: reviews.filter((r) => r.reviewed).length,
        pendingRules: pendingReviewRules().map((r) => ({ id: r.id, titleHe: r.titleHe, noteHe: r.reviewNoteHe })),
        mediaBaseConfigured: Boolean(process.env.MEDIA_BASE_URL),
        aiStatusHe,
        readinessNoteHe:
          'רכיב שאין לו נכס מדיה מאומת, או שתוכנו טרם עבר ביקורת מקצועית, אינו מסומן כמוכן. ' +
          'אין להצהיר על מוכנות לייצור לפני שהמסלולים המרכזיים נבדקו וסומנו כאן.',
      };
    },
  },
  {
    method: 'GET',
    path: '/api/admin/exercises',
    auth: 'admin',
    handler: async ({ db }) => {
      const media = await repo.listMediaAssets(db);
      const reviews = await repo.listContentReviews(db);
      return {
        exercises: EXERCISES.map((ex) => {
          const m = media.find((x) => x.exercise_id === ex.id && !x.variant_id);
          const r = reviews.find((x) => x.exerciseId === ex.id);
          return {
            id: ex.id,
            nameHe: ex.nameHe,
            nameEn: ex.nameEn,
            pattern: ex.pattern,
            difficulty: ex.difficulty,
            hasMedia: Boolean(m),
            mediaVerified: m?.verified === 1,
            mediaLicense: m?.license ?? null,
            mediaOwner: m?.owner ?? null,
            mediaAiGenerated: m?.ai_generated === 1,
            reviewed: r?.reviewed ?? false,
            reviewerName: r?.reviewerName ?? null,
            ready: Boolean(m && m.verified === 1) && Boolean(r?.reviewed),
          };
        }),
      };
    },
  },
  {
    method: 'POST',
    path: '/api/admin/media',
    auth: 'admin',
    handler: async ({ db, user, body }) => {
      const admin = requireAdmin(user);
      const exerciseId = str(body.exerciseId, 'תרגיל', { max: 64 });
      if (!getExercise(exerciseId)) throw badRequest('תרגיל לא קיים בספרייה.');
      // מקור, בעלים ורישיון הם שדות חובה. אין הוספת מדיה בלי תיעוד רישוי.
      const id = await repo.upsertMediaAsset(db, {
        exerciseId,
        variantId: body.variantId ? str(body.variantId, 'גרסה', { max: 64 }) : null,
        path: str(body.path, 'נתיב הנכס', { max: 300 }),
        kind: body.kind ? str(body.kind, 'סוג', { max: 30 }) : 'video',
        source: str(body.source, 'מקור', { max: 300 }),
        owner: str(body.owner, 'בעלים', { max: 200 }),
        license: str(body.license, 'רישיון', { max: 200 }),
        verified: body.verified === true,
        aiGenerated: body.aiGenerated === true,
        updatedBy: admin.id,
      });
      await repo.audit(db, 'admin.media_upsert', admin.id, { exerciseId });
      return {
        id,
        noteHe:
          body.aiGenerated === true
            ? 'הנכס סומן כנוצר על ידי AI. הוא לא יוצג כתוכן שנבדק מקצועית, וההוראות הכתובות נשארות מקור האמת.'
            : 'הנכס נשמר עם פרטי המקור והרישוי. הוא יוצג למשתמשים רק אם סומן verified וגם הוגדר MEDIA_BASE_URL.',
      };
    },
  },
  {
    method: 'POST',
    path: '/api/admin/review',
    auth: 'admin',
    handler: async ({ db, user, body }) => {
      const admin = requireAdmin(user);
      const exerciseId = str(body.exerciseId, 'תרגיל', { max: 64 });
      if (!getExercise(exerciseId)) throw badRequest('תרגיל לא קיים בספרייה.');
      await repo.setContentReview(db, {
        exerciseId,
        reviewed: body.reviewed === true,
        reviewerName: str(body.reviewerName, 'שם הבודק', { max: 120 }),
        note: body.note ? str(body.note, 'הערה', { max: 1000 }) : undefined,
      });
      await repo.audit(db, 'admin.content_review', admin.id, { exerciseId });
      return { ok: true };
    },
  },
  {
    method: 'GET',
    path: '/api/admin/rules',
    auth: 'admin',
    handler: async () => ({ rules: Object.values(RULES) }),
  },
  {
    method: 'GET',
    path: '/api/admin/audit',
    auth: 'admin',
    handler: async ({ db }) => ({
      entries: await repo.listAuditLog(db, 200),
      noteHe: 'היומן אינו מכיל נתוני בריאות, משקל, מגבלות או תוכן תזונתי - רק פעולות טכניות.',
    }),
  },
];
