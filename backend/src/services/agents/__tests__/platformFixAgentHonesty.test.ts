/**
 * PlatformFixAgent proposes. It must never say it applied.
 *
 * Audited 2026-10-27: the agent read a ticket's title and description, asked a model for a
 * diagnosis, and on high confidence and low risk posted "Auto-fix has been applied. Moving to
 * review." Nothing was applied - there is no file write, no patch and no deploy anywhere in the
 * agent, and the action it records is named `auto_fix_proposed`. The dispatcher then moved the
 * ticket to in_review, which corroborated the claim. A reviewer could close a real defect.
 *
 * Found by Quincy Ninying while building Ellis (his finding 49).
 */

const mockChatCompletion = jest.fn(async (..._a: unknown[]): Promise<any> => null);
const mockAddTicketComment = jest.fn(async (..._a: unknown[]): Promise<any> => undefined);

jest.mock('../../../intelligence/assistant/openaiHelper', () => ({
  chatCompletion: (...a: unknown[]) => mockChatCompletion(...a),
}));
jest.mock('../../ticketService', () => ({
  addTicketComment: (...a: unknown[]) => mockAddTicketComment(...a),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { runPlatformFixAgent } = require('../platformFixAgent');

/** The branch that used to lie: high confidence, low risk. */
const CONFIDENT = JSON.stringify({
  root_cause: 'a null guard is missing',
  fix_description: 'add the guard',
  confidence: 0.95,
  risk_level: 'low',
  affected_components: ['scheduler'],
  recommended_action: 'add it',
});

const TICKET = { title: 'thing is broken', description: 'it throws' };

/** The comment body passed to addTicketComment on the nth call. */
const commentBody = (n = 0) => String(mockAddTicketComment.mock.calls[n][1]);

beforeEach(() => {
  jest.clearAllMocks();
  mockChatCompletion.mockResolvedValue(CONFIDENT);
});

describe('what it tells a person', () => {
  it('never claims a fix was applied', async () => {
    await runPlatformFixAgent('t1', TICKET);

    expect(commentBody()).not.toMatch(/has been applied/i);
    expect(commentBody()).not.toMatch(/auto-?fix has been/i);
  });

  it('says plainly that nothing changed', async () => {
    await runPlatformFixAgent('t1', TICKET);

    expect(commentBody()).toMatch(/no change has been made/i);
  });

  it('tells the reader the work is still theirs', async () => {
    // The old text ended the reader's job. This one starts it.
    await runPlatformFixAgent('t1', TICKET);

    expect(commentBody()).toMatch(/apply it yourself/i);
  });

  it('still gives the diagnosis, because the content was never the problem', async () => {
    await runPlatformFixAgent('t1', TICKET);

    expect(commentBody()).toContain('a null guard is missing');
    expect(commentBody()).toContain('add the guard');
  });

  it('says nothing was applied on the low-confidence branch too', async () => {
    mockChatCompletion.mockResolvedValue(JSON.stringify({
      ...JSON.parse(CONFIDENT), confidence: 0.2, risk_level: 'high',
    }));

    await runPlatformFixAgent('t1', TICKET);

    expect(commentBody()).not.toMatch(/has been applied/i);
  });
});

describe('what it tells the dispatcher', () => {
  it('reports itself as advisory, on the confident branch', async () => {
    // Without this the dispatcher reads a clean finish as work done and promotes the ticket,
    // which makes the status itself a second false claim.
    const result = await runPlatformFixAgent('t1', TICKET);

    expect(result.advisory_only).toBe(true);
  });

  it('reports itself as advisory on the low-confidence branch too', async () => {
    mockChatCompletion.mockResolvedValue(JSON.stringify({
      ...JSON.parse(CONFIDENT), confidence: 0.2, risk_level: 'high',
    }));

    const result = await runPlatformFixAgent('t1', TICKET);

    expect(result.advisory_only).toBe(true);
  });

  it('reports itself as advisory even when the model call fails', async () => {
    // The fallback diagnosis is still a proposal, and a failed model call must not become the
    // one path that promotes a ticket.
    mockChatCompletion.mockResolvedValue(null);

    const result = await runPlatformFixAgent('t1', TICKET);

    expect(result.advisory_only).toBe(true);
  });

  it('records the action under a name that matches what it did', async () => {
    const result = await runPlatformFixAgent('t1', TICKET);

    expect(result.actions_taken[0].action).toBe('auto_fix_proposed');
  });

  it('finishes without errors, which is why the error list could not carry this', async () => {
    // Proposing is a success. That is exactly why "no errors" could never have meant "changed
    // something", and why the signal had to be its own field.
    const result = await runPlatformFixAgent('t1', TICKET);

    expect(result.errors).toEqual([]);
    expect(result.advisory_only).toBe(true);
  });
});
