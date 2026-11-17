/**
 * AF11.12 — the drafter's prompt and normalizer.
 *
 * The load-bearing test here is `every contract field reaches the prompt`. Ali's promise was that
 * the button fills the request in; the way that quietly stops being true is a field added to the
 * contract that the prompt never learned about, so the AI stops filling it and the builder gets a
 * refusal about a field the draft never offered to write.
 *
 * The compile-time pin in `toolRequestContract.ts` catches a field missing from the runtime LIST.
 * This catches a field missing from the PROMPT, which is a different drift with the same symptom.
 */
import {
  buildDraftMessages,
  draftTitle,
  normalizeDraft,
  type DraftContext,
} from '../toolRequestDrafter';
import { TOOL_REQUEST_DETAIL_FIELDS } from '../toolRequestContract';

const CONTEXT: DraftContext = {
  domainKey: 'marketing',
  agentId: 'agent-1',
  agentDisplayName: 'Ava',
  capabilities: [
    { capability_id: 'cap_landing_page', name: 'Draft a landing page' },
    { capability_id: 'cap_ad_rotation', name: 'Rotate ad creative' },
  ],
  datasets: ['leads', 'campaign_variants'],
  actors: ['sarbjit@colaberry.com'],
};

function userText(args: Parameters<typeof buildDraftMessages>[0]): string {
  const msgs = buildDraftMessages(args);
  return msgs.filter((m) => m.role === 'user').map((m) => m.content).join('\n');
}

describe('the prompt is built FROM the contract', () => {
  it('names every field the contract accepts', () => {
    const text = userText({ mode: 'suggest', context: CONTEXT });
    const missing = TOOL_REQUEST_DETAIL_FIELDS.filter((f) => !text.includes(f));
    // Named rather than counted, so a failure says which field fell out.
    expect(missing).toEqual([]);
  });

  it('describes what a field MEANS and never which are required', () => {
    // The contract is the only authority on completeness. A prompt that taught the model which
    // fields are mandatory would be a second definition of "complete", kept in prose, drifting.
    const text = userText({ mode: 'suggest', context: CONTEXT }).toLowerCase();
    expect(text).not.toContain('required field');
    expect(text).not.toContain('mandatory');
  });

  it('offers only the capabilities, datasets and people it was given', () => {
    const text = userText({ mode: 'suggest', context: CONTEXT });
    expect(text).toContain('cap_landing_page');
    expect(text).toContain('leads');
    expect(text).toContain('sarbjit@colaberry.com');
    // Nothing invented from elsewhere in the platform.
    expect(text).not.toContain('cap_not_in_this_domain');
  });

  it('says to omit a list rather than invent one when a roster is empty', () => {
    const text = userText({
      mode: 'suggest',
      context: { ...CONTEXT, actors: [], datasets: [] },
    });
    expect(text).toContain('none available, omit acts_on_output');
    expect(text).toContain('none catalogued, use an empty list');
  });
});

describe('the two modes Ali described', () => {
  it('from_intent carries the builder’s own sentence', () => {
    const text = userText({
      mode: 'from_intent',
      intent: 'scan last week calls and flag the bad ones',
      context: CONTEXT,
    });
    expect(text).toContain('scan last week calls and flag the bad ones');
  });

  it('suggest asks it to pick one, and carries no intent', () => {
    const text = userText({ mode: 'suggest', intent: 'ignored', context: CONTEXT });
    expect(text).toContain('Propose ONE tool');
    expect(text).not.toContain('ignored');
  });

  it('tells it to omit agent_id when the domain has no agent', () => {
    const text = userText({
      mode: 'suggest',
      context: { ...CONTEXT, agentId: null, agentDisplayName: null },
    });
    expect(text).toContain('omit it, there is no agent');
  });
});

describe('normalizeDraft can only ever produce a shape the contract can read', () => {
  it('drops keys the contract does not have', () => {
    const out = normalizeDraft({ tool_name: 'call_scan', not_a_field: 'x', domain_key: 'marketing' });
    expect(out).toEqual({ tool_name: 'call_scan' });
  });

  it('OMITS an unresolvable field rather than writing null into it', () => {
    // Three fields are optional-but-NOT-nullable. Sending an explicit null is a shape error that
    // refuses the whole request with a message about a field the builder was never shown — the
    // bug AF11.11 caught before it shipped. So an unusable value means no key at all.
    const out = normalizeDraft({
      tool_name: 'call_scan',
      side_effects: null,
      reversible: null,
      writes: 'yes',
      purpose: '   ',
    });
    expect(Object.keys(out).sort()).toEqual(['tool_name']);
    expect('side_effects' in out).toBe(false);
    expect('writes' in out).toBe(false);
    expect('purpose' in out).toBe(false);
  });

  it('keeps a declared-but-empty list, because that is a real answer', () => {
    // "read today's snapshot" takes no inputs, and `inputs_undeclared` is a refusal while an
    // empty array is an answer. Flattening the two would turn a valid draft into a refusal.
    const out = normalizeDraft({ inputs: [], produces: [] });
    expect(out.inputs).toEqual([]);
    expect(out.produces).toEqual([]);
  });

  it('keeps booleans and trims strings', () => {
    const out = normalizeDraft({ writes: true, reversible: false, purpose: '  scan calls  ' });
    expect(out).toEqual({ writes: true, reversible: false, purpose: 'scan calls' });
  });

  it('strips non-strings out of a list instead of failing', () => {
    const out = normalizeDraft({ reads: ['calls', 42, null, '  leads  ', ''] });
    expect(out.reads).toEqual(['calls', 'leads']);
  });

  it('survives rubbish', () => {
    expect(normalizeDraft(null)).toEqual({});
    expect(normalizeDraft('a string')).toEqual({});
    expect(normalizeDraft([1, 2, 3])).toEqual({});
  });
});

describe('draftTitle', () => {
  it('reads as a sentence about the tool', () => {
    expect(draftTitle({ tool_name: 'call_scan', purpose: 'Flag bad calls' }, 140))
      .toBe('call_scan: Flag bad calls');
  });

  it('truncates to the column the title actually has', () => {
    const t = draftTitle({ tool_name: 'x', purpose: 'y'.repeat(400) }, 40);
    expect(t.length).toBeLessThanOrEqual(40);
    expect(t.endsWith('…')).toBe(true);
  });

  it('never returns empty, because the parent request needs a title', () => {
    expect(draftTitle({}, 140)).toBe('Tool request');
  });
});
