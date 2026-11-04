/**
 * AF11.2 — the catalog the matcher compares against, and the three sources it has to union.
 *
 * ## Why this file exists at all
 *
 * `toolDuplicateCheck.test.ts` proves the matcher against a catalog assembled BY THAT TEST. That is
 * legitimate there, because every entry in it comes from the shipped `TOOL_CAPABILITIES`
 * dictionary. But it leaves one gap that the ticket names in its own words: *"the fixture would be
 * built by the code under test and would match by construction."* If production assembled a
 * DIFFERENT 57 tools from the ones that test uses, the matcher would pass its own suite and miss
 * the real thing.
 *
 * So this file tests the assembly, and the single most valuable assertion in it is the one about
 * `read_attachments`: a tool in NEITHER the dictionary NOR any agent's `tools_granted`, reachable
 * only through the compiled handler arrays. Drop that source and the catalog is 56, the matcher
 * still passes everything, and a request duplicating an undocumented tool quietly reads as novel.
 *
 * ## Measured in production on 2026-11-04
 *
 * | Source | Count |
 * |---|---|
 * | `TOOL_CAPABILITIES` | 53 |
 * | distinct names across `ai_agents.tools_granted` (270 rows) | 56 |
 * | union of the two | 56 |
 * | `buildToolCatalog()`, the authoritative catalog | **57** |
 *
 * The missing one is `read_attachments`. Those numbers are why all three sources are read.
 */

const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => mockQuery(...a) },
}));

import { TOOL_CAPABILITIES } from '../../reese/agentToolCapabilities';
import { allGrantTableToolNames } from '../../agents/tools/agentToolRegistry';
import { loadToolCatalogForMatching } from '../toolCatalogForMatching';

let warn: jest.SpyInstance;

beforeEach(() => {
  mockQuery.mockReset();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

/** The driver returns objects here; the raw-array shape is covered by its own test below. */
const granted = (...names: string[]) => names.map((tool_name) => ({ tool_name }));

describe('the three sources, each one proved to be load-bearing', () => {
  it('includes every documented tool, with its behavior text intact', async () => {
    mockQuery.mockResolvedValue([]);
    const { tools } = await loadToolCatalogForMatching();
    const byName = new Map(tools.map((t) => [t.tool_name, t]));
    for (const [name, capability] of Object.entries(TOOL_CAPABILITIES)) {
      expect(byName.get(name)?.reads).toEqual(capability.reads);
      expect(byName.get(name)?.produces).toEqual(capability.produces);
    }
  });

  it('adds names that appear only in some agent\'s tools_granted', async () => {
    // The three measured in production: documented nowhere, granted to somebody.
    mockQuery.mockResolvedValue(granted('assignHandoff', 'materializeHandoffs', 'rankQueue'));
    const names = (await loadToolCatalogForMatching()).tools.map((t) => t.tool_name);
    expect(names).toContain('assignHandoff');
    expect(names).toContain('materializeHandoffs');
    expect(names).toContain('rankQueue');
  });

  it('ADDS read_attachments, which is in neither the dictionary nor tools_granted', async () => {
    // THE ASSERTION THIS FILE EXISTS FOR. Measured 2026-11-04: `read_attachments` is in no
    // agent's `tools_granted` and in no documentation, so it reaches the catalog only through the
    // `GRANTS` table. Without that third source the catalog is 56 of 57, every test still passes,
    // and a request duplicating an undocumented tool reads as novel in production.
    mockQuery.mockResolvedValue([]);
    const names = (await loadToolCatalogForMatching()).tools.map((t) => t.tool_name);
    expect(allGrantTableToolNames()).toContain('read_attachments');
    expect(names).toContain('read_attachments');
    expect(Object.keys(TOOL_CAPABILITIES)).not.toContain('read_attachments');
  });

  it('reproduces the production count of 57 from the three sources', async () => {
    // Guards the claim in the module header rather than leaving it as prose. If the dictionary
    // grows or a grant is added this fails and gets re-measured, which is the point: a stale
    // number in a comment is how the ticket came to say 47.
    mockQuery.mockResolvedValue(granted('assignHandoff', 'materializeHandoffs', 'rankQueue'));
    const { tools } = await loadToolCatalogForMatching();
    expect(Object.keys(TOOL_CAPABILITIES).length).toBe(53);
    expect(tools.length).toBe(57);
  });
});

describe('shape and order, because a stored answer has to be reproducible', () => {
  it('sorts by name, so two loads over the same data give the same catalog', async () => {
    mockQuery.mockResolvedValue(granted('zzz_tool', 'aaa_tool'));
    const names = (await loadToolCatalogForMatching()).tools.map((t) => t.tool_name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('gives an undocumented tool EMPTY behavior rather than inventing any', async () => {
    mockQuery.mockResolvedValue(granted('rankQueue'));
    const entry = (await loadToolCatalogForMatching()).tools.find((t) => t.tool_name === 'rankQueue');
    expect(entry).toEqual({ tool_name: 'rankQueue', reads: [], produces: [] });
  });

  it('never lets a granted name overwrite a documented tool\'s behavior text', async () => {
    // Both sources carry `create_tickets`. The documented entry must win, or the catalog would
    // quietly lose the behavior of every tool any agent happens to be granted.
    mockQuery.mockResolvedValue(granted('create_tickets'));
    const entry = (await loadToolCatalogForMatching()).tools.find((t) => t.tool_name === 'create_tickets');
    expect(entry?.produces).toEqual(TOOL_CAPABILITIES.create_tickets.produces);
    expect(entry?.produces.length).toBeGreaterThan(0);
  });

  it('lists each tool exactly once even when every source names it', async () => {
    mockQuery.mockResolvedValue(granted('respond_to_dm', 'respond_to_dm'));
    const names = (await loadToolCatalogForMatching()).tools.map((t) => t.tool_name);
    expect(names.filter((n) => n === 'respond_to_dm').length).toBe(1);
    expect(new Set(names).size).toBe(names.length);
  });

  it('flattens in Postgres, so the query returns names and not 270 JSON arrays', async () => {
    mockQuery.mockResolvedValue([]);
    await loadToolCatalogForMatching();
    expect(String(mockQuery.mock.calls[0][0])).toContain('jsonb_array_elements_text');
    expect(String(mockQuery.mock.calls[0][0])).toContain('DISTINCT');
  });

  it('issues ONE query, not one per agent', async () => {
    // `buildToolCatalog()` calls `resolveEffectiveAccess()` once per agent and there are 270 rows.
    // That is the whole reason this module exists rather than reusing it on the submit path.
    mockQuery.mockResolvedValue([]);
    await loadToolCatalogForMatching();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

describe('the driver returns a single-column select as RAW ARRAYS, sometimes', () => {
  it('handles the raw-array row shape as well as the object one', async () => {
    // Not defensive padding. Two sibling schema modules each reported a present thing as missing
    // on exactly this, and the fix is recorded in both their headers.
    mockQuery.mockResolvedValue([['assignHandoff'], ['rankQueue']]);
    const names = (await loadToolCatalogForMatching()).tools.map((t) => t.tool_name);
    expect(names).toContain('assignHandoff');
    expect(names).toContain('rankQueue');
  });

  it('drops an empty name rather than adding a nameless catalog entry', async () => {
    mockQuery.mockResolvedValue(granted('', 'rankQueue'));
    const names = (await loadToolCatalogForMatching()).tools.map((t) => t.tool_name);
    expect(names).not.toContain('');
    expect(names).toContain('rankQueue');
  });
});

describe('degrading, because 53 of 57 tools beats no duplicate check at all', () => {
  it('returns the documented dictionary when the query throws, and says it is degraded', async () => {
    mockQuery.mockRejectedValue(new TypeError('connection reset'));
    const { tools, degraded } = await loadToolCatalogForMatching();
    expect(degraded).toBe(true);
    // Still the full dictionary plus the handler arrays: only the granted names are lost.
    expect(tools.length).toBeGreaterThanOrEqual(Object.keys(TOOL_CAPABILITIES).length);
    expect(tools.map((t) => t.tool_name)).toContain('read_attachments');
  });

  it('logs the degradation with a named error class and the count it fell back to', async () => {
    mockQuery.mockRejectedValue(new TypeError('connection reset'));
    await loadToolCatalogForMatching();
    const line = JSON.parse(String(warn.mock.calls[0][0]));
    expect(line.event).toBe('tool_matching_catalog_granted_names_unavailable');
    expect(line.error_class).toBe('TypeError');
    expect(line.outcome).toBe('partial');
    expect(line.context.documented_tools).toBe(Object.keys(TOOL_CAPABILITIES).length);
  });

  it('reports NOT degraded on the happy path, so the flag means something', async () => {
    mockQuery.mockResolvedValue(granted('rankQueue'));
    expect((await loadToolCatalogForMatching()).degraded).toBe(false);
  });

  it('does NOT return an empty catalog on failure, which would read as "could not check"', async () => {
    // An empty catalog makes `checkForDuplicateTool` report `catalog_absent`, which tells the
    // reviewer the detector was blind when in fact most of the catalog was right there.
    mockQuery.mockRejectedValue(new Error('down'));
    expect((await loadToolCatalogForMatching()).tools.length).toBeGreaterThan(50);
  });
});

describe('the grant table is read with the kill switch IGNORED, on purpose', () => {
  it('still lists a tool that AGENT_TOOLS_DISABLED has switched off', async () => {
    // A tool switched off by an incident still EXISTS, so a request restating it is still a
    // duplicate. Applying the kill switch here would make an incident look like a gap in the
    // catalog, and the request would be filed as novel.
    const before = process.env.AGENT_TOOLS_DISABLED;
    process.env.AGENT_TOOLS_DISABLED = 'read_attachments';
    try {
      mockQuery.mockResolvedValue([]);
      const names = (await loadToolCatalogForMatching()).tools.map((t) => t.tool_name);
      expect(names).toContain('read_attachments');
    } finally {
      if (before === undefined) delete process.env.AGENT_TOOLS_DISABLED;
      else process.env.AGENT_TOOLS_DISABLED = before;
    }
  });
});
