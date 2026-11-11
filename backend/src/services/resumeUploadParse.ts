/**
 * Read an uploaded resume / LinkedIn PDF into the learner's profile, and SAY what happened.
 *
 * WHY THIS EXISTS. On 2026-11-09 Obi Anamelechi uploaded his LinkedIn PDF. The file was stored,
 * the upload answered 200, and nothing was read: `extracted` stayed null, there was no log line,
 * and his Hire portfolio had no job history until the parse was re-run by hand. Two paths were
 * silent: text of 40 characters or less was skipped without a word, and an extractor failure was
 * a bare `console.warn`. The learner was told "Resume uploaded" either way.
 *
 * FAILURE MODES, and what each does:
 * - unreadable: the file yields too little text (a scanned image PDF, an empty export). Not
 *   retried: the same bytes give the same text. The learner is told to try another file.
 * - failed: text extraction threw, or the AI extraction returned nothing usable. Retried ONCE
 *   (fixed, no backoff: the OpenAI client already retries its own transport once with a 60s
 *   timeout). After that the learner is told we could not read it, and the stored file stays,
 *   so a re-upload or a manual re-run recovers it.
 * NOT handled here: a DB failure while saving the parse result propagates as `failed`, same as
 * an extractor failure, and the upload itself still succeeds (the file is already stored).
 *
 * Every outcome writes one structured JSON log line (event `resume_upload_parse`).
 */

export type ResumeParseStatus = 'parsed' | 'unreadable' | 'failed';

export interface ResumeParseOutcome {
  status: ResumeParseStatus;
  attempts: number;
  /** Stable class for logs and for the UI to pick its words; null when parsed. */
  error_class: 'TooLittleText' | 'TextExtractionError' | 'ExtractionEmpty' | 'ExtractionError' | null;
}

export interface ResumeParseDeps {
  extractText: (buf: Buffer, fileName: string) => Promise<string>;
  /** Runs the AI extraction and saves it; `parsed` false means nothing usable came back. */
  ingest: (enrollmentId: string, text: string) => Promise<{ parsed: boolean }>;
  log?: (line: Record<string, unknown>) => void;
  now?: () => number;
}

/** Below this, a "resume" is a header or a page number, not a career. Kept from the original rule. */
export const MIN_RESUME_TEXT_CHARS = 41;
export const MAX_PARSE_ATTEMPTS = 2;

const defaultLog = (line: Record<string, unknown>) => console.log(JSON.stringify(line));

export async function parseUploadedResume(
  enrollmentId: string,
  buf: Buffer,
  fileName: string,
  deps: ResumeParseDeps,
): Promise<ResumeParseOutcome> {
  const log = deps.log || defaultLog;
  const now = deps.now || Date.now;
  const started = now();
  const finish = (o: ResumeParseOutcome, extra: Record<string, unknown> = {}): ResumeParseOutcome => {
    log({
      timestamp: new Date().toISOString(),
      level: o.status === 'parsed' ? 'info' : 'warn',
      service: 'backend',
      event: 'resume_upload_parse',
      outcome: o.status === 'parsed' ? 'success' : 'failure',
      error_class: o.error_class,
      duration_ms: now() - started,
      context: { enrollment_id: enrollmentId, status: o.status, attempts: o.attempts, ...extra },
    });
    return o;
  };

  let text: string;
  try {
    text = (await deps.extractText(buf, fileName)) || '';
  } catch (err: unknown) {
    // Same bytes, same parser: a retry cannot change the answer.
    return finish({ status: 'failed', attempts: 1, error_class: 'TextExtractionError' }, { message: errMessage(err) });
  }
  const chars = text.trim().length;
  if (chars < MIN_RESUME_TEXT_CHARS) {
    return finish({ status: 'unreadable', attempts: 0, error_class: 'TooLittleText' }, { chars });
  }

  let lastClass: ResumeParseOutcome['error_class'] = null;
  let lastMessage: string | null = null;
  for (let attempt = 1; attempt <= MAX_PARSE_ATTEMPTS; attempt++) {
    try {
      const r = await deps.ingest(enrollmentId, text);
      if (r.parsed) return finish({ status: 'parsed', attempts: attempt, error_class: null }, { chars });
      lastClass = 'ExtractionEmpty';
      lastMessage = null;
    } catch (err: unknown) {
      lastClass = 'ExtractionError';
      lastMessage = errMessage(err);
    }
  }
  return finish({ status: 'failed', attempts: MAX_PARSE_ATTEMPTS, error_class: lastClass }, { chars, message: lastMessage });
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300);
}
