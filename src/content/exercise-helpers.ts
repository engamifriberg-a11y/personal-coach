import type { ExerciseVariant, MediaAsset } from '../domain/types.ts';

/**
 * נכס מדיה ריק.
 * החלטה מכוונת: אין בקוד קישורי סרטונים. כל נכס מוזן דרך פאנל הניהול
 * עם מקור, בעלים ורישיון, ועובר סימון verified רק לאחר בדיקה ידנית
 * שהוא תואם בדיוק לגרסת התרגיל. ראו docs/MEDIA-LICENSING.md
 */
export function noMedia(kind: MediaAsset['kind'] = 'video'): MediaAsset {
  return {
    path: null,
    kind,
    source: null,
    owner: null,
    license: null,
    verified: false,
    aiGenerated: false,
    checkedAt: null,
  };
}

export function variant(
  id: string,
  nameHe: string,
  nameEn: string,
  howItDiffersHe: string,
): ExerciseVariant {
  return { id, nameHe, nameEn, howItDiffersHe, media: noMedia() };
}

export const REVIEW_NOTE_HE =
  'התוכן נכתב על בסיס פרקטיקה מקובלת של אימון התנגדות. טרם עבר ביקורת של מאמן מוסמך מטעם המערכת, ' +
  'ולכן הוא מסומן בממשק כ"ממתין לביקורת מקצועית".';
