/**
 * caseStudyProvenance — unit tests for the source-precedence engine (T009).
 *
 * NO DATABASE, NO NETWORK, NO WALL CLOCK. The module under test is pure, so
 * there is nothing to mock; the one impure neighbour it touches is the snapshot
 * builder's single `console.log`, which is captured. The suite therefore runs
 * under `jest.ci.config.ts` with `DATABASE_URL` unset.
 *
 * The three acceptance criteria map onto the first three `describe` blocks:
 * AC1 is SIX tests, one per adjacent pair of the ladder — not one test walking
 * the whole order, because an off-by-one at a single boundary is exactly the
 * bug that would let a repo-extracted value outrank a human's decision, and a
 * whole-order assertion can pass while one boundary is inverted.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  CaseStudyProvenanceError,
  TIER_ORIGIN_KINDS,
  classifyAiForbiddenPath,
  describeSnapshotProvenance,
  enumerateSnapshotPaths,
  existingProvenanceAsCandidates,
  findAiForbiddenKey,
  findUnknownProvenanceFields,
  isCaseStudyProvenanceError,
  isSupportedProvenanceTier,
  provenanceAncestors,
  provenanceLogRef,
  provenanceTierRank,
  resolveCaseStudyProvenance,
} from '../caseStudyProvenance';
import type { AiForbiddenFieldClass, CaseStudyFieldCandidate } from '../caseStudyProvenance';
import { CASE_STUDY_PROVENANCE_PRECEDENCE } from '../../../types/caseStudyProvenance';
import type {
  CaseStudyProvenanceOrigin, CaseStudyProvenanceTier,
} from '../../../types/caseStudyProvenance';
import { buildCaseStudySnapshot } from '../caseStudySnapshotBuilder';
import { opaqueRepoRef } from '../caseStudyRepoReader';
import { fixedClock, makePlatform, makeRepo, SHA_A } from './snapshotFixtures';
import type { SnapshotPlatformFacts } from '../caseStudySnapshotInput';

let logSpy: jest.SpyInstance;
beforeEach(() => { logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined); });
afterEach(() => { logSpy.mockRestore(); jest.restoreAllMocks(); });

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'caseStudyProvenance.ts'), 'utf8');

/** A path every tier — including tier 7 — is allowed to supply. */
const NEUTRAL_PATH = 'identity.standfirst';

const ORIGINS: Readonly<Record<CaseStudyProvenanceTier, CaseStudyProvenanceOrigin>> = {
  human_override: { kind: 'human', actor: 'reviewer@example.test' },
  approved_metric_evidence: { kind: 'case_study_metric', metricId: 'metric-1' },
  project_facts: { kind: 'project_field', projectId: 'project-1', fieldName: 'name' },
  evidence_or_artifact: { kind: 'evidence_record', evidenceRecordId: 'evidence-1' },
  repo_manifest: {
    kind: 'manifest', repoOwner: 'colaberry', repoName: 'accelerator',
    manifestPath: 'case-study.json',
  },
  repo_extraction: {
    kind: 'repo_extraction', repoOwner: 'colaberry', repoName: 'accelerator', commitSha: SHA_A,
  },
  ai_draft: {
    kind: 'ai_draft', model: 'test-model', promptKey: 'standfirst', factInputs: ['README.md'],
  },
};

const candidate = (
  tier: CaseStudyProvenanceTier, over: Partial<CaseStudyFieldCandidate> = {},
): CaseStudyFieldCandidate => ({
  path: NEUTRAL_PATH,
  value: `value from ${tier}`,
  tier,
  origin: ORIGINS[tier],
  recordedAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

/* ── AC1 — one test per adjacent pair of the precedence ladder ───────────── */

describe('AC1 — precedence, proved one adjacent pair at a time', () => {
  /** Resolves in BOTH array orders, so no verdict can come from iteration order. */
  const assertBeats = (strong: CaseStudyProvenanceTier, weak: CaseStudyProvenanceTier) => {
    const weakFirst = resolveCaseStudyProvenance([candidate(weak), candidate(strong)]);
    const strongFirst = resolveCaseStudyProvenance([candidate(strong), candidate(weak)]);
    expect(weakFirst.values).toEqual(strongFirst.values);
    expect(weakFirst.provenance).toEqual(strongFirst.provenance);

    expect(weakFirst.values[NEUTRAL_PATH]).toBe(`value from ${strong}`);
    expect(weakFirst.provenance[NEUTRAL_PATH]?.tier).toBe(strong);
    expect(weakFirst.provenance[NEUTRAL_PATH]?.origin).toEqual(ORIGINS[strong]);
    expect(weakFirst.rejected).toEqual([
      expect.objectContaining({ path: NEUTRAL_PATH, tier: weak, reason: 'outranked', stage: 'ranked' }),
    ]);
  };

  it('1 v 2 — a human override beats an approved metric/evidence value', () => {
    assertBeats('human_override', 'approved_metric_evidence');
  });
  it('2 v 3 — an approved metric/evidence value beats a Project fact', () => {
    assertBeats('approved_metric_evidence', 'project_facts');
  });
  it('3 v 4 — a Project fact beats an EvidenceRecord/PortfolioArtifact', () => {
    assertBeats('project_facts', 'evidence_or_artifact');
  });
  it('4 v 5 — an EvidenceRecord/PortfolioArtifact beats a repo manifest', () => {
    assertBeats('evidence_or_artifact', 'repo_manifest');
  });
  it('5 v 6 — a repo manifest beats deterministic repo extraction', () => {
    assertBeats('repo_manifest', 'repo_extraction');
  });
  it('6 v 7 — deterministic repo extraction beats an AI draft', () => {
    assertBeats('repo_extraction', 'ai_draft');
  });

  it('all seven at once: the human wins and the other six are reported outranked', () => {
    const all = CASE_STUDY_PROVENANCE_PRECEDENCE.map((t) => candidate(t));
    const result = resolveCaseStudyProvenance([...all].reverse());
    expect(result.provenance[NEUTRAL_PATH]?.tier).toBe('human_override');
    expect(result.rejected).toHaveLength(6);
    expect(result.rejected.every((r) => r.reason === 'outranked')).toBe(true);
    expect(result.unresolved).toEqual([]);
  });

  it('reads the ladder from types/caseStudyProvenance rather than re-declaring it', () => {
    expect(SOURCE).toMatch(/import \{ CASE_STUDY_PROVENANCE_PRECEDENCE \}/);
    expect(SOURCE).not.toMatch(/\[\s*'human_override',/);
    expect(provenanceTierRank('human_override')).toBe(0);
    expect(provenanceTierRank('ai_draft')).toBe(CASE_STUDY_PROVENANCE_PRECEDENCE.length - 1);
  });
});

/* ── AC2 — every field in a built snapshot carries provenance ────────────── */

const richPlatform = (): SnapshotPlatformFacts => makePlatform({
  projectId: 'project-1',
  standfirst: 'A copilot for the bottling line.',
  summary: 'What the team built and how it was measured.',
  industry: 'manufacturing',
  primaryCapability: 'agent_orchestration',
  programKey: 'accelerator',
  programLabel: 'Enterprise AI Leadership Accelerator',
  builtByType: 'client_team',
  deliverables: ['runbook', 'dashboard'],
  projectStatus: 'in_progress',
  engagementWindow: {
    start: '2026-01-05', end: '2026-04-05', durationLabel: '13 weeks',
    verification: { class: 'verified', method: 'platform' },
  },
  productionStatus: { status: 'in_progress', verification: { class: 'pending', method: 'internal' } },
  situation: {
    narrative: ['Changeovers ran long.'],
    constraints: ['No PII leaves the plant.'],
    goals: ['Cut changeover time.'],
    verification: { class: 'verified', method: 'client' },
  },
  timeline: [{
    date: '2026-02-01', label: 'First agent shipped', source: 'milestone',
    verification: { class: 'verified', method: 'platform' },
  }],
  roadmap: [{
    label: 'Extend to line 2', status: 'in_progress',
    verification: { class: 'pending', method: 'internal' },
  }],
  contributors: [{ displayMode: 'role_only', role: 'Data engineer', kind: 'client_team' }],
  artifacts: [{
    id: 'artifact-1', artifactType: 'architecture', title: 'System diagram',
    sourceType: 'repo', visibility: 'public', status: 'approved',
  }],
  metrics: [{
    key: 'changeover_time', label: 'Changeover time', valueDisplay: '18 minutes',
    metricType: 'delivery', isHeadline: true, publishable: true,
    verification: { class: 'verified', method: 'repo' },
  }],
  architectureNarrative: ['Three services behind one gateway.'],
  measurementNarrative: ['Measured over ten changeovers.'],
});

const buildRichDraft = () => buildCaseStudySnapshot({
  caseStudyId: 'cs-1', platform: richPlatform(), repos: [makeRepo()], now: fixedClock(),
});

describe('AC2 — every field in a built snapshot carries a provenance entry', () => {
  it('resolves ZERO fields to provenance unknown', () => {
    const draft = buildRichDraft();
    expect(findUnknownProvenanceFields(draft.content, draft.provenance)).toEqual([]);
  });

  it('the assertion is not vacuous — the snapshot has many enumerated fields', () => {
    const draft = buildRichDraft();
    const paths = enumerateSnapshotPaths(draft.content);
    expect(paths.length).toBeGreaterThan(30);
    expect(paths).toContain('identity.title');
    expect(paths).toContain('heroMetrics[0].valueDisplay');
    expect(paths).toContain('repositories[0].repoOwner');
  });

  it('every described field names the entry that covers it', () => {
    const draft = buildRichDraft();
    for (const field of describeSnapshotProvenance(draft.content, draft.provenance)) {
      expect(field.coveredBy).not.toBeNull();
      expect(field.tier).not.toBe('unknown');
    }
  });

  it('the guard bites: removing one section entry reports exactly that section unknown', () => {
    const draft = buildRichDraft();
    const { identity: _dropped, ...withoutIdentity } = draft.provenance;
    const unknown = findUnknownProvenanceFields(draft.content, withoutIdentity);
    expect(unknown.length).toBeGreaterThan(0);
    expect(unknown.every((p) => p.startsWith('identity'))).toBe(true);
  });

  it('a field-level entry covers a field whose section has none', () => {
    const draft = buildRichDraft();
    const fieldOnly = { 'identity.title': draft.provenance.identity };
    const described = describeSnapshotProvenance(draft.content, fieldOnly)
      .find((f) => f.path === 'identity.title');
    expect(described?.coveredBy).toBe('identity.title');
  });

  it('walks a field back to its section the way the override parser writes paths', () => {
    expect(provenanceAncestors('heroMetrics[0].valueDisplay'))
      .toEqual(['heroMetrics[0].valueDisplay', 'heroMetrics[0]', 'heroMetrics']);
    expect(provenanceAncestors('identity')).toEqual(['identity']);
  });
});

/* ── AC3 — a later sync never silently overwrites a human override ───────── */

describe('AC3 — a later sync never silently overwrites a human override', () => {
  const TITLE = 'identity.title';
  const previous = () => resolveCaseStudyProvenance([
    candidate('human_override', { path: TITLE, value: 'Bottling line copilot' }),
  ]);
  const resync = (syncedAt = '2026-09-01T00:00:00.000Z') => {
    const before = previous();
    return resolveCaseStudyProvenance([
      ...existingProvenanceAsCandidates(before.provenance, before.values),
      candidate('repo_extraction', { path: TITLE, value: 'accelerator', recordedAt: syncedAt }),
    ]);
  };

  it('keeps the human value and the human tier after a later repo sync', () => {
    const after = resync();
    expect(after.values[TITLE]).toBe('Bottling line copilot');
    expect(after.provenance[TITLE]?.tier).toBe('human_override');
    expect(after.provenance[TITLE]?.origin).toEqual(ORIGINS.human_override);
  });

  it('is not SILENT — the discarded sync value is reported back to the caller', () => {
    const after = resync();
    expect(after.preservedOverrides).toEqual([TITLE]);
    expect(after.rejected).toEqual([expect.objectContaining({
      path: TITLE, tier: 'repo_extraction', reason: 'outranked', stage: 'ranked',
    })]);
  });

  it('holds even when the sync value is far newer than the override', () => {
    expect(resync('2099-01-01T00:00:00.000Z').values[TITLE]).toBe('Bottling line copilot');
  });

  it('a second identical sync changes nothing (idempotent)', () => {
    expect(JSON.stringify(resync())).toBe(JSON.stringify(resync()));
  });

  it('preservedOverrides stays empty when nothing tried to overwrite', () => {
    expect(previous().preservedOverrides).toEqual([]);
  });

  it('existingProvenanceAsCandidates drops values with no recorded entry', () => {
    const before = previous();
    const folded = existingProvenanceAsCandidates(before.provenance, {
      ...before.values, 'identity.summary': 'orphan with no provenance',
    });
    expect(folded.map((c) => c.path)).toEqual([TITLE]);
  });
});

/* ── tier 7 is REJECTED OUTRIGHT, not merely outranked ───────────────────── */

const FORBIDDEN: readonly (readonly [string, AiForbiddenFieldClass])[] = [
  ['heroMetrics[0].valueDisplay', 'metric'],
  ['identity.organizationDisplayName', 'organization_identity'],
  ['situation.quote', 'quote'],
  ['identity.organizationNamingConsent', 'consent'],
  ['identity.productionStatus.status', 'production_claim'],
  ['measurement.roiSummary', 'roi'],
];

describe('an AI draft is rejected outright for the six absolute NOs', () => {
  for (const [forbiddenPath, cls] of FORBIDDEN) {
    it(`rejects an AI candidate for ${forbiddenPath} (${cls}) when it is the ONLY candidate`, () => {
      const result = resolveCaseStudyProvenance([
        candidate('ai_draft', { path: forbiddenPath, value: 'a plausible sentence' }),
      ]);
      // Nothing to outrank it, and still no value: the rejection is outright.
      expect(result.values).toEqual({});
      expect(result.provenance).toEqual({});
      expect(result.unresolved).toEqual([forbiddenPath]);
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0]).toMatchObject({
        path: forbiddenPath, tier: 'ai_draft', stage: 'screened', reason: 'ai_forbidden_field',
      });
      expect(result.rejected[0].detail).toContain(cls);
    });
  }

  it('the rejection is never recorded as `outranked` — nothing outranked it', () => {
    for (const [forbiddenPath] of FORBIDDEN) {
      const result = resolveCaseStudyProvenance([candidate('ai_draft', { path: forbiddenPath })]);
      expect(result.rejected.some((r) => r.reason === 'outranked')).toBe(false);
      expect(result.rejected.some((r) => r.stage === 'ranked')).toBe(false);
    }
  });

  it('CONTROL: the same tier 7 candidate at a permitted path wins when unopposed', () => {
    const result = resolveCaseStudyProvenance([candidate('ai_draft')]);
    expect(result.values[NEUTRAL_PATH]).toBe('value from ai_draft');
    expect(result.provenance[NEUTRAL_PATH]?.tier).toBe('ai_draft');
    expect(result.rejected).toEqual([]);
  });

  it('CONTROL: a NON-ai tier may supply a forbidden field, so the rule is tier-specific', () => {
    const result = resolveCaseStudyProvenance([
      candidate('approved_metric_evidence', {
        path: 'heroMetrics[0].valueDisplay', value: '18 minutes',
      }),
    ]);
    expect(result.values['heroMetrics[0].valueDisplay']).toBe('18 minutes');
    expect(result.rejected).toEqual([]);
  });

  it('rejects a whole-section AI candidate whose VALUE hides a forbidden key', () => {
    const result = resolveCaseStudyProvenance([candidate('ai_draft', {
      path: 'identity',
      value: { title: 'A title', organizationDisplayName: 'Acme Bottling' },
    })]);
    expect(result.values).toEqual({});
    expect(result.rejected[0]).toMatchObject({ stage: 'screened', reason: 'ai_forbidden_field' });
    expect(result.rejected[0].detail).toContain('organization_identity');
    expect(result.rejected[0].detail).toContain('organizationDisplayName');
  });

  it('rejects an AI draft that wears a stronger tier, before any comparison', () => {
    const result = resolveCaseStudyProvenance([{
      ...candidate('ai_draft', { path: 'heroMetrics[0].valueDisplay' }),
      tier: 'approved_metric_evidence',
    }]);
    expect(result.values).toEqual({});
    expect(result.rejected[0]).toMatchObject({ stage: 'screened', reason: 'origin_tier_mismatch' });
  });

  it('classifies each forbidden path to the documented class, and permits the rest', () => {
    for (const [forbiddenPath, cls] of FORBIDDEN) {
      expect(classifyAiForbiddenPath(forbiddenPath)).toBe(cls);
    }
    for (const permitted of [
      'identity.standfirst', 'identity.summary', 'situation.narrative[0]',
      'architecture.narrative[1]', 'taxonomy.capabilities[0]', 'buildTimeline[0].label',
    ]) {
      expect(classifyAiForbiddenPath(permitted)).toBeNull();
    }
  });

  it('finds a forbidden key nested inside arrays as well as objects', () => {
    expect(findAiForbiddenKey({ contributors: [{ role: 'x' }, { displayName: 'Jane' }] }))
      .toEqual({ cls: 'organization_identity', at: 'contributors[1].displayName' });
    expect(findAiForbiddenKey({ narrative: ['plain prose'] })).toBeNull();
  });
});

/* ── ties inside one tier ────────────────────────────────────────────────── */

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, i) => permutations([
    ...items.slice(0, i), ...items.slice(i + 1),
  ]).map((rest) => [item, ...rest]));
}

describe('ties inside one tier resolve deterministically, never by iteration order', () => {
  const sameInstant = '2026-01-01T00:00:00.000Z';
  const keyed = [
    candidate('project_facts', { value: 'alpha', candidateKey: 'a', recordedAt: sameInstant }),
    candidate('project_facts', { value: 'beta', candidateKey: 'b', recordedAt: sameInstant }),
    candidate('project_facts', { value: 'gamma', candidateKey: 'c', recordedAt: sameInstant }),
  ];

  it('every one of the six permutations produces byte-identical output', () => {
    const results = permutations(keyed).map((p) => JSON.stringify(resolveCaseStudyProvenance(p)));
    expect(results).toHaveLength(6);
    expect(new Set(results).size).toBe(1);
  });

  it('the stable key breaks the tie — lowest key wins', () => {
    expect(resolveCaseStudyProvenance(keyed).values[NEUTRAL_PATH]).toBe('alpha');
  });

  it('with no stable key it falls back to the origin, still deterministically', () => {
    const unkeyed = ['metric-c', 'metric-a', 'metric-b'].map((metricId) => candidate(
      'approved_metric_evidence',
      { value: metricId, recordedAt: sameInstant, origin: { kind: 'case_study_metric', metricId } },
    ));
    const winners = permutations(unkeyed)
      .map((p) => resolveCaseStudyProvenance(p).values[NEUTRAL_PATH]);
    expect(new Set(winners).size).toBe(1);
    expect(['metric-a', 'metric-b', 'metric-c']).toContain(winners[0]);
  });

  it('within a tier the LATER recordedAt wins, matching caseStudySnapshotOverrides', () => {
    const result = resolveCaseStudyProvenance([
      candidate('human_override', { value: 'first', recordedAt: '2026-01-01T00:00:00.000Z' }),
      candidate('human_override', { value: 'second', recordedAt: '2026-06-01T00:00:00.000Z' }),
    ]);
    expect(result.values[NEUTRAL_PATH]).toBe('second');
  });
});

/* ── failing closed ──────────────────────────────────────────────────────── */

describe('unknown and unsupported values fail closed', () => {
  const bogus = (over: Partial<CaseStudyFieldCandidate> = {}): CaseStudyFieldCandidate => ({
    ...candidate('project_facts', over), tier: 'super_override' as CaseStudyProvenanceTier,
  });

  it('an unrecognised tier is screened out, never ranked and never a winner', () => {
    const result = resolveCaseStudyProvenance([bogus({ value: 'from nowhere' })]);
    expect(result.values).toEqual({});
    expect(result.unresolved).toEqual([NEUTRAL_PATH]);
    expect(result.rejected[0]).toMatchObject({ stage: 'screened', reason: 'unsupported_tier' });
  });

  it('an unrecognised tier does not even beat the WEAKEST real tier', () => {
    const result = resolveCaseStudyProvenance([bogus({ value: 'from nowhere' }), candidate('ai_draft')]);
    expect(result.provenance[NEUTRAL_PATH]?.tier).toBe('ai_draft');
    expect(result.values[NEUTRAL_PATH]).toBe('value from ai_draft');
  });

  it('does not silently coerce an unknown tier to a rank', () => {
    expect(provenanceTierRank('super_override')).toBe(-1);
    expect(isSupportedProvenanceTier('super_override')).toBe(false);
    expect(isSupportedProvenanceTier(undefined)).toBe(false);
    expect(isSupportedProvenanceTier('human_override')).toBe(true);
  });

  it('rejects an origin whose kind does not belong to its tier', () => {
    const result = resolveCaseStudyProvenance([
      candidate('human_override', { origin: ORIGINS.repo_extraction }),
    ]);
    expect(result.values).toEqual({});
    expect(result.rejected[0]).toMatchObject({ stage: 'screened', reason: 'origin_tier_mismatch' });
  });

  it('every tier in the ladder has an origin allow-list — no tier defaults open', () => {
    for (const tier of CASE_STUDY_PROVENANCE_PRECEDENCE) {
      expect(TIER_ORIGIN_KINDS[tier].length).toBeGreaterThan(0);
      expect(TIER_ORIGIN_KINDS[tier]).toContain(ORIGINS[tier].kind);
    }
  });

  it('a malformed candidate is reported invalid rather than merged', () => {
    const result = resolveCaseStudyProvenance([
      { ...candidate('project_facts'), path: '' } as CaseStudyFieldCandidate,
    ]);
    expect(result.values).toEqual({});
    expect(result.rejected[0]).toMatchObject({ stage: 'invalid', reason: 'invalid_candidate' });
  });

  it('a non-array input throws ProvenanceValidationError before any work', () => {
    let thrown: unknown;
    try {
      resolveCaseStudyProvenance(undefined as unknown as CaseStudyFieldCandidate[]);
    } catch (err) { thrown = err; }
    expect(isCaseStudyProvenanceError(thrown)).toBe(true);
    expect((thrown as CaseStudyProvenanceError).error_class).toBe('ProvenanceValidationError');
    expect((thrown as CaseStudyProvenanceError).http_status).toBe(400);
  });

  it('an empty candidate list resolves to an empty, non-throwing result', () => {
    expect(resolveCaseStudyProvenance([])).toEqual({
      values: {}, provenance: {}, rejected: [], unresolved: [], preservedOverrides: [],
    });
  });
});

/* ── purity ──────────────────────────────────────────────────────────────── */

describe('pure and deterministic', () => {
  const ladder = () => CASE_STUDY_PROVENANCE_PRECEDENCE.map((t) => candidate(t));

  it('same inputs produce byte-identical output', () => {
    expect(JSON.stringify(resolveCaseStudyProvenance(ladder())))
      .toBe(JSON.stringify(resolveCaseStudyProvenance(ladder())));
  });

  it('reads neither the clock nor the random source', () => {
    const nowSpy = jest.spyOn(Date, 'now');
    const randomSpy = jest.spyOn(Math, 'random');
    resolveCaseStudyProvenance(ladder());
    expect(nowSpy).not.toHaveBeenCalled();
    expect(randomSpy).not.toHaveBeenCalled();
  });

  it('has no clock, randomness, logging or I/O in its source at all', () => {
    expect(SOURCE).not.toMatch(/new Date\(/);
    expect(SOURCE).not.toMatch(/Date\.now\(/);
    expect(SOURCE).not.toMatch(/Math\.random\(/);
    expect(SOURCE).not.toMatch(/console\./);
    expect(SOURCE).not.toMatch(/require\('fs'\)|from 'fs'/);
  });

  it('does not mutate the candidates it is given', () => {
    const input = ladder();
    const before = JSON.stringify(input);
    resolveCaseStudyProvenance(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});

/* ── log safety ──────────────────────────────────────────────────────────── */

describe('log safety — private repository identity never reaches a log line', () => {
  it('names no repository, reusing the opaque handle from caseStudyRepoReader', () => {
    const ref = provenanceLogRef(ORIGINS.repo_extraction);
    expect(ref).toBe(`repo_extraction:${opaqueRepoRef('colaberry', 'accelerator')}`);
    expect(ref).not.toContain('colaberry');
    expect(ref).not.toContain('accelerator');
    expect(provenanceLogRef(ORIGINS.repo_manifest))
      .toBe(`manifest:${opaqueRepoRef('colaberry', 'accelerator')}`);
  });

  it('imports the opaque handle rather than reimplementing it', () => {
    expect(SOURCE).toMatch(/import \{ opaqueRepoRef \} from '\.\/caseStudyRepoReader'/);
    expect(SOURCE).not.toMatch(/createHash/);
  });

  it('carries no actor, enrollment id, project id or evidence id into the ref', () => {
    expect(provenanceLogRef({ kind: 'human', actor: 'student@example.test' })).toBe('human');
    expect(provenanceLogRef(ORIGINS.project_facts)).toBe('project_field');
    expect(provenanceLogRef(ORIGINS.evidence_or_artifact)).toBe('evidence_record');
    expect(provenanceLogRef(ORIGINS.approved_metric_evidence)).toBe('case_study_metric');
    for (const origin of Object.values(ORIGINS)) {
      const ref = provenanceLogRef(origin);
      expect(ref).not.toContain('@');
      expect(ref).not.toContain('project-1');
      expect(ref).not.toContain('evidence-1');
      expect(ref).not.toContain('metric-1');
    }
  });

  it('is stable across calls, so a handle can be correlated between log lines', () => {
    expect(provenanceLogRef(ORIGINS.repo_extraction)).toBe(provenanceLogRef(ORIGINS.repo_extraction));
  });
});
