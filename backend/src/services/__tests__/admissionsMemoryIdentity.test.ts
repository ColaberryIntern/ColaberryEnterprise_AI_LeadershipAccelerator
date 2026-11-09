const memUpdate = jest.fn(async (..._a: unknown[]) => [1]);
const findOrCreate = jest.fn();
jest.mock('../../models/AdmissionsMemory', () => ({ __esModule: true, default: {
  update: (...a: unknown[]) => memUpdate(...a), findOrCreate: (...a: unknown[]) => findOrCreate(...a), findOne: jest.fn(),
} }));
jest.mock('../../models', () => ({
  Visitor: { findByPk: jest.fn() }, ChatConversation: { findByPk: jest.fn() }, ChatMessage: { findAll: jest.fn() },
  Lead: { findByPk: jest.fn(async () => null) }, IntentScore: { findOne: jest.fn(async () => null) }, BehavioralSignal: {},
}));

import { findPersonMemory, isReturning, type MemoryIdentityDeps } from '../admissionsMemoryIdentity';
import { loadMemory, classifyVisitorType, buildMemoryContext } from '../admissionsMemoryService';
import { runLink, type LinkCandidate, type LinkDeps } from '../../scripts/linkAdmissionsMemoryToLeads';

/**
 * R4 acceptance:
 *   (1) memory resolves by person where a person is known, and falls back to the visitor for an anonymous first touch
 *   (2) the unlinked rows are attached where the evidence supports it, by a dry-run-default reversible script
 *   (3) two visitor ids belonging to one lead resolve to ONE memory
 *   (4) visitor_type stops reporting a returning person as new
 */

type Row = { id: string; visitor_id: string; lead_id: number | null; conversation_count: number; update: jest.Mock;
  interests: string[]; questions_asked: string[]; conversation_summaries: unknown[]; visitor_type: string;
  personality_notes: null; recommended_next_action: null };
const row = (id: string, visitor: string, lead: number | null, count = 1): Row => ({
  id, visitor_id: visitor, lead_id: lead, conversation_count: count, update: jest.fn(async () => undefined),
  interests: ['pricing'], questions_asked: [], conversation_summaries: [], visitor_type: 'returning', personality_notes: null, recommended_next_action: null,
});

/** One person (lead 42) on two browsers: laptop has the memory, phone is new. A stranger on a third browser. */
function world(): MemoryIdentityDeps & { rows: Row[] } {
  const rows = [row('m-laptop', 'v-laptop', 42, 3)];
  const links: Record<string, number | null> = { 'v-laptop': 42, 'v-phone': 42, 'v-stranger': null };
  return {
    rows,
    leadForVisitor: async (v) => links[v] ?? null,
    canonicalForLead: async (l) => (rows.find((r) => r.lead_id === l) ?? null) as never,
    ownRow: async (v) => (rows.find((r) => r.visitor_id === v) ?? null) as never,
  };
}

beforeEach(() => { memUpdate.mockClear(); findOrCreate.mockReset(); });

describe('(3) two browsers of one person resolve to ONE memory', () => {
  it('the phone gets the laptop row, and the phone row (if any) is stamped with the lead, never merged or deleted', async () => {
    const w = world();
    const m = await loadMemory('v-phone', null, w);
    expect((m as unknown as Row).id).toBe('m-laptop');
    expect(findOrCreate).not.toHaveBeenCalled();
    expect(memUpdate).toHaveBeenCalledWith({ lead_id: 42 }, { where: { visitor_id: 'v-phone', lead_id: expect.anything() } });
    expect((await findPersonMemory('v-phone', null, w) as unknown as Row).id).toBe('m-laptop');
  });

  it('a conversation lead hint resolves even when the browser itself is not linked', async () => {
    const w = world();
    expect((await findPersonMemory('v-stranger', 42, w) as unknown as Row).id).toBe('m-laptop');
  });
});

describe('(1) anonymous first touch is unchanged', () => {
  it('a stranger gets their own row via findOrCreate, with no lead', async () => {
    const own = row('m-new', 'v-stranger', null, 0);
    findOrCreate.mockResolvedValue([own, true]);
    const m = await loadMemory('v-stranger', null, world());
    expect(m).toBe(own);
    expect(findOrCreate.mock.calls[0][0].where).toEqual({ visitor_id: 'v-stranger' });
    expect(findOrCreate.mock.calls[0][0].defaults.lead_id).toBeUndefined();
  });

  it('a known lead with no memory yet: the visitor row is created WITH the lead, becoming the canonical one', async () => {
    const w = world(); w.rows.length = 0;
    const own = row('m-first', 'v-phone', null, 0);
    findOrCreate.mockResolvedValue([own, true]);
    await loadMemory('v-phone', null, w);
    expect(findOrCreate.mock.calls[0][0].defaults.lead_id).toBe(42);
    expect(own.update).toHaveBeenCalledWith({ lead_id: 42 });
  });
});

describe('(4) a returning person is not "new"', () => {
  it('the phone, never seen before as a browser, is classified from the PERSON memory', async () => {
    const t = await classifyVisitorType('v-phone', world());
    expect(t).not.toBe('new');
    expect(t).toBe('engaged'); // 3 conversations on the laptop
  });
  it('a genuine stranger is still new', async () => {
    expect(await classifyVisitorType('v-stranger', world())).toBe('new');
    expect(isReturning(null)).toBe(false);
  });
  it('the memory context the prompt gets is the person\'s', async () => {
    expect(await buildMemoryContext('v-phone', world())).toContain('Conversations to date: 3');
  });
});

describe('(2) linkAdmissionsMemoryToLeads: dry-run default, idempotent, reversible', () => {
  function linkWorld() {
    const linked = new Set<string>();
    const all: LinkCandidate[] = [{ memoryId: 'a', visitorId: 'v1', leadId: 7 }, { memoryId: 'b', visitorId: 'v2', leadId: 8 }];
    const reverts: LinkCandidate[][] = [];
    const deps: LinkDeps = {
      counts: async () => ({ total: 114, linked: 1 + linked.size }),
      candidates: async () => all.filter((c) => !linked.has(c.memoryId)),
      link: async (c) => { if (linked.has(c.memoryId)) return false; linked.add(c.memoryId); return true; },
      writeRevert: (rows) => { reverts.push(rows); return 'revert.json'; },
    };
    return { deps, linked, reverts };
  }

  it('the default is a dry run: reports candidates and writes NOTHING', async () => {
    const w = linkWorld();
    const r = await runLink(false, w.deps);
    expect(r).toMatchObject({ mode: 'dry-run', candidates: 2, written: 0, revertFile: null });
    expect(w.linked.size).toBe(0);
  });

  it('a confirmed run links, prints before/after, and writes a revert file of exactly the ids it changed', async () => {
    const w = linkWorld();
    const r = await runLink(true, w.deps);
    expect(r).toMatchObject({ mode: 'confirmed', written: 2, before: { linked: 1 }, after: { linked: 3 }, revertFile: 'revert.json' });
    expect(w.reverts[0].map((c) => c.memoryId)).toEqual(['a', 'b']);
  });

  it('a run that fails partway still writes a revert file for the rows it already changed', async () => {
    const w = linkWorld();
    let n = 0;
    const link = w.deps.link;
    w.deps.link = async (c) => { if (++n === 2) throw new Error('db dropped'); return link(c); };
    await expect(runLink(true, w.deps)).rejects.toThrow('db dropped');
    expect(w.reverts[0].map((c) => c.memoryId)).toEqual(['a']);
  });

  it('a second confirmed run changes 0 rows and writes no revert file', async () => {
    const w = linkWorld();
    await runLink(true, w.deps);
    const again = await runLink(true, w.deps);
    expect(again).toMatchObject({ candidates: 0, written: 0, revertFile: null });
  });

  it('the SQL only ever touches unlinked rows and only reverts what it wrote', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'scripts', 'linkAdmissionsMemoryToLeads.ts'), 'utf8');
    expect(src).toMatch(/SET lead_id = :leadId WHERE id = :memoryId AND lead_id IS NULL/);
    expect(src).toMatch(/SET lead_id = NULL WHERE id = :memoryId AND lead_id = :leadId/);
    expect(src).not.toMatch(/DELETE/);
  });
});
