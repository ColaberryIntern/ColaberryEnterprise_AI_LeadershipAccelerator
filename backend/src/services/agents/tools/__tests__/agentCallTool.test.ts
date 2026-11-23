import { AGENT_CALL_TOOL, buildAgentCallPrompt, callKey, ctDate, placeAgentCall, type CallDeps } from '../agentCallTool';

const NOW = new Date('2026-11-23T16:00:00Z'); // Monday 10:00 AM CT
const LEAD = { id: 42, name: 'Pat Doe', phone: '(214) 555-0142', email: 'pat@acme.com', company: 'Acme' };

type Rec = { reservation: string; row: Parameters<CallDeps['settle']>[1] };
function deps(over: Partial<CallDeps> = {}): CallDeps & { dials: Array<Record<string, any>>; records: Rec[]; keys: Set<string>; released: string[] } {
  const dials: Array<Record<string, any>> = [];
  const records: Rec[] = [];
  const released: string[] = [];
  const keys = new Set<string>();
  return {
    dials, records, keys, released,
    gate: async () => ({ usable: true, reason: null }),
    lead: async () => LEAD,
    consent: async () => ({ allowed: true }),
    // Mirrors the unique index: the first insert of a key wins, synchronously, so a race has one winner.
    reserve: async (row) => { if (keys.has(row.key)) return null; keys.add(row.key); return `res:${row.key}`; },
    settle: async (reservation, row) => { records.push({ reservation, row }); },
    release: async (reservation) => { released.push(reservation); keys.delete(reservation.slice(4)); },
    persona: async () => ({ displayName: 'Maya', systemPrompt: 'You are Maya, Director of Admissions.' }),
    dial: async (p) => { dials.push(p); return { success: true, data: { call_id: 'call_1' } }; },
    skipSummary: (r) => `skipped:${r}`,
    now: () => NOW,
    ...over,
  } as CallDeps & { dials: Array<Record<string, any>>; records: Rec[]; keys: Set<string>; released: string[] };
}

const CALL = { agentName: 'Maya', leadId: 42, purpose: 'Answer their questions about the pilot timeline', context: 'They asked in chat how long a pilot takes.' };

describe('place_ai_call', () => {
  it('places the call to the number on record with a dynamic script, and logs it against the agent', async () => {
    const d = deps();
    expect(await placeAgentCall(CALL, d)).toMatchObject({ outcome: 'placed', callId: 'call_1' });
    expect(d.dials[0].phone).toBe('(214) 555-0142');
    expect(d.dials[0].prompt).toContain('You are Maya, Director of Admissions.');
    expect(d.dials[0].prompt).toContain('WHY YOU ARE CALLING: Answer their questions about the pilot timeline');
    expect(d.dials[0].prompt).toContain('"Hi Pat, this is Maya from Colaberry."');
    expect(d.dials[0].prompt).toMatch(/say plainly and naturally that you are an AI/);
    expect(d.records[0].row).toMatchObject({ leadId: 42, callId: 'call_1', agentName: 'Maya', key: callKey('Maya', 42, CALL.purpose, NOW) });
  });

  it('refuses an agent without the grant, or disabled, before anything else', async () => {
    const d = deps({ gate: async () => ({ usable: false, reason: 'tool_not_granted' }) });
    expect(await placeAgentCall(CALL, d)).toMatchObject({ outcome: 'refused', reason: 'tool_not_granted' });
    expect((await placeAgentCall(CALL, deps({ gate: async () => ({ usable: false, reason: 'agent_disabled' }) }))).reason).toBe('agent_disabled');
    expect(d.dials).toHaveLength(0);
  });

  it('refuses without consent, and honors a consent redirect (test mode)', async () => {
    const d = deps({ consent: async () => ({ allowed: false, reason: 'no_voice_consent' }) });
    expect(await placeAgentCall(CALL, d)).toMatchObject({ outcome: 'refused', reason: 'no_voice_consent' });
    expect(d.dials).toHaveLength(0);
    const d2 = deps({ consent: async () => ({ allowed: true, redirectPhone: '+12145559999' }) });
    await placeAgentCall(CALL, d2);
    expect(d2.dials[0].phone).toBe('+12145559999');
  });

  it('the number comes from the lead: none on record, or a different one passed in, is refused', async () => {
    expect((await placeAgentCall(CALL, deps({ lead: async () => ({ ...LEAD, phone: null }) }))).reason).toBe('no_phone');
    const d = deps();
    expect((await placeAgentCall({ ...CALL, phone: '+1 469 555 0000' }, d)).reason).toBe('phone_not_on_record');
    expect((await placeAgentCall({ ...CALL, phone: '+1 214 555 0142' }, d)).outcome).toBe('placed');
  });

  it('the same purpose for the same lead on the same Central day is called once', async () => {
    const d = deps();
    await placeAgentCall(CALL, d);
    expect(await placeAgentCall(CALL, d)).toMatchObject({ outcome: 'deduped' });
    expect(d.dials).toHaveLength(1);
  });

  it('CONCURRENCY: two identical requests at the same moment place ONE call', async () => {
    const d = deps();
    const [a, b] = await Promise.all([placeAgentCall(CALL, d), placeAgentCall(CALL, d)]);
    expect([a.outcome, b.outcome].sort()).toEqual(['deduped', 'placed']);
    expect(d.dials).toHaveLength(1);
  });

  it('a dial that throws gives the key back and propagates (nothing is half-recorded)', async () => {
    const d = deps({ dial: async () => { throw new Error('socket hang up'); } });
    await expect(placeAgentCall(CALL, d)).rejects.toThrow('socket hang up');
    expect(d.released).toHaveLength(1);
    expect(d.records).toHaveLength(0);
  });

  it('a TIMEOUT (no HTTP status: the call may have gone out) KEEPS the key: settled unconfirmed, a retry is deduped', async () => {
    const d = deps({ dial: async () => ({ success: false, error: 'The operation was aborted due to timeout' }) });
    expect(await placeAgentCall(CALL, d)).toMatchObject({ outcome: 'not_placed', reason: 'provider_unconfirmed' });
    expect(d.released).toHaveLength(0);
    expect(d.records[0].row).toMatchObject({ callId: null, unconfirmed: true });
    expect((await placeAgentCall(CALL, d)).outcome).toBe('deduped');
    expect((await placeAgentCall(CALL, d)).summary).not.toMatch(/is being placed/);
  });

  it('a provider rejection (an HTTP status) releases the key, so a retry later the same day can dial', async () => {
    let fail = true;
    const d = deps({ dial: async () => (fail ? { success: false, error: 'Synthflow HTTP 500', status: 500 } : { success: true, data: { call_id: 'call_2' } }) });
    expect((await placeAgentCall(CALL, d)).reason).toBe('provider_rejected');
    fail = false;
    expect((await placeAgentCall(CALL, d)).outcome).toBe('placed');
  });

  it('a skip inside the dial (allowlist, hours, cap) is NOT placed and writes no row', async () => {
    for (const reason of ['path_not_allowed', 'outside_call_hours', 'number_dialed_recently']) {
      const d = deps({ dial: async () => ({ success: true, data: { skipped: true, reason } }) });
      expect(await placeAgentCall(CALL, d)).toEqual({ outcome: 'not_placed', reason, summary: `skipped:${reason}` });
      expect(d.records).toHaveLength(0);
      expect(d.released).toHaveLength(1); // the key is given back, so a later retry can go through
      expect(d.keys.size).toBe(0);
    }
    const d = deps({ dial: async () => ({ success: false, error: '500', status: 500 }) });
    expect((await placeAgentCall(CALL, d)).reason).toBe('provider_rejected');
  });

  it('bad input is refused; an internal caller may pass its own script', async () => {
    expect((await placeAgentCall({ ...CALL, purpose: 'hi' }, deps())).reason).toBe('invalid_input');
    expect((await placeAgentCall({ ...CALL, leadId: -1 }, deps())).reason).toBe('invalid_input');
    const d = deps();
    await placeAgentCall({ ...CALL, prompt: 'You ARE Maya. Custom admissions script with the program facts.' }, d);
    expect(d.dials[0].prompt).toBe('You ARE Maya. Custom admissions script with the program facts.');
  });

  it('helpers', () => {
    expect(AGENT_CALL_TOOL).toBe('place_ai_call');
    expect(ctDate(new Date('2026-11-24T04:00:00Z'))).toBe('2026-11-23'); // 10 PM CT Monday
    expect(buildAgentCallPrompt({ displayName: 'Reese', systemPrompt: null, leadName: null, purpose: 'Check in' })).toContain('You are Reese from Colaberry.');
  });
});
