/**
 * The rule that decides whether a student's work counts.
 *
 * Every case here is taken from a real repository measured on 14 Nov 2026. The
 * headline one: Omolola's Saratoga Springs repo has 35 files with a document or image
 * extension and exactly ten of them are deliverables. A naive extension filter would
 * have imported the application's own screens, fourteen story documents the platform
 * generated, and a config file, and buried the real work under our own output.
 */

import {
  DOCUMENT_DIRS,
  EXCLUDED_PREFIXES,
  MAX_ARTIFACT_BYTES,
  MAX_CANDIDATES_PER_REPO,
  MIN_IMAGE_BYTES,
  type TreeEntry,
  classifyRepoFile,
  fileExtension,
  isInDocumentDirectory,
  planRepoArtifactIngest,
  scanTreeForArtifacts,
  titleFromFilename,
} from '../repoArtifactScan';

const blob = (path: string, size = 50_000, sha = 'abc123'): TreeEntry => ({ path, type: 'blob', size, sha });

const isCandidate = (v: ReturnType<typeof classifyRepoFile>): boolean => !('reason' in v);
const reasonFor = (v: ReturnType<typeof classifyRepoFile>): string => ('reason' in v ? v.reason : 'ACCEPTED');

/** Omolola's repository, exactly as the git tree holds it. */
const SARATOGA: TreeEntry[] = [
  blob('.colaberry/connect.txt', 33),
  blob('CLAUDE.md', 4786),
  blob('app/assets.html', 7017),
  blob('app/budget.html', 5266),
  blob('app/history.html', 6692),
  blob('app/login.html', 3381),
  blob('app/permits.html', 6932),
  blob('app/portal.html', 6020),
  blob('app/system.html', 5612),
  blob('app/testing.html', 5625),
  blob('docs/CUTOVER.md', 2761),
  blob('docs/DATA_CONTRACT.md', 7429),
  blob('docs/REQUIREMENTS.md', 2733),
  blob('docs/SECURITY.md', 7159),
  blob('docs/STORIES.md', 2878),
  blob('docs/TEST-REPORT.md', 5272),
  blob('docs/TRACEABILITY.md', 781),
  blob('docs/VIDEOS AND INFOGRAPHICS/Municipal_Software_Project_Briefing.png', 4_554_283),
  blob('docs/VIDEOS AND INFOGRAPHICS/Municipal_System_Architecture_Diagram.png', 3_992_185),
  blob('docs/project-overview.html', 50_207),
  ...Array.from({ length: 14 }, (_, i) => blob(`docs/stories/STORY-${String(i).padStart(3, '0')}.md`, 2000)),
  blob('index.html', 600),
  blob('package.json', 900),
  blob('assets/app.js', 4331),
  blob('assets/styles.css', 7896),
  { path: 'docs', type: 'tree' },
];

describe('the Saratoga Springs repository, end to end', () => {
  const { candidates, skipped } = scanTreeForArtifacts(SARATOGA);

  it('finds the six deliverables that are hers, and nothing else', () => {
    // Ten files survive the type and place rules; four of those are documents the SBP
    // wrote into her repo (DATA_CONTRACT, REQUIREMENTS, STORIES, TRACEABILITY), so six
    // are hers. Code-unit order, so uppercase sorts before lowercase.
    expect(candidates.map((c) => c.repoPath)).toEqual([
      'docs/CUTOVER.md',
      'docs/SECURITY.md',
      'docs/TEST-REPORT.md',
      'docs/VIDEOS AND INFOGRAPHICS/Municipal_Software_Project_Briefing.png',
      'docs/VIDEOS AND INFOGRAPHICS/Municipal_System_Architecture_Diagram.png',
      'docs/project-overview.html',
    ]);
  });

  it('leaves the application\'s own screens alone', () => {
    for (const p of ['app/permits.html', 'app/login.html', 'app/portal.html']) {
      expect(skipped.find((s) => s.repoPath === p)?.reason).toBe('not_in_a_documents_directory');
    }
  });

  it('leaves the fourteen story documents WE generated alone', () => {
    const stories = skipped.filter((s) => s.repoPath.startsWith('docs/stories/'));
    expect(stories).toHaveLength(14);
    expect(new Set(stories.map((s) => s.reason))).toEqual(new Set(['excluded_path']));
  });

  it('leaves config and the Command Center shell alone', () => {
    expect(skipped.find((s) => s.repoPath === 'CLAUDE.md')?.reason).toBe('excluded_name');
    expect(skipped.find((s) => s.repoPath === 'index.html')?.reason).toBe('excluded_name');
    expect(skipped.find((s) => s.repoPath === '.colaberry/connect.txt')?.reason).toBe('dot_directory');
  });

  it('flags her three own markdown documents as the wrong format, without hiding them', () => {
    const md = candidates.filter((c) => c.wrongFormat);
    expect(md.map((c) => c.repoPath)).toEqual([
      'docs/CUTOVER.md', 'docs/SECURITY.md', 'docs/TEST-REPORT.md',
    ]);
    expect(md.every((c) => c.extension === 'md')).toBe(true);
  });

  it('drops the four documents the SBP wrote into her repo', () => {
    const generated = skipped.filter((s) => s.reason === 'platform_generated').map((s) => s.repoPath);
    expect(generated.sort()).toEqual([
      'docs/DATA_CONTRACT.md', 'docs/REQUIREMENTS.md', 'docs/STORIES.md', 'docs/TRACEABILITY.md',
    ]);
  });

  it('does not flag the infographics or the HTML overview', () => {
    expect(candidates.filter((c) => !c.wrongFormat).map((c) => c.extension).sort())
      .toEqual(['html', 'png', 'png']);
  });
});

describe('our own mirror must never be re-imported', () => {
  it('skips artifacts/, which is where artifactRepoSync writes', () => {
    // Without this the ingest would re-import every uploaded artifact as a repo
    // discovery, double counting them and growing the set on every single run.
    expect(reasonFor(classifyRepoFile(blob('artifacts/week-01/governance.pdf', 90_000))))
      .toBe('excluded_path');
  });

  it('skips it at any depth, not just at the root', () => {
    expect(reasonFor(classifyRepoFile(blob('packages/web/artifacts/week-02/plan.pdf', 90_000))))
      .toBe('excluded_path');
  });

  it.each(EXCLUDED_PREFIXES)('skips %s', (prefix) => {
    expect(reasonFor(classifyRepoFile(blob(`${prefix}something.pdf`, 90_000)))).toBe('excluded_path');
  });
});

describe('machine output is not a deliverable', () => {
  // The first real run wanted 946 artifacts from one intern: per-screen walkthrough
  // screenshots emitted by his own test gates, under a dot-directory.
  it('skips the 946-screenshot case at its real path', () => {
    expect(reasonFor(classifyRepoFile(blob('.alveara/gates/B/evidence/walkthroughs-desktop/board/10-phone.png', 90_000))))
      .toBe('dot_directory');
  });

  it('skips ANY dot-directory, so the next tool needs no new entry', () => {
    for (const p of ['.github/x.pdf', '.venv/y.pdf', '.next/z.png', '.somethingnew/a.pdf']) {
      expect(reasonFor(classifyRepoFile(blob(p, 90_000)))).toBe('dot_directory');
    }
  });

  it('does not mistake a dotted FILE for a dot-directory', () => {
    expect(isCandidate(classifyRepoFile(blob('docs/report.v2.final.pdf', 90_000)))).toBe(true);
  });

  it.each(['evidence', 'screenshots', 'test-results', 'playwright-report', '__snapshots__', 'gates'])(
    'skips a %s directory at any depth', (dir) => {
      expect(reasonFor(classifyRepoFile(blob(`app/${dir}/shot.png`, 90_000)))).toBe('machine_output');
    });

  it('still takes a screenshot the student filed under docs/images', () => {
    expect(isCandidate(classifyRepoFile(blob('docs/images/login.png', 90_000)))).toBe(true);
  });
});

describe('a repo that produces too much is refused, never truncated', () => {
  const many = (n: number): TreeEntry[] =>
    Array.from({ length: n }, (_, i) => blob(`docs/doc-${String(i).padStart(4, '0')}.pdf`, 90_000));

  it('plans normally at the limit', () => {
    const plan = planRepoArtifactIngest(scanTreeForArtifacts(many(MAX_CANDIDATES_PER_REPO)), []);
    expect(plan.toCreate).toHaveLength(MAX_CANDIDATES_PER_REPO);
    expect(plan.tooMany).toBeUndefined();
  });

  it('records NOTHING one past the limit, rather than an arbitrary slice', () => {
    const plan = planRepoArtifactIngest(scanTreeForArtifacts(many(MAX_CANDIDATES_PER_REPO + 1)), []);
    expect(plan.toCreate).toEqual([]);
    expect(plan.tooMany).toEqual({ found: MAX_CANDIDATES_PER_REPO + 1, limit: MAX_CANDIDATES_PER_REPO });
  });

  it('judges on everything found, so a repo cannot creep past the limit over several runs', () => {
    const scan = scanTreeForArtifacts(many(MAX_CANDIDATES_PER_REPO + 5));
    const alreadyHave = scan.candidates.slice(0, 10).map((c) => c.repoPath);
    expect(planRepoArtifactIngest(scan, alreadyHave).tooMany).toBeDefined();
  });
});

describe('our own generated documents are not the student\'s artifacts', () => {
  // Found by dry-running across every connected repo: the same four filenames came
  // back for five different interns. services/sbp/docsBundle.ts confirms we write them.
  it.each([
    'docs/CONNECT-YOUR-REPO.md',
    'docs/REQUIREMENTS.md',
    'docs/STORIES.md',
    'docs/TRACEABILITY.md',
    'docs/DATA_CONTRACT.md',
    'docs/COMMAND_CENTER_DATA_CONTRACT.md',
  ])('skips %s, which the SBP wrote', (path) => {
    expect(reasonFor(classifyRepoFile(blob(path, 7000)))).toBe('platform_generated');
  });

  it('still takes documents the student added themselves alongside them', () => {
    // Omolola wrote these three; they are not in the generated bundle.
    for (const p of ['docs/TEST-REPORT.md', 'docs/CUTOVER.md', 'docs/SECURITY.md']) {
      expect(isCandidate(classifyRepoFile(blob(p, 5000)))).toBe(true);
    }
  });

  it('skips Claude Code session logs, which are a working record', () => {
    expect(reasonFor(classifyRepoFile(blob('docs/sessions/CC-20261023-b6bz.md', 22_000))))
      .toBe('excluded_path');
  });
});

describe('brand furniture is not an artifact', () => {
  it('skips a logo that clears the size floor', () => {
    // colaberry-logo.png at 25KB passed the first real run. It should not have.
    expect(reasonFor(classifyRepoFile(blob('backend/app/web_assets/colaberry-logo.png', 25_000))))
      .toBe('image_is_furniture');
  });

  it.each(['favicon.png', 'icon-512.png', 'hero_banner.jpg', 'bg-tile.png', 'user_avatar.png'])(
    'skips %s', (name) => {
      expect(reasonFor(classifyRepoFile(blob(`docs/${name}`, 90_000)))).toBe('image_is_furniture');
    });

  it('does NOT mistake a real screenshot for furniture', () => {
    for (const p of ['docs/images/toolsmithai-login.png', 'docs/Municipal_System_Architecture_Diagram.png']) {
      expect(isCandidate(classifyRepoFile(blob(p, 500_000)))).toBe(true);
    }
  });

  it('matches the word, not a fragment of another word', () => {
    // "logout" contains "logo" and is not a logo.
    expect(isCandidate(classifyRepoFile(blob('docs/logout-flow.png', 90_000)))).toBe(true);
  });
});

describe('standalone types count anywhere; text-shaped types only in a documents directory', () => {
  it('takes a PDF from the repo root, because nobody commits a PDF as source', () => {
    expect(isCandidate(classifyRepoFile(blob('Proposal.pdf', 200_000)))).toBe(true);
  });

  it('takes a deck or a spreadsheet from anywhere', () => {
    expect(isCandidate(classifyRepoFile(blob('deliverable/Showcase.pptx', 400_000)))).toBe(true);
    expect(isCandidate(classifyRepoFile(blob('analysis/Costs.xlsx', 60_000)))).toBe(true);
  });

  it('refuses markdown at the repo root, where boilerplate lives', () => {
    expect(reasonFor(classifyRepoFile(blob('ARCHITECTURE.md', 9000)))).toBe('not_in_a_documents_directory');
  });

  it.each(DOCUMENT_DIRS)('accepts markdown inside %s', (dir) => {
    expect(isCandidate(classifyRepoFile(blob(`${dir}design-note.md`, 9000)))).toBe(true);
  });

  it('accepts a documents directory nested anywhere', () => {
    expect(isCandidate(classifyRepoFile(blob('packages/web/docs/runbook.md', 9000)))).toBe(true);
  });

  it('never takes source code, whatever directory it is in', () => {
    for (const p of ['docs/build.js', 'docs/style.css', 'src/index.ts', 'docs/data.json']) {
      expect(reasonFor(classifyRepoFile(blob(p, 9000)))).toBe('type_not_ingestible');
    }
  });

  it('does not take SVG, which is nearly always an icon here', () => {
    expect(reasonFor(classifyRepoFile(blob('docs/logo.svg', 9000)))).toBe('type_not_ingestible');
  });
});

describe('size bounds', () => {
  it('ignores an icon-sized image but keeps a real screenshot', () => {
    // Not named like furniture, so size is what decides it. A file actually called
    // favicon.png is caught earlier and more informatively, as image_is_furniture.
    expect(reasonFor(classifyRepoFile(blob('docs/step1.png', 2_000)))).toBe('too_small');
    // Harpreet's actual login screenshot.
    expect(isCandidate(classifyRepoFile(blob('docs/images/toolsmithai-login.png', 513_316)))).toBe(true);
  });

  it('uses a higher floor for images than for documents', () => {
    expect(reasonFor(classifyRepoFile(blob('docs/small.png', MIN_IMAGE_BYTES - 1)))).toBe('too_small');
    expect(isCandidate(classifyRepoFile(blob('docs/small.md', 600)))).toBe(true);
  });

  it('ignores a stub document', () => {
    expect(reasonFor(classifyRepoFile(blob('docs/empty.md', 10)))).toBe('too_small');
  });

  it('ignores something far too big to be a document to read', () => {
    expect(reasonFor(classifyRepoFile(blob('docs/dataset.csv', MAX_ARTIFACT_BYTES + 1)))).toBe('too_large');
  });

  it('keeps a 4MB infographic, which is the real case this bound was set around', () => {
    expect(isCandidate(classifyRepoFile(blob('docs/brief.png', 4_554_283)))).toBe(true);
  });
});

describe('boundary and malformed input', () => {
  it('ignores directories', () => {
    expect(reasonFor(classifyRepoFile({ path: 'docs', type: 'tree' }))).toBe('not_a_blob');
  });

  it('ignores a file with no extension', () => {
    expect(reasonFor(classifyRepoFile(blob('docs/Makefile', 9000)))).toBe('no_extension');
  });

  it('treats a missing size as zero rather than throwing', () => {
    expect(reasonFor(classifyRepoFile({ path: 'docs/a.md', type: 'blob' }))).toBe('too_small');
  });

  it('survives an empty or absent tree', () => {
    expect(scanTreeForArtifacts([]).candidates).toEqual([]);
    expect(scanTreeForArtifacts(null).candidates).toEqual([]);
    expect(scanTreeForArtifacts(undefined).skipped).toEqual([]);
  });

  it('matches extensions case-insensitively', () => {
    expect(isCandidate(classifyRepoFile(blob('docs/Report.PDF', 90_000)))).toBe(true);
    expect(isCandidate(classifyRepoFile(blob('DOCS/Note.MD', 9000)))).toBe(true);
  });

  it('returns candidates in a stable order regardless of tree order', () => {
    const a = scanTreeForArtifacts([blob('docs/b.pdf'), blob('docs/a.pdf')]);
    const b = scanTreeForArtifacts([blob('docs/a.pdf'), blob('docs/b.pdf')]);
    expect(a.candidates.map((c) => c.repoPath)).toEqual(b.candidates.map((c) => c.repoPath));
  });
});

describe('helpers', () => {
  it('fileExtension reads only the final extension', () => {
    expect(fileExtension('docs/report.final.pdf')).toBe('pdf');
    expect(fileExtension('docs/Makefile')).toBeNull();
    expect(fileExtension('docs/.gitignore')).toBeNull();
  });

  it('isInDocumentDirectory does not match a directory that merely starts the same', () => {
    expect(isInDocumentDirectory('docs/x.md')).toBe(true);
    expect(isInDocumentDirectory('docker/x.md')).toBe(false);
  });

  it('titleFromFilename uses the name the student chose and invents nothing', () => {
    expect(titleFromFilename('Municipal_Software_Project_Briefing.png')).toBe('Municipal Software Project Briefing');
    expect(titleFromFilename('TEST-REPORT.md')).toBe('TEST REPORT');
    expect(titleFromFilename('report.pdf')).toBe('report');
  });
});

describe('planRepoArtifactIngest is idempotent on repo_path', () => {
  const scan = scanTreeForArtifacts([blob('docs/a.pdf', 90_000), blob('docs/b.pdf', 90_000)]);

  it('creates everything on a first run', () => {
    const plan = planRepoArtifactIngest(scan, []);
    expect(plan.toCreate).toHaveLength(2);
    expect(plan.alreadyPresent).toHaveLength(0);
  });

  it('creates nothing on a second run — the guarantee that lets this be a cron', () => {
    const plan = planRepoArtifactIngest(scan, ['docs/a.pdf', 'docs/b.pdf']);
    expect(plan.toCreate).toHaveLength(0);
    expect(plan.alreadyPresent).toHaveLength(2);
  });

  it('creates only the new one when a document is added', () => {
    const plan = planRepoArtifactIngest(scan, ['docs/a.pdf']);
    expect(plan.toCreate.map((c) => c.repoPath)).toEqual(['docs/b.pdf']);
  });

  it('does not duplicate when a document is EDITED in place', () => {
    // The artifact is the document; its current version is whatever the repo holds.
    const edited = scanTreeForArtifacts([blob('docs/a.pdf', 123_456, 'a-different-blob-sha')]);
    expect(planRepoArtifactIngest(edited, ['docs/a.pdf']).toCreate).toHaveLength(0);
  });

  it('matches an existing path case-insensitively', () => {
    expect(planRepoArtifactIngest(scan, ['DOCS/A.PDF', 'docs/b.pdf']).toCreate).toHaveLength(0);
  });
});
