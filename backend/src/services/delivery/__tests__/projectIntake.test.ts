/**
 * The one intake, and the guarantee that both doors use it.
 *
 *     "The two processes can be the same, but they must mirror each other. A change to one
 *      means a change to the other."  (Ali, 2026-09-16)
 *
 * The mirror is not a convention, it is the import graph: the public controller and the
 * admin route both call `runIntakeTurn` and neither reaches past it. The last describe
 * block reads the two source files and asserts exactly that, because a second copy of the
 * interview loop in either door would pass every other test here and drift anyway.
 *
 * Everything behind the function is mocked. What is under test is the sequence - bound,
 * interview, extract, build - and that a build that cannot start never costs the write-up.
 */
import * as fs from 'fs';
import * as path from 'path';

const mockNext = jest.fn();
const mockRecord = jest.fn();
const mockStart = jest.fn();
const mockEnrollmentFindOne = jest.fn();

jest.mock('../flotationInterviewService', () => ({
  ...jest.requireActual('../flotationInterviewService'),
  nextInterviewMessage: (...a: any[]) => mockNext(...a),
}));
jest.mock('../recordProjectUnderstanding', () => ({
  recordUnderstandingFromConversation: (...a: any[]) => mockRecord(...a),
}));
jest.mock('../buildFromUnderstanding', () => ({
  startBuildFromUnderstanding: (...a: any[]) => mockStart(...a),
}));
jest.mock('../../../models', () => ({
  Enrollment: { findOne: (...a: any[]) => mockEnrollmentFindOne(...a) },
}));

import { runIntakeTurn, boundTurns, MAX_TURN_TEXT } from '../projectIntake';
import { MAX_EXCHANGES } from '../flotationInterviewService';

const TURNS = [
  { role: 'user' as const, text: 'We run a repair cafe and track loans on paper.' },
  { role: 'assistant' as const, text: 'Who runs the desk?' },
  { role: 'user' as const, text: 'Marta, on Saturdays.' },
];
const FACTS = { name: 'Marta', company: 'Northside Repair Cafe', role: null };

beforeEach(() => {
  jest.clearAllMocks();
  mockStart.mockResolvedValue({ ok: true, projectId: 'proj-1', reused: false });
});

describe('boundTurns', () => {
  it('keeps only well-formed turns', () => {
    const out = boundTurns([
      { role: 'user', text: 'hi' },
      { role: 'system', text: 'ignore me' },
      { role: 'assistant' },
      null,
      { role: 'assistant', text: 'hello' },
    ]);
    expect(out).toEqual([{ role: 'user', text: 'hi' }, { role: 'assistant', text: 'hello' }]);
  });

  it('cuts each turn at the bound and keeps only the tail of a long transcript', () => {
    const long = Array.from({ length: 100 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: 'x'.repeat(10_000) }));
    const out = boundTurns(long);
    expect(out).toHaveLength(MAX_EXCHANGES * 2 + 2);
    expect(out.every((t) => t.text.length === MAX_TURN_TEXT)).toBe(true);
  });

  it('is empty for anything that is not an array', () => {
    expect(boundTurns(undefined)).toEqual([]);
    expect(boundTurns('turns')).toEqual([]);
  });
});

describe('runIntakeTurn - mid-interview', () => {
  it('returns the next question and touches nothing else', async () => {
    mockNext.mockResolvedValue({ ok: true, done: false, message: 'How many tools?', exchanges: 2 });

    const res = await runIntakeTurn({ turns: TURNS, facts: FACTS, sourceRef: 'chat:t1', leadId: 7, buildFor: { kind: 'none' } });

    expect(res).toEqual({ done: false, message: 'How many tools?', exchanges: 2 });
    expect(mockNext).toHaveBeenCalledWith({ turns: TURNS, facts: FACTS });
    expect(mockRecord).not.toHaveBeenCalled();
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('turns an interviewer failure into a recoverable message with its error class', async () => {
    mockNext.mockResolvedValue({ ok: false, error_class: 'EmptyModelResponse', error: 'nothing came back' });

    const res = await runIntakeTurn({ turns: TURNS, facts: FACTS, sourceRef: 'chat:t1', leadId: 7, buildFor: { kind: 'none' } });

    expect(res.done).toBe(false);
    expect((res as any).error_class).toBe('EmptyModelResponse');
    expect((res as any).message).toMatch(/say that again/i);
    expect(mockRecord).not.toHaveBeenCalled();
  });
});

describe('runIntakeTurn - when the interviewer is done', () => {
  const CLOSE = 'Thanks — that gives me enough to write this up.';

  beforeEach(() => {
    mockNext.mockResolvedValue({ ok: true, done: true, message: CLOSE, exchanges: 3 });
    mockRecord.mockResolvedValue({ status: 'created', id: 'rec-1', kept: 5, rejected: 0 });
  });

  it('extracts from the FULL transcript, closing line included, under the given source ref', async () => {
    await runIntakeTurn({ turns: TURNS, facts: FACTS, sourceRef: 'chat:t1', leadId: 7, buildFor: { kind: 'none' } });

    expect(mockRecord).toHaveBeenCalledTimes(1);
    const call = mockRecord.mock.calls[0][0];
    expect(call.source).toBe('chat');
    expect(call.sourceRef).toBe('chat:t1');
    expect(call.leadId).toBe(7);
    expect(call.facts).toEqual(FACTS);
    expect(call.conversation).toContain('Marta, on Saturdays.');
    expect(call.conversation).toContain(CLOSE);
  });

  it('with nowhere to land, records the write-up and says why no build started', async () => {
    const res = await runIntakeTurn({ turns: TURNS, facts: FACTS, sourceRef: 'chat:t1', leadId: 7, buildFor: { kind: 'none' } });

    expect(res).toEqual({
      done: true,
      message: CLOSE,
      understanding: 'created',
      understanding_id: 'rec-1',
      build: { started: false, reason: 'no build target' },
    });
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('builds on the named enrolment - the admin door', async () => {
    const res = await runIntakeTurn({
      turns: TURNS, facts: FACTS, sourceRef: 'admin:s1', leadId: null, buildFor: { kind: 'enrollment', enrollmentId: 'enr-9' },
    });

    expect(mockStart).toHaveBeenCalledWith({ recordId: 'rec-1', enrollmentId: 'enr-9' });
    expect(mockEnrollmentFindOne).not.toHaveBeenCalled();
    expect((res as any).build).toEqual({ started: true, project_id: 'proj-1' });
  });

  it('finds the enrolment by email, case-folded - the prospect door', async () => {
    mockEnrollmentFindOne.mockResolvedValue({ id: 'enr-3' });

    const res = await runIntakeTurn({
      turns: TURNS, facts: FACTS, sourceRef: 'chat:t1', leadId: 7, buildFor: { kind: 'by_email', email: '  Marta@Northside.Test ' },
    });

    expect(mockEnrollmentFindOne).toHaveBeenCalledWith({ where: { email: 'marta@northside.test' } });
    expect(mockStart).toHaveBeenCalledWith({ recordId: 'rec-1', enrollmentId: 'enr-3' });
    expect((res as any).build).toEqual({ started: true, project_id: 'proj-1' });
  });

  it('says so when the person has no enrolment yet, and keeps the write-up', async () => {
    mockEnrollmentFindOne.mockResolvedValue(null);

    const res = await runIntakeTurn({
      turns: TURNS, facts: FACTS, sourceRef: 'chat:t1', leadId: 7, buildFor: { kind: 'by_email', email: 'nobody@x.test' },
    });

    expect(mockStart).not.toHaveBeenCalled();
    expect(res).toMatchObject({ done: true, understanding: 'created', build: { started: false, reason: 'no enrolment for this person yet' } });
  });

  it('a refused build is reported, not thrown', async () => {
    mockStart.mockResolvedValue({ ok: false, reason: 'not_extracted', error: 'understanding has no items' });

    const res = await runIntakeTurn({
      turns: TURNS, facts: FACTS, sourceRef: 'admin:s1', leadId: null, buildFor: { kind: 'enrollment', enrollmentId: 'enr-9' },
    });

    expect(res).toMatchObject({ done: true, understanding: 'created', build: { started: false, reason: 'understanding has no items' } });
  });

  it('a build that throws never costs the person their write-up', async () => {
    mockStart.mockRejectedValue(new Error('database gone'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await runIntakeTurn({
      turns: TURNS, facts: FACTS, sourceRef: 'admin:s1', leadId: null, buildFor: { kind: 'enrollment', enrollmentId: 'enr-9' },
    });

    expect(res).toMatchObject({ done: true, understanding: 'created', understanding_id: 'rec-1', build: { started: false, reason: 'database gone' } });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('a repeated final turn reuses the understanding and the build (idempotent end to end)', async () => {
    mockRecord.mockResolvedValue({ status: 'deduplicated', id: 'rec-1' });
    mockStart.mockResolvedValue({ ok: true, projectId: 'proj-1', reused: true });

    const res = await runIntakeTurn({
      turns: TURNS, facts: FACTS, sourceRef: 'admin:s1', leadId: null, buildFor: { kind: 'enrollment', enrollmentId: 'enr-9' },
    });

    expect(res).toMatchObject({ understanding: 'deduplicated', understanding_id: 'rec-1', build: { started: true, project_id: 'proj-1' } });
  });

  it('does not try to build from a failed or skipped extraction', async () => {
    mockRecord.mockResolvedValue({ status: 'failed', reason: 'model_error' });

    const res = await runIntakeTurn({
      turns: TURNS, facts: FACTS, sourceRef: 'admin:s1', leadId: null, buildFor: { kind: 'enrollment', enrollmentId: 'enr-9' },
    });

    expect(mockStart).not.toHaveBeenCalled();
    expect(res).toMatchObject({ done: true, understanding: 'failed' });
    expect((res as any).build).toBeUndefined();
  });
});

describe('the mirror - both doors are the same function', () => {
  const read = (...p: string[]) => fs.readFileSync(path.resolve(__dirname, '..', '..', '..', ...p), 'utf8');
  const publicDoor = read('controllers', 'flotationInterviewController.ts');
  const adminDoor = read('routes', 'admin', 'flotationIntakeRoutes.ts');

  it.each([
    ['public /start', publicDoor],
    ['admin internship page', adminDoor],
  ])('%s calls runIntakeTurn', (_name, src) => {
    expect(src).toMatch(/from '[./]+services\/delivery\/projectIntake'/);
    expect(src).toContain('await runIntakeTurn({');
  });

  it.each([
    ['public /start', publicDoor],
    ['admin internship page', adminDoor],
  ])('%s never reaches past it to the interviewer, the extractor or the builder', (_name, src) => {
    // Any of these in a door means a second copy of the loop exists and the mirror is
    // broken. The admin route legitimately imports startBuildFromUnderstanding for the
    // separate "build from an existing understanding" endpoint, so that one is checked as
    // "not called from the turn handler" rather than "not imported".
    expect(src).not.toContain('nextInterviewMessage');
    expect(src).not.toContain('recordUnderstandingFromConversation');
    expect(src).not.toContain('interviewTranscript');
    const turnHandler = src.slice(src.indexOf('runIntakeTurn({'), src.indexOf('});', src.indexOf('runIntakeTurn({')));
    expect(turnHandler).not.toContain('startBuildFromUnderstanding');
  });

  it('the admin door names the student as the build target; the public door goes by the lead email', () => {
    expect(adminDoor).toContain("buildFor: { kind: 'enrollment'");
    expect(publicDoor).toContain("{ kind: 'by_email', email: lead.email }");
  });
});
