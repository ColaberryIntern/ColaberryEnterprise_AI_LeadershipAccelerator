/**
 * Manifest wiring — proves the spec §8 manifest reaches the reader THROUGH THE
 * REAL ANALYZER, with no `manifestContents` injection.
 *
 * WHY THIS SUITE EXISTS. Independent verification of T011 found the §8 feature
 * inert in production: `selectHighValueFiles` correctly chose `case-study.json`
 * and the client fetched it, but `DOCUMENT_RULES` is prose-only, so
 * `buildDocuments` dropped the body and it never reached `CaseStudyRepoFacts`.
 * The sync's `manifestContents` parameter — an override meant for an admin or a
 * test — was therefore the ONLY way to reach `caseStudyManifestReader`. No
 * production caller supplies it. A repository shipping a valid manifest had it
 * silently ignored, and because "absent manifest" is the normal case and never
 * an error, 472 passing tests said nothing was wrong.
 *
 * Every test below therefore asserts on `analyzeRepository`'s own output with
 * `fetchImpl` wired to a fake GitHub and NOTHING injected. If someone reverts
 * the analyzer to discard the body again, these fail.
 */
import {
  makeGitHubFake, json, fileReply, repoPayload, treePayload, SENTINEL_TOKEN,
} from './githubFetchFake';
import { analyzeRepository } from '../caseStudyRepoAnalyzer';
import type { RepoAnalysisOutcome, CaseStudyRepoFacts } from '../caseStudyRepoAnalyzer';
import { readCaseStudyManifest } from '../caseStudyManifestReader';

const VALID_MANIFEST = JSON.stringify({
  schema_version: 1,
  project: { slug: 'claims-triage', title: 'Claims triage copilot' },
  classification: { stack: ['Temporal', 'FastAPI'], capabilities: ['rag'] },
});

function factsOf(outcome: RepoAnalysisOutcome): CaseStudyRepoFacts {
  if (outcome.status === 'failed') {
    throw new Error(`expected facts, got failed (${outcome.error.error_class}: ${outcome.error.message})`);
  }
  return outcome.facts;
}

const realToken = process.env.GITHUB_TOKEN;
beforeEach(() => { process.env.GITHUB_TOKEN = SENTINEL_TOKEN; });
afterEach(() => {
  if (realToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = realToken;
});

/** A repo whose tree contains exactly the given files. */
function analyseWithManifests(files: Readonly<Record<string, string>>) {
  const gh = makeGitHubFake({
    repo: json(repoPayload()),
    tree: json(treePayload(Object.entries(files).map(([path, body]) => ({
      path, type: 'blob', size: Buffer.byteLength(body, 'utf8'),
    })))),
    file: (path) => fileReply(files[path] ?? ''),
  });
  return analyzeRepository({ owner: 'acme', repo: 'atlas', fetchImpl: gh.impl }).then((outcome) => ({ outcome, gh }));
}

describe('the analyzer carries the manifest body, it does not discard it', () => {
  it('a repo shipping case-study.json exposes its verbatim body on facts.manifestFile', async () => {
    const { outcome } = await analyseWithManifests({ 'case-study.json': VALID_MANIFEST });
    const facts = factsOf(outcome);

    expect(facts.manifestFile).not.toBeNull();
    expect(facts.manifestFile?.filename).toBe('case-study.json');
    // Verbatim, not an excerpt: a truncated JSON manifest cannot parse, which is
    // exactly why this must not travel through the `documents` path.
    expect(facts.manifestFile?.contents).toBe(VALID_MANIFEST);
    expect(facts.manifestFile?.bytes).toBe(Buffer.byteLength(VALID_MANIFEST, 'utf8'));
  });

  it('that body PARSES through the real reader — the end-to-end §8 claim', async () => {
    const { outcome } = await analyseWithManifests({ 'case-study.json': VALID_MANIFEST });
    const file = factsOf(outcome).manifestFile;

    const read = readCaseStudyManifest(file!.filename, file!.contents);

    expect(read.status).toBe('parsed');
    if (read.status !== 'parsed') throw new Error('unreachable');
    expect(read.manifest.project?.slug).toBe('claims-triage');
    expect(read.manifest.classification?.stack).toEqual(['Temporal', 'FastAPI']);
  });

  it('the manifest is NOT smuggled into documents — that path truncates', async () => {
    const { outcome } = await analyseWithManifests({ 'case-study.json': VALID_MANIFEST });
    const facts = factsOf(outcome);

    expect(facts.documents.some((doc) => doc.path === 'case-study.json')).toBe(false);
  });

  it('no second network read is added — the body comes from the fetch already made', async () => {
    const { outcome, gh } = await analyseWithManifests({ 'case-study.json': VALID_MANIFEST });
    factsOf(outcome);

    expect(gh.filePaths.filter((path) => path === 'case-study.json')).toHaveLength(1);
  });
});

describe('spec §8 precedence is the reader’s, not a second implementation', () => {
  it('a .yml is reported as unsupported rather than guessed at', async () => {
    const { outcome } = await analyseWithManifests({ 'case-study.yml': 'schema_version: 1\n' });
    const file = factsOf(outcome).manifestFile;

    expect(file?.filename).toBe('case-study.yml');
    expect(readCaseStudyManifest(file!.filename, file!.contents).status).toBe('unsupported_format');
  });

  it('a repo shipping BOTH .yml and .json yields the .yml — the higher-precedence file wins', async () => {
    // The dangerous alternative: silently parse the .json and present a partial
    // manifest as the whole truth, when the author designated the .yml.
    const { outcome } = await analyseWithManifests({
      'case-study.json': VALID_MANIFEST,
      'case-study.yml': 'schema_version: 1\n',
    });
    const file = factsOf(outcome).manifestFile;

    expect(file?.filename).toBe('case-study.yml');
    expect(readCaseStudyManifest(file!.filename, file!.contents).status).toBe('unsupported_format');
  });

  it('a repo shipping no manifest yields null, and that is not an error', async () => {
    const { outcome } = await analyseWithManifests({ 'README.md': '# atlas\n' });

    expect(factsOf(outcome).manifestFile).toBeNull();
    expect(outcome.status).not.toBe('failed');
  });
});

describe('a malformed manifest degrades, it does not crash the analysis', () => {
  it('carries the bytes anyway and lets the reader classify them', async () => {
    const { outcome } = await analyseWithManifests({ 'case-study.json': '{"schema_version": 1,' });
    const facts = factsOf(outcome);

    expect(facts.manifestFile?.contents).toBe('{"schema_version": 1,');

    const read = readCaseStudyManifest(facts.manifestFile!.filename, facts.manifestFile!.contents);
    expect(read.status).toBe('malformed');
    if (read.status !== 'malformed') throw new Error('unreachable');
    expect(read.error_class).toBe('MalformedManifest');
  });

  it('the analysis itself still produces usable facts alongside the bad manifest', async () => {
    const { outcome } = await analyseWithManifests({
      'case-study.json': 'not json at all',
      'README.md': '# atlas\n',
    });
    const facts = factsOf(outcome);

    // One bad file must never cost the rest of the evidence (spec §29).
    expect(facts.derived.hasReadme).toBe(true);
    expect(facts.manifestFile).not.toBeNull();
  });
});

describe('determinism survives the new field', () => {
  it('two identical analyses produce byte-identical facts, manifest included', async () => {
    const first = factsOf((await analyseWithManifests({ 'case-study.json': VALID_MANIFEST })).outcome);
    const second = factsOf((await analyseWithManifests({ 'case-study.json': VALID_MANIFEST })).outcome);

    // The run's headline guarantee is that an unchanged repository re-syncs to
    // `unchanged`. That holds only if the facts feeding the content hash are
    // stable — a manifest field that varied would break it silently.
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
