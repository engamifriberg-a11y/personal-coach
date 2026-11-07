import type { Route } from '../http.ts';
import { notFound } from '../http.ts';
import type { Exercise } from '../../domain/types.ts';
import {
  DIFFICULTY_LABELS_HE,
  EQUIPMENT_LABELS_HE,
  MUSCLE_LABELS_HE,
  PATTERN_LABELS_HE,
  DEFAULT_EQUIPMENT_BY_LOCATION,
  filterExercises,
  getExercise,
  libraryStats,
} from '../../content/exercises.ts';
import * as repo from '../../db/repo.ts';
import type { Db } from '../../db/index.ts';
import { RULES, SOURCES, pendingReviewRules } from '../../domain/sources.ts';

/**
 * מצרף לתרגיל את נכס המדיה המאושר מהמסד, אם קיים.
 * אין בקוד קישורי סרטונים. רכיב בלי מדיה מאומתת מסומן mediaReady=false,
 * והממשק מציג הוראות כתובות במקום נגן שבור.
 */
export async function withMedia(db: Db, ex: Exercise) {
  const row = await repo.getMediaForExercise(db, ex.id);
  const base = process.env.MEDIA_BASE_URL ?? '';
  const reviews = await repo.listContentReviews(db);
  const review = reviews.find((r) => r.exerciseId === ex.id);
  const media =
    row && row.verified === 1 && base
      ? {
          url: `${base.replace(/\/$/, '')}/${row.path.replace(/^\//, '')}`,
          kind: row.kind,
          source: row.source,
          owner: row.owner,
          license: row.license,
          verified: true,
          aiGenerated: row.ai_generated === 1,
          checkedAt: row.checked_at,
        }
      : null;
  return {
    ...ex,
    media: media ?? ex.media,
    mediaReady: Boolean(media),
    mediaFallbackHe: media
      ? null
      : 'אין כאן סרטון הדגמה מאומת, ולכן מוצגות הוראות הביצוע הכתובות. ' +
        'סרטון יתווסף רק כשיהיה נכס שמותר להטמיע, עם מקור ורישיון מתועדים, ואחרי בדיקה שהוא תואם בדיוק לגרסת התרגיל.',
    professionallyReviewed: review?.reviewed ?? ex.professionallyReviewed,
    reviewerName: review?.reviewerName ?? null,
  };
}

export const libraryRoutes: Route[] = [
  {
    method: 'GET',
    path: '/api/exercises',
    handler: async ({ db, url }) => {
      const q = url.searchParams;
      const equipment = q.get('equipment');
      const results = filterExercises({
        pattern: (q.get('pattern') as any) ?? undefined,
        muscle: (q.get('muscle') as any) ?? undefined,
        difficulty: (q.get('difficulty') as any) ?? undefined,
        equipment: equipment ? (equipment.split(',') as any) : undefined,
        search: q.get('search') ?? undefined,
      });
      return {
        exercises: await Promise.all(results.map((ex) => withMedia(db, ex))),
        stats: libraryStats(),
      };
    },
  },
  {
    method: 'GET',
    path: '/api/exercises/:id',
    handler: async ({ db, params }) => {
      const ex = getExercise(params.id!);
      if (!ex) throw notFound('תרגיל לא נמצא.');
      return { exercise: await withMedia(db, ex) };
    },
  },
  {
    method: 'GET',
    path: '/api/meta',
    handler: async () => ({
      labels: {
        equipment: EQUIPMENT_LABELS_HE,
        muscles: MUSCLE_LABELS_HE,
        patterns: PATTERN_LABELS_HE,
        difficulty: DIFFICULTY_LABELS_HE,
      },
      defaultEquipmentByLocation: DEFAULT_EQUIPMENT_BY_LOCATION,
      libraryStats: libraryStats(),
      sources: SOURCES,
      rules: RULES,
      pendingReviewCount: pendingReviewRules().length,
      disclaimerHe:
        'האפליקציה נותנת הנחיות אימון ותזונה כלליות למבוגרים בריאים, ואינה מהווה אבחון, טיפול או ייעוץ רפואי. ' +
        'תוכן שמסומן "ממתין לביקורת מקצועית" טרם נבדק על ידי גורם מוסמך מטעם המערכת.',
    }),
  },
];
