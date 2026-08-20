/**
 * artifactRepoFiles — the pure artifact-to-repo mapping, tested from literals.
 *
 * The determinism assertions are the important ones. repoWriter decides whether
 * to commit by comparing content hashes, so any non-determinism here would turn
 * every sync into a fresh commit on a student's repo forever.
 */
import {
  ARTIFACT_INDEX_PATH,
  ArtifactRecord,
  artifactPath,
  buildArtifactFiles,
  isTextArtifact,
  renderArtifactIndex,
  slugifyFilename,
} from '../artifactRepoFiles';
import { isAllowedPath, RenderedFile } from '../../sbp/renderDocs';

const artifact = (over: Partial<ArtifactRecord> = {}): ArtifactRecord => ({
  week: 4,
  cardId: 'card-1',
  filename: 'governance-framework.md',
  title: 'Build — Systematic Prompt Engineering',
  text: '# Governance Framework\n',
  uploadedAt: '2026-08-20T10:00:00.000Z',
  sizeBytes: 2048,
  ...over,
});

describe('isTextArtifact', () => {
  it.each(['a.md', 'a.MD', 'a.txt', 'a.csv'])('accepts %s', (f) => {
    expect(isTextArtifact(f)).toBe(true);
  });

  it.each(['a.pdf', 'a.docx', 'a.pptx', 'a.xlsx', 'noextension'])('rejects %s', (f) => {
    expect(isTextArtifact(f)).toBe(false);
  });
});

describe('slugifyFilename', () => {
  it('lowercases and hyphenates', () => {
    expect(slugifyFilename('Governance Framework V2.md')).toBe('governance-framework-v2.md');
  });

  it('strips a directory traversal attempt — a path-safety boundary, not cosmetics', () => {
    // Student-supplied. A surviving `../` would push the write outside
    // artifacts/ and the allowlist would reject the whole commit.
    expect(slugifyFilename('../../etc/passwd.md')).toBe('passwd.md');
    expect(slugifyFilename('..\\..\\windows\\system.md')).toBe('system.md');
  });

  it('survives a filename that is entirely punctuation', () => {
    expect(slugifyFilename('!!!.md')).toBe('artifact.md');
  });

  it('keeps a file with no extension usable', () => {
    expect(slugifyFilename('README')).toBe('readme');
  });

  it('caps a very long stem', () => {
    const long = `${'a'.repeat(300)}.md`;
    expect(slugifyFilename(long).length).toBeLessThanOrEqual(83);
  });
});

describe('artifactPath', () => {
  it('zero-pads the week folder so weeks sort correctly as strings', () => {
    expect(artifactPath(artifact({ week: 4 }))).toBe('artifacts/week-04/governance-framework.md');
    expect(artifactPath(artifact({ week: 12 }))).toBe('artifacts/week-12/governance-framework.md');
  });

  it('files a null or zero week under week-00 rather than throwing', () => {
    expect(artifactPath(artifact({ week: null }))).toBe('artifacts/week-00/governance-framework.md');
    expect(artifactPath(artifact({ week: 0 }))).toBe('artifacts/week-00/governance-framework.md');
  });

  it('produces files assignable to repoWriter\'s RenderedFile without a cast', () => {
    // The type compatibility artifactRepoSync relies on. If RenderedFile ever
    // gains a required field, this stops compiling here rather than being
    // papered over with an `as any` at the call site.
    const files: RenderedFile[] = buildArtifactFiles([artifact()]);
    expect(files.length).toBeGreaterThan(0);
  });

  it('produces a path the SBP allowlist accepts', () => {
    // The contract between this module and repoWriter. If the allowlist ever
    // loses its artifacts/ entry, this fails here rather than as a thrown
    // AllowlistViolation against a real student's repo.
    expect(isAllowedPath(artifactPath(artifact()))).toBe(true);
    expect(isAllowedPath(ARTIFACT_INDEX_PATH)).toBe(true);
  });

  it('produces a path the allowlist accepts even from a hostile filename', () => {
    expect(isAllowedPath(artifactPath(artifact({ filename: '../../../CLAUDE.md' })))).toBe(true);
    expect(artifactPath(artifact({ filename: '../../../CLAUDE.md' })))
      .toBe('artifacts/week-04/claude.md');
  });
});

describe('buildArtifactFiles', () => {
  it('emits one file per artifact plus the index', () => {
    const files = buildArtifactFiles([
      artifact({ week: 4, filename: 'a.md', text: 'A' }),
      artifact({ week: 5, filename: 'b.md', text: 'B', cardId: 'card-2' }),
    ]);
    expect(files.map((f) => f.path)).toEqual([
      'artifacts/week-04/a.md',
      'artifacts/week-05/b.md',
      ARTIFACT_INDEX_PATH,
    ]);
  });

  it('commits text content verbatim', () => {
    const files = buildArtifactFiles([artifact({ text: '# Real content\n\nBody.\n' })]);
    expect(files[0].content).toBe('# Real content\n\nBody.\n');
  });

  it('writes a stub for a binary artifact rather than dropping it', () => {
    const files = buildArtifactFiles([
      artifact({ filename: 'trust-brief.pdf', text: null, sizeBytes: 1048576 }),
    ]);
    expect(files[0].path).toBe('artifacts/week-04/trust-brief.pdf');
    expect(files[0].content).toContain('held on the Colaberry platform');
    expect(files[0].content).toContain('1.0 MB');
  });

  it('emits only the index when the student has no artifacts yet', () => {
    const files = buildArtifactFiles([]);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe(ARTIFACT_INDEX_PATH);
    expect(files[0].content).toContain('0 artifacts.');
  });

  describe('determinism — what stops an infinite commit loop', () => {
    it('is byte-identical across runs for the same input', () => {
      const input = [
        artifact({ week: 9, filename: 'war-story.md', text: 'broke it' }),
        artifact({ week: 4, filename: 'prompts.csv', text: 'a,b', cardId: 'c2' }),
      ];
      expect(buildArtifactFiles(input)).toEqual(buildArtifactFiles(input));
    });

    it('is byte-identical regardless of the order artifacts arrive in', () => {
      const a = artifact({ week: 9, filename: 'war-story.md', text: 'x' });
      const b = artifact({ week: 4, filename: 'prompts.csv', text: 'y', cardId: 'c2' });
      expect(buildArtifactFiles([a, b])).toEqual(buildArtifactFiles([b, a]));
    });

    it('contains no timestamp of its own — only the caller-supplied uploadedAt', () => {
      const first = buildArtifactFiles([artifact({ uploadedAt: '2026-08-20T10:00:00.000Z' })]);
      const second = buildArtifactFiles([artifact({ uploadedAt: '2026-08-20T10:00:00.000Z' })]);
      expect(first).toEqual(second);
    });
  });

  it('lets the last artifact win when two slug to the same path', () => {
    const files = buildArtifactFiles([
      artifact({ week: 4, filename: 'Report.md', text: 'first', cardId: 'c1' }),
      artifact({ week: 4, filename: 'report.md', text: 'second', cardId: 'c2' }),
    ]);
    expect(files.filter((f) => f.path === 'artifacts/week-04/report.md')).toHaveLength(1);
    expect(files[0].content).toBe('second');
  });
});

describe('renderArtifactIndex', () => {
  it('orders rows by week', () => {
    const md = renderArtifactIndex([
      artifact({ week: 11, filename: 'arch.md', title: 'Architecture' }),
      artifact({ week: 2, filename: 'skills.md', title: 'Skills', cardId: 'c2' }),
    ]);
    expect(md.indexOf('Week 2')).toBeLessThan(md.indexOf('Week 11'));
  });

  it('marks a platform-held artifact so the repo never overstates what it holds', () => {
    const md = renderArtifactIndex([artifact({ filename: 'brief.pdf', text: null })]);
    expect(md).toContain('*(held on platform)*');
  });

  it('escapes a pipe in a title so one card cannot break the table', () => {
    const md = renderArtifactIndex([artifact({ title: 'Build | Governance' })]);
    expect(md).toContain('Build \\| Governance');
  });

  it('flattens a newline in a title into the row', () => {
    const md = renderArtifactIndex([artifact({ title: 'Build\nGovernance' })]);
    expect(md).toContain('Build Governance');
    expect(md.split('\n').filter((l) => l.startsWith('| Week 4'))).toHaveLength(1);
  });

  it('singularises the count for one artifact', () => {
    expect(renderArtifactIndex([artifact()])).toContain('1 artifact.');
  });
});
