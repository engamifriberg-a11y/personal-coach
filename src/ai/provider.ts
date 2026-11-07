// שכבת AI מוחלפת.
//
// שלושה כללים שאינם ניתנים לעקיפה:
// 1. ה-AI מנסח בלבד. הוא אינו קובע תרגילים, עומסים, ספים או יעדי אנרגיה.
// 2. המידע שנשלח לספק מצומצם למינימום: אין שם, אין אימייל, אין מזהה משתמש, אין טקסט חופשי רפואי.
// 3. כשל או היעדר מפתח אינם שוברים את המוצר - נופלים לניסוח דטרמיניסטי מקומי.

export type AiRequest = {
  /** סוג הניסוח המבוקש - קובע את התבנית המקומית בנפילה. */
  kind: 'plan_summary' | 'exercise_tip' | 'progress_note';
  /** עובדות מספריות וקטגוריות בלבד. בלי מזהים ובלי טקסט חופשי של המשתמש. */
  facts: Record<string, string | number | boolean | string[]>;
  /** תבנית מקומית לשימוש כשאין ספק AI. */
  fallbackHe: string;
};

export type AiResult = {
  textHe: string;
  provider: 'none' | 'anthropic' | 'openai';
  degraded: boolean;
  /** סיבת הנפילה, אם הייתה. מוצג ללוג בלי נתוני בריאות. */
  reason?: string;
};

export type AiProvider = {
  name: 'none' | 'anthropic' | 'openai';
  available: boolean;
  explain(req: AiRequest): Promise<AiResult>;
};

const SYSTEM_HE =
  'אתה מנסח הסברים בעברית עבור אפליקציית אימונים. אתה מקבל עובדות שחושבו על ידי מנוע כללים מקצועי. ' +
  'אסור לך לשנות מספרים, להוסיף תרגילים, להמליץ על תוספים, על צום או על שינוי תרופות, ' +
  'או לקבוע ספי בטיחות. נסח 2-4 משפטים ברורים, בטון תומך, בלי הבטחות לתוצאה ובלי מסגור מפחיד. ' +
  'אם העובדות לא מספיקות - אמור זאת במקום להשלים מהדמיון.';

/** ספק ברירת מחדל: ניסוח מקומי דטרמיניסטי. ללא רשת, ללא עלות, עובד תמיד. */
export const nullProvider: AiProvider = {
  name: 'none',
  available: true,
  async explain(req: AiRequest): Promise<AiResult> {
    return { textHe: req.fallbackHe, provider: 'none', degraded: false };
  },
};

type HttpProviderConfig = {
  name: 'anthropic' | 'openai';
  apiKey: string;
  model: string;
  timeoutMs: number;
};

function buildHttpProvider(cfg: HttpProviderConfig): AiProvider {
  return {
    name: cfg.name,
    available: true,
    async explain(req: AiRequest): Promise<AiResult> {
      const userContent =
        `סוג הניסוח: ${req.kind}\n` +
        `עובדות שחושבו על ידי מנוע הכללים:\n${JSON.stringify(req.facts, null, 2)}\n` +
        'נסח הסבר בעברית על בסיס העובדות האלה בלבד.';
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
      try {
        const { url, headers, body, extract } =
          cfg.name === 'anthropic'
            ? {
                url: 'https://api.anthropic.com/v1/messages',
                headers: {
                  'content-type': 'application/json',
                  'x-api-key': cfg.apiKey,
                  'anthropic-version': '2023-06-01',
                },
                body: {
                  model: cfg.model,
                  max_tokens: 500,
                  system: SYSTEM_HE,
                  messages: [{ role: 'user', content: userContent }],
                },
                extract: (j: any) => j?.content?.[0]?.text as string | undefined,
              }
            : {
                url: 'https://api.openai.com/v1/chat/completions',
                headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
                body: {
                  model: cfg.model,
                  max_tokens: 500,
                  messages: [
                    { role: 'system', content: SYSTEM_HE },
                    { role: 'user', content: userContent },
                  ],
                },
                extract: (j: any) => j?.choices?.[0]?.message?.content as string | undefined,
              };

        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok) {
          return {
            textHe: req.fallbackHe,
            provider: cfg.name,
            degraded: true,
            reason: `HTTP ${res.status}`,
          };
        }
        const json = await res.json();
        const text = extract(json);
        if (!text || text.trim().length === 0) {
          return { textHe: req.fallbackHe, provider: cfg.name, degraded: true, reason: 'empty_response' };
        }
        return { textHe: text.trim(), provider: cfg.name, degraded: false };
      } catch (err) {
        return {
          textHe: req.fallbackHe,
          provider: cfg.name,
          degraded: true,
          reason: err instanceof Error ? err.name : 'unknown_error',
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * בחירת ספק לפי משתני סביבה.
 * אם חסר מפתח - חוזרים ל-nullProvider ומסמנים זאת. אין "תלות חינמית" מוסתרת.
 */
export function createAiProvider(env: Record<string, string | undefined> = process.env): { provider: AiProvider; statusHe: string } {
  const requested = (env.AI_PROVIDER ?? 'none').toLowerCase();
  const timeoutMs = Number(env.AI_TIMEOUT_MS ?? 15000);

  if (requested === 'anthropic') {
    const key = env.ANTHROPIC_API_KEY;
    if (!key) {
      return {
        provider: nullProvider,
        statusHe:
          'הוגדר AI_PROVIDER=anthropic אבל חסר ANTHROPIC_API_KEY. המערכת עובדת עם ניסוח מקומי. ' +
          'זהו חיבור חיצוני חסר ולא תקלה.',
      };
    }
    return {
      provider: buildHttpProvider({
        name: 'anthropic',
        apiKey: key,
        model: env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5',
        timeoutMs,
      }),
      statusHe: 'ספק AI: Anthropic. שירות בתשלום לפי שימוש.',
    };
  }

  if (requested === 'openai') {
    const key = env.OPENAI_API_KEY;
    if (!key) {
      return {
        provider: nullProvider,
        statusHe:
          'הוגדר AI_PROVIDER=openai אבל חסר OPENAI_API_KEY. המערכת עובדת עם ניסוח מקומי. ' +
          'זהו חיבור חיצוני חסר ולא תקלה.',
      };
    }
    return {
      provider: buildHttpProvider({
        name: 'openai',
        apiKey: key,
        model: env.OPENAI_MODEL ?? 'gpt-4o-mini',
        timeoutMs,
      }),
      statusHe: 'ספק AI: OpenAI. שירות בתשלום לפי שימוש.',
    };
  }

  return {
    provider: nullProvider,
    statusHe: 'ניסוח מקומי דטרמיניסטי (ללא ספק AI חיצוני, ללא עלות וללא שליחת נתונים לצד שלישי).',
  };
}
