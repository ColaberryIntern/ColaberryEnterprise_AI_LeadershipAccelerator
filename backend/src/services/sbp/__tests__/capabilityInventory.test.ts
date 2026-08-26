/**
 * capabilityInventory — the merge is the safety property, so it gets the most tests.
 *
 * `mergeInventory` is deliberately asymmetric: presence and counts ratchet up and
 * never down. Every test that looks like it is checking arithmetic is really
 * checking that a student cannot lose credit for work they did because a repo
 * read came back thin.
 */
import {
  CAPABILITIES, CapabilityEntry, Inventory,
  capabilityById, capstoneProgress, isComplete, mergeInventory,
} from '../capabilityInventory';

const inv = (entries: CapabilityEntry[], enrollmentId = 'enr-1'): Inventory => ({ enrollmentId, entries });
const e = (id: string, over: Partial<CapabilityEntry> = {}): CapabilityEntry =>
  ({ id, present: true, count: 1, ...over });

describe('the catalogue', () => {
  it('covers all twelve weeks with eleven capabilities', () => {
    expect(CAPABILITIES).toHaveLength(11);
    const weeks = CAPABILITIES.flatMap((c) => c.weeks).sort((a, b) => a - b);
    expect(weeks).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('keeps the MCP server as ONE capability across weeks 5 and 6', () => {
    // It was briefly two. Both pointed at `mcp-server/`, so they could never
    // disagree on presence — two entries that always move together are one
    // capability wearing two labels. Week 6 extends the same server.
    expect(capabilityById('MCP_SERVER')?.weeks).toEqual([5, 6]);
    expect(capabilityById('MCP_INTEGRATION')).toBeNull();
    const evidencePaths = CAPABILITIES.flatMap((c) => c.evidence);
    expect(new Set(evidencePaths).size).toBe(evidencePaths.length);
  });

  it('has unique, stable ids', () => {
    // Ids are the ONLY thing the Delivery OS and both producers must agree on.
    // A duplicate here would silently merge two capabilities into one.
    const ids = CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[A-Z][A-Z_]*$/.test(id))).toBe(true);
  });

  it('gives every collection a floor and every service its run evidence', () => {
    for (const c of CAPABILITIES) {
      if (c.shape === 'collection') expect(c.minimum).toBeGreaterThan(0);
      if (c.shape === 'service') expect(c.runEvidence).toBeTruthy();
      if (c.shape !== 'composite') expect(c.evidence.length).toBeGreaterThan(0);
    }
  });

  it('names AGENTS as the one capability both producers may create', () => {
    expect(capabilityById('AGENTS')?.producer).toBe('either');
    expect(capabilityById('SKILLS')?.producer).toBe('curriculum');
  });
});

describe('mergeInventory — presence ratchets', () => {
  it('keeps a capability present after it stops being observed', () => {
    // A student refactoring, or a failed repo read, must not erase earned work.
    const stored = inv([e('SKILLS', { present: true, count: 3 })]);
    const merged = mergeInventory(stored, inv([e('SKILLS', { present: false, count: 0 })]));
    expect(merged.entries[0].present).toBe(true);
    expect(merged.entries[0].count).toBe(3);
  });

  it('raises a count but never lowers it', () => {
    const stored = inv([e('PROMPT_LIBRARY', { count: 5 })]);
    expect(mergeInventory(stored, inv([e('PROMPT_LIBRARY', { count: 7 })])).entries[0].count).toBe(7);
    expect(mergeInventory(stored, inv([e('PROMPT_LIBRARY', { count: 2 })])).entries[0].count).toBe(5);
  });

  it('keeps a service proven once it has been proven', () => {
    const stored = inv([e('MCP_SERVER', { proven: true })]);
    expect(mergeInventory(stored, inv([e('MCP_SERVER', { proven: false })])).entries[0].proven).toBe(true);
  });
});

describe('mergeInventory — new categories and late binding', () => {
  it('adds a capability the stored copy has never seen', () => {
    // This is what makes the Command Center upgradable forever: a category added
    // next year appears for every existing student on their next sync.
    const stored = inv([e('SKILLS')]);
    const merged = mergeInventory(stored, inv([e('GOVERNANCE')]));
    expect(merged.entries.map((x) => x.id)).toEqual(['SKILLS', 'GOVERNANCE']);
  });

  it('works from nothing at all', () => {
    const merged = mergeInventory(null, inv([e('WORKSPACE')]));
    expect(merged.entries).toHaveLength(1);
    expect(merged.enrollmentId).toBe('enr-1');
  });

  it('adopts a project when one appears, and never unsets it', () => {
    // Projects start week 4, so weeks 1-3 are recorded with no project at all.
    const stored = inv([e('WORKSPACE', { projectId: null })]);
    const adopted = mergeInventory(stored, inv([e('WORKSPACE', { projectId: 'proj-9' })]));
    expect(adopted.entries[0].projectId).toBe('proj-9');
    // A later read that does not know the project must not orphan the entry.
    expect(mergeInventory(adopted, inv([e('WORKSPACE', { projectId: null })])).entries[0].projectId).toBe('proj-9');
  });

  it('lets a sample build be upgraded to a real one, but not the reverse', () => {
    const onSample = inv([e('WORKFLOW_ASSISTANT', { onSample: true })]);
    expect(mergeInventory(onSample, inv([e('WORKFLOW_ASSISTANT', { onSample: false })])).entries[0].onSample).toBe(false);
    const real = inv([e('WORKFLOW_ASSISTANT', { onSample: false })]);
    expect(mergeInventory(real, inv([e('WORKFLOW_ASSISTANT', { onSample: true })])).entries[0].onSample).toBe(false);
  });

  it('orders entries by the catalogue so a re-serialised inventory is byte-identical', () => {
    // Without this a merge churns a version for having been re-sorted, which is
    // the same class of noise the Capstone Record's canonical comparison fixes.
    const merged = mergeInventory(null, inv([e('CAPSTONE'), e('WORKSPACE'), e('AGENTS')]));
    expect(merged.entries.map((x) => x.id)).toEqual(['WORKSPACE', 'AGENTS', 'CAPSTONE']);
    expect(JSON.stringify(mergeInventory(merged, inv([])))).toBe(JSON.stringify(merged));
  });
});

describe('isComplete respects each shape', () => {
  it('needs a collection to reach its floor', () => {
    expect(isComplete(e('AGENTS', { count: 2 }))).toBe(false);
    expect(isComplete(e('AGENTS', { count: 3 }))).toBe(true);
  });

  it('needs a service to be proven, not merely present', () => {
    // The code existing is not evidence that it runs. A static tree cannot show
    // an MCP server responding, which is why run evidence is committed separately.
    expect(isComplete(e('MCP_SERVER', { present: true }))).toBe(false);
    expect(isComplete(e('MCP_SERVER', { present: true, proven: true }))).toBe(true);
  });

  it('accepts a module on presence alone', () => {
    expect(isComplete(e('GOVERNANCE', { present: true }))).toBe(true);
    expect(isComplete(e('GOVERNANCE', { present: false }))).toBe(false);
  });

  it('never answers for the composite, or for an unknown id', () => {
    expect(isComplete(e('CAPSTONE', { present: true, count: 99 }))).toBe(false);
    expect(isComplete(e('NOT_A_CAPABILITY'))).toBe(false);
  });
});

describe('capstoneProgress', () => {
  it('counts the ten observable capabilities, excluding itself', () => {
    expect(capstoneProgress(inv([]))).toEqual({ complete: 0, total: 10 });
  });

  it('counts only what is genuinely finished', () => {
    const progress = capstoneProgress(inv([
      e('WORKSPACE'),
      e('SKILLS', { count: 3 }),
      e('AGENTS', { count: 1 }),               // below its floor
      e('MCP_SERVER', { proven: false }),      // present but unproven
    ]));
    expect(progress).toEqual({ complete: 2, total: 10 });
  });
});
