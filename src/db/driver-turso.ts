// דרייבר Turso (libSQL) מעל HTTP, עם fetch בלבד ובלי תלויות npm.
//
// למה HTTP ולא ספריית לקוח: אפס תלויות שומר על ההבטחה שהפרויקט רץ בלי npm install,
// וה-API הוא JSON פשוט. Turso הוא SQLite, ולכן ה-SQL והפרמטרים זהים לדרייבר המקומי.
//
// פרוטוקול: POST {TURSO_DATABASE_URL}/v2/pipeline
//   { "requests": [ { "type": "execute", "stmt": { "sql": "...", "args": [...] } } ] }
// תשובה: { "results": [ { "type": "ok", "response": { "result": { cols, rows, affected_row_count } } } ] }
//
// הערה חשובה: הדרייבר הזה לא נבדק מול שרת Turso אמיתי בסביבת הפיתוח (אין שם רשת
// לשירות הזה). לכן קיים נתיב /api/health/db שמאמת אותו בשנייה אחרי הפריסה.

import type { DbDriver, ExecuteResult, Row, SqlValue, Statement } from './driver.ts';

type TursoArg =
  | { type: 'null' }
  | { type: 'integer'; value: string }
  | { type: 'float'; value: number }
  | { type: 'text'; value: string }
  | { type: 'blob'; base64: string };

function toArg(value: SqlValue): TursoArg {
  if (value === null || value === undefined) return { type: 'null' };
  if (typeof value === 'boolean') return { type: 'integer', value: value ? '1' : '0' };
  if (typeof value === 'bigint') return { type: 'integer', value: value.toString() };
  if (typeof value === 'number') {
    // מספר שלם נשלח כ-integer כדי שיישמר כמו שהוא ב-SQLite
    return Number.isInteger(value)
      ? { type: 'integer', value: String(value) }
      : { type: 'float', value };
  }
  if (value instanceof Uint8Array) {
    return { type: 'blob', base64: Buffer.from(value).toString('base64') };
  }
  return { type: 'text', value: String(value) };
}

/** המרה חזרה לטיפוסים של JavaScript. integer מוחזר כמספר, אלא אם הוא גדול מהבטוח. */
function fromValue(cell: any): any {
  if (cell === null || cell === undefined) return null;
  switch (cell.type) {
    case 'null':
      return null;
    case 'integer': {
      const asNumber = Number(cell.value);
      return Number.isSafeInteger(asNumber) ? asNumber : BigInt(cell.value);
    }
    case 'float':
      return typeof cell.value === 'number' ? cell.value : Number(cell.value);
    case 'blob':
      return cell.base64 ? new Uint8Array(Buffer.from(cell.base64, 'base64')) : new Uint8Array();
    case 'text':
    default:
      return cell.value ?? null;
  }
}

type PipelineResult = {
  cols: Array<{ name: string | null }>;
  rows: any[][];
  affected_row_count?: number;
  last_insert_rowid?: string | null;
};

export function createTursoDriver(config: {
  url: string;
  authToken: string;
  timeoutMs?: number;
}): DbDriver {
  // libsql:// הוא השם שמופיע בלוח הבקרה; מעל HTTP זה https://
  const base = config.url.replace(/^libsql:\/\//, 'https://').replace(/\/+$/, '');
  const endpoint = `${base}/v2/pipeline`;
  const timeoutMs = config.timeoutMs ?? 15000;
  const host = (() => {
    try {
      return new URL(base).host;
    } catch {
      return base;
    }
  })();

  /** שליחת בקשות גולמיות והחזרת רשומות התוצאה כפי שהן, בלי פירוש. */
  async function pipelineRaw(requests: object[]): Promise<any[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.authToken}`,
        },
        body: JSON.stringify({ requests: [...requests, { type: 'close' }] }),
        signal: controller.signal,
      });
    } catch (err) {
      const reason = err instanceof Error && err.name === 'AbortError' ? 'חרגה מזמן ההמתנה' : 'נכשלה';
      throw new Error(`הבקשה למסד הנתונים ${reason}`);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      // לא מחזירים את גוף התשובה למשתמש; הוא עלול להכיל פרטי שאילתה
      const text = await res.text().catch(() => '');
      console.error('[turso] HTTP', res.status, text.slice(0, 500));
      throw new Error(`מסד הנתונים החזיר שגיאה (HTTP ${res.status})`);
    }

    const json: any = await res.json();
    return json?.results ?? [];
  }

  /** שליחת פקודות execute, עם זריקת שגיאה על כל פקודה שנכשלה. */
  async function pipeline(requests: object[]): Promise<PipelineResult[]> {
    const entries = await pipelineRaw(requests);
    const out: PipelineResult[] = [];
    for (const entry of entries) {
      if (entry?.type === 'error') {
        const message = entry.error?.message ?? 'שגיאה לא מזוהה';
        console.error('[turso] statement error:', message);
        throw new Error(`שאילתה נכשלה במסד הנתונים: ${message}`);
      }
      if (entry?.response?.type === 'execute' && entry.response.result) {
        out.push(entry.response.result as PipelineResult);
      }
    }
    return out;
  }

  function rowsToObjects(result: PipelineResult | undefined): Row[] {
    if (!result) return [];
    const names = result.cols.map((c, i) => c.name ?? `col${i}`);
    return result.rows.map((row) => {
      const obj: Row = {};
      row.forEach((cell, i) => {
        obj[names[i]!] = fromValue(cell);
      });
      return obj;
    });
  }

  const execute = (sql: string, params?: SqlValue[]) => ({
    type: 'execute',
    stmt: { sql, args: (params ?? []).map(toArg) },
  });

  return {
    name: 'turso',
    describeHe: `Turso (SQLite מנוהל): ${host}`,

    async all(sql, params) {
      const [result] = await pipeline([execute(sql, params)]);
      return rowsToObjects(result);
    },

    async get(sql, params) {
      const [result] = await pipeline([execute(sql, params)]);
      return rowsToObjects(result)[0] ?? null;
    },

    async run(sql, params): Promise<ExecuteResult> {
      const [result] = await pipeline([execute(sql, params)]);
      return {
        changes: Number(result?.affected_row_count ?? 0),
        lastInsertRowid: result?.last_insert_rowid ? Number(result.last_insert_rowid) : null,
      };
    },

    async batch(statements: Statement[]) {
      if (statements.length === 0) return;

      // אטומיות אמיתית דורשת את סוג הבקשה "batch" עם תנאים בין השלבים.
      // ב-pipeline רגיל, פקודה שנכשלת אינה עוצרת את ה-COMMIT שאחריה,
      // וכך היה נשמר חלק מהשינויים. כאן כל שלב תלוי בהצלחת קודמו:
      //   step 0            BEGIN
      //   step 1..n         הפקודות, כל אחת תלויה בקודמת
      //   step n+1          COMMIT, תלוי בהצלחת הפקודה האחרונה
      //   step n+2          ROLLBACK, רק אם ה-COMMIT לא הצליח
      // שלב שתנאו אינו מתקיים מדולג, ולכן כשלון באמצע מדלג גם על ה-COMMIT.
      const n = statements.length;
      const steps: object[] = [{ stmt: { sql: 'BEGIN', args: [] } }];
      statements.forEach((st, i) => {
        steps.push({
          condition: { type: 'ok', step: i },
          stmt: { sql: st.sql, args: (st.params ?? []).map(toArg) },
        });
      });
      steps.push({ condition: { type: 'ok', step: n }, stmt: { sql: 'COMMIT', args: [] } });
      steps.push({
        condition: { type: 'not', cond: { type: 'ok', step: n + 1 } },
        stmt: { sql: 'ROLLBACK', args: [] },
      });

      const results = await pipelineRaw([{ type: 'batch', batch: { steps } }]);
      const batchResult = results.find((r) => r?.response?.type === 'batch')?.response?.result;
      const errors: Array<{ message?: string } | null> = batchResult?.step_errors ?? [];

      // שלב ROLLBACK הוא האחרון; שגיאה בו אינה מעניינת אם ממילא התגלגלנו אחורה
      const failure = errors.slice(0, n + 2).find((e) => e);
      if (failure) {
        console.error('[turso] batch step failed:', failure.message ?? 'unknown');
        throw new Error(`פעולה מרובת פקודות נכשלה ולא נשמרה: ${failure.message ?? 'שגיאה לא מזוהה'}`);
      }
      // ה-COMMIT עצמו חייב להיות שלב שהתבצע
      const commitRan = batchResult?.step_results?.[n + 1];
      if (!commitRan) {
        throw new Error('פעולה מרובת פקודות לא אושרה במסד ולא נשמרה.');
      }
    },

    async exec(sql) {
      // סקריפט מיגרציה: פיצול לפקודות. הערות מוסרות כדי שלא יבלבלו את הפיצול.
      const statements = splitSqlScript(sql);
      if (statements.length === 0) return;
      await pipeline(statements.map((s) => execute(s)));
    },

    async close() {
      // חיבור HTTP חסר מצב - אין מה לסגור
    },
  };
}

/**
 * פיצול סקריפט SQL לפקודות בודדות.
 * מתעלם מנקודה-פסיק בתוך מחרוזות ובתוך הערות. מספיק למיגרציות של הפרויקט,
 * שאינן כוללות טריגרים או בלוקי BEGIN...END מקוננים.
 */
export function splitSqlScript(sql: string): string[] {
  const out: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]!;
    const next = sql[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (!inSingle && !inDouble) {
      if (ch === '-' && next === '-') {
        inLineComment = true;
        i++;
        continue;
      }
      if (ch === '/' && next === '*') {
        inBlockComment = true;
        i++;
        continue;
      }
    }

    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;

    if (ch === ';' && !inSingle && !inDouble) {
      const trimmed = current.trim();
      if (trimmed) out.push(trimmed);
      current = '';
      continue;
    }
    current += ch;
  }

  const tail = current.trim();
  if (tail) out.push(tail);
  return out;
}
