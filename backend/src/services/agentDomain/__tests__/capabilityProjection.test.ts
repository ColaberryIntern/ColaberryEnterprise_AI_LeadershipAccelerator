import {
  PROJECTED_CAPABILITY_FIELDS,
  PROJECTED_RELEASE_BEHAVIOUR_FIELDS,
  projectCapabilities,
  projectCapability,
} from '../capabilityProjection';
import { loadAllMatrices } from '../capabilityRecord';
import type { CapabilityRecord } from '../capabilityRecord';

/**
 * AF12.5 — the projection that publishes capability records, and refuses to publish anything else.
 *
 * Reported independently by three builders: Mihret Netsereab (criterion 1), Victoria
 * Spencer-Auber (criterion 3) and Sarbjit Kaur, 3 Nov 2026. Both domain-detail handlers loaded
 * `m.capabilities` into a local variable and discarded it, while `agentDomainSnapshot.ts` told
 * every Command Center page that those endpoints were its capability source.
 *
 * The allow-list is the part under test hardest, because `CapabilityRecord` ends in
 * `readonly [extra: string]: unknown`. A spread would publish whatever a researcher put in a JSON
 * file, to every caller, forever — so the leak boundary is asserted against the REAL 444 records
 * and not only against fixtures.
 */

function record(over: Record<string, unknown> = {}): CapabilityRecord {
  return {
    capability_id: 'marketing.a',
    name: 'A capability',
    business_outcome: 'x',
    intended_users: [],
    classification: 'agent_task',
    source: 'research',
    supporting_evidence: [],
    implementation_state: 'absent',
    requirement_validation_state: 'draft',
    validation_dependency: '',
    inputs: [],
    outputs: [],
    workflow: [],
    exceptions: [],
    dependencies: [],
    application_pages: [],
    apis: [],
    source_modules: [],
    required_tools: [],
    human_decision: false,
    starting_autonomy: 'autonomy:R0',
    max_permitted_autonomy: 'autonomy:R4',
    blocked_by: [],
    release_behaviour: [],
    ...over,
  } as unknown as CapabilityRecord;
}

const ids = (r: { capabilities: ReadonlyArray<{ capability_id: string }> }) =>
  r.capabilities.map((c) => c.capability_id);

describe('the allow-list is the contract, and it is exact', () => {
  it('projects exactly the declared fields, no more and no fewer', () => {
    const keys = Object.keys(projectCapability(record())).sort();
    expect(keys).toEqual([...PROJECTED_CAPABILITY_FIELDS].sort());
  });

  it('serves every field panel 2 of the Command Center story names', () => {
    // The story names these by name. If one is ever dropped, the panel it serves goes blank and
    // the builder has no way to know whether that is the data or the platform.
    for (const f of [
      'name', 'classification', 'implementation_state', 'requirement_validation_state',
      'starting_autonomy', 'max_permitted_autonomy', 'human_decision',
    ]) {
      expect(PROJECTED_CAPABILITY_FIELDS).toContain(f);
    }
  });

  it('serves release_behaviour, which panel 4 has no other source for anywhere', () => {
    expect(PROJECTED_CAPABILITY_FIELDS).toContain('release_behaviour');
  });

  it('does NOT leak a domain-specific extra from the index signature', () => {
    const p = projectCapability(record({
      pii_exposure: 'high',
      financial_consequence: true,
      public_facing: 'yes',
      reaches_learners: 1,
    }));
    expect(p).not.toHaveProperty('pii_exposure');
    expect(p).not.toHaveProperty('financial_consequence');
    expect(p).not.toHaveProperty('public_facing');
    expect(p).not.toHaveProperty('reaches_learners');
  });

  it('does NOT leak current_approved_autonomy, the extra that reads as an approval', () => {
    // Named on its own because it is the dangerous one: it exists in two of the ten research
    // files and `coverageMatrix.ts` exists in part to stop it being read as an approval. Beside a
    // real autonomy field on a page it would look equally authoritative.
    const p = projectCapability(record({ current_approved_autonomy: 'autonomy:R0' }));
    expect(p).not.toHaveProperty('current_approved_autonomy');
  });

  it('does NOT leak permissions_by_environment', () => {
    const p = projectCapability(record({
      permissions_by_environment: { production: { human: ['x'], agent: ['y'] } },
    }));
    expect(p).not.toHaveProperty('permissions_by_environment');
  });

  it('omits the fields no panel asked for, including the one the snapshot already publishes', () => {
    // `max_autonomy_rationale` is deliberately absent: the snapshot publishes it as
    // `authority[].ceiling_reason`, and two names for one value is how a page renders it twice
    // and disagrees with itself.
    const p = projectCapability(record({ max_autonomy_rationale: 'because' }));
    for (const f of [
      'max_autonomy_rationale', 'blocked_by', 'source', 'supporting_evidence', 'inputs',
      'outputs', 'workflow', 'exceptions', 'dependencies', 'application_pages', 'apis',
      'source_modules', 'required_tools', 'business_outcome', 'intended_users',
      'validation_dependency',
    ]) {
      expect(p).not.toHaveProperty(f);
    }
  });
});

describe('release_behaviour entries are projected, not passed through', () => {
  it('projects exactly the three declared entry fields', () => {
    const p = projectCapability(record({
      release_behaviour: [{ autonomy: 'autonomy:R1', behaviour: 'b', acceptance_criteria: 'c' }],
    }));
    const keys = Object.keys(p.release_behaviour[0]).sort();
    expect(keys).toEqual([...PROJECTED_RELEASE_BEHAVIOUR_FIELDS].sort());
  });

  it('does not leak a field added to an entry', () => {
    // `ReleaseBehaviour` is a closed shape today. It is still projected field by field so that the
    // day somebody adds a field to it, that field does not publish itself.
    const p = projectCapability(record({
      release_behaviour: [{
        autonomy: 'autonomy:R1', behaviour: 'b', acceptance_criteria: 'c', internal_note: 'secret',
      }],
    }));
    expect(p.release_behaviour[0]).not.toHaveProperty('internal_note');
  });

  it('keeps entry order within a capability', () => {
    const p = projectCapability(record({
      release_behaviour: [
        { autonomy: 'autonomy:R3', behaviour: 'third', acceptance_criteria: 'c' },
        { autonomy: 'autonomy:R1', behaviour: 'first', acceptance_criteria: 'c' },
      ],
    }));
    expect(p.release_behaviour.map((r) => r.autonomy)).toEqual(['autonomy:R3', 'autonomy:R1']);
  });

  it('an empty ladder stays an empty ARRAY, which panel 6 asks to be labelled', () => {
    const p = projectCapability(record({ release_behaviour: [] }));
    expect(p.release_behaviour).toEqual([]);
  });

  it('a non-array release_behaviour becomes an empty array rather than throwing', () => {
    // JSONB and hand-edited JSON are typed by the model, not the data. `assertRecordContract`
    // checks the field is PRESENT, not that it is an array.
    expect(projectCapability(record({ release_behaviour: null })).release_behaviour).toEqual([]);
    expect(projectCapability(record({ release_behaviour: 'R1' })).release_behaviour).toEqual([]);
    expect(projectCapability(record({ release_behaviour: {} })).release_behaviour).toEqual([]);
  });
});

describe('a gap is null and never undefined, because undefined disappears on the wire', () => {
  it('turns a missing entry field into null', () => {
    const p = projectCapability(record({ release_behaviour: [{ autonomy: 'autonomy:R1' }] }));
    expect(p.release_behaviour[0].behaviour).toBeNull();
    expect(p.release_behaviour[0].acceptance_criteria).toBeNull();
  });

  it('turns a blank or whitespace entry field into null', () => {
    const p = projectCapability(record({
      release_behaviour: [{ autonomy: '  ', behaviour: '', acceptance_criteria: '   ' }],
    }));
    expect(p.release_behaviour[0]).toEqual({
      autonomy: null, behaviour: null, acceptance_criteria: null,
    });
  });

  it('SURVIVES A JSON ROUND TRIP WITH EVERY KEY STILL PRESENT', () => {
    // This is the test the null coercion exists for. `JSON.stringify` DELETES an undefined value,
    // so a page would receive a missing key and render a loading state where it should render a
    // labelled gap. Asserted through a real round trip rather than on the object.
    const p = projectCapability(record({ release_behaviour: [{ autonomy: 'autonomy:R1' }] }));
    const round = JSON.parse(JSON.stringify(p));
    expect(Object.keys(round).sort()).toEqual([...PROJECTED_CAPABILITY_FIELDS].sort());
    expect(Object.keys(round.release_behaviour[0]).sort())
      .toEqual([...PROJECTED_RELEASE_BEHAVIOUR_FIELDS].sort());
    expect(round.release_behaviour[0].behaviour).toBeNull();
  });

  it('trims a padded value rather than publishing the padding', () => {
    const p = projectCapability(record({
      release_behaviour: [{ autonomy: ' autonomy:R1 ', behaviour: ' b ', acceptance_criteria: 'c' }],
    }));
    expect(p.release_behaviour[0].autonomy).toBe('autonomy:R1');
    expect(p.release_behaviour[0].behaviour).toBe('b');
  });
});

describe('human_decision is a gate, so it is coerced rather than passed through', () => {
  it('is true only for a real boolean true', () => {
    expect(projectCapability(record({ human_decision: true })).human_decision).toBe(true);
  });

  it('a truthy STRING does not become a human gate nobody recorded', () => {
    // A research file that writes "yes" must not reach a page as a gate. `=== true` or nothing.
    expect(projectCapability(record({ human_decision: 'yes' })).human_decision).toBe(false);
    expect(projectCapability(record({ human_decision: 1 })).human_decision).toBe(false);
    expect(projectCapability(record({ human_decision: 'false' })).human_decision).toBe(false);
  });

  it('is false, not undefined, when the field is absent', () => {
    expect(projectCapability(record({ human_decision: undefined })).human_decision).toBe(false);
  });
});

describe('FILE ORDER, which panel 2 requires and the snapshot deliberately does not share', () => {
  it('preserves the order the records arrive in', () => {
    const r = projectCapabilities([
      record({ capability_id: 'm.c' }),
      record({ capability_id: 'm.a' }),
      record({ capability_id: 'm.b' }),
    ]);
    expect(ids(r)).toEqual(['m.c', 'm.a', 'm.b']);
  });

  it('does not sort, even when the input is exactly reverse-alphabetical', () => {
    // A sort hidden in the projection would look harmless and would be invisible on any input
    // that happens to be sorted already. This input makes a sort impossible to miss.
    const r = projectCapabilities(['m.z', 'm.y', 'm.x', 'm.w'].map((id) => record({ capability_id: id })));
    expect(ids(r)).toEqual(['m.z', 'm.y', 'm.x', 'm.w']);
  });

  it('DIFFERS FROM capability_id ORDER, so a positional join would mis-attribute rows', () => {
    // The snapshot's `authority[]` IS sorted by capability_id. These two arrays therefore do not
    // line up, and a page joining `capabilities[i]` to `authority[i]` would attribute every row
    // past the first difference to the wrong capability. Pinned here so neither order drifts into
    // the other without a failure.
    const input = ['m.c', 'm.a', 'm.b'].map((id) => record({ capability_id: id }));
    const fileOrder = ids(projectCapabilities(input));
    const sorted = [...fileOrder].sort();
    expect(fileOrder).not.toEqual(sorted);
    expect(sorted).toEqual(['m.a', 'm.b', 'm.c']);
  });
});

describe('the limit is optional, and truncation is never silent', () => {
  const five = ['a', 'b', 'c', 'd', 'e'].map((s) => record({ capability_id: `m.${s}` }));

  it('returns everything when no limit is given', () => {
    const r = projectCapabilities(five);
    expect(r.returned).toBe(5);
    expect(r.total).toBe(5);
    expect(r.capabilities).toHaveLength(5);
  });

  it('reports the REAL total when it truncates, so the cut is visible', () => {
    const r = projectCapabilities(five, 2);
    expect(r.capabilities).toHaveLength(2);
    expect(r.returned).toBe(2);
    expect(r.total).toBe(5);
    expect(ids(r)).toEqual(['m.a', 'm.b']);
  });

  it('does not pad when the limit exceeds the count', () => {
    const r = projectCapabilities(five, 500);
    expect(r.returned).toBe(5);
    expect(r.total).toBe(5);
  });

  it('a limit of zero returns nothing and still tells the truth about the total', () => {
    const r = projectCapabilities(five, 0);
    expect(r.capabilities).toHaveLength(0);
    expect(r.returned).toBe(0);
    expect(r.total).toBe(5);
  });

  it('A NEGATIVE LIMIT RETURNS NOTHING, not everything-but-the-last', () => {
    // The trap this clamp exists for: `Array.slice(0, -1)` counts from the END, so an unclamped
    // negative limit quietly returns all but the final row while looking like a refusal.
    for (const n of [-1, -5, -500]) {
      const r = projectCapabilities(five, n);
      expect(r.capabilities).toHaveLength(0);
      expect(r.returned).toBe(0);
      expect(r.total).toBe(5);
    }
  });

  it('floors a fractional limit instead of handing a float to slice', () => {
    expect(projectCapabilities(five, 2.9).returned).toBe(2);
  });

  it('treats NaN and Infinity as no limit at all', () => {
    expect(projectCapabilities(five, Number.NaN).returned).toBe(5);
    expect(projectCapabilities(five, Number.POSITIVE_INFINITY).returned).toBe(5);
  });

  it('an empty domain is zero rows and zero total, not a throw', () => {
    const r = projectCapabilities([]);
    expect(r).toEqual({ capabilities: [], returned: 0, total: 0 });
  });

  it('a non-array input is empty rather than a throw', () => {
    const r = projectCapabilities(null as unknown as CapabilityRecord[]);
    expect(r).toEqual({ capabilities: [], returned: 0, total: 0 });
  });
});

describe('pure: the snapshot it feeds carries no clock, so neither can this', () => {
  it('returns deeply equal output for the same input twice', () => {
    const input = [record({ capability_id: 'm.a' }), record({ capability_id: 'm.b' })];
    expect(projectCapabilities(input)).toEqual(projectCapabilities(input));
  });

  it('publishes no clock-derived key', () => {
    // `agentDomainSnapshot.ts` carries no wall-clock field on purpose: a timestamp in a file that
    // takes part in the sync comparison turns every sync into a commit whose only change is the
    // time it was written (FR-026). A field added here would land in that file.
    const serialised = JSON.stringify(projectCapabilities([record()]));
    for (const banned of ['generated_at', 'captured_at', 'projected_at', 'as_of', 'timestamp']) {
      expect(serialised).not.toContain(banned);
    }
  });

  it('does not mutate the record it was given', () => {
    const r = record({ capability_id: 'm.a', release_behaviour: [{ autonomy: 'autonomy:R1' }] });
    const before = JSON.stringify(r);
    projectCapability(r);
    expect(JSON.stringify(r)).toBe(before);
  });
});

describe('THE LEAK BOUNDARY, against the real 444 records rather than a fixture', () => {
  const matrices = loadAllMatrices();

  it('loads all ten domains', () => {
    expect(matrices.size).toBe(10);
  });

  it('projects every real domain without throwing, with a truthful total', () => {
    for (const [key, m] of matrices) {
      const r = projectCapabilities(m.capabilities);
      expect(r.total).toBe(m.capabilities.length);
      expect(r.returned).toBe(m.capabilities.length);
      expect(r.capabilities.length).toBeGreaterThan(0);
      expect(typeof key).toBe('string');
    }
  });

  it('PUBLISHES NO KEY OUTSIDE THE ALLOW-LIST, for any of the real records', () => {
    // The test that catches the research file somebody edits next month. A spread would pass every
    // other test in this file and fail only this one.
    const allowed = new Set(PROJECTED_CAPABILITY_FIELDS);
    const allowedInner = new Set(PROJECTED_RELEASE_BEHAVIOUR_FIELDS);
    const offenders: string[] = [];
    for (const [key, m] of matrices) {
      for (const p of projectCapabilities(m.capabilities).capabilities) {
        for (const k of Object.keys(p)) {
          if (!allowed.has(k)) offenders.push(`${key}/${p.capability_id}: ${k}`);
        }
        for (const rb of p.release_behaviour) {
          for (const k of Object.keys(rb)) {
            if (!allowedInner.has(k)) offenders.push(`${key}/${p.capability_id}/rb: ${k}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('preserves each real domain file order exactly', () => {
    for (const m of matrices.values()) {
      expect(ids(projectCapabilities(m.capabilities)))
        .toEqual(m.capabilities.map((c) => c.capability_id));
    }
  });

  it('carries real per-rung behaviour, which is what panel 4 had no source for', () => {
    // Measured 15 Nov 2026: 966 entries across 444 capabilities, every field populated, and no
    // capability with an empty ladder. Asserted as a floor rather than an exact count so adding a
    // capability does not fail the suite.
    let entries = 0;
    for (const m of matrices.values()) {
      for (const p of projectCapabilities(m.capabilities).capabilities) {
        entries += p.release_behaviour.length;
        for (const rb of p.release_behaviour) {
          expect(rb.autonomy).not.toBeNull();
          expect(rb.behaviour).not.toBeNull();
          expect(rb.acceptance_criteria).not.toBeNull();
        }
      }
    }
    expect(entries).toBeGreaterThanOrEqual(900);
  });
});
