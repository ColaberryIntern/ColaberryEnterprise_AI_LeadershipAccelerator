import fs from 'fs';
import path from 'path';
import {
  ANY_FILE_TYPE,
  ARTIFACT_CATALOG_VERSION,
  CATALOG_ARTIFACT_ROLE,
  acceptsAnyFileType,
  allowsEvidenceSource,
  artifactType,
  artifactTypeNames,
  artifactTypes,
  isKnownArtifactType,
} from '../storyArtifactTypes';

/**
 * THE CATALOG'S OWN INVARIANTS.
 *
 * The catalog is data, so the tests over it are mostly about the shapes a later phase will rely
 * on: `requires_github_validation` must agree with `evidence_source` or the contract validator
 * will demand a repo path for a platform upload, and a duplicated type name would make
 * `artifactType()` silently return whichever row happened to load last.
 *
 * The expectations derive from the JSON rather than restating it, with two deliberate exceptions:
 * the count and the three type names Ali named as first-class. Those two are the ones worth
 * breaking the suite over, because a type quietly disappearing from the catalog is how a contract
 * that used to validate starts refusing.
 */

const CATALOG_FILE = path.resolve(__dirname, '../storyArtifactTypes.json');

describe('the artifact type catalog', () => {
  it('is the eleven types the plan named, with the three first-class ones present', () => {
    expect(artifactTypes()).toHaveLength(11);
    for (const named of ['case_study', 'proposal', 'portfolio']) {
      expect(isKnownArtifactType(named)).toBe(true);
    }
    expect(isKnownArtifactType('white_paper')).toBe(false);
    expect(ARTIFACT_CATALOG_VERSION).toBe(1);
  });

  it('has a unique type name and a unique sort order per entry', () => {
    const types = artifactTypes();
    expect(new Set(types.map((t) => t.type)).size).toBe(types.length);
    expect(new Set(types.map((t) => t.sort_order)).size).toBe(types.length);
  });

  it('returns the types in sort order regardless of the order in the file', () => {
    const orders = artifactTypes().map((t) => t.sort_order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it('keeps requires_github_validation in step with evidence_source', () => {
    // The whole reason this column stopped being decorative. If these two ever disagree, the
    // contract validator either demands a repo path for a platform upload or stops demanding one
    // for a repo artifact, and neither failure is visible from the outside.
    const repo = artifactTypes().filter((t) => t.evidence_source === 'repo');
    const notRepo = artifactTypes().filter((t) => t.evidence_source !== 'repo');
    expect(repo.length).toBeGreaterThan(0);
    expect(notRepo.length).toBeGreaterThan(0);
    for (const t of artifactTypes()) {
      expect(t.requires_github_validation).toBe(t.evidence_source === 'repo');
    }
  });

  it('declares only the three evidence sources the validator understands', () => {
    for (const t of artifactTypes()) {
      expect(['repo', 'platform', 'either']).toContain(t.evidence_source);
    }
  });

  it('declares file types as lowercase extensions with no dot, or the wildcard alone', () => {
    for (const t of artifactTypes()) {
      expect(t.file_types.length).toBeGreaterThan(0);
      if (acceptsAnyFileType(t)) {
        // A wildcard beside named types would be ambiguous: does the entry narrow, or not?
        expect(t.file_types).toEqual([ANY_FILE_TYPE]);
        continue;
      }
      for (const ft of t.file_types) {
        expect(ft).toMatch(/^[a-z0-9]{1,8}$/);
      }
      expect(new Set(t.file_types).size).toBe(t.file_types.length);
    }
  });

  it('gives every type a judging sentence a person could actually apply', () => {
    for (const t of artifactTypes()) {
      expect(t.evaluation_criteria.trim().length).toBeGreaterThan(40);
      expect(t.name.trim().length).toBeGreaterThan(0);
      expect(t.handed_over.trim().length).toBeGreaterThan(0);
      expect(t.exists_today.trim().length).toBeGreaterThan(0);
    }
  });

  it('exactly one type accepts any extension, and it is the build artifact', () => {
    const wild = artifactTypes().filter(acceptsAnyFileType).map((t) => t.type);
    expect(wild).toEqual(['build_artifact']);
  });

  it('requires a screenshot only where a screenshot is the point', () => {
    const shots = artifactTypes().filter((t) => t.requires_screenshot).map((t) => t.type).sort();
    expect(shots).toEqual(['build_artifact', 'demo_capture']);
  });
});

describe('the accessors', () => {
  it('returns undefined for an unknown type rather than a blank one', () => {
    expect(artifactType('white_paper')).toBeUndefined();
    expect(artifactType('')).toBeUndefined();
    expect(artifactType('CASE_STUDY')).toBeUndefined();
  });

  it('hands out copies, so a caller cannot edit the catalog for everyone else', () => {
    const first = artifactType('case_study')!;
    first.file_types.push('docx');
    first.evaluation_criteria = 'anything goes';
    const second = artifactType('case_study')!;
    expect(second.file_types).not.toContain('docx');
    expect(second.evaluation_criteria).not.toBe('anything goes');

    const list = artifactTypes();
    list.splice(0, list.length);
    expect(artifactTypes()).toHaveLength(11);
  });

  it('names every type for an error message', () => {
    expect(artifactTypeNames().sort()).toEqual(artifactTypes().map((t) => t.type).sort());
  });

  it('admits both sources for an either-type and only its own for the rest', () => {
    const either = artifactType('presentation')!;
    const repoOnly = artifactType('analysis_report')!;
    const platformOnly = artifactType('field_guide')!;
    expect(allowsEvidenceSource(either, 'repo')).toBe(true);
    expect(allowsEvidenceSource(either, 'platform')).toBe(true);
    expect(allowsEvidenceSource(repoOnly, 'repo')).toBe(true);
    expect(allowsEvidenceSource(repoOnly, 'platform')).toBe(false);
    expect(allowsEvidenceSource(platformOnly, 'platform')).toBe(true);
    expect(allowsEvidenceSource(platformOnly, 'repo')).toBe(false);
    // 'either' describes a type's options, never one artifact's evidence.
    expect(allowsEvidenceSource(either, 'either')).toBe(false);
  });
});

describe('the catalog file itself', () => {
  it('is valid JSON with a version and a types array, read from disk and not from the import', () => {
    const raw = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
    expect(typeof raw.version).toBe('number');
    expect(Array.isArray(raw.types)).toBe(true);
    expect(raw.types).toHaveLength(11);
  });

  it('carries no field the typed door does not expose', () => {
    // A field in the JSON that nothing reads is a producer with no consumer: it looks like
    // configuration and changes nothing. This repository has shipped several of those.
    const raw = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
    const known = new Set([
      'type', 'name', 'file_types', 'evidence_source', 'requires_github_validation',
      'requires_screenshot', 'evaluation_criteria', 'exists_today', 'handed_over', 'sort_order',
    ]);
    for (const entry of raw.types) {
      expect(Object.keys(entry).filter((k) => !known.has(k))).toEqual([]);
    }
  });

  it('reserves an artifact_role the curriculum does not use', () => {
    expect(CATALOG_ARTIFACT_ROLE).toBe('catalog_type');
    // The model's own default is 'output'; the seeder's discriminator must not collide with it.
    expect(CATALOG_ARTIFACT_ROLE).not.toBe('output');
  });
});
