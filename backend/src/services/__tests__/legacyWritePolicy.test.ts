/**
 * The legacy write policy, as rules rather than as a writer.
 *
 * The traversal cases are not hypothetical. `projectScaffoldService` derived
 * folder names from `contract_json.components[].folder` — LLM-authored JSON —
 * and interpolated them straight into a write path as `${folder}/.gitkeep`. The
 * feature is deleted, but the policy is what guarantees nothing reintroduces it
 * by adding a pattern that is not anchored.
 */
import { legacyWriteMode, isAllowedLegacyPath, LEGACY_WRITE_POLICY } from '../legacyWritePolicy';

describe('what a legacy writer may touch', () => {
  it('governs CLAUDE.md as a managed block, never a replacement', () => {
    expect(legacyWriteMode('CLAUDE.md')).toBe('managed_block');
  });

  it('treats student-authored files as seed-once', () => {
    expect(legacyWriteMode('README.md')).toBe('seed_once');
    expect(legacyWriteMode('.gitignore')).toBe('seed_once');
  });

  it('treats pure DB projections as platform-owned', () => {
    expect(legacyWriteMode('PROJECT_STATE.json')).toBe('platform_owned');
    expect(legacyWriteMode('requirements/master.md')).toBe('platform_owned');
  });
});

describe('what it refuses', () => {
  it.each([
    ['src/index.ts'],
    ['src/.gitkeep'],
    ['tests/.gitkeep'],
    ['docs/.gitkeep'],
    ['app/main.py'],
    ['.github/workflows/deploy.yml'],
  ])('refuses %s — the student source tree is theirs', (path) => {
    expect(isAllowedLegacyPath(path)).toBe(false);
  });

  it.each([
    ['../../etc/passwd'],
    ['requirements/../../.github/workflows/evil.yml'],
    ['/absolute/path.md'],
    ['..\\..\\windows\\system32'],
  ])('refuses traversal: %s', (path) => {
    expect(isAllowedLegacyPath(path)).toBe(false);
  });

  it('refuses empty and nested requirements paths', () => {
    expect(isAllowedLegacyPath('')).toBe(false);
    // `[^/]+` keeps requirements one level deep
    expect(isAllowedLegacyPath('requirements/sub/deep.md')).toBe(false);
  });
});

describe('the policy itself', () => {
  it('anchors every pattern at both ends', () => {
    for (const { re } of LEGACY_WRITE_POLICY) {
      expect(re.source.startsWith('^')).toBe(true);
      expect(re.source.endsWith('$')).toBe(true);
    }
  });
});
