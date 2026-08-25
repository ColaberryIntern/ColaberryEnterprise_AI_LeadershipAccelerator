/**
 * caseStudyManifestReader — T006 acceptance tests.
 *
 * Every case here is built from a string literal. The module under test does no
 * I/O, so nothing is mocked except `console.log` (to keep the run quiet and to
 * assert what the log line does NOT contain) and `globalThis.fetch` (to prove a
 * URL inside a manifest never becomes a request). The suite therefore passes
 * with `DATABASE_URL` unset — there is no model, no Sequelize and no connection
 * anywhere in the import graph, which the "no network capability" block below
 * asserts statically rather than assuming.
 *
 * Ordered to match plan.md's six acceptance criteria: precedence and YAML (AC1),
 * malformed JSON (AC2), declared-fields-only + requested_surfaces (AC3),
 * outcome metrics always pending (AC4), no fetch vector (AC5), no hand-written
 * YAML parser (AC6). Each block carries a failure or boundary case, not only a
 * happy path.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  readCaseStudyManifest,
  pickManifestFilename,
  CASE_STUDY_MANIFEST_FILENAMES,
  PARSEABLE_MANIFEST_FILENAME,
  MAX_MANIFEST_BYTES,
  MAX_MANIFEST_REPOS,
  MAX_MANIFEST_OUTCOMES,
  MAX_MANIFEST_LIST_ITEMS,
  MAX_MANIFEST_DEPTH,
} from '../caseStudyManifestReader';
import type { CaseStudyManifestReadResult } from '../caseStudyManifestReader';

const MODULE_PATH = path.join(__dirname, '..', 'caseStudyManifestReader.ts');
const TYPES_PATH = path.join(__dirname, '..', '..', '..', 'types', 'caseStudy.ts');
const BACKEND_PACKAGE_JSON = path.join(__dirname, '..', '..', '..', '..', 'package.json');
const MODULE_SOURCE = fs.readFileSync(MODULE_PATH, 'utf8');

/** The spec §8 worked example, converted to JSON. Mirrors docs/case-study/case-study-schema.md. */
const SPEC_EXAMPLE = JSON.stringify({
  schema_version: 1,
  project: { slug: 'claims-triage-copilot', title: 'Claims triage copilot for first-notice-of-loss' },
  classification: {
    industry: 'Insurance',
    capabilities: ['rag', 'document-ai'],
    stack: ['Claude', 'Python', 'FastAPI'],
    method: 'AADM',
  },
  built_by: { type: 'client_team', program: 'Enterprise Accelerator' },
  publication: { requested_surfaces: ['enterprise', 'training', 'ai-flotation'] },
  consent: { organization_named: false, builders_named: false, public_repo_link: false },
  repos: [{ role: 'primary', url: 'https://github.com/example/claims-triage' }],
  outcomes: [{
    key: 'triage_time',
    label: 'Triage time per claim',
    value_display: '40 → 12 min',
    verification_method: 'client',
    evidence_ref: 'client-ops-report-2026-06',
  }],
});

function parsed(result: CaseStudyManifestReadResult) {
  if (result.status !== 'parsed') throw new Error(`expected parsed, got ${result.status}`);
  return result;
}

function malformed(result: CaseStudyManifestReadResult) {
  if (result.status !== 'malformed') throw new Error(`expected malformed, got ${result.status}`);
  return result;
}

/** What the sync does with each outcome. Only `parsed` yields manifest facts. */
function syncDecision(result: CaseStudyManifestReadResult): 'manifest' | 'repo_inference' {
  return result.status === 'parsed' ? 'manifest' : 'repo_inference';
}

let logSpy: jest.SpyInstance;
let fetchSpy: jest.Mock;
const realFetch = (globalThis as Record<string, unknown>).fetch;

beforeEach(() => {
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  fetchSpy = jest.fn();
  (globalThis as Record<string, unknown>).fetch = fetchSpy;
});

afterEach(() => {
  logSpy.mockRestore();
  (globalThis as Record<string, unknown>).fetch = realFetch;
});

/* ── AC1 — recognition, precedence, and the YAML deferral ─────────────────── */

describe('filename recognition and precedence', () => {
  it('recognises the three names in spec §8 order', () => {
    expect([...CASE_STUDY_MANIFEST_FILENAMES]).toEqual(['case-study.yml', 'case-study.yaml', 'case-study.json']);
  });

  it('picks yml over yaml over json when a repo ships more than one', () => {
    expect(pickManifestFilename(['case-study.json', 'case-study.yaml', 'case-study.yml'])).toBe('case-study.yml');
    expect(pickManifestFilename(['case-study.json', 'case-study.yaml'])).toBe('case-study.yaml');
    expect(pickManifestFilename(['README.md', 'case-study.json'])).toBe('case-study.json');
  });

  it('returns null when a repo ships no manifest', () => {
    expect(pickManifestFilename([])).toBeNull();
    expect(pickManifestFilename(['README.md', 'package.json', 'case-study.toml'])).toBeNull();
  });

  it('matches on the basename only, case-insensitively, from either slash style', () => {
    expect(pickManifestFilename(['docs/Case-Study.JSON'])).toBe('case-study.json');
    expect(pickManifestFilename(['a\\b\\case-study.json'])).toBe('case-study.json');
  });
});

describe('YAML is a documented deferral, not a failure', () => {
  it.each(['case-study.yml', 'case-study.yaml'])('%s returns unsupported_manifest_format without throwing', (name) => {
    const result = readCaseStudyManifest(name, 'schema_version: 1\nproject:\n  slug: a\n');
    expect(result).toEqual({
      status: 'unsupported_format',
      filename: name,
      error_class: 'UnsupportedManifestFormat',
      reason: 'unsupported_manifest_format',
      format: 'yaml',
    });
    expect(syncDecision(result)).toBe('repo_inference');
  });

  it('does not opportunistically JSON-parse a .yml, even when its bytes are valid JSON', () => {
    // YAML is a JSON superset, so this WOULD parse. Reading it anyway would mean
    // picking a file the author did not designate as the manifest.
    const result = readCaseStudyManifest('case-study.yml', SPEC_EXAMPLE);
    expect(result.status).toBe('unsupported_format');
  });

  it('only case-study.json is parseable in this build', () => {
    expect(PARSEABLE_MANIFEST_FILENAME).toBe('case-study.json');
  });

  /* AC6 — the reason YAML is deferred, asserted rather than asserted-to. */
  it('backend/package.json declares no YAML parser', () => {
    const pkg = JSON.parse(fs.readFileSync(BACKEND_PACKAGE_JSON, 'utf8')) as {
      dependencies?: Record<string, string>; devDependencies?: Record<string, string>;
    };
    const declared = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(declared.filter((d) => /ya?ml/i.test(d))).toEqual([]);
  });

  it('contains no hand-written YAML parser — every yaml mention is a name, a literal or a comment', () => {
    const offending = MODULE_SOURCE.split('\n').filter((line) => /yaml/i.test(line)).filter((line) => {
      const trimmed = line.trim();
      const isComment = trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*');
      const isFilenameConst = trimmed.startsWith('export const CASE_STUDY_MANIFEST_FILENAMES');
      const isFormatLiteral = trimmed.includes("format: 'yaml'");
      return !isComment && !isFilenameConst && !isFormatLiteral;
    });
    expect(offending).toEqual([]);
    expect(MODULE_SOURCE).not.toMatch(/function\s+\w*[Yy]aml/);
  });
});

/* ── absent: nothing to be authoritative about ────────────────────────────── */

describe('absent', () => {
  it.each([
    [undefined, 'no_manifest_file'],
    [null, 'no_manifest_file'],
    ['', 'no_manifest_file'],
    ['   ', 'no_manifest_file'],
  ])('filename %p is %s', (name, reason) => {
    const result = readCaseStudyManifest(name as string | null | undefined, '{}');
    expect(result).toEqual({ status: 'absent', filename: null, reason });
  });

  it('an unrecognised filename is absent, not an error', () => {
    const result = readCaseStudyManifest('case-study.toml', 'anything');
    expect(result).toEqual({ status: 'absent', filename: 'case-study.toml', reason: 'unrecognized_filename' });
  });

  it.each(['', '   ', '\n\t '])('an empty case-study.json (%p) is absent, not malformed', (contents) => {
    // Zero bytes declares zero fields, so it is indistinguishable from no manifest.
    const result = readCaseStudyManifest('case-study.json', contents);
    expect(result).toEqual({ status: 'absent', filename: 'case-study.json', reason: 'empty_manifest' });
    expect(syncDecision(result)).toBe('repo_inference');
  });

  it('null contents on a recognised filename is absent', () => {
    expect(readCaseStudyManifest('case-study.json', null).status).toBe('absent');
  });
});

/* ── AC2 — malformed JSON is classified, never thrown, never blocking ─────── */

describe('malformed', () => {
  it('invalid JSON is classified MalformedManifest and the sync continues on repo inference', () => {
    const result = readCaseStudyManifest('case-study.json', '{ "project": { "title": "x" ');
    const bad = malformed(result);
    expect(bad.error_class).toBe('MalformedManifest');
    expect(bad.reason).toBe('invalid_json');
    expect(syncDecision(result)).toBe('repo_inference');
  });

  it('never throws for any hostile or nonsense byte string', () => {
    // The NUL case is written as the escape '\u0000', never as a literal 0x00 byte.
    // A raw NUL in the source makes every byte-oriented tool classify the whole file
    // as binary — grep refuses it, and a secret scanner or diff viewer may skip it
    // entirely, which is a poor property for a test file to have. The escape is the
    // same input to the parser under test.
    const inputs = ['', '{', '}', '[]', 'null', 'true', '"a string"', '42', '\u0000', '{"a":', '[[[[[[', '{}{}'];
    for (const input of inputs) {
      expect(() => readCaseStudyManifest('case-study.json', input)).not.toThrow();
    }
  });

  it.each(['[]', '"a string"', '42', 'true', 'null'])('a non-object top level (%s) is not_an_object', (contents) => {
    expect(malformed(readCaseStudyManifest('case-study.json', contents)).reason).toBe('not_an_object');
  });

  it('rejects a manifest above the byte bound before parsing it', () => {
    const oversized = `{"project":{"title":"${'a'.repeat(MAX_MANIFEST_BYTES + 10)}"}}`;
    const bad = malformed(readCaseStudyManifest('case-study.json', oversized));
    expect(bad.reason).toBe('manifest_too_large');
    expect(bad.detail).toContain(String(MAX_MANIFEST_BYTES));
    expect(bad.issues).toEqual([]);
  });

  it('bounds on raw bytes, not on schema-relevant content — accepts exactly the limit, rejects one byte more', () => {
    const head = '{"project":{"title":"T"},"_pad":"';
    const tail = '"}';
    const pad = (extra: number) => `${head}${'a'.repeat(MAX_MANIFEST_BYTES - head.length - tail.length + extra)}${tail}`;
    expect(Buffer.byteLength(pad(0), 'utf8')).toBe(MAX_MANIFEST_BYTES);
    expect(readCaseStudyManifest('case-study.json', pad(0)).status).toBe('parsed');
    expect(malformed(readCaseStudyManifest('case-study.json', pad(1))).reason).toBe('manifest_too_large');
  });

  it('rejects hostile nesting depth rather than recursing into it', () => {
    let deep: unknown = 'leaf';
    for (let i = 0; i < MAX_MANIFEST_DEPTH + 4; i += 1) deep = { nested: deep };
    const bad = malformed(readCaseStudyManifest('case-study.json', JSON.stringify({ project: deep })));
    expect(bad.reason).toBe('too_deeply_nested');
  });

  it.each([
    ['repos', MAX_MANIFEST_REPOS, () => ({ repos: Array.from({ length: MAX_MANIFEST_REPOS + 1 }, () => ({ url: 'acme/app' })) })],
    ['outcomes', MAX_MANIFEST_OUTCOMES, () => ({
      outcomes: Array.from({ length: MAX_MANIFEST_OUTCOMES + 1 }, (_, i) => ({ key: `m_${i}`, label: 'L', value_display: 'V' })),
    })],
    ['classification.capabilities', MAX_MANIFEST_LIST_ITEMS, () => ({
      classification: { capabilities: Array.from({ length: MAX_MANIFEST_LIST_ITEMS + 1 }, (_, i) => `cap-${i}`) },
    })],
  ])('caps %s at %i so a hostile file cannot exhaust memory', (label, _cap, build) => {
    const bad = malformed(readCaseStudyManifest('case-study.json', JSON.stringify(build())));
    expect(bad.reason).toBe('schema_violation');
    expect(bad.issues.some((i) => i.code === 'too_big')).toBe(true);
    expect(bad.issues.map((i) => i.path).join(' ')).toContain(label.split('.')[0]);
  });

  it('accepts exactly the cap', () => {
    const atCap = { repos: Array.from({ length: MAX_MANIFEST_REPOS }, () => ({ url: 'acme/app' })) };
    expect(parsed(readCaseStudyManifest('case-study.json', JSON.stringify(atCap))).manifest.repos).toHaveLength(MAX_MANIFEST_REPOS);
  });

  it.each([
    ['built_by.type', { built_by: { type: 'martians' } }],
    ['publication.requested_surfaces', { publication: { requested_surfaces: ['everywhere'] } }],
    ['repos[].role', { repos: [{ url: 'acme/app', role: 'wizardry' }] }],
    ['outcomes[].verification_method', { outcomes: [{ key: 'k', label: 'L', value_display: 'V', verification_method: 'vibes' }] }],
    ['schema_version', { schema_version: 2 }],
    ['project.slug', { project: { slug: 'Not A Slug' } }],
  ])('rejects an out-of-vocabulary value for %s', (_label, body) => {
    expect(malformed(readCaseStudyManifest('case-study.json', JSON.stringify(body))).reason).toBe('schema_violation');
  });

  it.each([
    ['http://', 'http://github.com/acme/app'],
    ['javascript:', 'javascript:alert(1)'],
    ['file:', 'file:///etc/passwd'],
    ['whitespace', 'https://github.com/acme/a pp'],
  ])('rejects a %s repo reference', (_label, url) => {
    expect(malformed(readCaseStudyManifest('case-study.json', JSON.stringify({ repos: [{ url }] }))).reason)
      .toBe('schema_violation');
  });

  it('reports Zod v4 issues with path and code, capped', () => {
    const bad = malformed(readCaseStudyManifest('case-study.json', JSON.stringify({ built_by: { type: 'martians' } })));
    expect(bad.issues[0]).toEqual(expect.objectContaining({ path: 'built_by.type', code: 'invalid_value' }));
    expect(bad.issues.length).toBeLessThanOrEqual(25);
  });
});

/* ── AC3a — authoritative ONLY for the fields it declares ─────────────────── */

describe('authority is exactly the declared set', () => {
  it('an empty object declares nothing and defaults nothing', () => {
    const result = parsed(readCaseStudyManifest('case-study.json', '{}'));
    expect(result.declaredFields).toEqual([]);
    expect(result.manifest).toEqual({});
    for (const value of Object.values(result.manifest)) expect(value).toBeUndefined();
  });

  it('a partial manifest declares only what it wrote', () => {
    const result = parsed(readCaseStudyManifest('case-study.json', '{"project":{"title":"Claims triage"}}'));
    expect(result.declaredFields).toEqual(['project', 'project.title']);
    expect(result.manifest.project).toEqual({ title: 'Claims triage' });
    expect(result.manifest.project?.slug).toBeUndefined();
    expect(result.manifest.classification).toBeUndefined();
    expect(result.manifest.consent).toBeUndefined();
    expect(result.manifest.repos).toBeUndefined();
  });

  it('a null declares nothing — it is not a value that could outrank repo evidence', () => {
    const result = parsed(readCaseStudyManifest('case-study.json', '{"project":{"title":"T","slug":null},"repos":null}'));
    expect(result.declaredFields).toEqual(['project', 'project.title']);
    expect(result.manifest.repos).toBeUndefined();
  });

  it('declares a false boolean — false is a declaration, absence is not', () => {
    const result = parsed(readCaseStudyManifest('case-study.json', '{"consent":{"organization_named":false}}'));
    expect(result.declaredFields).toEqual(['consent', 'consent.organization_named']);
    expect(result.manifest.consent).toEqual({
      organizationNamed: false, buildersNamed: undefined, publicRepoLink: undefined,
    });
  });

  it('strips unknown fields, reports them, and never treats them as authoritative', () => {
    const result = parsed(readCaseStudyManifest('case-study.json', JSON.stringify({
      project: { slug: 'a', tagline: 'marketing copy' },
      totally_made_up: { deep: true },
      repos: [{ url: 'acme/app', stars: 9000 }],
      outcomes: [{ key: 'k', label: 'L', value_display: 'V', verified: true }],
    })));
    expect(result.unknownFields).toEqual(
      expect.arrayContaining(['project.tagline', 'totally_made_up', 'repos[].stars', 'outcomes[].verified']),
    );
    expect(result.declaredFields).not.toContain('project.tagline');
    expect(JSON.stringify(result.manifest)).not.toContain('tagline');
    expect(JSON.stringify(result.manifest)).not.toContain('9000');
  });

  it('cannot pollute Object.prototype through a __proto__ key', () => {
    const result = readCaseStudyManifest('case-study.json', '{"__proto__":{"polluted":true},"project":{"title":"T"}}');
    expect(result.status).toBe('parsed');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('parses the spec §8 worked example end to end', () => {
    const result = parsed(readCaseStudyManifest('case-study.json', SPEC_EXAMPLE));
    expect(result.manifest.schemaVersion).toBe(1);
    expect(result.manifest.project).toEqual({ slug: 'claims-triage-copilot', title: 'Claims triage copilot for first-notice-of-loss' });
    expect(result.manifest.classification?.capabilities).toEqual(['rag', 'document-ai']);
    expect(result.manifest.builtBy?.type).toBe('client_team');
    expect(result.manifest.repos).toEqual([{ role: 'primary', url: 'https://github.com/example/claims-triage' }]);
    // Every path the manifest actually declares, and nothing else. This is the
    // load-bearing half of "a manifest is authoritative only for the fields it
    // declares" (spec §8): a path absent from this list must lose to real
    // repository evidence rather than silently outranking it with a default.
    expect(result.declaredFields).toEqual([
      'schema_version',
      'project',
      'project.slug',
      'project.title',
      'classification',
      'classification.industry',
      'classification.capabilities',
      'classification.stack',
      'classification.method',
      'built_by',
      'built_by.type',
      'built_by.program',
      'publication',
      'publication.requested_surfaces',
      'consent',
      'consent.organization_named',
      'consent.builders_named',
      'consent.public_repo_link',
      'repos',
      'outcomes',
    ]);
    expect(result.unknownFields).toEqual([]);
  });

  it('is deterministic — identical bytes give an identical result', () => {
    expect(readCaseStudyManifest('case-study.json', SPEC_EXAMPLE))
      .toEqual(readCaseStudyManifest('case-study.json', SPEC_EXAMPLE));
  });
});

/* ── AC3b — requested_surfaces is a request, never an authorisation ───────── */

describe('requested_surfaces never grants publication', () => {
  /** Stands in for the real publication row. Frozen so a write would throw in strict mode. */
  const publicationState = Object.freeze({ surfaceKey: 'enterprise', status: 'draft', publishedAt: null });

  it('parsing requested_surfaces: ["enterprise"] leaves publication state untouched', () => {
    const before = JSON.stringify(publicationState);
    const result = parsed(readCaseStudyManifest('case-study.json', '{"publication":{"requested_surfaces":["enterprise"]}}'));
    expect(result.manifest.publication?.requestedSurfaces).toEqual(['enterprise']);
    expect(result.authorizesPublication).toBe(false);
    expect(JSON.stringify(publicationState)).toBe(before);
    expect(publicationState.status).toBe('draft');
  });

  it('requesting every surface still authorises nothing', () => {
    const result = parsed(readCaseStudyManifest('case-study.json', JSON.stringify({
      publication: { requested_surfaces: ['enterprise', 'training', 'ai-flotation', 'refactored'] },
    })));
    expect(result.manifest.publication?.requestedSurfaces).toHaveLength(4);
    expect(result.authorizesPublication).toBe(false);
  });

  it('returns no field that could be mistaken for a grant', () => {
    const serialised = JSON.stringify(parsed(readCaseStudyManifest('case-study.json', SPEC_EXAMPLE)));
    expect(serialised).not.toMatch(/"(published|publishedAt|isPublished|approved|authorized|authorised)":/);
    expect(serialised).toContain('"authorizesPublication":false');
  });

  it('exports nothing that publishes', () => {
    expect(MODULE_SOURCE).not.toMatch(/authorizesPublication:\s*true/);
    expect(MODULE_SOURCE).not.toMatch(/\bpublish(Case|Snapshot|Surface)/);
  });
});

/* ── AC4 — a repository author cannot self-certify a business outcome ─────── */

describe('outcome metrics are always pending', () => {
  const outcome = (extra: Record<string, unknown> = {}) => JSON.stringify({
    outcomes: [{ key: 'triage_time', label: 'Triage time per claim', value_display: '40 → 12 min', ...extra }],
  });

  it('a declared verification_method: "client" still lands pending', () => {
    const result = parsed(readCaseStudyManifest('case-study.json', outcome({ verification_method: 'client' })));
    expect(result.manifest.outcomes?.[0]).toEqual({
      key: 'triage_time',
      label: 'Triage time per claim',
      valueDisplay: '40 → 12 min',
      verificationMethod: 'client',
      evidenceRef: undefined,
      verificationClass: 'pending',
    });
  });

  it.each(['client', 'repo', 'platform', 'internal', 'self', 'manual'])('method %s never promotes the class', (method) => {
    const result = parsed(readCaseStudyManifest('case-study.json', outcome({ verification_method: method })));
    expect(result.manifest.outcomes?.[0].verificationClass).toBe('pending');
  });

  it('a manifest that tries to declare itself verified is ignored', () => {
    const result = parsed(readCaseStudyManifest('case-study.json', outcome({
      verification_class: 'verified', verified: true, verified_at: '2026-08-22T00:00:00.000Z',
    })));
    expect(result.manifest.outcomes?.[0].verificationClass).toBe('pending');
    expect(result.unknownFields).toEqual(expect.arrayContaining(['outcomes[].verification_class']));
    expect(JSON.stringify(result.manifest)).not.toContain('verified');
  });

  it('no outcome in any manifest can come back verified', () => {
    const result = parsed(readCaseStudyManifest('case-study.json', SPEC_EXAMPLE));
    for (const entry of result.manifest.outcomes ?? []) expect(entry.verificationClass).toBe('pending');
    expect(MODULE_SOURCE).not.toMatch(/verificationClass:\s*'(verified|anonymized|illustrative)'/);
  });
});

/* ── AC5 — no fetch vector exists at all ──────────────────────────────────── */

describe('no network capability', () => {
  it('imports only zod and the leaf type module', () => {
    const specifiers = [...MODULE_SOURCE.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    expect(new Set(specifiers)).toEqual(new Set(['zod', '../../types/caseStudy']));
    expect(MODULE_SOURCE).not.toMatch(/\brequire\s*\(/);
    expect(MODULE_SOURCE).not.toMatch(/\bimport\s*\(/);
  });

  it('the one internal module it imports is itself a leaf that imports nothing', () => {
    expect(fs.readFileSync(TYPES_PATH, 'utf8')).not.toMatch(/^\s*import\s/m);
  });

  it('names no network client, model, database or analyzer in executable code', () => {
    // Comments are stripped first: the header deliberately NAMES the things it
    // refuses to import, and a prose mention is not a dependency.
    const code = MODULE_SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const forbidden of [
      'axios', 'node-fetch', 'undici', 'got(', 'Octokit', 'XMLHttpRequest', 'WebSocket',
      'child_process', 'fetchImpl', 'githubRepoClient', 'config/database', 'sequelize',
      'Sequelize', 'models/', 'caseStudyRepoAnalyzer', 'caseStudyRepoCollection',
    ]) {
      expect(code).not.toContain(forbidden);
    }
    expect(code).not.toMatch(/(^|[^.\w])fetch\s*\(/);
  });

  it('does not call fetch for a manifest full of URLs', () => {
    const result = readCaseStudyManifest('case-study.json', JSON.stringify({
      project: { title: 'T' },
      repos: [
        { url: 'https://github.com/acme/one' },
        { url: 'https://internal.example.com/redirect?to=http://169.254.169.254/latest/meta-data' },
      ],
      outcomes: [{ key: 'k', label: 'L', value_display: 'V', evidence_ref: 'https://example.com/report.pdf' }],
    }));
    expect(result.status).toBe('parsed');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not call fetch for any other outcome either', () => {
    readCaseStudyManifest('case-study.yml', 'a: b');
    readCaseStudyManifest('case-study.json', '{ broken');
    readCaseStudyManifest(null, null);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

/* ── logging, and the programmer-error boundary ───────────────────────────── */

describe('logging', () => {
  const lines = () => logSpy.mock.calls.map((call) => JSON.parse(String(call[0])) as Record<string, unknown>);

  it('emits one structured line per read with the required envelope', () => {
    readCaseStudyManifest('case-study.json', SPEC_EXAMPLE, { correlationId: 'corr-1', repoOwner: 'acme', repoName: 'app' });
    const [line] = lines();
    expect(line).toEqual(expect.objectContaining({
      level: 'info',
      service: 'case-study-manifest-reader',
      event: 'case_study_manifest_read',
      correlation_id: 'corr-1',
      repo_owner: 'acme',
      outcome: 'success',
      authorizes_publication: false,
    }));
    expect(typeof line.timestamp).toBe('string');
  });

  it('classifies a malformed manifest as a failure with a stable error_class', () => {
    readCaseStudyManifest('case-study.json', '{ nope');
    expect(lines()[0]).toEqual(expect.objectContaining({
      level: 'error', outcome: 'failure', error_class: 'MalformedManifest', reason: 'invalid_json',
    }));
  });

  it('never writes manifest contents, or a parser message quoting them, to a log line', () => {
    const secret = 'acme-internal-codename-bluebird';
    readCaseStudyManifest('case-study.json', `{"project":{"title":"${secret}"}}`);
    readCaseStudyManifest('case-study.json', `{"project":{"title":"${secret}"`);
    readCaseStudyManifest('case-study.json', `{"project":{"slug":"${secret} not a slug"}}`);
    const serialised = JSON.stringify(lines());
    expect(serialised).not.toContain(secret);
    expect(serialised).not.toContain('bluebird');
  });

  it('describes a JSON error by byte offset, not by quoting the source', () => {
    const bad = malformed(readCaseStudyManifest('case-study.json', '{"project":{"title":"secret-value",}}'));
    expect(bad.detail).toMatch(/^invalid JSON( at byte \d+)?$/);
    expect(bad.detail).not.toContain('secret-value');
  });
});

describe('programmer error', () => {
  it.each([[123], [{}], [[]], [true]])('throws TypeError for a non-string filename (%p)', (value) => {
    expect(() => readCaseStudyManifest(value as unknown as string, '{}')).toThrow(TypeError);
  });

  it('throws TypeError for non-string contents', () => {
    expect(() => readCaseStudyManifest('case-study.json', { a: 1 } as unknown as string)).toThrow(TypeError);
  });
});
