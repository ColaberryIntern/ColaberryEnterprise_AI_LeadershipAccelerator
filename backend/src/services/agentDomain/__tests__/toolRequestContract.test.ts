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
  namesMoreThanOneTool,
  readsAsAThreshold,
  type ToolRequestDetailInput,
  type ToolRequestRefusal,
} from '../toolRequestContract';

const AGENT = '11111111-2222-3333-4444-555555555555';
const DOMAIN = 'marketing';

/**
 * AF11.7. A stand-in for the people roster, which held 50 `admin_users` rows and 37 `org_members`
 * rows in production on 16 Nov 2026.
 *
 * Hard-coded for the same reason `KNOWN_DATASETS` is: the contract is pure and the roster is I/O.
 * The spellings are MIXED CASE on purpose — `Sohail@Colaberry.com` is in the roster and the tests
 * below use it to pin both halves of the casing rule: a lowercase answer matches it, and what gets
 * stored is the ROSTER's spelling rather than the typed one.
 */
const KNOWN_ACTORS = ['Sohail@Colaberry.com', 'taiwo@colaberry.com', 'ali@colaberry.com'];

/**
 * A stand-in for `dataset_registry`, which held 633 scanned datasets in production on 14 Nov 2026.
 *
 * Hard-coded rather than read, because the contract is pure and the catalog is I/O — the same
 * split the service makes when it passes `datasetNames(await loadDatasetCatalog(...))` in. The
 * names are real tables from that catalog so a reader can tell this is a projection of something
 * that exists rather than three invented strings.
 */
const KNOWN_DATASETS = ['interaction_outcomes', 'leads', 'enrollments'];

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
    // AF11.7 — the three answers that decide whether this gets built at all.
    acts_on_output: 'sohail@colaberry.com',
    judged_threshold: 'Sohail replies to at least 3 of the 5 posts it ranks highest, each weekday.',
    judged_measured_from: 'The reply timestamps already stored on interaction_outcomes.',
    tried_in_product: 'not_built',
    missing_from_product: 'Nothing in the app reads Skool at all; there is no feed view to open.',
    needed_by: '2026-11-30',
    run_frequency: 'daily',
    touches: ['Skool API (read only)', 'interaction_outcomes'],
    environment: 'sandbox',
    read_datasets: ['interaction_outcomes'],
    inputs: ['A community id', 'A lookback window in days'],
    writes: false,
    ...over,
  };
}

function gate(detail: ToolRequestDetailInput, over: {
  domainKey?: string;
  knownCapabilityIds?: string[];
  ownedAgentIds?: string[];
  knownDatasets?: string[];
  knownActorEmails?: string[];
} = {}) {
  return gateToolRequest({
    detail,
    domainKey: over.domainKey ?? DOMAIN,
    knownCapabilityIds: over.knownCapabilityIds ?? CAPABILITY_IDS,
    ownedAgentIds: over.ownedAgentIds ?? [AGENT],
    knownDatasets: over.knownDatasets ?? KNOWN_DATASETS,
    knownActorEmails: over.knownActorEmails ?? KNOWN_ACTORS,
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
    ['environment', 'environment_missing'],
    ['read_datasets', 'read_datasets_undeclared'],
    ['inputs', 'inputs_undeclared'],
    ['writes', 'writes_undeclared'],
    // AF11.7. In the same table rather than a separate one, so a future required field with no row
    // here is visible as an omission — which is the stated reason this table exists at all.
    ['acts_on_output', 'acts_on_output_missing'],
    ['judged_threshold', 'judged_threshold_missing'],
    ['judged_measured_from', 'judged_measured_from_missing'],
    ['tried_in_product', 'tried_in_product_missing'],
    ['missing_from_product', 'missing_from_product_missing'],
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
      knownDatasets: KNOWN_DATASETS,
      knownActorEmails: KNOWN_ACTORS,
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
      knownDatasets: KNOWN_DATASETS,
      knownActorEmails: KNOWN_ACTORS,
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
      knownDatasets: KNOWN_DATASETS,
      knownActorEmails: KNOWN_ACTORS,
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
      knownDatasets: KNOWN_DATASETS,
      knownActorEmails: KNOWN_ACTORS,
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
      knownDatasets: KNOWN_DATASETS,
      knownActorEmails: KNOWN_ACTORS,
    });
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.detail.side_effects).toBeNull();
      expect(verdict.detail.reversible).toBeNull();
    }
  });
});

describe('WHICH DATA — the dataset scope, and the one rule that differs by environment', () => {
  it('accepts a catalogued dataset: the POSITIVE control', () => {
    expect(rules(complete({ read_datasets: ['leads', 'enrollments'] }))).toEqual([]);
  });

  it('refuses a dataset nobody has on record, and SAYS WHICH ONE', () => {
    // The name matters more than the rule here. `leadz` is the realistic failure — a typed name
    // instead of a picked one — and a refusal that does not echo it leaves the builder rereading
    // a list of five to find the wrong one.
    const issue = gate(complete({ read_datasets: ['leads', 'leadz'] }))
      .find((i) => i.rule === 'read_datasets_not_catalogued');
    expect(issue).toBeDefined();
    expect((issue as { detail: string }).detail).toContain('leadz');
    expect((issue as { detail: string }).detail).not.toContain('leads,');
  });

  it('refuses an uncatalogued name on SANDBOX too, not only on production', () => {
    // A typo is a typo in both environments. Accepting it on sandbox would mean the first time
    // anybody finds out is the production request, which is the expensive moment to find out.
    expect(rules(complete({ environment: 'sandbox', read_datasets: ['leadz'] })))
      .toContain('read_datasets_not_catalogued');
  });

  it('refuses an unreadable catalog as its own reason, never as a pass', () => {
    const found = rules(complete({ read_datasets: ['leads'] }), { knownDatasets: [] });
    expect(found).toContain('dataset_roster_absent');
    expect(found).not.toContain('read_datasets_not_catalogued');
  });

  it('does NOT block a request that names no dataset when the catalog is unreadable', () => {
    // The roster is consulted only when the request names something, so a tool that reads no
    // database is never held up by a metadata table being down.
    expect(rules(complete({ read_datasets: [] }), { knownDatasets: [] })).toEqual([]);
  });

  describe("Ali's rule: sandbox-wide read is fine, production gets narrowed", () => {
    it('accepts a SANDBOX request that names no datasets', () => {
      expect(rules(complete({ environment: 'sandbox', read_datasets: [] }))).toEqual([]);
    });

    it('refuses a PRODUCTION request that reads something and names no datasets', () => {
      const found = rules(complete({
        environment: 'production',
        reads: ['the lead table'],
        read_datasets: [],
      }));
      expect(found).toContain('production_reads_unscoped');
    });

    it('accepts a PRODUCTION request once it names them', () => {
      expect(rules(complete({
        environment: 'production',
        reads: ['the lead table'],
        read_datasets: ['leads'],
      }))).toEqual([]);
    });

    it('does not fire on a production tool that declares it reads nothing', () => {
      // `reads: []` with a non-empty `produces` is a legitimate write-only tool, and the scope
      // rule has nothing to narrow. `reads_and_produces_both_empty` is what catches a tool that
      // does neither, and it is a different rule for a different mistake.
      expect(rules(complete({
        environment: 'production',
        reads: [],
        produces: ['A posted reply'],
        read_datasets: [],
      }))).toEqual([]);
    });

    it('tells the builder BOTH ways out, because most unscoped reads are not database reads', () => {
      // 24% of the 118 read verbs declared across the capability records are not relational at
      // all. A refusal that only said "pick datasets" would push somebody with none to pick one
      // anyway, which is worse than the blank it replaced.
      const issue = gate(complete({
        environment: 'production',
        reads: ['the repository'],
        read_datasets: [],
      })).find((i) => i.rule === 'production_reads_unscoped');
      expect(issue).toBeDefined();
      const detail = (issue as { detail: string }).detail;
      expect(detail).toContain('catalog');
      expect(detail).toContain('touches');
    });
  });

  it('refuses an environment that is not one of the two, by its own name', () => {
    const found = rules(complete({ environment: 'staging' }));
    expect(found).toContain('environment_unknown');
    expect(found).not.toContain('environment_missing');
  });

  it('does not reach the production rule when the environment is unknown', () => {
    // Otherwise a typo in the enum would also produce a scope refusal, and the builder would fix
    // the wrong field first.
    expect(rules(complete({ environment: 'prod', read_datasets: [] })))
      .not.toContain('production_reads_unscoped');
  });

  it('carries both fields onto the accepted detail, narrowed', () => {
    const verdict = acceptToolRequest({
      detail: complete({
        environment: 'production',
        read_datasets: ['  leads  ', '', 'enrollments'],
      }),
      domainKey: DOMAIN,
      knownCapabilityIds: CAPABILITY_IDS,
      ownedAgentIds: [AGENT],
      knownDatasets: KNOWN_DATASETS,
      knownActorEmails: KNOWN_ACTORS,
    });
    // The padded entry is the point: the gate trims before it checks, so `'  leads  '` resolves
    // against the catalog, and `accept` has to store the trimmed name or the grant would be
    // written against a string no table has.
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.detail.read_datasets).toEqual(['leads', 'enrollments']);
    expect(verdict.detail.environment).toBe('production');
  });
});

describe('the catalog vocabulary, so a request and a registered tool are comparable', () => {
  it('names the fields the catalog names', () => {
    const verdict = acceptToolRequest({
      detail: complete(),
      domainKey: DOMAIN,
      knownCapabilityIds: CAPABILITY_IDS,
      ownedAgentIds: [AGENT],
      knownDatasets: KNOWN_DATASETS,
      knownActorEmails: KNOWN_ACTORS,
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

/**
 * AF11.7 — the three questions, the one-tool rule, and the capability that started it.
 *
 * The ticket's six acceptance criteria are each a `describe` below, in its words, so a reader can
 * check the ticket against the file rather than against a summary of it. The last one is the one
 * that matters most and it is a REGRESSION TEST FOR A JUDGMENT rather than for a bug: the
 * design-token drift capability passed every field this contract had on 15 Nov and should never
 * have reached seven builders' boards.
 */

describe('AF11.7 criterion 1 — a request missing any of the three fields cannot be submitted', () => {
  // The omissions table above already covers each field one at a time. What it cannot show is that
  // the three arrive TOGETHER on a request that answers everything else, which is the shape a real
  // pre-AF11.7 payload has.
  it('refuses a request that is complete by the OLD contract and silent on all three', () => {
    const old = complete();
    for (const f of [
      'acts_on_output', 'judged_threshold', 'judged_measured_from',
      'tried_in_product', 'missing_from_product',
    ]) {
      delete (old as Record<string, unknown>)[f];
    }
    const found = rules(old);
    expect(found).toContain('acts_on_output_missing');
    expect(found).toContain('judged_threshold_missing');
    expect(found).toContain('judged_measured_from_missing');
    expect(found).toContain('tried_in_product_missing');
    // `missing_from_product` is NOT expected here: it is only required once `tried_in_product`
    // says `not_built`, and this payload does not say anything. A rule that fired anyway would be
    // demanding the gap in the product from somebody who has not yet said the product has one.
    expect(found).not.toContain('missing_from_product_missing');
  });

  it('names the field in every one of the three refusals, so the error is actionable', () => {
    const bare = gate({});
    for (const rule of [
      'acts_on_output_missing', 'judged_threshold_missing', 'judged_measured_from_missing',
      'tried_in_product_missing',
    ] as const) {
      const issue = bare.find((i) => i.rule === rule);
      expect(issue).toBeDefined();
      expect((issue as { detail: string }).detail.length).toBeGreaterThan(20);
    }
  });
});

describe('AF11.7 criterion 2 — "how it will be judged" rejects a value with no threshold', () => {
  it('rejects the exact non-answer the ticket names', () => {
    expect(rules(complete({ judged_threshold: 'The output is accurate' })))
      .toContain('judged_threshold_has_no_number');
  });

  it.each([
    ['an adjective', 'It should be good'],
    ['a promise', 'The agent will do a thorough job every time'],
    ['a quantifier wearing a number word', 'Accurate all of the time'],
    ['a bare number, which names no subject', '7'],
    ['a bare rate', '80%'],
  ])('rejects %s', (_label, value) => {
    expect(rules(complete({ judged_threshold: value })))
      .toContain('judged_threshold_has_no_number');
  });

  it.each([
    ["Ali's own worked example", 'A draft is good if Sohail publishes it with fewer than three edits, target 7 of the next 10'],
    ['a spelled count', 'Sohail accepts at least four of the five it ranks top'],
    ['a rate with a subject', 'Fewer than 2% of drafts need a rewrite'],
  ])('accepts %s', (_label, value) => {
    expect(rules(complete({ judged_threshold: value }))).toEqual([]);
  });

  it('asks separately what ALREADY RECORDS the number, because a threshold nobody can measure is not one', () => {
    // Two fields rather than one. A threshold is a claim about the future; the measurement source
    // is a claim about what exists today, and only the second can be checked before the build.
    const found = rules(complete({ judged_measured_from: '' }));
    expect(found).toEqual(['judged_measured_from_missing']);
  });

  it('states its own limit honestly: a number is necessary, not sufficient', () => {
    // `readsAsAThreshold` cannot tell a threshold from any other sentence with a number in it, and
    // the docblock says so. This test PINS that known gap rather than hiding it, so nobody later
    // reads a green suite as proof the field is semantically validated.
    expect(readsAsAThreshold('This tool reads 5 tables')).toBe(true);
    expect(rules(complete({ judged_threshold: 'This tool reads 5 tables' }))).toEqual([]);
  });
});

describe('AF11.7 criterion 3 — a feature that exists and has NOT been used is blocked', () => {
  it('blocks it, and the refusal sends them to use the product first', () => {
    const issue = gate(complete({ tried_in_product: 'exists_unused' }))
      .find((i) => i.rule === 'feature_exists_use_it_first');
    expect(issue).toBeDefined();
    expect((issue as { detail: string }).detail).toMatch(/by hand/i);
  });

  it('does not ALSO demand what is missing from the product, which they cannot know yet', () => {
    // The whole point of sending somebody to try the feature is that they find out what it lacks.
    // Demanding the answer first would teach them to invent one.
    const found = rules(complete({ tried_in_product: 'exists_unused', missing_from_product: '' }));
    expect(found).toContain('feature_exists_use_it_first');
    expect(found).not.toContain('missing_from_product_missing');
  });
});

describe('AF11.7 criterion 4 — a feature that exists and HAS been used is a grant, never a build', () => {
  it('refuses it as a build and says a grant is the shorter request', () => {
    const issue = gate(complete({ tried_in_product: 'used_by_hand' }))
      .find((i) => i.rule === 'feature_exists_request_a_grant');
    expect(issue).toBeDefined();
    expect((issue as { detail: string }).detail).toMatch(/grant/i);
  });

  it('SARBJIT\'S REAL CASE: a landing page tool is a grant, and AF11.2 could not have said so', () => {
    // `backend/src/routes/admin/landingPageRoutes.ts` exposes eight endpoints on main — create,
    // suggest-name, revise, patch, preview, publish, unpublish, list. No agent has been granted
    // any of them, so the capability is a PRODUCT FEATURE and not a REGISTERED TOOL, and AF11.2's
    // duplicate check compares only against registered tools. This field is the only thing in the
    // request path that can see it.
    const sarbjit = complete({
      tool_name: 'draft_landing_page_from_brief',
      purpose: 'Draft a landing page from a campaign brief so Sohail has something to edit.',
      tried_in_product: 'used_by_hand',
      acts_on_output: 'sohail@colaberry.com',
      judged_threshold: 'Sohail publishes the draft with fewer than 3 edits, 7 of the next 10 times.',
      judged_measured_from: 'The revision count the landing page API already stores per page.',
    });
    expect(rules(sarbjit)).toEqual(['feature_exists_request_a_grant']);
  });

  it('only `not_built` can be filed, and it is the state that requires the gap to be named', () => {
    expect(rules(complete({ tried_in_product: 'not_built' }))).toEqual([]);
    expect(rules(complete({ tried_in_product: 'not_built', missing_from_product: '   ' })))
      .toEqual(['missing_from_product_missing']);
  });

  it('refuses a state nobody defined, rather than reading it as one of the three', () => {
    const found = rules(complete({ tried_in_product: 'maybe' }));
    expect(found).toContain('tried_in_product_unknown');
    expect(found).not.toContain('feature_exists_use_it_first');
    expect(found).not.toContain('feature_exists_request_a_grant');
  });
});

describe('AF11.7 criterion 5 — a request naming more than one tool is rejected, with the release rule', () => {
  it.each([
    ['a comma list', 'create_page, publish_page'],
    ['a slash', 'draft/publish a landing page'],
    ['a plus', 'read_feed + rank_posts'],
    ['an ampersand', 'draft & publish'],
    ['a spoken conjunction', 'draft a landing page and publish it'],
    ['a sequence', 'read the feed then post a reply'],
  ])('rejects %s', (_label, name) => {
    expect(rules(complete({ tool_name: name }))).toContain('more_than_one_tool');
  });

  it('gives the RELEASE RULE as the reason, and says several endpoints of one tool are fine', () => {
    // A rule with no reason reads as a bug, and somebody hitting a false positive needs to know
    // that renaming is the fix rather than splitting a request that was already one tool.
    const issue = gate(complete({ tool_name: 'draft and publish' }))
      .find((i) => i.rule === 'more_than_one_tool');
    expect(issue).toBeDefined();
    const detail = (issue as { detail: string }).detail;
    expect(detail).toMatch(/one tool/i);
    expect(detail).toMatch(/endpoints/i);
  });

  it('leaves the CATALOG\'S OWN VOCABULARY alone, which is the boundary that makes this safe', () => {
    // The catalog is snake_case verb-object. If `_and_` were caught, a large share of legitimate
    // names would be refused and the rule would be worse than nothing.
    for (const name of [
      'read_learner_context',
      'flag_curriculum_content_gaps',
      'close_workforce_tickets_on_recovery',
      'search_and_replace_tokens',
    ]) {
      expect(namesMoreThanOneTool(name)).toBe(false);
      expect(rules(complete({ tool_name: name }))).toEqual([]);
    }
  });

  it('is applied to the NAME only, never to the purpose, which is prose', () => {
    // A purpose is supposed to mention the things a tool sits next to.
    expect(rules(complete({
      purpose: 'Read the feed and rank it, so the draft tool and the publish tool have input.',
    }))).toEqual([]);
  });
});

describe('AF11.7 criterion 6 — the design-token drift request, re-filed today, fails on fields 1 and 2', () => {
  /**
   * The capability Ali killed, written out as the request it would have to be.
   *
   * Measured against main on 16 Nov 2026: 1,571 distinct colors outside the approved palette
   * across 3,088 styled files, 4,492 unapproved occurrences in all. Every field the contract had
   * before AF11.7 can be answered honestly, which is the finding: **the request path had no
   * question this capability could fail.**
   *
   * Ali, 16 Nov 2026: *"what good is judging 50 colors and why are we judging them - are we
   * replacing them? What's the goal here - it's not clearly defined... That sounds like a waste of
   * time."*
   */
  const designTokenDrift = (): ToolRequestDetailInput => ({
    agent_id: AGENT,
    tool_name: 'scan_design_token_drift',
    purpose: 'Find every color in the codebase that is not in the approved palette.',
    reads: ['Every .tsx, .ts and .css file in the repository'],
    produces: ['A list of unapproved color values, grouped by nearest approved color'],
    read_datasets: [],
    capability_id: A_REAL_CAPABILITY,
    task_unblocked: 'The design-system consistency pass.',
    manual_today: 'Nobody does this by hand; the drift accumulates unnoticed.',
    needed_by: '2026-11-30',
    run_frequency: 'daily',
    touches: ['The repository, read only'],
    environment: 'sandbox',
    inputs: ['A palette file path'],
    writes: false,
    // Field 3 is answerable, and honestly `not_built` — nothing in the app scans for this.
    tried_in_product: 'not_built',
    missing_from_product: 'The app has no view that compares a color against the palette.',
    // Fields 1 and 2 are where it dies. Nobody was ever named, and no threshold ever existed.
    acts_on_output: '',
    judged_threshold: 'The agent surfaces colors that are off-palette',
    judged_measured_from: '',
  });

  it('fails on field 1 and field 2, and on nothing else', () => {
    const found = rules(designTokenDrift());
    expect(found).toContain('acts_on_output_missing');
    expect(found).toContain('judged_measured_from_missing');
    expect(found).toContain('judged_threshold_has_no_number');
    // THE SHARP PART. Every other group passes, which is why this reached seven boards.
    expect(found.sort()).toEqual([
      'acts_on_output_missing',
      'judged_measured_from_missing',
      'judged_threshold_has_no_number',
    ].sort());
  });

  it('CONTROL: it passed the pre-AF11.7 contract completely, which is the whole finding', () => {
    // Strip the three new fields and the same request has nothing wrong with it. If this ever
    // starts failing, the capability was refusable all along and the criterion above is testing
    // something other than what it claims.
    const asFiledBefore = designTokenDrift() as Record<string, unknown>;
    for (const f of [
      'acts_on_output', 'judged_threshold', 'judged_measured_from',
      'tried_in_product', 'missing_from_product',
    ]) {
      delete asFiledBefore[f];
    }
    const found = rules(asFiledBefore as ToolRequestDetailInput);
    // Only the five new rules fire. Nothing from the original six groups does.
    expect(found.filter((r) => !r.startsWith('acts_on_output')
      && !r.startsWith('judged_') && !r.startsWith('tried_in_product')
      && !r.startsWith('missing_from_product'))).toEqual([]);
  });

  it('is not rescued by a threshold with a number but no reader', () => {
    // The failure mode worth pinning: somebody answers field 2 to get past the form and leaves
    // field 1 blank. Two fields, two refusals, and the one that matters survives.
    const found = rules({
      ...designTokenDrift(),
      judged_threshold: 'Fewer than 50 new off-palette colors appear per month',
      judged_measured_from: 'A count from the scan itself, stored per run',
    });
    expect(found).toEqual(['acts_on_output_missing']);
  });
});

describe('AF11.7 — the person has to be on the roster, and the roster is the caller\'s', () => {
  it('refuses a role, a team and a placeholder, none of which name anybody', () => {
    for (const notAPerson of ['marketing', 'the team', 'TBD', 'me', 'whoever owns it']) {
      expect(rules(complete({ acts_on_output: notAPerson })))
        .toContain('acts_on_output_not_a_person');
    }
  });

  it('refuses a well-formed email that belongs to nobody, and says which', () => {
    // This is why the field is not a Zod `.email()`: shape was never the question.
    const issue = gate(complete({ acts_on_output: 'nobody@colaberry.com' }))
      .find((i) => i.rule === 'acts_on_output_not_a_person');
    expect(issue).toBeDefined();
    expect((issue as { detail: string }).detail).toContain('nobody@colaberry.com');
  });

  it('refuses an EMPTY roster as its own reason, never as a pass', () => {
    // The house rule, in `agentChangeRequest.ts`'s words: "An absent roster is a refusal, never a
    // pass." An unreadable people table must not be the thing that lets an unchecked name through.
    const found = rules(complete(), { knownActorEmails: [] });
    expect(found).toContain('actor_roster_absent');
    expect(found).not.toContain('acts_on_output_not_a_person');
  });

  it('matches case-insensitively, because an email is one identity however it is typed', () => {
    expect(rules(complete({ acts_on_output: 'SOHAIL@colaberry.com' }))).toEqual([]);
  });

  it('stores the ROSTER\'S spelling, not the typed one', () => {
    // Otherwise the record carries a spelling no people row has, and the next reader has two
    // spellings of one person to reconcile.
    const verdict = acceptToolRequest({
      detail: complete({ acts_on_output: 'sohail@colaberry.com' }),
      domainKey: DOMAIN,
      knownCapabilityIds: CAPABILITY_IDS,
      ownedAgentIds: [AGENT],
      knownDatasets: KNOWN_DATASETS,
      knownActorEmails: KNOWN_ACTORS,
    });
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.detail.acts_on_output).toBe('Sohail@Colaberry.com');
  });

  it('narrows the other four new fields too, so the gate and the write read one object', () => {
    const verdict = acceptToolRequest({
      detail: complete({
        judged_threshold: '  At least 3 of 5, each weekday.  ',
        judged_measured_from: '  interaction_outcomes reply timestamps  ',
        missing_from_product: '  No feed view exists.  ',
      }),
      domainKey: DOMAIN,
      knownCapabilityIds: CAPABILITY_IDS,
      ownedAgentIds: [AGENT],
      knownDatasets: KNOWN_DATASETS,
      knownActorEmails: KNOWN_ACTORS,
    });
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.detail.judged_threshold).toBe('At least 3 of 5, each weekday.');
    expect(verdict.detail.judged_measured_from).toBe('interaction_outcomes reply timestamps');
    expect(verdict.detail.missing_from_product).toBe('No feed view exists.');
    expect(verdict.detail.tried_in_product).toBe('not_built');
  });
});
