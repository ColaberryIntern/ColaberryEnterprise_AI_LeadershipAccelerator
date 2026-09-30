/**
 * capabilitySampleFlags — the join that makes `on_sample` reachable.
 *
 * The band shipped with this flag documented, rendered and tested, and nothing able to
 * set it. So the tests that matter here are the three-way ones: sample, own, and NO
 * CLAIM. Collapsing the third into `false` is the failure mode, because it would let
 * silence clear a caveat the student has not actually earned the removal of.
 */
import { mergeInventory } from '../../sbp/capabilityInventory';
import { sampleFlagReader, sampleWeeks } from '../capabilitySampleFlags';

const row = (week: number, built_on_sample?: unknown) => ({ week, built_on_sample });

describe('sampleWeeks', () => {
  it('splits weeks by the claim the artifact actually made', () => {
    const { sample, own } = sampleWeeks([row(3, true), row(4, false)]);
    expect([...sample]).toEqual([3]);
    expect([...own]).toEqual([4]);
  });

  it('treats a missing or non-boolean flag as NO claim, not as own-project', () => {
    // A row that says nothing must leave the week undecided. Reading absence as
    // `false` would silently clear a disclosure.
    const { sample, own } = sampleWeeks([row(3), row(4, 'yes'), row(5, null), row(6, 1)]);
    expect(sample.size).toBe(0);
    expect(own.size).toBe(0);
  });

  it('ignores rows with no usable week', () => {
    const { sample } = sampleWeeks([
      { week: 'three' as unknown, built_on_sample: true },
      { built_on_sample: true },
      { week: NaN, built_on_sample: true },
    ]);
    expect(sample.size).toBe(0);
  });

  it('does not throw on junk', () => {
    for (const bad of [undefined, null, 'nope', 42, [null], [undefined], ['x']]) {
      expect(() => sampleWeeks(bad as any)).not.toThrow();
    }
  });
});

describe('sampleFlagReader', () => {
  it('reports a sample build for the capability covering that week', () => {
    // Week 3 is the workflow assistant, and week 3 explicitly permits the sample.
    expect(sampleFlagReader([row(3, true)])('WORKFLOW_ASSISTANT')).toBe(true);
  });

  it('reports FALSE once an artifact says the work was on their own project', () => {
    // This is the un-latch. `mergeInventory` treats an explicit false as permanent.
    expect(sampleFlagReader([row(3, false)])('WORKFLOW_ASSISTANT')).toBe(false);
  });

  it('returns undefined when no artifact speaks to that capability at all', () => {
    // The case the whole module exists to keep separate from `false`.
    expect(sampleFlagReader([row(3, true)])('GOVERNANCE')).toBeUndefined();
    expect(sampleFlagReader([])('WORKFLOW_ASSISTANT')).toBeUndefined();
  });

  it('covers every week a capability spans', () => {
    // MCP_SERVER is weeks 5 AND 6; a claim in either is a claim about the capability.
    expect(sampleFlagReader([row(6, true)])('MCP_SERVER')).toBe(true);
    expect(sampleFlagReader([row(5, true)])('MCP_SERVER')).toBe(true);
  });

  it('lets sample WIN a tie across a multi-week capability', () => {
    // Disclosing is the safe direction. Dropping the caveat because one of the two
    // weeks was on their own project would understate what the evidence says.
    expect(sampleFlagReader([row(5, true), row(6, false)])('MCP_SERVER')).toBe(true);
  });

  it('returns undefined for a capability id it does not know', () => {
    expect(sampleFlagReader([row(3, true)])('NOT_A_CAPABILITY')).toBeUndefined();
  });

  it('builds the sets once and answers consistently', () => {
    const flag = sampleFlagReader([row(3, true), row(8, false)]);
    expect([flag('WORKFLOW_ASSISTANT'), flag('AUTOMATION'), flag('SKILLS')])
      .toEqual([true, false, undefined]);
    expect(flag('WORKFLOW_ASSISTANT')).toBe(true);
  });
});

describe('together with the inventory merge', () => {
  const stored = (onSample: boolean) => ({
    enrollmentId: 'enr-1',
    entries: [{ id: 'WORKFLOW_ASSISTANT', present: true, count: 1, onSample }],
  });
  const observedWith = (flag: boolean | undefined) => ({
    enrollmentId: 'enr-1',
    entries: [{
      id: 'WORKFLOW_ASSISTANT', present: true, count: 1,
      ...(flag === undefined ? {} : { onSample: flag }),
    }],
  });

  it('a student who rebuilds on their own project SHEDS the caveat', () => {
    // The reason the flag is applied before the merge rather than after. `on_sample`
    // is a caveat, not credit: unlike count and proven it must be able to go away.
    const out = mergeInventory(stored(true), observedWith(false));
    expect(out.entries[0].onSample).toBe(false);
  });

  it('but silence does NOT shed it', () => {
    // No artifact spoke, so nothing was earned. The disclosure stands.
    const out = mergeInventory(stored(true), observedWith(undefined));
    expect(out.entries[0].onSample).toBe(true);
  });

  it('and the caveat never comes back once the real build is recorded', () => {
    const out = mergeInventory(stored(false), observedWith(true));
    expect(out.entries[0].onSample).toBe(false);
  });

  it('leaves credit alone while doing it', () => {
    // The ratchet on count must survive a flag change.
    const richer = {
      enrollmentId: 'enr-1',
      entries: [{ id: 'SKILLS', present: true, count: 7 }],
    };
    const thin = {
      enrollmentId: 'enr-1',
      entries: [{ id: 'SKILLS', present: true, count: 2, onSample: false }],
    };
    expect(mergeInventory(richer, thin).entries[0].count).toBe(7);
  });
});
