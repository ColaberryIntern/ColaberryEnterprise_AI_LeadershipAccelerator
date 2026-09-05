import fs from 'fs';
import path from 'path';

import {
  CASE_STUDY_SURFACE_KEYS,
  CASE_STUDY_VERIFICATION_CLASSES,
  CASE_STUDY_VERIFICATION_METHODS,
  PUBLISHABLE_SURFACE_KEYS,
} from '../caseStudy';
import type { CaseStudySnapshotContent } from '../caseStudy';
import { CASE_STUDY_PROVENANCE_PRECEDENCE } from '../caseStudyProvenance';
import {
  FORBIDDEN_PUBLIC_KEYS,
  PUBLIC_DETAIL_KEYS,
  PUBLIC_SUMMARY_KEYS,
  PUBLIC_VERIFICATION_CLASSES,
} from '../caseStudyPublic';
import { CASE_STUDY_SORT_KEYS } from '../caseStudyFilters';
import {
  assertNever,
  describeArtifactVisibility,
  describeBuilderIdentityMode,
  describeBuiltByType,
  describeCaseStudyStatus,
  describeOrganizationIdentityMode,
  describeProvenanceTier,
  describePublicVerificationClass,
  describeRepoVisibility,
  describeRoadmapStatus,
  describeSectionKey,
  describeSortKey,
  describeSurfaceKey,
  describeVerificationClass,
  describeVerificationMethod,
  isCaseStudySortKey,
  isCaseStudySurfaceKey,
  isCaseStudyVerificationClass,
  isCaseStudyVerificationMethod,
  isPublicVerificationClass,
  isPublishableSurfaceKey,
  provenanceRank,
} from '../caseStudyGuards';
import { DETAIL_FIXTURE, SUMMARY_FIXTURE, UNION_MEMBERS } from './caseStudyContractFixtures';

/**
 * Contract tests for the Case Study OS type layer (T003).
 *
 * A test that only proves "the types compile" proves nothing, because types are
 * erased before anything runs. Every block below asserts something that survives
 * to runtime, or pins one file's text to another's:
 *
 *  1. the verification vocabulary matches the FRONTEND's, read out of Claim.tsx
 *  2. the marketing-claims vocabulary was NOT adopted and NOT mapped
 *  3. the public key allow-lists are disjoint from the forbidden-key list
 *  4. a maximal public payload carries no forbidden key at any depth
 *  5. `pending` is unrepresentable on a public shape
 *  6. every union member is handled — the compile-time half lives in
 *     `caseStudyGuards.ts`, which `tsc --noEmit` does check (test files are
 *     excluded from tsconfig, so a `never` written here would be checked by
 *     nothing); this half proves the runtime member lists agree
 *  7. the contract modules are leaves: no service, model, config or Express import
 *
 * NO DATABASE. This suite imports type modules only, so it runs in CI's set with
 * `DATABASE_URL` unset — asserted by running it that way.
 */

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const TYPES_DIR = path.resolve(__dirname, '..');
const CLAIM_TSX = path.join(REPO_ROOT, 'frontend/src/components/publicV2/Claim.tsx');
const CLAIMS_REGISTRY = path.join(REPO_ROOT, 'frontend/src/config/claimsRegistry.ts');

const CONTRACT_FILES = [
  'caseStudy.ts',
  'caseStudyProvenance.ts',
  'caseStudyPublic.ts',
  'caseStudyFilters.ts',
  'caseStudyGuards.ts',
];

const readContract = (file: string): string =>
  fs.readFileSync(path.join(TYPES_DIR, file), 'utf8');

/** Strip comments so a prose mention is never mistaken for code. */
const codeOnly = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** Every key name appearing anywhere in a nested payload. */
function collectKeys(value: unknown, found: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, found));
    return found;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      found.add(key);
      collectKeys(child, found);
    }
  }
  return found;
}

const forbidden = new Set<string>(FORBIDDEN_PUBLIC_KEYS);

/* ───────────────────────────── 1. frontend vocabulary is the same vocabulary ── */

describe('verification vocabulary is pinned to the frontend', () => {
  const claimSource = fs.readFileSync(CLAIM_TSX, 'utf8');

  it('reads the EvidenceClass union out of Claim.tsx', () => {
    expect(claimSource).toContain('export type EvidenceClass');
  });

  it('CaseStudyVerificationClass matches EvidenceClass exactly', () => {
    const union = claimSource.match(/export type EvidenceClass\s*=\s*([^;]+);/);
    expect(union).not.toBeNull();

    const frontendClasses = Array.from(
      (union as RegExpMatchArray)[1].matchAll(/'([^']+)'/g),
    ).map((m) => m[1]);

    // Same members, same order. Order is a tripwire: a reorder means somebody
    // edited one list without looking at the other.
    expect(frontendClasses).toEqual([...CASE_STUDY_VERIFICATION_CLASSES]);
    expect(frontendClasses).toHaveLength(4);
  });

  it('uses the same words for each class as EvidenceBadge does', () => {
    const block = claimSource.match(/const EVIDENCE_LABEL[^=]*=\s*\{([\s\S]*?)\};/);
    expect(block).not.toBeNull();

    const labels = Object.fromEntries(
      Array.from((block as RegExpMatchArray)[1].matchAll(/(\w+):\s*'([^']*)'/g)).map((m) => [
        m[1],
        m[2],
      ]),
    );

    expect(Object.keys(labels).sort()).toEqual([...CASE_STUDY_VERIFICATION_CLASSES].sort());
    for (const cls of CASE_STUDY_VERIFICATION_CLASSES) {
      expect(describeVerificationClass(cls)).toBe(labels[cls]);
    }
  });

  it('has exactly the six spec §14 methods, on an axis of their own', () => {
    expect([...CASE_STUDY_VERIFICATION_METHODS]).toEqual([
      'client',
      'repo',
      'platform',
      'internal',
      'self',
      'manual',
    ]);
    // Orthogonal axes: no method name is also a class name, so neither list can
    // be quietly used in the other's place.
    const overlap = CASE_STUDY_VERIFICATION_METHODS.filter((m) =>
      (CASE_STUDY_VERIFICATION_CLASSES as readonly string[]).includes(m),
    );
    expect(overlap).toEqual([]);
  });
});

/* ─────────────────────── 2. the claims-registry vocabulary was NOT adopted ──── */

describe('the marketing claims vocabulary is kept separate', () => {
  const CLAIMS_REGISTRY_STATUSES = [
    'VERIFIED',
    'OWNER_ATTESTED',
    'NEEDS_VERIFICATION',
    'ILLUSTRATIVE',
    'DO_NOT_PUBLISH',
  ];

  it('those five statuses really are what claimsRegistry.ts declares', () => {
    const registry = fs.readFileSync(CLAIMS_REGISTRY, 'utf8');
    expect(registry).toContain('export type VerificationStatus');
    for (const status of CLAIMS_REGISTRY_STATUSES) {
      expect(registry).toContain(`'${status}'`);
    }
  });

  it('no contract file adopts or maps them', () => {
    // A mapping is the failure mode: `VERIFIED -> 'verified'` would silently
    // promote a marketing claim into an evidenced Case Study fact.
    for (const file of CONTRACT_FILES) {
      const code = codeOnly(readContract(file));
      for (const status of CLAIMS_REGISTRY_STATUSES) {
        expect(code).not.toContain(status);
      }
    }
  });
});

/* ──────────────────────────────── 3. public allow-lists vs forbidden keys ──── */

describe('public key allow-lists', () => {
  it('are non-empty, unique, and frozen', () => {
    expect(PUBLIC_SUMMARY_KEYS.length).toBeGreaterThan(0);
    expect(PUBLIC_DETAIL_KEYS.length).toBeGreaterThan(0);
    expect(new Set(PUBLIC_SUMMARY_KEYS).size).toBe(PUBLIC_SUMMARY_KEYS.length);
    expect(new Set(PUBLIC_DETAIL_KEYS).size).toBe(PUBLIC_DETAIL_KEYS.length);
    expect(Object.isFrozen(PUBLIC_SUMMARY_KEYS)).toBe(true);
    expect(Object.isFrozen(PUBLIC_DETAIL_KEYS)).toBe(true);
    expect(new Set(FORBIDDEN_PUBLIC_KEYS).size).toBe(FORBIDDEN_PUBLIC_KEYS.length);
  });

  it('the summary allow-list is disjoint from the forbidden list', () => {
    expect(PUBLIC_SUMMARY_KEYS.filter((k) => forbidden.has(k))).toEqual([]);
  });

  it('the detail allow-list is disjoint from the forbidden list', () => {
    expect(PUBLIC_DETAIL_KEYS.filter((k) => forbidden.has(k))).toEqual([]);
  });

  it('bites — a forbidden key added to a public shape is caught by name', () => {
    // Proves the two disjointness assertions above are not vacuous.
    const withLeak = [...PUBLIC_DETAIL_KEYS, 'review_notes', 'student_email'];
    expect(withLeak.filter((k) => forbidden.has(k))).toEqual(['review_notes', 'student_email']);
  });

  it('forbids every category the public API must never carry', () => {
    for (const key of [
      'review_notes',
      'internal_notes',
      'created_by',
      'approved_by',
      'student_email',
      'enrollment_id',
      'admin_id',
      'repo_url',
      'repo_owner',
      'repo_name',
      'access_token',
      'github_token',
      'file_tree_json',
      'project_variables',
      'id',
    ]) {
      expect(forbidden.has(key)).toBe(true);
    }
  });
});

/* ────────────────────────── 4. a maximal public payload carries no leak ────── */

describe('a fully populated public payload', () => {
  it('has exactly the keys the summary allow-list declares', () => {
    expect(Object.keys(SUMMARY_FIXTURE).sort()).toEqual([...PUBLIC_SUMMARY_KEYS].sort());
  });

  it('has exactly the keys the detail allow-list declares', () => {
    expect(Object.keys(DETAIL_FIXTURE).sort()).toEqual([...PUBLIC_DETAIL_KEYS].sort());
  });

  it('carries no forbidden key at ANY depth', () => {
    expect(Array.from(collectKeys(DETAIL_FIXTURE)).filter((k) => forbidden.has(k))).toEqual([]);
    expect(Array.from(collectKeys(SUMMARY_FIXTURE)).filter((k) => forbidden.has(k))).toEqual([]);
  });

  it('names no private repository — only an opaque count survives', () => {
    const serialised = JSON.stringify(DETAIL_FIXTURE);
    expect(serialised).not.toContain('repoOwner');
    expect(serialised).not.toContain('repoName');
    expect(DETAIL_FIXTURE.privateRepositoryCount).toBe(2);
    for (const repo of DETAIL_FIXTURE.repositories) {
      expect(repo.url.startsWith('https://github.com/')).toBe(true);
    }
  });

  it('names no contributor who did not consent', () => {
    for (const contributor of DETAIL_FIXTURE.contributors) {
      if (contributor.displayMode === 'named') {
        expect(contributor.displayName.length).toBeGreaterThan(0);
      } else {
        expect(contributor).not.toHaveProperty('displayName');
      }
    }
    expect(DETAIL_FIXTURE.anonymousContributorCount).toBe(1);
  });

  it('gives every request-only artifact no url to click', () => {
    for (const artifact of DETAIL_FIXTURE.artifacts) {
      if (artifact.access === 'request') expect(artifact).not.toHaveProperty('url');
      else expect(artifact.url).toMatch(/^https:\/\//);
    }
  });
});

/* ─────────────────────────────────── 5. `pending` cannot reach the public ──── */

describe('pending is unrepresentable publicly', () => {
  it('is absent from the public class list', () => {
    expect([...PUBLIC_VERIFICATION_CLASSES]).toEqual(['verified', 'anonymized', 'illustrative']);
    expect((PUBLIC_VERIFICATION_CLASSES as readonly string[]).includes('pending')).toBe(false);
  });

  it('is rejected by the public guard but accepted by the internal one', () => {
    expect(isPublicVerificationClass('pending')).toBe(false);
    expect(isCaseStudyVerificationClass('pending')).toBe(true);
    expect(isPublicVerificationClass('verified')).toBe(true);
    expect(isPublicVerificationClass('nonsense')).toBe(false);
    expect(isCaseStudyVerificationMethod('repo')).toBe(true);
    expect(isCaseStudyVerificationMethod('gut-feel')).toBe(false);
  });

  it('the public list is a strict subset of the internal one', () => {
    for (const cls of PUBLIC_VERIFICATION_CLASSES) {
      expect((CASE_STUDY_VERIFICATION_CLASSES as readonly string[]).includes(cls)).toBe(true);
    }
    expect(PUBLIC_VERIFICATION_CLASSES.length).toBeLessThan(CASE_STUDY_VERIFICATION_CLASSES.length);
  });
});

/* ───────────────────────────────────────────── 6. every union is handled ──── */

/** Erase the literal type so one table can hold describers for 14 different unions. */
const anyUnion = <T extends string>(fn: (v: T) => string): ((v: string) => string) =>
  fn as (v: string) => string;

const UNION_CASES: ReadonlyArray<[string, readonly string[], (v: string) => string]> = [
  ['CaseStudyVerificationClass', CASE_STUDY_VERIFICATION_CLASSES, anyUnion(describeVerificationClass)],
  ['PublicVerificationClass', PUBLIC_VERIFICATION_CLASSES, anyUnion(describePublicVerificationClass)],
  ['CaseStudyVerificationMethod', CASE_STUDY_VERIFICATION_METHODS, anyUnion(describeVerificationMethod)],
  ['CaseStudySurfaceKey', CASE_STUDY_SURFACE_KEYS, anyUnion(describeSurfaceKey)],
  ['CaseStudySortKey', CASE_STUDY_SORT_KEYS, anyUnion(describeSortKey)],
  ['CaseStudyProvenanceTier', CASE_STUDY_PROVENANCE_PRECEDENCE, anyUnion(describeProvenanceTier)],
  ['CaseStudyRoadmapStatus', UNION_MEMBERS.roadmapStatus, anyUnion(describeRoadmapStatus)],
  ['CaseStudyBuiltByType', UNION_MEMBERS.builtByType, anyUnion(describeBuiltByType)],
  ['CaseStudyBuilderIdentityMode', UNION_MEMBERS.builderIdentityMode, anyUnion(describeBuilderIdentityMode)],
  ['CaseStudyOrganizationIdentityMode', UNION_MEMBERS.organizationIdentityMode, anyUnion(describeOrganizationIdentityMode)],
  ['CaseStudyArtifactVisibility', UNION_MEMBERS.artifactVisibility, anyUnion(describeArtifactVisibility)],
  ['CaseStudyRepoVisibility', UNION_MEMBERS.repoVisibility, anyUnion(describeRepoVisibility)],
  ['CaseStudyStatus', UNION_MEMBERS.caseStudyStatus, anyUnion(describeCaseStudyStatus)],
  ['CaseStudySectionKey', UNION_MEMBERS.sectionKey, anyUnion(describeSectionKey)],
];

describe('exhaustiveness', () => {
  it.each(UNION_CASES)(
    '%s: every member describes to distinct, non-empty text',
    (_name, members, describer) => {
      const described = members.map((m) => describer(m));
      described.forEach((label) => expect(label.length).toBeGreaterThan(0));
      expect(new Set(described).size).toBe(members.length);
    },
  );

  it('covers fourteen unions, so this table is not quietly shrinking', () => {
    expect(UNION_CASES).toHaveLength(14);
    expect(new Set(UNION_CASES.map(([name]) => name)).size).toBe(14);
  });

  it('assertNever throws a classified error when an unknown member arrives', () => {
    expect(() => assertNever('from_the_database' as never, 'CaseStudySurfaceKey')).toThrow(
      /ContractViolation: unhandled CaseStudySurfaceKey/,
    );
  });
});

/* ───────────────────────────── provenance, surfaces, sorts ─────────────────── */

describe('provenance precedence', () => {
  it('is the seven tiers of spec §9, strongest first', () => {
    expect([...CASE_STUDY_PROVENANCE_PRECEDENCE]).toEqual([
      'human_override',
      'approved_metric_evidence',
      'project_facts',
      'evidence_or_artifact',
      'repo_manifest',
      'repo_extraction',
      'ai_draft',
    ]);
    expect(new Set(CASE_STUDY_PROVENANCE_PRECEDENCE).size).toBe(7);
  });

  it('ranks a human override above everything and an AI draft below everything', () => {
    expect(provenanceRank('human_override')).toBe(0);
    expect(provenanceRank('ai_draft')).toBe(CASE_STUDY_PROVENANCE_PRECEDENCE.length - 1);
    for (const tier of CASE_STUDY_PROVENANCE_PRECEDENCE) {
      if (tier === 'human_override') continue;
      expect(provenanceRank('human_override')).toBeLessThan(provenanceRank(tier));
    }
  });
});

describe('surfaces and sorts', () => {
  it('declares all four surfaces so a future surface is a row, not a migration', () => {
    expect([...CASE_STUDY_SURFACE_KEYS]).toEqual([
      'enterprise',
      'training',
      'ai-flotation',
      'refactored',
    ]);
    expect(isCaseStudySurfaceKey('training')).toBe(true);
    expect(isCaseStudySurfaceKey('linkedin')).toBe(false);
  });

  /**
   * PUBLISHABLE IS A SUBSET OF DECLARED, AND THE GAP IS THE POINT.
   *
   * `ai-flotation` moved into the publishable set on 2026-09-05, when
   * aiflotation.com/results gained a page that renders records for it. Every
   * surface is still DECLARED - that is what lets a lens preview one without
   * anyone being able to publish to it - but only the two with a real page are
   * publishable.
   *
   * The loop below is what stops that subset quietly becoming everything: a
   * surface with nowhere to appear must stay refused, or an operator marks a
   * record live and no reader can ever reach it.
   */
  it('publishes only to surfaces that have a page to appear on', () => {
    expect([...PUBLISHABLE_SURFACE_KEYS]).toEqual(['enterprise', 'ai-flotation']);
    for (const key of ['enterprise', 'ai-flotation']) {
      expect(isPublishableSurfaceKey(key)).toBe(true);
    }
    for (const key of ['training', 'refactored']) {
      expect(isCaseStudySurfaceKey(key)).toBe(true);
      expect(isPublishableSurfaceKey(key)).toBe(false);
    }
  });

  it('has four deterministic sorts', () => {
    expect([...CASE_STUDY_SORT_KEYS]).toEqual([
      'featured',
      'newest',
      'strongest-proof',
      'recently-updated',
    ]);
    expect(isCaseStudySortKey('newest')).toBe(true);
    expect(isCaseStudySortKey('most-impressive')).toBe(false);
  });
});

/* ─────────────────────── snapshot content: absent vs present-but-empty ─────── */

describe('CaseStudySnapshotContent', () => {
  it('is valid with only the three sections a record cannot render without', () => {
    const minimal: CaseStudySnapshotContent = {
      identity: {
        slug: 'a-record',
        title: 'A record',
        organizationIdentityMode: 'hidden',
        organizationNamingConsent: false,
        builderIdentityMode: 'anonymous',
        builderNamingConsent: false,
      },
      heroMetrics: [],
      taxonomy: { capabilities: [], stack: [], deliverables: [] },
    };

    // Absence is representable and distinct from present-but-empty: the detail
    // page hides an unsupported section rather than rendering an empty one.
    expect(Object.keys(minimal).sort()).toEqual(['heroMetrics', 'identity', 'taxonomy']);
    expect('situation' in minimal).toBe(false);
    expect('measurement' in minimal).toBe(false);
    expect(minimal.heroMetrics).toEqual([]);
  });
});

/* ──────────────────────────── 7. the contract modules are leaves ───────────── */

describe('the contract modules are leaf modules', () => {
  it('caseStudy.ts imports nothing at all', () => {
    expect(readContract('caseStudy.ts')).not.toMatch(/^\s*import\s/m);
  });

  it('no contract file imports a service, model, config, route, or Express', () => {
    const banned =
      /from\s+'(express|sequelize|[^']*\/(services|models|config|routes|middlewares)\/[^']*)'/;
    for (const file of CONTRACT_FILES) {
      const imports = readContract(file)
        .split('\n')
        .filter((line) => line.trim().startsWith('from ') || line.trim().startsWith('import '));
      for (const line of imports) {
        expect(line).not.toMatch(banned);
      }
    }
  });

  it('uses no `any` — the point of the file is that JSON stops being untyped', () => {
    for (const file of CONTRACT_FILES) {
      const code = codeOnly(readContract(file));
      expect(code).not.toMatch(/:\s*any\b/);
      expect(code).not.toMatch(/\bas\s+any\b/);
      expect(code).not.toMatch(/<any[,>]/);
    }
  });
});
