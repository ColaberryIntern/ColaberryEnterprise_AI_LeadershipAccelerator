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

import { runIntakeTurn, finishIntake, buildTargetFromCall, boundTurns, MAX_TURN_TEXT } from '../projectIntake';
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

describe('finishIntake - the spoken mouth ends the same way as the typed one', () => {
  const TRANSCRIPT = 'Agent: What do you do?\nCustomer: We run a repair cafe and track loans on paper.';

  beforeEach(() => {
    mockRecord.mockResolvedValue({ status: 'created', id: 'rec-7', kept: 4, rejected: 0 });
  });

  it('records a voice transcript under the call id and builds on the stamped enrolment', async () => {
    const out = await finishIntake({
      conversation: TRANSCRIPT, source: 'voice_transcript', sourceRef: 'call_abc', facts: FACTS, leadId: 7,
      buildFor: { kind: 'enrollment', enrollmentId: 'enr-9' },
    });

    expect(mockRecord).toHaveBeenCalledWith({ leadId: 7, source: 'voice_transcript', sourceRef: 'call_abc', conversation: TRANSCRIPT, facts: FACTS });
    expect(mockStart).toHaveBeenCalledWith({ recordId: 'rec-7', enrollmentId: 'enr-9' });
    expect(out).toEqual({ understanding: 'created', understanding_id: 'rec-7', build: { started: true, project_id: 'proj-1' } });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("a prospect's call lands by their email, the way the typed door does", async () => {
    mockEnrollmentFindOne.mockResolvedValue({ id: 'enr-3' });
    await finishIntake({
      conversation: TRANSCRIPT, source: 'voice_transcript', sourceRef: 'call_abc', facts: FACTS, leadId: 7,
      buildFor: buildTargetFromCall({ enrollmentId: null, email: 'Marta@Northside.test' }),
    });
    expect(mockEnrollmentFindOne).toHaveBeenCalledWith({ where: { email: 'marta@northside.test' } });
    expect(mockStart).toHaveBeenCalledWith({ recordId: 'rec-7', enrollmentId: 'enr-3' });
  });

  it('is what the typed interview calls when it is done - same outcome shape, same build', async () => {
    mockNext.mockResolvedValue({ ok: true, done: true, message: 'Thanks.', exchanges: 3 });
    const typed = await runIntakeTurn({ turns: TURNS, facts: FACTS, sourceRef: 'chat:t1', leadId: 7, buildFor: { kind: 'enrollment', enrollmentId: 'enr-9' } });
    const spoken = await finishIntake({ conversation: TRANSCRIPT, source: 'voice_transcript', sourceRef: 'call_abc', facts: FACTS, leadId: 7, buildFor: { kind: 'enrollment', enrollmentId: 'enr-9' } });

    const { done, message, ...typedOutcome } = typed as any;
    expect(typedOutcome).toEqual(spoken);
    expect(mockStart).toHaveBeenCalledTimes(2);
  });
});

describe('buildTargetFromCall - what the call was stamped with decides where it lands', () => {
  it('prefers the stamped enrolment', () => {
    expect(buildTargetFromCall({ enrollmentId: 'enr-1', email: 'x@y.test' })).toEqual({ kind: 'enrollment', enrollmentId: 'enr-1' });
  });
  it('falls back to the email', () => {
    expect(buildTargetFromCall({ enrollmentId: null, email: 'x@y.test' })).toEqual({ kind: 'by_email', email: 'x@y.test' });
  });
  it('has nowhere to land with neither', () => {
    expect(buildTargetFromCall({})).toEqual({ kind: 'none' });
  });
});

describe('the mirror - both doors are the same function', () => {
  const read = (...p: string[]) => fs.readFileSync(path.resolve(__dirname, '..', '..', '..', ...p), 'utf8');
  const publicDoor = read('controllers', 'flotationInterviewController.ts');
  const adminDoor = read('routes', 'admin', 'flotationIntakeRoutes.ts');
  const spokenDoor = read('controllers', 'synthflowWebhookController.ts');
  const publicCall = read('services', 'routingActionsService.ts');

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

  it('the spoken mouth ends through finishIntake, never through the extractor directly', () => {
    // A call's transcript can arrive three ways - the webhook, the admin page's poll, the
    // five-minute sweep - and all three go through flotationCallCompletion, which is the
    // one place voice calls finishIntake. If the webhook recorded the understanding
    // itself, voice would stop where chat continues - exactly the gap this closes.
    const completion = read('services', 'delivery', 'flotationCallCompletion.ts');
    expect(completion).toContain('await finishIntake({');
    expect(completion).toContain("source: 'voice_transcript'");
    expect(completion).toContain('buildTargetFromCall({ enrollmentId: meta.enrollment_id');

    expect(spokenDoor).toMatch(/from '[./]+services\/delivery\/flotationCallCompletion'/);
    expect(spokenDoor).toContain('await completeFlotationCall({');
    for (const door of [spokenDoor, adminDoor]) {
      expect(door).not.toContain('recordUnderstandingFromConversation');
      // Neither door ends a call itself; the admin route only READS voice understandings.
      expect(door).not.toContain('finishIntake(');
    }
    // The admin poll reconciles through the same module, not its own copy.
    expect(adminDoor).toContain('await reconcileFlotationCall(callId)');
  });

  it('both doors place the call through the one requestInstantCallback; the admin door stamps the Colaberry brand', () => {
    // The public site places it via the request_callback routing action; the admin page
    // via its own route. One function dials, scripts, gates and logs the call for both -
    // that is the mirror. What the two doors do NOT share is the spoken business name: the
    // public prospect hears AI Flotation (the default brand), the intern hears Colaberry,
    // because the admin door stamps COLABERRY_BRAND on the call it places. Same plumbing,
    // correct business name - the mirror is the function, not the brand.
    expect(publicCall).toContain('await requestInstantCallback({');
    expect(adminDoor).toContain('await requestInstantCallback(');
    expect(adminDoor).toContain("const FLOTATION_SOURCE = 'ai-flotation'");
    expect(adminDoor).toContain("{ enrollmentId: enrollment.id, requestedBy: 'admin', brand: COLABERRY_BRAND }");
    // The public door carries no CallBrand override, so it keeps the AI Flotation default.
    expect(publicCall).not.toContain('COLABERRY_BRAND');
    for (const door of [publicCall, adminDoor]) {
      expect(door).not.toContain('triggerVoiceCall');
    }
  });
});
