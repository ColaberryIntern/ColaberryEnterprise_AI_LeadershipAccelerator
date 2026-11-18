/**
 * AF11.14 — standing instructions.
 *
 * The property worth defending is the THREE-STATE reading. "Nobody ever set any" and "somebody
 * removed them" look identical if you only ask for the text, and they are different facts about a
 * production agent: one means no rule was ever written, the other means a rule was in force and a
 * named person took it away. A surface that collapses them tells a reader the wrong thing about
 * why an agent is behaving as it is.
 */
import {
  INSTRUCTIONS_MAX,
  acceptInstruction,
  inForce,
  isCleared,
  type InstructionEntry,
} from '../capabilityInstructionContract';

const OK = {
  agentId: '11111111-1111-1111-1111-111111111111',
  capabilityId: 'marketing.landing_page.draft',
  instructions: 'Never publish without a person.',
  setByIdentity: 'ali@colaberry.com',
};

const entry = (instructions: string, at = '2026-11-17T23:00:00Z'): InstructionEntry => ({
  instructions,
  set_by_identity: 'ali@colaberry.com',
  created_at: at,
});

describe('what is refused, and why each refusal exists', () => {
  it('accepts a normal instruction and trims it', () => {
    const v = acceptInstruction({ ...OK, instructions: '  Never publish without a person.  ' });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.instructions).toBe('Never publish without a person.');
  });

  it('refuses an instruction nobody is on record as setting', () => {
    // This one matters most: an unattributed instruction changes production behaviour with
    // nobody accountable for having asked for it.
    const v = acceptInstruction({ ...OK, setByIdentity: '   ' });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.issues.map((i) => i.rule)).toContain('instruction_actor_missing');
  });

  it('refuses instructions attached to no capability and no agent', () => {
    const v = acceptInstruction({ instructions: 'x', setByIdentity: 'ali@colaberry.com' });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.issues.map((i) => i.rule).sort())
        .toEqual(['instruction_agent_missing', 'instruction_capability_missing']);
    }
  });

  it('names EVERY problem, not the first', () => {
    const v = acceptInstruction({ instructions: 'x'.repeat(INSTRUCTIONS_MAX + 1) });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.issues.length).toBe(4);
  });

  it('refuses text over the ceiling, and says how far over', () => {
    const v = acceptInstruction({ ...OK, instructions: 'x'.repeat(INSTRUCTIONS_MAX + 5) });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      const issue = v.issues.find((i) => i.rule === 'instructions_too_long')!;
      expect(issue.detail).toContain(String(INSTRUCTIONS_MAX + 5));
    }
  });
});

describe('CLEARED is a value, not an absence', () => {
  it('accepts an empty instruction, because clearing is a real action', () => {
    const v = acceptInstruction({ ...OK, instructions: '' });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.instructions).toBe('');
  });

  it('still requires an author when clearing', () => {
    // Removing a rule from a production agent is exactly as consequential as adding one, so it
    // is recorded the same way or not at all.
    const v = acceptInstruction({ ...OK, instructions: '', setByIdentity: '' });
    expect(v.ok).toBe(false);
  });

  it('treats whitespace-only as cleared rather than as an instruction', () => {
    const v = acceptInstruction({ ...OK, instructions: '    \n  ' });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.instructions).toBe('');
  });
});

describe('three states, never two', () => {
  it('never_set: nobody has written one', () => {
    expect(inForce([])).toBeNull();
    expect(isCleared(null)).toBe(false);
  });

  it('cleared: somebody removed them, and we can still say who and when', () => {
    const latest = inForce([entry(''), entry('old rule')]);
    expect(isCleared(latest)).toBe(true);
    expect(latest!.set_by_identity).toBe('ali@colaberry.com');
  });

  it('in_force: the newest entry is the rule', () => {
    const latest = inForce([entry('new rule'), entry('old rule')]);
    expect(isCleared(latest)).toBe(false);
    expect(latest!.instructions).toBe('new rule');
  });

  it('takes the FIRST entry, because the reader hands them over newest first', () => {
    // The ordering is the service's job and is done by `seq`, not by timestamp: two entries
    // written in one transaction carry the identical `created_at`, and ordering on it returned
    // the instruction a cleared entry had just replaced. Measured against accelerator_dev1.
    const latest = inForce([entry('newest', '2026-01-01T00:00:00Z'), entry('older', '2026-12-01T00:00:00Z')]);
    expect(latest!.instructions).toBe('newest');
  });
});
