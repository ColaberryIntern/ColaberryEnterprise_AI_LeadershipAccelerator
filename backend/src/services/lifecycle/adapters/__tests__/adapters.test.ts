/**
 * The adapter seam: pointers out, nothing in.
 *
 * Two kinds of assertion here. Behavioural ones, on what the mapping produces. And a STRUCTURAL
 * one, over the adapter files' own source text, proving they import nothing that could write.
 * "The coordinator must not add a column to contract_* or build_*" is then enforced by the test
 * suite rather than by everyone remembering it.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { compareSourceSets, mintSourceItem, type SourceItem } from '../../sourceIdentity';
import {
  emptyRefs,
  checkRefIntegrity,
  DOMAIN_TABLES_ADAPTERS_MUST_NOT_WRITE,
  type ManifestRefs,
} from '../manifestRefs';
import {
  factoryToManifestRefs,
  evidenceStateToSourceState,
  type FactoryAdapterInput,
} from '../factoryAdapter';
import {
  sbpToManifestRefs,
  sbpRequirementToSourceState,
  isConstraintKind,
  requirementsNeedingCoverage,
} from '../sbpAdapter';

const ADAPTER_DIR = join(__dirname, '..');

describe('STRUCTURAL: an adapter has no way to write', () => {
  const files = ['factoryAdapter.ts', 'sbpAdapter.ts', 'manifestRefs.ts'];

  it.each(files)('%s imports nothing that can reach the database', (file) => {
    const src = readFileSync(join(ADAPTER_DIR, file), 'utf8');
    // No sequelize, no model, no config/database. If any of these ever appear, the
    // one-directional guarantee stops being structural and becomes a convention.
    expect(src).not.toMatch(/from\s+'sequelize'/);
    expect(src).not.toMatch(/from\s+'[./]*config\/database'/);
    expect(src).not.toMatch(/from\s+'[./]*models\//);
    expect(src).not.toMatch(/\.create\(|\.update\(|\.destroy\(|\.upsert\(/);
    expect(src).not.toMatch(/INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM/i);
  });

  it('POSITIVE CONTROL: the patterns above do match a file that WOULD write', () => {
    // Guards against a regex that silently matches nothing — the failure mode this repo has
    // already been bitten by.
    const writer = "import { sequelize } from '../config/database';\nawait Thing.create({});";
    expect(writer).toMatch(/from\s+'[./]*config\/database'/);
    expect(writer).toMatch(/\.create\(/);
  });

  it('names the domain tables that are off limits, so the intent is discoverable', () => {
    expect(DOMAIN_TABLES_ADAPTERS_MUST_NOT_WRITE).toContain('contract_process_documents');
    expect(DOMAIN_TABLES_ADAPTERS_MUST_NOT_WRITE).toContain('build_plans');
    expect(DOMAIN_TABLES_ADAPTERS_MUST_NOT_WRITE).toContain('student_tasks');
  });
});

describe('Factory adapter', () => {
  const base: FactoryAdapterInput = {
    deliveryProjectId: 'dp-1',
    documentVersion: 7,
    requirements: [
      { canonical_req_id: 'REQ-1', evidence_state: 'planned', source_document: 'RFP-2026-01' },
      { canonical_req_id: 'REQ-2', evidence_state: 'unassessed' },
      { canonical_req_id: 'REQ-3', evidence_state: 'tested', human_confirmed: true },
    ],
  };

  it('keeps the Factory\'s own canonical ids so the pointer still resolves there', () => {
    const refs = factoryToManifestRefs(base);
    expect(refs.sources.map((s) => s.id)).toEqual(['REQ-1', 'REQ-2', 'REQ-3']);
    expect(refs.origin).toBe('factory');
    expect(refs.projectId).toBe('dp-1');
  });

  it('pins the document revision onto every ref', () => {
    const refs = factoryToManifestRefs(base);
    // REQ-1 carries its own amendment version when present; the others fall back to the doc.
    expect(refs.sources[1].revision).toBe(7);
  });

  it('maps evidence states without ever upgrading to confirmed by inference', () => {
    expect(evidenceStateToSourceState('demonstrated', null)).toBe('production_verified');
    expect(evidenceStateToSourceState('tested', null)).toBe('tested');
    expect(evidenceStateToSourceState('planned', null)).toBe('proposed');
    expect(evidenceStateToSourceState('assumption', null)).toBe('proposed');
    expect(evidenceStateToSourceState('missing', null)).toBe('open');
    // The important ones: nothing reaches `confirmed` without the explicit human flag.
    expect(evidenceStateToSourceState('tested', false)).not.toBe('confirmed');
    expect(evidenceStateToSourceState('demonstrated', undefined)).not.toBe('confirmed');
    expect(evidenceStateToSourceState('tested', true)).toBe('confirmed');
  });

  it('maps unassessed to open rather than flattening it to a default', () => {
    // "Don't know" is a value, not a guess. Collapsing it would discard the one thing it carries.
    expect(evidenceStateToSourceState('unassessed', null)).toBe('open');
    expect(factoryToManifestRefs(base).sources[1].state).toBe('open');
  });

  it('records provenance as null when unrecorded, and does not invent a document', () => {
    const refs = factoryToManifestRefs(base);
    expect(refs.sources[0].provenanceKind).toBe('RFP-2026-01');
    expect(refs.sources[1].provenanceKind).toBeNull();
  });

  it('treats an empty-string source document as unrecorded, not as a document named ""', () => {
    const refs = factoryToManifestRefs({
      ...base,
      requirements: [{ canonical_req_id: 'R', source_document: '   ' }],
    });
    expect(refs.sources[0].provenanceKind).toBeNull();
  });

  it('carries government track mappings through verbatim', () => {
    const refs = factoryToManifestRefs({
      ...base,
      proposalSections: [{ canonical_req_id: 'REQ-1', proposal_section_ref: 'L.3.2' }],
      solutionStories: [{ canonical_req_id: 'REQ-1', student_task_story_id: 'STORY-004' }],
    });
    expect(refs.trackMappings.proposalSections).toEqual([{ canonicalReqId: 'REQ-1', sectionRef: 'L.3.2' }]);
    expect(refs.trackMappings.solutionStories).toEqual([{ canonicalReqId: 'REQ-1', storyId: 'STORY-004' }]);
  });

  it('keeps runtime and builder agents in separate namespaces', () => {
    const refs = factoryToManifestRefs({
      ...base,
      runtimeAgentIds: ['agent-intake'],
      builderAgentIds: ['claude-builder-1'],
    });
    expect(refs.agents.runtime.map((a) => a.id)).toEqual(['agent-intake']);
    expect(refs.agents.builder.map((a) => a.id)).toEqual(['claude-builder-1']);
    expect(checkRefIntegrity(refs).agentNamespaceCollisions).toEqual([]);
  });

  it('returns stable empty arrays rather than omitting fields', () => {
    const refs = factoryToManifestRefs({ deliveryProjectId: 'dp', documentVersion: null, requirements: [] });
    expect(refs.trackMappings.proposalSections).toEqual([]);
    expect(refs.agents.runtime).toEqual([]);
    expect(refs.downstream).toEqual([]);
  });
});

describe('SBP adapter', () => {
  const base = {
    projectId: 'proj-1',
    planVersion: 3,
    requirements: [
      { id: 'FR-001', kind: 'FUNC', priority: 'must' },
      { id: 'C-001', kind: 'CONSTRAINT', priority: 'must' },
      { id: 'FR-002', kind: 'FUNC', human_confirmed: true },
    ],
    releases: [{ id: 'r0' }],
    stories: [{ id: 'STORY-001', release_id: 'r0' }],
  };

  it('keeps SBP ids and marks the origin', () => {
    const refs = sbpToManifestRefs(base);
    expect(refs.origin).toBe('sbp');
    expect(refs.sources.map((s) => s.id)).toEqual(['FR-001', 'C-001', 'FR-002']);
  });

  it('does not upgrade state by inference', () => {
    expect(sbpRequirementToSourceState({ id: 'x' })).toBe('heard');
    expect(sbpRequirementToSourceState({ id: 'x', human_confirmed: false })).toBe('heard');
    expect(sbpRequirementToSourceState({ id: 'x', human_confirmed: true })).toBe('confirmed');
  });

  it('puts releases and stories in DOWNSTREAM, not processes', () => {
    // Conflating the software build with the business it serves would collapse the distinction
    // the whole business-task contract rests on.
    const refs = sbpToManifestRefs(base);
    expect(refs.downstream.map((d) => d.id)).toEqual(['r0', 'STORY-001']);
    expect(refs.processes).toEqual([]);
    expect(refs.businessTasks).toEqual([]);
  });

  it('treats an ABSENT agent list as legitimate, not as a failure', () => {
    // BuildPlan.agents is optional and scoping runs after the gate on purpose, so absence is a
    // normal state rather than something to flag.
    expect(sbpToManifestRefs({ ...base, agents: undefined }).agents.runtime).toEqual([]);
    expect(sbpToManifestRefs({ ...base, agents: null }).agents.runtime).toEqual([]);
    expect(sbpToManifestRefs({ ...base, agents: [{ id: 'a1' }] }).agents.runtime.map((a) => a.id)).toEqual(['a1']);
  });

  it('excludes CONSTRAINT requirements from story coverage', () => {
    expect(isConstraintKind('CONSTRAINT')).toBe(true);
    expect(isConstraintKind('FUNC')).toBe(false);
    expect(isConstraintKind(null)).toBe(false);
    // A constraint is context for the stories that use it, not a story of its own; demanding
    // coverage for it manufactures the "layer story" the plan contract prevents.
    expect(requirementsNeedingCoverage(base.requirements)).toEqual(['FR-001', 'FR-002']);
  });

  it('leaves track mappings present but empty, since SBP has no track concept', () => {
    const refs = sbpToManifestRefs(base);
    expect(refs.trackMappings).toEqual({ proposalSections: [], solutionStories: [] });
  });
});

describe('round trips lose nothing and invent nothing', () => {
  /** Treat adapter output as source items so the T5 comparison can be applied to it. */
  function asItems(refs: ManifestRefs): SourceItem[] {
    return refs.sources.map((s) => ({
      id: s.id, revision: 1, text: s.id, state: s.state,
      provenance: s.provenanceKind ? { kind: s.provenanceKind, locator: '' } : null,
    }));
  }

  it('Factory: every requirement in is a source out, with none lost or duplicated', () => {
    const requirements = Array.from({ length: 30 }, (_, n) => ({
      canonical_req_id: `REQ-${n + 1}`, evidence_state: 'planned', source_document: 'RFP',
    }));
    const refs = factoryToManifestRefs({ deliveryProjectId: 'dp', documentVersion: 1, requirements });
    expect(refs.sources).toHaveLength(30);

    const before = requirements.map((r) => ({
      id: r.canonical_req_id, revision: 1, text: r.canonical_req_id,
      state: 'proposed' as const, provenance: { kind: 'RFP', locator: '' },
    }));
    const report = compareSourceSets(before, asItems(refs));
    expect(report.ok).toBe(true);
    expect(report.lost).toEqual([]);
    expect(report.inventedConfirmations).toEqual([]);
  });

  it('SBP: 30 requirements in, 30 sources out — the measured loss cannot recur here', () => {
    const requirements = Array.from({ length: 30 }, (_, n) => ({ id: `FR-${n + 1}`, kind: 'FUNC' }));
    const refs = sbpToManifestRefs({ projectId: 'p', planVersion: 1, requirements });
    expect(refs.sources).toHaveLength(30);
    const before = requirements.map((r) => ({
      id: r.id, revision: 1, text: r.id, state: 'heard' as const, provenance: null,
    }));
    expect(compareSourceSets(before, asItems(refs)).ok).toBe(true);
  });

  it('POSITIVE CONTROL: a truncating adapter WOULD be caught', () => {
    const requirements = Array.from({ length: 30 }, (_, n) => ({ id: `FR-${n + 1}` }));
    const refs = sbpToManifestRefs({ projectId: 'p', planVersion: 1, requirements });
    const truncated = { ...refs, sources: refs.sources.slice(0, 13) };
    const before = requirements.map((r) => ({
      id: r.id, revision: 1, text: r.id, state: 'heard' as const, provenance: null,
    }));
    const report = compareSourceSets(before, asItems(truncated));
    expect(report.ok).toBe(false);
    expect(report.lost).toHaveLength(17);
  });

  it('the two origins never share an id space — no cross-engine collision', () => {
    const f = factoryToManifestRefs({
      deliveryProjectId: 'dp', documentVersion: 1,
      requirements: [{ canonical_req_id: 'SHARED-1' }],
    });
    const s = sbpToManifestRefs({ projectId: 'p', planVersion: 1, requirements: [{ id: 'SHARED-1' }] });
    // Same literal id, but they are separate ref sets with distinct origins and projects, so
    // nothing merges them. This is the seam, asserted.
    expect(f.origin).not.toBe(s.origin);
    expect(f.projectId).not.toBe(s.projectId);
    expect(checkRefIntegrity(f).ok).toBe(true);
    expect(checkRefIntegrity(s).ok).toBe(true);
  });
});

describe('checkRefIntegrity', () => {
  it('passes a clean ref set', () => {
    expect(checkRefIntegrity(emptyRefs('sbp', 'p')).ok).toBe(true);
  });

  it('DETECTS one id standing for two different things', () => {
    const refs = emptyRefs('sbp', 'p');
    refs.processes = [{ id: 'X', revision: 1, source: 'a' }];
    refs.businessTasks = [{ id: 'X', revision: 1, source: 'b' }];
    const report = checkRefIntegrity(refs);
    expect(report.ok).toBe(false);
    expect(report.collisions).toEqual(['X']);
  });

  it('DETECTS an agent in BOTH namespaces — the conflation the request forbids', () => {
    const refs = emptyRefs('factory', 'dp');
    refs.agents = {
      runtime: [{ id: 'same-agent', revision: null, source: 'runtime_agents' }],
      builder: [{ id: 'same-agent', revision: null, source: 'builder_agents' }],
    };
    const report = checkRefIntegrity(refs);
    expect(report.ok).toBe(false);
    expect(report.agentNamespaceCollisions).toEqual(['same-agent']);
  });

  it('DETECTS a malformed ref', () => {
    const refs = emptyRefs('sbp', 'p');
    refs.sources = [{ id: '  ', revision: 1, source: 's', state: 'heard', provenanceKind: null }];
    expect(checkRefIntegrity(refs).ok).toBe(false);
    expect(checkRefIntegrity(refs).malformed).toHaveLength(1);
  });

  it('does not flag the same id appearing twice in the SAME list', () => {
    // Duplicate-within-a-list is compareSourceSets' job; this check is about one id meaning two
    // different KINDS of thing. Keeping the two concerns apart avoids a confusing double report.
    const refs = emptyRefs('sbp', 'p');
    refs.processes = [
      { id: 'P', revision: 1, source: 'a' },
      { id: 'P', revision: 1, source: 'a' },
    ];
    expect(checkRefIntegrity(refs).collisions).toEqual([]);
  });

  it('POSITIVE CONTROL: the integrity check can fail, so a pass means something', () => {
    const refs = emptyRefs('sbp', 'p');
    refs.sources = [{ id: '', revision: null, source: 's', state: 'heard', provenanceKind: null }];
    expect(checkRefIntegrity(refs).ok).toBe(false);
  });
});

describe('a minted lifecycle item and an adapter ref do not collide', () => {
  it('mints ids that are not any domain id', () => {
    const minted = mintSourceItem({ text: 'captured in the interview', state: 'heard' });
    const refs = factoryToManifestRefs({
      deliveryProjectId: 'dp', documentVersion: 1, requirements: [{ canonical_req_id: 'REQ-1' }],
    });
    expect(refs.sources.map((s) => s.id)).not.toContain(minted.id);
    expect(minted.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
