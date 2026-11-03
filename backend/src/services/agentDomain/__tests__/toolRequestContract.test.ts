/**
 * AF11.1 — the tool-request contract, asserted FIELD BY FIELD.
 *
 * The ticket's first acceptance criterion is *"a request missing any required field is refused with
 * a named reason, not a generic 400. Asserted per field."* So the omission cases are a table rather
 * than a handful of spot checks: a new required field with no row here is visible as an omission,
 * where a prose test would quietly cover fifteen of sixteen fields forever.
 *
 * THE CONTROL COMES FIRST and it is not a formality. If `complete()` ever stopped passing the gate,
 * every omission case below would still "fail as expected" — for the wrong reason — and the whole
 * file would report green while proving nothing. The first test is what stops that.
 */

import { allCapabilities } from '../capabilityRecord';
import {
  acceptToolRequest,
  gateToolRequest,
  type ToolRequestDetailInput,
  type ToolRequestRefusal,
} from '../toolRequestContract';

const AGENT = '11111111-2222-3333-4444-555555555555';
const DOMAIN = 'marketing';

/** Real ids from the real registry, because that is what the service passes. */
const CAPABILITY_IDS = allCapabilities().map((c) => c.capability_id);
const A_REAL_CAPABILITY = CAPABILITY_IDS[0];

function complete(over: Partial<ToolRequestDetailInput> = {}): ToolRequestDetailInput {
  return {
    agent_id: AGENT,
    tool_name: 'read_skool_signal_feed',
    purpose: 'Read the Skool community feed so the agent can spot questions worth answering.',
    reads: ['Skool community posts for the last 7 days'],
    produces: ['A ranked list of posts worth a reply'],
    capability_id: A_REAL_CAPABILITY,
    task_unblocked: 'STORY-004, the daily signal triage pass.',
    manual_today: 'I open Skool and scroll the feed every morning.',
    needed_by: '2026-11-30',
    run_frequency: 'daily',
    touches: ['Skool API (read only)', 'interaction_outcomes'],
    inputs: ['A community id', 'A lookback window in days'],
    writes: false,
    ...over,
  };
}

function gate(detail: ToolRequestDetailInput, over: {
  domainKey?: string;
  knownCapabilityIds?: string[];
  ownedAgentIds?: string[];
} = {}) {
  return gateToolRequest({
    detail,
    domainKey: over.domainKey ?? DOMAIN,
    knownCapabilityIds: over.knownCapabilityIds ?? CAPABILITY_IDS,
    ownedAgentIds: over.ownedAgentIds ?? [AGENT],
  });
}

const rules = (detail: ToolRequestDetailInput, over = {}): string[] =>
  gate(detail, over).map((i) => i.rule);

describe('THE CONTROL — without this the rest of the file proves nothing', () => {
  it('accepts a complete request with no issues at all', () => {
    expect(gate(complete())).toEqual([]);
  });

  it('reads a registry that is actually populated, so no capability case is vacuous', () => {
    // 443 researched capabilities across 10 domains. A loader returning nothing would make
    // `capability_not_found` pass for every id including the real ones.
    expect(CAPABILITY_IDS.length).toBeGreaterThan(400);
    expect(typeof A_REAL_CAPABILITY).toBe('string');
    expect(A_REAL_CAPABILITY.length).toBeGreaterThan(0);
  });
});

describe('every required field, named one at a time', () => {
  const OMISSIONS: ReadonlyArray<[keyof ToolRequestDetailInput, ToolRequestRefusal]> = [
    ['agent_id', 'agent_missing'],
    ['tool_name', 'tool_name_missing'],
    ['purpose', 'purpose_missing'],
    ['reads', 'reads_undeclared'],
    ['produces', 'produces_undeclared'],
    ['capability_id', 'capability_missing'],
    ['task_unblocked', 'task_unblocked_missing'],
    ['manual_today', 'manual_today_missing'],
    ['needed_by', 'needed_by_missing'],
    ['run_frequency', 'run_frequency_missing'],
    ['touches', 'touches_missing'],
    ['inputs', 'inputs_undeclared'],
    ['writes', 'writes_undeclared'],
  ];

  it.each(OMISSIONS)('refuses a missing %s as %s', (field, rule) => {
    const detail = complete();
    delete (detail as Record<string, unknown>)[field as string];
    expect(rules(detail)).toContain(rule);
  });

  it.each(OMISSIONS)('%s: the refusal carries a sentence, not just a code (%s)', (field, rule) => {
    const detail = complete();
    delete (detail as Record<string, unknown>)[field as string];
    const issue = gate(detail).find((i) => i.rule === rule);
    expect(issue).toBeDefined();
    // A code with no sentence is the generic 400 this criterion exists to rule out.
    expect((issue as { detail: string }).detail.length).toBeGreaterThan(10);
  });

  it('reports EVERY missing field at once, not the first one', () => {
    // A form that reports one missing field per round trip is how a six-group request gets
    // abandoned halfway through.
    const found = rules({ writes: true });
    expect(found.length).toBeGreaterThan(8);
    expect(found).toContain('agent_missing');
    expect(found).toContain('touches_missing');
  });

  it('treats whitespace as absent rather than as an answer', () => {
    expect(rules(complete({ purpose: '   ' }))).toContain('purpose_missing');
  });

  it('treats a list of blanks as an empty list, not as answers', () => {
    expect(rules(complete({ touches: ['', '  '] }))).toContain('touches_missing');
  });
});

describe('WHO — the agent has to be one of yours', () => {
  it('refuses an agent the requester does not own, by name', () => {
    expect(rules(complete(), { ownedAgentIds: ['99999999-9999-9999-9999-999999999999'] }))
      .toContain('agent_not_yours');
  });

  it('refuses an EMPTY roster as its own reason, never as a pass', () => {
    // The lesson `agentChangeRequest.ts` records: "An absent roster is a refusal, never a pass."
    // Collapsing this into `agent_not_yours` would read as "wrong agent" when the truth is
    // "we could not look".
    const found = rules(complete(), { ownedAgentIds: [] });
    expect(found).toContain('agent_roster_absent');
    expect(found).not.toContain('agent_not_yours');
  });

  it('takes the domain from the caller, so a payload cannot disagree with the request', () => {
    // There is no `domain_key` on the payload at all. The only way to a blank domain is a caller
    // that passes one, and that is refused rather than written.
    expect(rules(complete(), { domainKey: '' })).toContain('domain_missing');
    expect(rules(complete(), { domainKey: 'curriculum' })).toEqual([]);
  });

  it('records the CALLER domain on the accepted detail, not anything from the wire', () => {
    const verdict = acceptToolRequest({
      detail: { ...complete(), ...{ domain_key: 'website' } } as ToolRequestDetailInput,
      domainKey: 'marketing',
      knownCapabilityIds: CAPABILITY_IDS,
      ownedAgentIds: [AGENT],
    });
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.detail.domain_key).toBe('marketing');
  });
});

describe('WHAT FOR — the capability reference resolves against the JSON registry', () => {
  it('accepts a real capability id: the POSITIVE control', () => {
    expect(rules(complete({ capability_id: A_REAL_CAPABILITY }))).toEqual([]);
  });

  it('refuses an id no capability has, and says which id', () => {
    const issue = gate(complete({ capability_id: 'marketing.not_a_real_capability' }))
      .find((i) => i.rule === 'capability_not_found');
    expect(issue).toBeDefined();
    expect((issue as { detail: string }).detail).toContain('marketing.not_a_real_capability');
  });

  it('refuses an unreadable registry as its own reason', () => {
    const found = rules(complete(), { knownCapabilityIds: [] });
    expect(found).toContain('capability_roster_absent');
    expect(found).not.toContain('capability_not_found');
  });

  it('resolves ids of the shape the JSON registry really uses, not a table id', () => {
    // `models/Capability.ts` is a DIFFERENT table, keyed on `project_id`, whose ids are UUIDs.
    // If this ever starts accepting a UUID, the reference has been pointed at the wrong concept.
    expect(A_REAL_CAPABILITY).toMatch(/^[a-z_]+\.[a-z0-9_]+$/);
    expect(rules(complete({ capability_id: '3f2a1c44-0000-4000-8000-000000000000' })))
      .toContain('capability_not_found');
  });
});

describe('WHEN — a date and a comparable frequency', () => {
  it('refuses a needed-by that is not a date', () => {
    expect(rules(complete({ needed_by: 'next week' }))).toContain('needed_by_not_a_date');
  });

  it('refuses a day that matches the pattern and does not exist', () => {
    expect(rules(complete({ needed_by: '2026-02-31' }))).toContain('needed_by_not_a_date');
  });

  it('accepts a date in the past rather than refusing it', () => {
    // An overdue needed-by is a real signal for the approver, not a malformed request.
    expect(rules(complete({ needed_by: '2026-01-05' }))).toEqual([]);
  });

  it('refuses a frequency outside the enum and lists the allowed ones', () => {
    const issue = gate(complete({ run_frequency: 'sometimes' }))
      .find((i) => i.rule === 'run_frequency_unknown');
    expect(issue).toBeDefined();
    expect((issue as { detail: string }).detail).toContain('hourly');
  });
});

describe('WHAT — a tool that neither reads nor produces anything does nothing', () => {
  it('accepts an empty produces list, because real registered tools have one', () => {
    // Four entries in TOOL_CAPABILITIES have `produces: []`. Requiring it would refuse requests
    // for tools the catalog already contains.
    expect(rules(complete({ produces: [] }))).toEqual([]);
  });

  it('accepts an empty reads list when it produces something', () => {
    expect(rules(complete({ reads: [] }))).toEqual([]);
  });

  it('refuses both empty together', () => {
    expect(rules(complete({ reads: [], produces: [] })))
      .toContain('reads_and_produces_both_empty');
  });

  it('distinguishes an empty list from an undeclared one', () => {
    expect(rules(complete({ inputs: [] }))).toEqual([]);
    const undeclared = complete();
    delete (undeclared as Record<string, unknown>).inputs;
    expect(rules(undeclared)).toContain('inputs_undeclared');
  });
});

describe('HOW — the write rule, asserted BOTH ways', () => {
  it('a write with no side effects declared is refused', () => {
    expect(rules(complete({ writes: true, reversible: true })))
      .toContain('side_effects_missing');
  });

  it('a write with no reversibility declared is refused', () => {
    expect(rules(complete({ writes: true, side_effects: 'Creates one Basecamp todo.' })))
      .toContain('reversibility_undeclared');
  });

  it('a write that declares both is accepted', () => {
    expect(rules(complete({
      writes: true,
      side_effects: 'Creates one Basecamp todo in the signal list.',
      reversible: true,
    }))).toEqual([]);
  });

  it('a READ-ONLY tool does not need either of them: the other half of the assertion', () => {
    const detail = complete({ writes: false });
    delete (detail as Record<string, unknown>).side_effects;
    delete (detail as Record<string, unknown>).reversible;
    expect(rules(detail)).toEqual([]);
  });

  it('refuses a non-boolean `writes` rather than reading a word as true', () => {
    expect(rules({ ...complete(), writes: 'yes' } as unknown as ToolRequestDetailInput))
      .toContain('writes_undeclared');
  });

  it('refuses `reversible: false` with no note as acceptable, but records it as irreversible', () => {
    const verdict = acceptToolRequest({
      detail: complete({
        writes: true,
        side_effects: 'Sends one email to the lead.',
        reversible: false,
      }),
      domainKey: DOMAIN,
      knownCapabilityIds: CAPABILITY_IDS,
      ownedAgentIds: [AGENT],
    });
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.detail.reversible).toBe(false);
  });
});

describe('acceptToolRequest hands back a NARROWED value', () => {
  it('returns the trimmed, filtered detail on a pass', () => {
    const verdict = acceptToolRequest({
      detail: complete({ purpose: '  Read the feed.  ', touches: ['Skool', ''] }),
      domainKey: DOMAIN,
      knownCapabilityIds: CAPABILITY_IDS,
      ownedAgentIds: [AGENT],
    });
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.detail.purpose).toBe('Read the feed.');
      expect(verdict.detail.touches).toEqual(['Skool']);
    }
  });

  it('returns the issues and NO detail on a refusal', () => {
    const verdict = acceptToolRequest({
      detail: complete({ touches: [] }),
      domainKey: DOMAIN,
      knownCapabilityIds: CAPABILITY_IDS,
      ownedAgentIds: [AGENT],
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.issues.map((i) => i.rule)).toContain('touches_missing');
  });

  it('drops side effects and reversibility on a read-only tool rather than storing them', () => {
    // A side-effect sentence on a read-only row is a field two readers would interpret
    // differently, which is why the parent refuses a decline reason on an approval.
    const verdict = acceptToolRequest({
      detail: complete({ writes: false, side_effects: 'left over from an edit', reversible: true }),
      domainKey: DOMAIN,
      knownCapabilityIds: CAPABILITY_IDS,
      ownedAgentIds: [AGENT],
    });
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.detail.side_effects).toBeNull();
      expect(verdict.detail.reversible).toBeNull();
    }
  });
});

describe('the catalog vocabulary, so a request and a registered tool are comparable', () => {
  it('names the fields the catalog names', () => {
    const verdict = acceptToolRequest({
      detail: complete(),
      domainKey: DOMAIN,
      knownCapabilityIds: CAPABILITY_IDS,
      ownedAgentIds: [AGENT],
    });
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    // `ToolCapability` in `services/reese/agentToolCapabilities.ts` is `{ reads, produces }`, and
    // `ToolCatalogEntry` in `services/workforce/agentEffectiveAccessService.ts` is
    // `{ toolName, reads, produces, documented }`. Those three names are the shared vocabulary.
    expect(Object.keys(verdict.detail)).toContain('reads');
    expect(Object.keys(verdict.detail)).toContain('produces');
    expect(Object.keys(verdict.detail)).toContain('tool_name');
    // And `purpose` is NOT one of them: the catalog has no such field anywhere, which is why this
    // one is net-new here rather than borrowed. Recorded so the next reader does not go looking.
    expect(Object.keys(verdict.detail)).toContain('purpose');
  });
});
