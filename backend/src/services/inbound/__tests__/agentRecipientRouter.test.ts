import {
  PER_AGENT_UNKNOWN_DAILY_CAP, PER_SENDER_DAILY_CAP, agentStampFor, draftForAgentAddressedLead, errorClassOf, isAutomated,
  routeUnknownSenderToAgent, type RouterDeps,
} from '../agentRecipientRouter';

const MAYA = { agentName: 'Maya', slug: 'maya', displayName: 'Maya', fromAddress: 'maya@colaberry.com', fromHeader: '"Maya" <maya@colaberry.com>', replyTo: 'maya@reply.colaberry.ai' };
const MSG = { email: 'maya@reply.colaberry.ai', from_email: 'pat@acme.com', from_name: 'Pat', subject: 'Hi', text: 'How long is a pilot?', headers: { 'Message-Id': '<m1@acme.com>' } };

function deps(over: Partial<RouterDeps> = {}): RouterDeps & { recorded: any[]; marks: any[]; drafts: any[] } {
  const recorded: any[] = [];
  const marks: any[] = [];
  const drafts: any[] = [];
  return {
    recorded, marks, drafts,
    agentForRecipient: async (a) => (String(a).startsWith('maya@reply') ? MAYA : null),
    isAgentOwnAddress: (a) => /@reply\.colaberry\.ai$|^maya@colaberry\.com$/i.test(String(a)),
    leadExists: async () => false,
    inboundSeen: async (id) => recorded.some((r) => r.messageId === id),
    recentFromSender: async () => 0,
    unknownToday: async () => 0,
    recordInbound: async (row) => { recorded.push(row); return `log${recorded.length}`; },
    markInbound: async (id, meta) => { marks.push({ id, meta }); },
    draft: async (identity, m) => { drafts.push({ identity, m }); return { outcome: 'queued', queueId: 'q1' }; },
    ...over,
  } as RouterDeps & { recorded: any[]; marks: any[]; drafts: any[] };
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('(a) mail to an agent from someone with no lead', () => {
  it('records it on the agent and queues one draft; the webhook is done with it', async () => {
    const d = deps();
    expect(await routeUnknownSenderToAgent(MSG, 'pat@acme.com', 'Hi', 'How long is a pilot?', d)).toEqual({ handled: true, outcome: 'queued' });
    expect(d.recorded[0]).toMatchObject({ agentName: 'Maya', fromAddress: 'pat@acme.com', toAddress: 'maya@reply.colaberry.ai', messageId: 'm1@acme.com' });
    expect(d.drafts[0].m).toMatchObject({ fromAddress: 'pat@acme.com', leadId: null, messageId: 'm1@acme.com' });
    expect(d.marks[0]).toEqual({ id: 'log1', meta: { draft_outcome: 'queued', outbound_approval_id: 'q1' } });
  });

  it('a webhook replay records and drafts nothing more', async () => {
    const d = deps();
    await routeUnknownSenderToAgent(MSG, 'pat@acme.com', 'Hi', 'b', d);
    expect(await routeUnknownSenderToAgent(MSG, 'pat@acme.com', 'Hi', 'b', d)).toEqual({ handled: true, outcome: 'replay' });
    expect(d.recorded).toHaveLength(1);
    expect(d.drafts).toHaveLength(1);
  });

  it(`over the cap (${PER_SENDER_DAILY_CAP} per sender per day, ${PER_AGENT_UNKNOWN_DAILY_CAP} per agent): recorded, rate_capped, no draft`, async () => {
    for (const over of [{ recentFromSender: async () => PER_SENDER_DAILY_CAP }, { unknownToday: async () => PER_AGENT_UNKNOWN_DAILY_CAP }]) {
      const d = deps(over);
      expect(await routeUnknownSenderToAgent(MSG, 'pat@acme.com', 'Hi', 'b', d)).toEqual({ handled: true, outcome: 'rate_capped' });
      expect(d.recorded).toHaveLength(1);
      expect(d.marks[0].meta).toEqual({ draft_reason: 'rate_capped' });
      expect(d.drafts).toHaveLength(0);
    }
  });

  it('the per-sender cap counts the SENDER across every agent, not per agent', async () => {
    const seen: unknown[][] = [];
    const d = deps({ recentFromSender: async (...a: unknown[]) => { seen.push(a); return 0; } });
    await routeUnknownSenderToAgent(MSG, 'pat@acme.com', 'Hi', 'b', d);
    expect(seen).toEqual([['pat@acme.com']]);
  });

  it('a failure is logged with a stable error_class and the webhook carries on', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const d = deps({ leadExists: async () => { const e = new Error('conn'); e.name = 'SequelizeConnectionError'; throw e; } });
    expect(await routeUnknownSenderToAgent(MSG, 'pat@acme.com', 'Hi', 'b', d)).toEqual({ handled: false });
    expect(JSON.parse(String(err.mock.calls.at(-1)?.[0]))).toMatchObject({ event: 'agent_inbound_route_failed', error_class: 'DatabaseError' });
  });

  it('a known lead is left to the existing flow', async () => {
    const d = deps({ leadExists: async () => true });
    expect(await routeUnknownSenderToAgent(MSG, 'pat@acme.com', 'Hi', 'b', d)).toEqual({ handled: false });
    expect(d.recorded).toHaveLength(0);
  });

  it('mail not addressed to an agent (including a ticket reply address) is untouched', async () => {
    const d = deps();
    const ticket = { ...MSG, email: 'ticket-0f8e7d6c-1234-4abc-8def-0123456789ab-a1b2c3d4@reply.colaberry.ai' };
    expect(await routeUnknownSenderToAgent(ticket, 'pat@acme.com', 'Hi', 'b', d)).toEqual({ handled: false });
    expect(await routeUnknownSenderToAgent({ ...MSG, email: 'ali@colaberry.com' }, 'pat@acme.com', 'Hi', 'b', d)).toEqual({ handled: false });
    expect(d.recorded).toHaveLength(0);
  });

  it('loops are dropped: mail from an agent address, or machine-sent mail', async () => {
    const d = deps();
    expect((await routeUnknownSenderToAgent(MSG, 'reese@reply.colaberry.ai', 'Hi', 'b', d)).outcome).toBe('loop_dropped');
    expect((await routeUnknownSenderToAgent({ ...MSG, headers: { ...MSG.headers, 'Auto-Submitted': 'auto-replied' } }, 'pat@acme.com', 'Hi', 'b', d)).outcome).toBe('loop_dropped');
    expect(d.drafts).toHaveLength(0);
    expect(isAutomated({ from_email: 'MAILER-DAEMON@x.com' })).toBe(true);
    expect(isAutomated({ headers: { 'Auto-Submitted': 'no' } })).toBe(false);
  });

  it('any failure falls through to the existing flow, logged', async () => {
    const d = deps({ agentForRecipient: async () => { throw new Error('db down'); } });
    expect(await routeUnknownSenderToAgent(MSG, 'pat@acme.com', 'Hi', 'b', d)).toEqual({ handled: false });
    const d2 = deps({ recordInbound: async () => { throw new Error('db down'); } });
    expect(await routeUnknownSenderToAgent(MSG, 'pat@acme.com', 'Hi', 'b', d2)).toEqual({ handled: false });
    expect((console.error as jest.Mock).mock.calls.some((c) => String(c[0]).includes('error_class'))).toBe(true);
  });
});

describe('(b) and (c) lead-matched mail', () => {
  it('(b) stamps agent_name only when addressed to an agent', async () => {
    expect(await agentStampFor(MSG, deps())).toEqual({ agent_name: 'Maya' });
    expect(await agentStampFor({ ...MSG, email: 'enrollment@reply.colaberry.ai' }, deps())).toEqual({});
  });

  it('(c) the agent drafts for the lead; not addressed to an agent -> the existing auto-reply runs', async () => {
    const d = deps();
    expect(await draftForAgentAddressedLead(MSG, { id: 42, name: 'Pat' }, 'pat@acme.com', 'Hi', 'b', d)).toEqual({ handled: true, outcome: 'queued' });
    expect(d.drafts[0].m).toMatchObject({ leadId: 42, fromName: 'Pat' });
    expect(await draftForAgentAddressedLead({ ...MSG, email: 'info@reply.colaberry.ai' }, { id: 42 }, 'pat@acme.com', 'Hi', 'b', d)).toEqual({ handled: false });
  });

  it('(c) a draft failure falls through to the existing flow', async () => {
    const d = deps({ draft: async () => { throw new Error('x'); } });
    expect(await draftForAgentAddressedLead(MSG, { id: 42 }, 'pat@acme.com', 'Hi', 'b', d)).toEqual({ handled: false });
  });
});

describe('errorClassOf', () => {
  it('never reports a bare Error', () => {
    expect(errorClassOf(new Error('x'), 'AgentInboundRouteError')).toBe('AgentInboundRouteError');
    expect(errorClassOf('string thrown', 'X')).toBe('X');
    const t = new Error('t'); t.name = 'TimeoutError';
    expect(errorClassOf(t, 'X')).toBe('TimeoutError');
  });
});
