/**
 * T13 -- the capability -> story coverage matrix.
 *
 * Run `20261007-school-agent-factory`, session CC-20261006-a4k7.
 *
 * Four things are proved here, and each one is a defect this programme could plausibly ship:
 *
 *  1. A gap is reported by CAPABILITY and COLUMN, not as a count. Proved against a FIXTURE that
 *     contains one confirmed capability with a complete path and one with a deliberately missing
 *     column, so the test can fail -- the live set is empty and would pass vacuously.
 *  2. `unknown` and zero never collapse into each other.
 *  3. An empty confirmed set is REPORTED, never rendered as complete coverage.
 *  4. Nothing about progress -- a completed story, a shipped release, accumulated evidence --
 *     raises authority. Mutation-proven below by name.
 */

import {
  coverageForAllDomains,
  coverageForDomain,
  coverageGaps,
  renderCoverageSummary,
  untracedStories,
  reviseCapability,
  authorityFromMatrix,
  mayRaiseAuthority,
  COSMETIC_FIELDS,
  ADVISORY_ONLY_FIELDS,
  REQUIRED_PATH_COLUMNS,
  EMPTY_PROGRESS,
  type CoverageRow,
  type ApprovalRecord,
  type ProgressSignals,
} from '../coverageMatrix';
import { loadAllMatrices, type CapabilityRecord } from '../capabilityRecord';
import { AGENT_DOMAIN_KEYS } from '../agentDomainRegistry';
import { planForAllDomains } from '../agentDomainStoryTemplates';
import * as fs from 'fs';
import * as path from 'path';

// ─────────────────────────────── fixtures ───────────────────────────────

/** A row with every path column filled. The shape a confirmed capability must reach. */
function completeRow(overrides: Partial<CoverageRow> = {}): CoverageRow {
  return {
    domain_key: 'curriculum',
    capability_id: 'cur-complete-1',
    capability_name: 'Fixture: complete path',
    current_state: 'partial',
    validation_state: 'confirmed',
    target_autonomy: 'autonomy:R5',
    effective_authority: null,
    release: 'r1',
    story_id: 'CUR-R1-001',
    tools: ['read_curriculum'],
    tests: ['curriculumX.test.ts'],
    evidence: ['curriculumService.ts:120'],
    approver: 'Ruth Kumera',
    blocked_by: [],
    observed_autonomy_per_research: 'unknown',
    ...overrides,
  };
}

function minimalCapability(overrides: Partial<CapabilityRecord> = {}): CapabilityRecord {
  return {
    capability_id: 'fx-1',
    name: 'Fixture capability',
    business_outcome: 'something measurable',
    intended_users: ['manager'],
    classification: 'inherited_from_legacy',
    source: 'verified_legacy_functionality',
    supporting_evidence: ['someFile.ts:10'],
    implementation_state: 'partial',
    requirement_validation_state: 'draft',
    validation_dependency: 'manager has not reviewed this',
    inputs: ['a'],
    outputs: ['b'],
    workflow: ['step one'],
    exceptions: ['it fails'],
    dependencies: [],
    application_pages: [],
    apis: [],
    source_modules: ['someFile.ts'],
    required_tools: ['read_thing'],
    human_decision: false,
    starting_autonomy: 'autonomy:R0',
    max_permitted_autonomy: 'autonomy:R5',
    blocked_by: [],
    release_behaviour: [],
    ...overrides,
  } as CapabilityRecord;
}

// ─────────────────────────────── the live matrix ───────────────────────────────

describe('coverage matrix over the real capability data', () => {
  const rows = coverageForAllDomains();

  it('covers every domain and every capability exactly once', () => {
    const matrices = loadAllMatrices();
    const expected = [...matrices.values()].reduce((n, m) => n + m.capabilities.length, 0);
    expect(expected).toBeGreaterThan(400); // positive control: the denominator is real
    expect(rows).toHaveLength(expected);
    expect(new Set(rows.map((r) => r.capability_id)).size).toBe(expected);
    expect(new Set(rows.map((r) => r.domain_key))).toEqual(new Set(AGENT_DOMAIN_KEYS));
  });

  it('resolves a release and a story for every capability', () => {
    // If this ever regresses it names the capabilities rather than printing a count.
    const orphans = rows.filter((r) => r.story_id === 'unknown').map((r) => r.capability_id);
    expect(orphans).toEqual([]);
  });

  it('names an accountable human for every capability', () => {
    const unowned = rows.filter((r) => r.approver === 'unknown').map((r) => r.capability_id);
    expect(unowned).toEqual([]);
  });

  it('confers NO effective authority anywhere, because no human has approved a level', () => {
    const withAuthority = rows.filter((r) => r.effective_authority !== null);
    expect(withAuthority.map((r) => r.capability_id)).toEqual([]);
  });

  it('claims no test coverage for capabilities that are not built', () => {
    expect(rows.every((r) => r.tests.length === 0)).toBe(true);
  });
});

/**
 * The research data describes the world; it does not grant authority over it.
 *
 * These tests exist because the first version of `coverageMatrix` resolved
 * `effective_authority` from a `current_approved_autonomy` key in the capability JSON, and
 * reported 15 learner_success capabilities as carrying approved authority -- in a run where no
 * human approved anything. The field is a researcher's observation, present in 2 of 10 files.
 */
describe('no field of the research data can confer authority', () => {
  const caps = [...loadAllMatrices().values()].flatMap((m) => m.capabilities);

  it('POSITIVE CONTROL: the field that caused the defect is STILL in the data', () => {
    // Without this, the test below could pass because the field was quietly deleted, and the
    // invariant would be protecting nothing.
    const withField = caps.filter((c) => 'current_approved_autonomy' in c);
    expect(withField.length).toBeGreaterThan(0);
    const nonUnknown = withField.filter((c) => c.current_approved_autonomy !== 'unknown');
    expect(nonUnknown.length).toBeGreaterThan(0); // 15 at the time of writing
  });

  it('POSITIVE CONTROL: the field is absent from most domains, so the record set is not uniform', () => {
    const domainsWithField = [...loadAllMatrices().values()]
      .filter((m) => m.capabilities.some((c) => 'current_approved_autonomy' in c))
      .map((m) => m.domain_key)
      .sort();
    expect(domainsWithField).toEqual(['curriculum', 'learner_success']);
  });

  it('and yet NO row carries authority', () => {
    const offenders = coverageForAllDomains()
      .filter((r) => r.effective_authority !== null)
      .map((r) => `${r.capability_id} -> ${r.effective_authority}`);
    expect(offenders).toEqual([]);
  });

  it('reports the observation in its own column instead of discarding it', () => {
    const observed = coverageForAllDomains().filter((r) => r.observed_autonomy_per_research !== 'unknown');
    expect(observed.length).toBeGreaterThan(0);
    // The reported value is the researcher's, unaltered...
    expect(observed.every((r) => /^autonomy:R\d$/.test(r.observed_autonomy_per_research))).toBe(true);
    // ...and it sits beside a null authority, which is the whole point of separating the columns.
    expect(observed.every((r) => r.effective_authority === null)).toBe(true);
  });

  it('names every advisory-only field, including the plan fields that are not approvals', () => {
    expect(ADVISORY_ONLY_FIELDS).toContain('current_approved_autonomy');
    // `starting_autonomy` and `max_permitted_autonomy` are a PLAN and a CEILING. A ceiling can
    // only ever lower a level (autonomyLadder.ts), so reading either as a grant would invert it.
    expect(ADVISORY_ONLY_FIELDS).toContain('starting_autonomy');
    expect(ADVISORY_ONLY_FIELDS).toContain('max_permitted_autonomy');
  });

  it('the row builder reads no autonomy field as an approval', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'coverageMatrix.ts'), 'utf8');
    const rowFor = src.slice(src.indexOf('function rowFor('), src.indexOf('export function coverageForDomain'));
    // EXTRACT the assigned values and check them, rather than trying to negate a pattern.
    // The first attempt here was `not.toMatch(/effective_authority:\s*(?!null)/)`, which can never
    // fail: `\s*` backtracks to zero width, and the lookahead then sits on a space, which is not
    // "null", so it matches every time -- including on the correct code. A negated regex with a
    // variable-width prefix is not a check.
    const assigned = [...rowFor.matchAll(/effective_authority:([^,]+)/g)].map((m) => m[1].trim());
    expect(assigned).toEqual(['null']);
    // And no call to effectiveAuthority smuggles one in.
    expect(rowFor).not.toMatch(/effectiveAuthority\s*\(/);
  });
});

// ─────────────────────── the empty confirmed set is reported ───────────────────────

describe('an empty confirmed set is reported, not dressed up as coverage', () => {
  const summary = renderCoverageSummary();

  it('reports zero confirmed capabilities, which is the true state today', () => {
    expect(summary.confirmed).toBe(0);
    expect(summary.draft).toBe(summary.total_capabilities);
    expect(summary.with_complete_path).toBe(0);
  });

  it('the headline says there is NO coverage rather than complete coverage', () => {
    expect(summary.headline).toMatch(/NO coverage to report/);
    expect(summary.headline).toMatch(/not complete coverage/);
    expect(summary.headline).not.toMatch(/100%|fully covered|all capabilities have/i);
  });

  it('does not divide by zero into a percentage', () => {
    expect(JSON.stringify(summary)).not.toMatch(/NaN|Infinity/);
  });

  it('POSITIVE CONTROL: with confirmed rows present the headline switches to real numbers', () => {
    // Proves the empty-set branch is a branch and not the only thing this function can say.
    const fixture = [completeRow(), completeRow({ capability_id: 'cur-gap-1', release: 'unknown' })];
    const s = renderCoverageSummary(fixture);
    expect(s.confirmed).toBe(2);
    expect(s.headline).not.toMatch(/NO coverage to report/);
    expect(s.headline).toMatch(/1 of 2 confirmed capabilities have a complete development path/);
  });
});

// ─────────────────────────── gaps, named by column ───────────────────────────

describe('gap reporting names the capability and the column', () => {
  it('reports no gaps over the live set, because nothing is confirmed yet', () => {
    // Vacuously true, and said out loud so it is never mistaken for coverage.
    expect(coverageGaps()).toEqual([]);
    expect(renderCoverageSummary().confirmed).toBe(0);
  });

  it('FIXTURE: finds the deliberately missing column and names it', () => {
    const good = completeRow();
    const bad = completeRow({ capability_id: 'cur-gap-1', release: 'unknown', tools: [] });
    const gaps = coverageGaps([good, bad]);

    expect(gaps.map((g) => g.capability_id)).not.toContain('cur-complete-1');
    expect(gaps.filter((g) => g.capability_id === 'cur-gap-1').map((g) => g.column).sort())
      .toEqual(['release', 'tools']);
    expect(gaps.every((g) => g.reason.length > 0)).toBe(true);
  });

  it('FIXTURE: every required column can be detected as missing', () => {
    // Guards against a column being listed in REQUIRED_PATH_COLUMNS but never actually checked.
    const empties: Record<string, Partial<CoverageRow>> = {
      target_autonomy: { target_autonomy: 'unknown' },
      release: { release: 'unknown' },
      story_id: { story_id: 'unknown' },
      tools: { tools: [] },
      evidence: { evidence: [] },
      approver: { approver: 'unknown' },
    };
    for (const col of REQUIRED_PATH_COLUMNS) {
      const gaps = coverageGaps([completeRow(empties[col])]);
      expect(gaps.map((g) => g.column)).toEqual([col]);
    }
  });

  it('a DRAFT capability with an incomplete path is not a gap', () => {
    const draft = completeRow({ validation_state: 'draft', release: 'unknown', tools: [] });
    expect(coverageGaps([draft])).toEqual([]);
  });
});

// ─────────────────────── unknown is not zero ───────────────────────

describe('unknown and zero are counted separately and never collapse', () => {
  it('counts unknown cells independently of the gap count', () => {
    const rows = [
      completeRow({ capability_id: 'a', validation_state: 'draft', release: 'unknown' }),
      completeRow({ capability_id: 'b', validation_state: 'draft', story_id: 'unknown' }),
    ];
    const s = renderCoverageSummary(rows);
    expect(s.unknown_cells).toBe(2); // two unknowns...
    expect(s.gaps).toBe(0);          // ...and zero gaps, because neither is confirmed
    expect(s.unknown_cells).not.toBe(s.gaps);
  });

  it('an empty list is zero unknowns, not unknown', () => {
    const s = renderCoverageSummary([]);
    expect(s.unknown_cells).toBe(0);
    expect(s.total_capabilities).toBe(0);
    expect(s.headline).toMatch(/NO coverage to report/);
  });

  it('a row with a filled column contributes no unknown', () => {
    expect(renderCoverageSummary([completeRow()]).unknown_cells).toBe(0);
  });
});

// ─────────────────── authority never rises from progress ───────────────────

describe('no story, release or evidence total raises runtime authority', () => {
  const row = completeRow();

  const everythingDone: ProgressSignals = {
    completed_story_ids: ['CUR-R1-001', 'CUR-R1-002', 'CUR-R2-001'],
    shipped_releases: ['r0', 'r1', 'r2'],
    evidence_count: 99,
    approvals: [], // the one thing that is missing
  };

  /**
   * THE LOAD-BEARING TEST.
   *
   * MUTATION PROOF: in `authorityFromMatrix`, make a completed story confer authority --
   *   if (!approved) {
   * +   if (progress.completed_story_ids.length > 0) {
   * +     return { authority: 'autonomy:R5', reason: 'stories complete' };
   * +   }
   * -- and THIS test, `no amount of completed work confers authority without an approval`,
   * dies. Verified by applying that edit and re-running: 1 failed. Reverted by re-applying the
   * original expression, never by `git checkout`.
   */
  it('no amount of completed work confers authority without an approval', () => {
    const result = authorityFromMatrix(row, everythingDone);
    expect(result.authority).toBeNull();
    expect(result.reason).toMatch(/no recorded human approval/);
    expect(mayRaiseAuthority(row, [])).toBe(false);
  });

  it('says out loud which progress signals it is ignoring', () => {
    // A silent refusal is indistinguishable from a bug the next time someone reads the output.
    const r = authorityFromMatrix(row, everythingDone);
    expect(r.reason).toMatch(/3 stories complete/);
    expect(r.reason).toMatch(/3 releases shipped/);
    expect(r.reason).toMatch(/99 evidence rows/);
  });

  it('a recorded approval is necessary AND still not sufficient on its own', () => {
    const approval: ApprovalRecord = {
      capability_id: row.capability_id,
      approved_by: 'Ruth Kumera',
      approved_at: '2026-10-12T00:00:00.000Z',
      depends_on_fields: ['workflow'],
    };
    // The approval exists, so the matrix stops refusing -- and the row still carries no level,
    // because `effective_authority` is computed from an approved AUTONOMY LEVEL, which is absent.
    const r = authorityFromMatrix(row, { ...EMPTY_PROGRESS, approvals: [approval] });
    expect(r.reason).toBe('human approval on record');
    expect(r.authority).toBeNull();

    // With a level on the row as well, authority is exactly that level -- never more.
    const withLevel = completeRow({ effective_authority: 'autonomy:R3' });
    const r2 = authorityFromMatrix(withLevel, { ...everythingDone, approvals: [approval] });
    expect(r2.authority).toBe('autonomy:R3');
  });

  it('an approval for a DIFFERENT capability confers nothing here', () => {
    const other: ApprovalRecord = {
      capability_id: 'some-other-capability',
      approved_by: 'Ruth Kumera',
      approved_at: '2026-10-12T00:00:00.000Z',
      depends_on_fields: ['workflow'],
    };
    expect(authorityFromMatrix(row, { ...EMPTY_PROGRESS, approvals: [other] }).authority).toBeNull();
  });

  it('an approval with a blank approver is not an approval', () => {
    const blank: ApprovalRecord = {
      capability_id: row.capability_id,
      approved_by: '   ',
      approved_at: '2026-10-12T00:00:00.000Z',
      depends_on_fields: [],
    };
    expect(mayRaiseAuthority(completeRow({ effective_authority: 'autonomy:R3' }), [blank])).toBe(false);
  });
});

// ─────────────────── the inverse direction: stories trace back ───────────────────

describe('every implementation story traces to a capability or a justified foundation', () => {
  it('leaves no implementation story untraced', () => {
    expect(untracedStories().map((s) => s.story_id)).toEqual([]);
  });

  it('POSITIVE CONTROL: there are implementation stories to check', () => {
    const impl = planForAllDomains().flatMap((p) => p.stories).filter((s) => s.kind === 'implementation');
    expect(impl.length).toBeGreaterThan(300);
  });
});

// ─────────────────────── revision produces a visible diff ───────────────────────

describe('revising a requirement invalidates only what it affects', () => {
  const base = minimalCapability({ capability_id: 'rev-1' });

  const workflowApproval: ApprovalRecord = {
    capability_id: 'rev-1',
    approved_by: 'Sarbjit Kaur',
    approved_at: '2026-10-01T00:00:00.000Z',
    depends_on_fields: ['workflow', 'exceptions'],
  };
  const toolApproval: ApprovalRecord = {
    capability_id: 'rev-1',
    approved_by: 'Sarbjit Kaur',
    approved_at: '2026-10-02T00:00:00.000Z',
    depends_on_fields: ['required_tools'],
  };
  const approvals = [workflowApproval, toolApproval];

  it('a MATERIAL change invalidates the dependent approval and preserves the other', () => {
    const next = minimalCapability({ capability_id: 'rev-1', workflow: ['step one', 'step two'] });
    const impact = reviseCapability(base, next, approvals);

    expect(impact.kind).toBe('material');
    expect(impact.material_fields).toEqual(['workflow']);
    expect(impact.invalidated_approvals).toEqual([workflowApproval]);
    expect(impact.preserved_approvals).toEqual([toolApproval]);
  });

  it('a COSMETIC change cascades to nothing', () => {
    const next = minimalCapability({ capability_id: 'rev-1', name: 'Fixture capability (renamed)' });
    const impact = reviseCapability(base, next, approvals);

    expect(impact.kind).toBe('cosmetic');
    expect(impact.cosmetic_fields).toEqual(['name']);
    expect(impact.material_fields).toEqual([]);
    expect(impact.invalidated_approvals).toEqual([]);
    expect(impact.preserved_approvals).toEqual(approvals);
  });

  it('POSITIVE CONTROL: a rule that invalidated everything would fail the preservation test', () => {
    // The naive "any edit invalidates every approval" implementation is safe-looking and wrong:
    // it destroys the selective reapproval the policy exists to enable. This asserts the
    // difference is observable, so the naive version cannot pass unnoticed.
    const next = minimalCapability({ capability_id: 'rev-1', workflow: ['changed'] });
    const impact = reviseCapability(base, next, approvals);
    const naive = { invalidated: approvals, preserved: [] as ApprovalRecord[] };

    expect(impact.invalidated_approvals.length).toBeLessThan(naive.invalidated.length);
    expect(impact.preserved_approvals.length).toBeGreaterThan(naive.preserved.length);
  });

  it('the revision is VISIBLE: a diff names the field and both values', () => {
    const next = minimalCapability({ capability_id: 'rev-1', workflow: ['step one', 'step two'] });
    const impact = reviseCapability(base, next, approvals);
    expect(impact.diff).toHaveLength(1);
    expect(impact.diff[0]).toMatch(/^workflow: /);
    expect(impact.diff[0]).toMatch(/step two/);
  });

  it('an unchanged capability reports no change and touches no approval', () => {
    const impact = reviseCapability(base, minimalCapability({ capability_id: 'rev-1' }), approvals);
    expect(impact.kind).toBe('none');
    expect(impact.changed_fields).toEqual([]);
    expect(impact.invalidated_approvals).toEqual([]);
  });

  it('classification FAILS CLOSED: an unclassified field is material, not cosmetic', () => {
    // A field nobody thought about must not quietly stop invalidating approvals.
    const next = minimalCapability({ capability_id: 'rev-1', some_new_field: 'added later' } as Partial<CapabilityRecord>);
    const impact = reviseCapability(base, next, [{
      capability_id: 'rev-1',
      approved_by: 'Sarbjit Kaur',
      approved_at: '2026-10-01T00:00:00.000Z',
      depends_on_fields: ['some_new_field'],
    }]);
    expect(impact.kind).toBe('material');
    expect(impact.invalidated_approvals).toHaveLength(1);
  });

  it('the cosmetic list is short and excludes anything that changes meaning', () => {
    expect(COSMETIC_FIELDS.length).toBeLessThanOrEqual(4);
    for (const material of ['workflow', 'required_tools', 'human_decision', 'max_permitted_autonomy',
      'permissions_by_environment', 'release_behaviour', 'classification', 'business_outcome']) {
      expect(COSMETIC_FIELDS).not.toContain(material);
    }
  });

  it('an approval for another capability is never invalidated by this one changing', () => {
    const foreign: ApprovalRecord = {
      capability_id: 'rev-2',
      approved_by: 'Sarbjit Kaur',
      approved_at: '2026-10-01T00:00:00.000Z',
      depends_on_fields: ['workflow'],
    };
    const next = minimalCapability({ capability_id: 'rev-1', workflow: ['changed'] });
    const impact = reviseCapability(base, next, [foreign]);
    expect(impact.invalidated_approvals).toEqual([]);
    expect(impact.preserved_approvals).toEqual([foreign]);
  });
});

// ─────────────────────────── per-domain shape ───────────────────────────

describe('per-domain coverage', () => {
  it.each(AGENT_DOMAIN_KEYS)('%s produces rows scoped to itself', (key) => {
    const rows = coverageForDomain(key);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.domain_key === key)).toBe(true);
  });

  it('refuses an unknown domain rather than returning an empty matrix', () => {
    expect(() => coverageForDomain('not_a_domain')).toThrow(/No capability matrix/);
  });
});
