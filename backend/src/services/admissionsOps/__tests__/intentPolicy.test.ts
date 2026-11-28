import { ACTIONS } from '../agentManifest';
import { decideAllowed, decideIntent, redactParams } from '../intentPolicy';

/** AO2.3 the agent control surface's server rules, for every action in the manifest. */
const all = [...ACTIONS.values()];

describe('AO2.3 rule 1: an agent level-5 request always becomes an Approvals item and never executes', () => {
  it.each(all.filter((a) => a.level === 5).map((a) => [a.id, a]))('%s', (_id, action) => {
    for (const mode of ['answer', 'guide', 'operate'] as const) {
      const d = decideIntent({ type: 'invoke', actor: 'agent', mode, action });
      expect(d).toEqual({ outcome: 'sent_to_approval', reason: 'level_5_needs_a_person', createApproval: true });
    }
  });
  it('holds even if a level-5 action were marked available', () => {
    const fake = { ...all.find((a) => a.level === 5)!, available: true };
    expect(decideIntent({ type: 'invoke', actor: 'agent', mode: 'operate', action: fake }).outcome).toBe('sent_to_approval');
  });
  it('a person invoking a level-5 action gets the same: prepared, not executed', () => {
    expect(decideIntent({ type: 'invoke', actor: 'person', mode: 'answer', action: ACTIONS.get('payments.requestRefund')! }).outcome).toBe('sent_to_approval');
  });
});

describe('AO2.3 rule 2: the agent cannot decide', () => {
  it('refuses the agent at every level, allows a person, and keeps level 5 for the owner', () => {
    for (const level of [1, 2, 3, 4, 5]) expect(decideAllowed('agent', 'owner', level)).toEqual({ ok: false, reason: 'the_agent_cannot_decide' });
    expect(decideAllowed('person', 'lead_intake', 3)).toEqual({ ok: true });
    expect(decideAllowed('person', 'lead_intake', 5)).toEqual({ ok: false, reason: 'level_5_needs_a_leadership_approver' });
    expect(decideAllowed('person', 'owner', 5)).toEqual({ ok: true });
  });
});

describe('AO2.3 rule 3: Answer mode changes nothing on screen', () => {
  it('refuses agent navigate and annotate in Answer mode; records a person\'s navigation as done', () => {
    const nav = ACTIONS.get('tfcAudit.open')!;
    expect(decideIntent({ type: 'navigate', actor: 'agent', mode: 'answer', action: nav }).outcome).toBe('refused');
    expect(decideIntent({ type: 'annotate', actor: 'agent', mode: 'answer', action: null }).outcome).toBe('refused');
    expect(decideIntent({ type: 'navigate', actor: 'person', mode: 'answer', action: nav })).toEqual({ outcome: 'done', reason: null, createApproval: false });
    expect(decideIntent({ type: 'navigate', actor: 'agent', mode: 'guide', action: nav }).outcome).toBe('done');
  });
  it('a navigate intent must name a navigate action', () => {
    expect(decideIntent({ type: 'navigate', actor: 'person', mode: 'answer', action: ACTIONS.get('today.readQueue')! }).reason).toBe('not_a_navigate_action');
  });
});

describe('AO2.3 the other levels', () => {
  it('levels 1 and 2 run when available; an unavailable action is refused, not attempted', () => {
    expect(decideIntent({ type: 'invoke', actor: 'agent', mode: 'answer', action: ACTIONS.get('today.readQueue')! }).outcome).toBe('done');
    expect(decideIntent({ type: 'invoke', actor: 'agent', mode: 'answer', action: ACTIONS.get('today.explainItem')! })).toEqual(
      { outcome: 'refused', reason: 'not_available_yet', createApproval: false });
  });
  it('level 3 and (no level 4 authorized yet) level 4 are prepared for a person once available', () => {
    const l3 = { ...ACTIONS.get('student360.draftMessage')!, available: true };
    const l4 = { ...ACTIONS.get('student360.addNote')!, available: true };
    expect(decideIntent({ type: 'invoke', actor: 'agent', mode: 'answer', action: l3 }).outcome).toBe('sent_to_approval');
    expect(decideIntent({ type: 'invoke', actor: 'agent', mode: 'answer', action: l4 }).reason).toBe('level_4_not_authorized_yet');
  });
  it('an invoke without a known action is refused', () => {
    expect(decideIntent({ type: 'invoke', actor: 'agent', mode: 'answer', action: null }).reason).toBe('unknown_action');
  });
});

describe('AO2.3 audit params are redacted', () => {
  it('replaces sensitive keys and clips long values', () => {
    expect(redactParams({ ref: 'sample-1', body: 'Hi Renee', email: 'x@y.z', note: 'n', query: 'q'.repeat(300) })).toEqual(
      { ref: 'sample-1', body: '[redacted]', email: '[redacted]', note: '[redacted]', query: 'q'.repeat(200) });
  });
});
