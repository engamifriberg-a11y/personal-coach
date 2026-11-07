// שרת מקומי שמדמה את פרוטוקול ה-HTTP של Turso (/v2/pipeline) מעל node:sqlite.
//
// למה: אין גישה לשירות Turso אמיתי מסביבת הבדיקות, אבל את הפרוטוקול עצמו
// אפשר לאמת במדויק - מיפוי פרמטרים לטיפוסים, קריאת שורות, batch, שגיאות
// והרשאה. מה שנשאר לא מכוסה הוא רק ההתנהגות של השירות המנוהל בפועל.

import { createServer, type Server } from 'node:http';
import { DatabaseSync } from 'node:sqlite';

const AUTH_TOKEN = 'fake-turso-token';

function toCell(value: unknown) {
  if (value === null || value === undefined) return { type: 'null' };
  if (typeof value === 'bigint') return { type: 'integer', value: value.toString() };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { type: 'integer', value: String(value) }
      : { type: 'float', value };
  }
  if (value instanceof Uint8Array) {
    return { type: 'blob', base64: Buffer.from(value).toString('base64') };
  }
  return { type: 'text', value: String(value) };
}

function fromArg(arg: any) {
  if (!arg || arg.type === 'null') return null;
  switch (arg.type) {
    case 'integer':
      return Number(arg.value);
    case 'float':
      return Number(arg.value);
    case 'blob':
      return new Uint8Array(Buffer.from(arg.base64 ?? '', 'base64'));
    default:
      return String(arg.value);
  }
}

export type FakeTurso = {
  url: string;
  authToken: string;
  close: () => Promise<void>;
  /** מספר הבקשות שהתקבלו - לאימות שהדרייבר מאחד פקודות לבקשה אחת. */
  requestCount: () => number;
};

/** node:sqlite מריץ גם INSERT דרך all(), ולכן צריך להבדיל לפי המילה הפותחת. */
function isQuery(sql: string): boolean {
  return /^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(sql);
}

type StepOutcome = { ok: boolean; skipped: boolean; result: any; error: { message: string } | null };

export async function startFakeTurso(): Promise<FakeTurso> {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  let requests = 0;

  /** הרצת פקודה בודדת והחזרת תוצאה בפורמט של Turso. */
  function runStatement(stmt: any): { result: any } | { error: { message: string } } {
    const sql: string = stmt?.sql ?? '';
    const args = (stmt?.args ?? []).map(fromArg);
    try {
      const prepared = db.prepare(sql);
      let rows: any[] = [];
      let affected = 0;
      let lastRowid: number | null = null;

      if (isQuery(sql)) {
        rows = prepared.all(...args) as any[];
      } else {
        const out = prepared.run(...args);
        affected = Number(out.changes ?? 0);
        lastRowid = out.lastInsertRowid != null ? Number(out.lastInsertRowid) : null;
      }

      const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
      return {
        result: {
          cols: cols.map((name) => ({ name })),
          rows: rows.map((row) => cols.map((c) => toCell(row[c]))),
          affected_row_count: affected,
          last_insert_rowid: lastRowid === null ? null : String(lastRowid),
        },
      };
    } catch (err) {
      return { error: { message: err instanceof Error ? err.message : 'unknown' } };
    }
  }

  /** הערכת תנאי שלב, כמו בפרוטוקול של libSQL. */
  function evalCondition(cond: any, outcomes: StepOutcome[]): boolean {
    if (!cond) return true;
    switch (cond.type) {
      case 'ok':
        return outcomes[cond.step]?.ok === true;
      case 'error':
        return outcomes[cond.step]?.error != null;
      case 'not':
        return !evalCondition(cond.cond, outcomes);
      case 'and':
        return (cond.conds ?? []).every((c: any) => evalCondition(c, outcomes));
      case 'or':
        return (cond.conds ?? []).some((c: any) => evalCondition(c, outcomes));
      case 'is_autocommit':
        return true;
      default:
        return true;
    }
  }

  function runBatch(batch: any) {
    const outcomes: StepOutcome[] = [];
    for (const step of batch?.steps ?? []) {
      if (!evalCondition(step.condition, outcomes)) {
        outcomes.push({ ok: false, skipped: true, result: null, error: null });
        continue;
      }
      const out = runStatement(step.stmt);
      if ('error' in out) outcomes.push({ ok: false, skipped: false, result: null, error: out.error });
      else outcomes.push({ ok: true, skipped: false, result: out.result, error: null });
    }
    return {
      step_results: outcomes.map((o) => (o.ok ? o.result : null)),
      step_errors: outcomes.map((o) => o.error),
    };
  }

  const server: Server = createServer((req, res) => {
    if (req.url !== '/v2/pipeline' || req.method !== 'POST') {
      res.writeHead(404).end('not found');
      return;
    }
    if (req.headers.authorization !== `Bearer ${AUTH_TOKEN}`) {
      res.writeHead(401, { 'content-type': 'application/json' }).end(
        JSON.stringify({ error: 'unauthorized' }),
      );
      return;
    }

    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      requests++;
      let payload: any;
      try {
        payload = JSON.parse(body);
      } catch {
        res.writeHead(400, { 'content-type': 'application/json' }).end(
          JSON.stringify({ error: 'bad json' }),
        );
        return;
      }

      const results: any[] = [];
      for (const request of payload.requests ?? []) {
        if (request.type === 'close') {
          results.push({ type: 'ok', response: { type: 'close' } });
          continue;
        }

        if (request.type === 'batch') {
          results.push({
            type: 'ok',
            response: { type: 'batch', result: runBatch(request.batch) },
          });
          continue;
        }

        if (request.type !== 'execute') {
          results.push({ type: 'ok', response: { type: request.type } });
          continue;
        }

        const out = runStatement(request.stmt);
        if ('error' in out) {
          results.push({ type: 'error', error: { ...out.error, code: 'SQL_ERROR' } });
        } else {
          results.push({ type: 'ok', response: { type: 'execute', result: out.result } });
        }
      }

      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ results }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    url: `http://127.0.0.1:${port}`,
    authToken: AUTH_TOKEN,
    requestCount: () => requests,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      db.close();
    },
  };
}
