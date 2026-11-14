/**
 * The site-chat document send is governed (MR1).
 *
 * WHY THESE EXIST, in order of how much damage each regression would do.
 *
 *   1. **Consent is checked against the RECIPIENT, not the visitor.** The address comes
 *      from whatever the visitor typed, so it is not necessarily their own. Keying the
 *      check on the visitor's lead would check one person's consent and mail another.
 *      That was the actual hole: this path called no consent check at all.
 *   2. **A refusal is not reported as a send.** The old code returned "Successfully sent"
 *      on paths where no mail left, including when SMTP was unconfigured and when the
 *      document did not exist. Maya telling a visitor she emailed something she did not
 *      is worse than the missing email.
 *   3. **A second call sends no second email.** There was no idempotency key, so N tool
 *      calls produced N emails. The model calling a tool twice in one turn is ordinary.
 *   4. **No outbound copy claims an attachment.** The body always read "is attached to
 *      this email" and no attachment was ever added.
 */
export {};

jest.mock('../../models', () => ({
  Lead: { findOne: jest.fn(), findByPk: jest.fn() },
}));
jest.mock('../../models/AdmissionsMemory', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../../models/AdmissionsActionLog', () => ({ __esModule: true, default: { create: jest.fn() } }));
jest.mock('../../models/DocumentDeliveryLog', () => ({ __esModule: true, default: { create: jest.fn() } }));
jest.mock('../admissionsWorkflowService', () => ({ canDeliverDocument: jest.fn() }));
jest.mock('../emailService', () => ({ sendAdmissionsDocument: jest.fn() }));
jest.mock('../communicationSafetyService', () => ({ evaluateSend: jest.fn() }));
jest.mock('../email/idempotentSend', () => ({ sendOnce: jest.fn() }));
// Must resolve a promise: the caller fires it and attaches `.catch`, so a bare jest.fn()
// returning undefined throws inside production code rather than testing it.
jest.mock('../mayaCampaignRouter', () => ({ addMayaInteractionTag: jest.fn(async () => undefined) }));
// THE SEAM AND THE GATE, which the handler now goes through instead of calling the mailer.
//
// WHAT MOVED, AND WHY POINT 3 BELOW STILL HOLDS. The handler used to call `sendOnce` itself,
// wrapping `sendAdmissionsDocument`. It now calls `queueAdmissionsDocument`, which renders the
// message, stores the exact bytes, and - on approval - delivers through `sendOnce` inside
// `mayaOutboundDelivery.ts`. So the idempotency guarantee did not weaken, it doubled: the
// queue's UNIQUE `idempotency_key` stops a second ROW, and the ledger's UNIQUE index stops a
// second SEND. Both halves are tested where they now live, in `mayaOutboundQueue.test.ts`.
//
// What this suite still owns, and what the assertions below were rewritten to check, is the
// HANDLER: that consent is resolved against the recipient before anything is composed, that a
// refusal is never reported as a send, and that the handler reaches no provider except through
// the seam.
const mockQueueDoc = jest.fn();
jest.mock('../maya/deliverOrQueue', () => ({
  queueAdmissionsDocument: (...a: unknown[]) => mockQueueDoc(...a),
}));
jest.mock('../maya/mayaToolGate', () => ({
  guardMayaTool: jest.fn(async () => ({ blocked: false, capability: 'sendDocument', mode: 'review' })),
  capabilityRefusalSentence: jest.fn(() => 'not available'),
}));
jest.mock('../mayaToolsService', () => ({
  captureLeadDetails: jest.fn(), updateLeadRecord: jest.fn(), sendSmsSummary: jest.fn(),
  initiateVoiceCall: jest.fn(), getAvailableSlots: jest.fn(), scheduleStrategyCall: jest.fn(),
  enrollInCampaign: jest.fn(), retrieveKnowledgeContent: jest.fn(),
}));
// The recorder lazily imports aiEventService, which builds a real Sequelize. Stub the
// wrapper so this suite needs no database.
jest.mock('../agents/tools/toolInvocationRecorder', () => ({
  withToolRecording: (_ctx: unknown, run: () => Promise<unknown>) => run(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { executeMayaAction } = require('../mayaActionService');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Lead } = require('../../models');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const AdmissionsMemory = require('../../models/AdmissionsMemory').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const DocumentDeliveryLog = require('../../models/DocumentDeliveryLog').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { canDeliverDocument } = require('../admissionsWorkflowService');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sendAdmissionsDocument } = require('../emailService');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { evaluateSend } = require('../communicationSafetyService');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sendOnce } = require('../email/idempotentSend');

const VISITOR = 'visitor-1';
const CONVO = 'convo-1';
const ARGS = { document_type: 'program_overview', recipient_email: 'Dana@Example.com', recipient_name: 'Dana' };

const leadRow = (id: number) => ({ getDataValue: (k: string) => (k === 'id' ? id : 'Dana Whitfield') });

const call = (args: Record<string, unknown> = ARGS) =>
  executeMayaAction('send_document', args, VISITOR, CONVO);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  (canDeliverDocument as jest.Mock).mockResolvedValue({ allowed: true });
  (AdmissionsMemory.findOne as jest.Mock).mockResolvedValue({ lead_id: 999 });
  (Lead.findOne as jest.Mock).mockResolvedValue(leadRow(42));
  (Lead.findByPk as jest.Mock).mockResolvedValue(leadRow(42));
  (evaluateSend as jest.Mock).mockResolvedValue({ allowed: true, redirect: null, testMode: false, deliveryMode: 'live' });
  (DocumentDeliveryLog.create as jest.Mock).mockResolvedValue({});
  (sendAdmissionsDocument as jest.Mock).mockResolvedValue({ outcome: 'sent', messageId: 'msg-1' });
  // The DEFAULT is `queued`, not `delivered`, because that is what ships: `sendDocument` ships
  // at `review`, so the ordinary outcome of asking Maya for a document is that a message is
  // composed and held for a person. Tests that need the delivered path say so explicitly.
  mockQueueDoc.mockResolvedValue({
    outcome: 'queued', capability: 'sendDocument', mode: 'review',
    message: 'I have put the program overview together for you. A member of the team checks '
      + 'every message before it goes out, so it will reach you shortly rather than this second.',
  });
});

afterEach(() => jest.restoreAllMocks());

describe('consent is checked, and against the recipient', () => {
  it('asks evaluateSend before sending, on the email channel', async () => {
    await call();
    expect(evaluateSend).toHaveBeenCalledTimes(1);
    expect(evaluateSend).toHaveBeenCalledWith(expect.objectContaining({
      leadId: 42, channel: 'email', toEmail: 'Dana@Example.com',
    }));
  });

  it('resolves the lead from the RECIPIENT address, not the visitor memory', async () => {
    // The visitor's own lead is 999; the typed address belongs to lead 42. 42 must win,
    // or we would check one person's consent and mail a different person.
    await call();
    expect(Lead.findOne).toHaveBeenCalledTimes(1);
    expect((evaluateSend as jest.Mock).mock.calls[0][0].leadId).toBe(42);
  });

  it('matches the address case-insensitively, lower-cased on both sides', async () => {
    // Production holds 986 mixed-case lead addresses, 21 of them opted out. An exact match
    // would find no lead for those and skip the consent check entirely. The query must
    // compare lower(email) to a lower-cased value, and must not use a LIKE wildcard.
    await call({ ...ARGS, recipient_email: '  Dana@Example.COM  ' });
    const arg = (Lead.findOne as jest.Mock).mock.calls[0][0];
    const rendered = JSON.stringify(arg.where);
    expect(rendered).toContain('lower');
    expect(rendered).toContain('dana@example.com');
    expect(rendered).not.toMatch(/iLike|%/);
  });

  it('falls back to the visitor lead only when the address has none', async () => {
    (Lead.findOne as jest.Mock).mockResolvedValue(null);
    await call();
    expect((evaluateSend as jest.Mock).mock.calls[0][0].leadId).toBe(999);
  });

  it('refuses to send when the recipient is suppressed, and sends nothing', async () => {
    (evaluateSend as jest.Mock).mockResolvedValue({
      allowed: false, redirect: null, testMode: false,
      blockedReason: 'unsubscribe_event_exists', deliveryMode: 'blocked',
    });
    const out = await call();
    expect(out.success).toBe(false);
    expect(mockQueueDoc).not.toHaveBeenCalled();
    expect(mockQueueDoc).not.toHaveBeenCalled();
  });

  it('does not leak the suppression reason to the visitor', async () => {
    (evaluateSend as jest.Mock).mockResolvedValue({
      allowed: false, redirect: null, testMode: false,
      blockedReason: 'lead_bounced', deliveryMode: 'blocked',
    });
    const out = await call();
    expect(out.summary).not.toContain('lead_bounced');
    expect(out.summary).not.toContain('bounced');
    expect(out.summary).not.toContain('unsubscribe');
  });

  it('honours a test-mode redirect instead of mailing the real recipient', async () => {
    (evaluateSend as jest.Mock).mockResolvedValue({
      allowed: true, redirect: { email: 'sink@colaberry.com' }, testMode: true, deliveryMode: 'test_redirect',
    });
    await call();
    expect(mockQueueDoc.mock.calls[0][0].to).toBe('sink@colaberry.com');
  });

  it('proceeds when the recipient has no lead at all, because there is no opt-out to honour', async () => {
    (Lead.findOne as jest.Mock).mockResolvedValue(null);
    (AdmissionsMemory.findOne as jest.Mock).mockResolvedValue(null);
    const out = await call();
    expect(evaluateSend).not.toHaveBeenCalled();
    expect(out.success).toBe(true);
  });
});

describe('a refusal is never reported as a send', () => {
  it('reports failure, not success, when the document does not exist', async () => {
    mockQueueDoc.mockResolvedValue({ outcome: 'refused', capability: 'sendDocument', mode: 'review', message: 'I do not have that document to hand right now.', detail: 'no_document_to_send' });
    const out = await call();
    expect(out.success).toBe(false);
    expect(out.summary).not.toMatch(/sent|emailed/i);
  });

  it('reports failure when SMTP is not configured, rather than claiming delivery', async () => {
    mockQueueDoc.mockResolvedValue({ outcome: 'refused', capability: 'sendDocument', mode: 'review', message: 'I do not have that document to hand right now.', detail: 'smtp_not_configured' });
    const out = await call();
    expect(out.success).toBe(false);
  });

  it('records a failed delivery row so the request stays actionable by a person', async () => {
    mockQueueDoc.mockResolvedValue({ outcome: 'refused', capability: 'sendDocument', mode: 'review', message: 'I do not have that document to hand right now.', detail: 'no_document_to_send' });
    await call();
    expect(DocumentDeliveryLog.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
  });

  it('does not tag the lead as having received a document when nothing was sent', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { addMayaInteractionTag } = require('../mayaCampaignRouter');
    mockQueueDoc.mockResolvedValue({ outcome: 'refused', capability: 'sendDocument', mode: 'review', message: 'I do not have that document to hand right now.', detail: 'no_document_to_send' });
    await call();
    expect(addMayaInteractionTag).not.toHaveBeenCalled();
  });
});

describe('the handler reaches a provider only through the seam', () => {
  it('calls the seam exactly once and the mailer not at all', async () => {
    await call();
    expect(mockQueueDoc).toHaveBeenCalledTimes(1);
    // The point of the seam: the handler has no way to reach a person on its own. A structural
    // version of this, over the whole dispatcher closure, is in `mayaSeamContainment.test.ts`.
    expect(sendAdmissionsDocument).not.toHaveBeenCalled();
    expect(sendOnce).not.toHaveBeenCalled();
  });

  it('hands the seam everything it needs to compose and to address the message', async () => {
    await call();
    expect(mockQueueDoc).toHaveBeenCalledWith(expect.objectContaining({
      to: 'Dana@Example.com',
      name: 'Dana',
      documentType: 'program_overview',
      visitorId: VISITOR,
      correlationId: CONVO,
    }));
  });

  it('identifies the recipient by an OPAQUE REF, never by their email address', async () => {
    // Ids are not PII in this repo. The ref is what every log line and API response carries,
    // and `recipient_address` exists separately because a queue that cannot address a message
    // cannot deliver it.
    await call();
    const input = mockQueueDoc.mock.calls[0][0];
    expect(input.recipientRef).toBe('lead:42');
    expect(input.recipientRef).not.toMatch(/@/);
  });

  it('falls back to a visitor ref when the recipient has no lead row', async () => {
    (Lead.findOne as jest.Mock).mockResolvedValue(null);
    (AdmissionsMemory.findOne as jest.Mock).mockResolvedValue(null);
    await call();
    expect(mockQueueDoc.mock.calls[0][0].recipientRef).toBe(`visitor:${VISITOR}`);
  });

  it('a different document type is a different message, so it is not suppressed as a duplicate', async () => {
    // The idempotency key itself is derived inside the seam, from the document type and the
    // visitor, and `mayaOutboundQueue.test.ts` proves a replay writes no second row. What this
    // asserts is the input that key is derived FROM, which is this handler's responsibility.
    await call({ ...ARGS, document_type: 'pricing_guide' });
    expect(mockQueueDoc.mock.calls[0][0].documentType).toBe('pricing_guide');
  });
});

describe('a queued message is never described as a sent one', () => {
  it('relays the seam\'s own sentence rather than claiming delivery', async () => {
    const out = await call();
    expect(out.success).toBe(true);
    // The summary is what the model reads before telling the visitor what happened. If a queued
    // message were summarised as sent, Maya would say something untrue to a real person, which
    // is the class of defect this whole run exists to close.
    expect(out.summary).toMatch(/checks every message before it goes out/i);
    expect(out.summary).not.toMatch(/successfully sent/i);
  });

  it('records the delivery row as pending, not sent', async () => {
    await call();
    expect(DocumentDeliveryLog.create)
      .toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
  });

  it('but DOES say sent when the capability is live and it actually went', async () => {
    mockQueueDoc.mockResolvedValue({
      outcome: 'delivered', capability: 'sendDocument', mode: 'live', message: 'Done.',
    });
    const out = await call();
    expect(out.summary).toMatch(/successfully sent/i);
    expect(DocumentDeliveryLog.create)
      .toHaveBeenCalledWith(expect.objectContaining({ status: 'sent' }));
  });
});

describe('the workflow gate still applies, and boundaries hold', () => {
  it('refuses an unsupported document type before any lookup', async () => {
    const out = await call({ ...ARGS, document_type: 'not_a_document' });
    expect(out.success).toBe(false);
    expect(evaluateSend).not.toHaveBeenCalled();
    expect(mockQueueDoc).not.toHaveBeenCalled();
  });

  it('refuses a missing recipient address', async () => {
    const out = await call({ document_type: 'program_overview' });
    expect(out.success).toBe(false);
    expect(mockQueueDoc).not.toHaveBeenCalled();
  });

  it('still honours the workflow stage denial', async () => {
    (canDeliverDocument as jest.Mock).mockResolvedValue({ allowed: false, reason: 'stage_too_early' });
    const out = await call({ ...ARGS, document_type: 'executive_briefing' });
    expect(out.success).toBe(false);
    expect(mockQueueDoc).not.toHaveBeenCalled();
  });

  // "reports success only on an actual send" used to live here, asserting a `sent` delivery
  // row on the default path. That default is now `queued`, because `sendDocument` ships at
  // `review`, so the assertion moved rather than being deleted: see "a queued message is never
  // described as a sent one" above, which holds BOTH halves - `pending` when it was queued and
  // `sent` only when the capability is live and the message actually went.
});
