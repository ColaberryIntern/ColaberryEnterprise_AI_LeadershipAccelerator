/**
 * parseUploadedResume: a resume upload that was not read must SAY so (Obi, 2026-11-09: file
 * stored, `extracted` null, no log line). Every dependency is injected; no DB, no OpenAI.
 */
import { MAX_PARSE_ATTEMPTS, MIN_RESUME_TEXT_CHARS, parseUploadedResume, ResumeParseDeps } from '../resumeUploadParse';

const RESUME = 'Senior Data Engineer, Acme Corp, 2019-2024. Built pipelines in Python and SQL for claims.';
const buf = Buffer.from('x');

function deps(over: Partial<ResumeParseDeps> = {}) {
  const logs: Record<string, any>[] = [];
  const d: ResumeParseDeps = {
    extractText: jest.fn().mockResolvedValue(RESUME),
    ingest: jest.fn().mockResolvedValue({ parsed: true }),
    log: (l) => logs.push(l),
    now: () => 1000,
    ...over,
  };
  return { d, logs };
}

describe('parseUploadedResume', () => {
  it('parses a readable resume in one attempt and logs success (happy path)', async () => {
    const { d, logs } = deps();
    expect(await parseUploadedResume('e1', buf, 'cv.pdf', d)).toEqual({ status: 'parsed', attempts: 1, error_class: null });
    expect(d.ingest).toHaveBeenCalledWith('e1', RESUME);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ event: 'resume_upload_parse', outcome: 'success', level: 'info', context: { enrollment_id: 'e1', status: 'parsed' } });
  });

  it('retries once when the extraction comes back empty, and succeeds on the retry', async () => {
    const { d } = deps({ ingest: jest.fn().mockResolvedValueOnce({ parsed: false }).mockResolvedValueOnce({ parsed: true }) });
    expect(await parseUploadedResume('e1', buf, 'cv.pdf', d)).toEqual({ status: 'parsed', attempts: 2, error_class: null });
  });

  it('reports failed (not success) after the capped retries, with a warn log (the Obi case)', async () => {
    const { d, logs } = deps({ ingest: jest.fn().mockResolvedValue({ parsed: false }) });
    const out = await parseUploadedResume('e1', buf, 'linkedin.pdf', d);
    expect(out).toEqual({ status: 'failed', attempts: MAX_PARSE_ATTEMPTS, error_class: 'ExtractionEmpty' });
    expect(d.ingest).toHaveBeenCalledTimes(MAX_PARSE_ATTEMPTS);
    expect(logs[0]).toMatchObject({ level: 'warn', outcome: 'failure', error_class: 'ExtractionEmpty' });
  });

  it('classifies a thrown extraction as ExtractionError and never throws itself', async () => {
    const { d, logs } = deps({ ingest: jest.fn().mockRejectedValue(new Error('OpenAI 429')) });
    const out = await parseUploadedResume('e1', buf, 'cv.pdf', d);
    expect(out).toEqual({ status: 'failed', attempts: MAX_PARSE_ATTEMPTS, error_class: 'ExtractionError' });
    expect(logs[0].context.message).toBe('OpenAI 429');
  });

  it('does not retry a text-extraction failure: same bytes, same answer', async () => {
    const { d } = deps({ extractText: jest.fn().mockRejectedValue(new Error('bad pdf')) });
    expect(await parseUploadedResume('e1', buf, 'cv.pdf', d)).toEqual({ status: 'failed', attempts: 1, error_class: 'TextExtractionError' });
    expect(d.ingest).not.toHaveBeenCalled();
  });

  it('calls too little text unreadable, logs it, and never spends an AI call (boundary)', async () => {
    const short = 'x'.repeat(MIN_RESUME_TEXT_CHARS - 1);
    const { d, logs } = deps({ extractText: jest.fn().mockResolvedValue(`  ${short}  `) });
    expect(await parseUploadedResume('e1', buf, 'scan.pdf', d)).toEqual({ status: 'unreadable', attempts: 0, error_class: 'TooLittleText' });
    expect(d.ingest).not.toHaveBeenCalled();
    expect(logs[0]).toMatchObject({ error_class: 'TooLittleText', context: { chars: MIN_RESUME_TEXT_CHARS - 1 } });

    const { d: d2 } = deps({ extractText: jest.fn().mockResolvedValue('x'.repeat(MIN_RESUME_TEXT_CHARS)) });
    expect((await parseUploadedResume('e1', buf, 'cv.pdf', d2)).status).toBe('parsed');

    const { d: d3 } = deps({ extractText: jest.fn().mockResolvedValue('') });
    expect((await parseUploadedResume('e1', buf, 'empty.pdf', d3)).status).toBe('unreadable');
  });

  it('is idempotent: the same upload twice gives the same outcome', async () => {
    const { d } = deps();
    const a = await parseUploadedResume('e1', buf, 'cv.pdf', d);
    const b = await parseUploadedResume('e1', buf, 'cv.pdf', d);
    expect(b).toEqual(a);
  });
});
