/**
 * docsBundle — the no-git fallback.
 *
 * The claim being tested is parity: what a student downloads is the SAME
 * document set a connected repo receives, from the same pure renderer, plus one
 * file explaining what the download cannot do. If those drift, a student who
 * downloads today and connects next week sees an inexplicable diff on their
 * first sync.
 */

const mockPublished = jest.fn();
const mockLatest = jest.fn();
jest.mock('../planStore', () => ({
  getPublishedPlan: (...a: unknown[]) => mockPublished(...a),
  getPlan: (...a: unknown[]) => mockLatest(...a),
}));

import { buildDocsBundle, renderBundleNotice, BUNDLE_NOTICE_PATH } from '../docsBundle';
import { renderDocs } from '../renderDocs';
import { RepoConnectError } from '../repoConnect/connectErrors';
import { BuildPlan } from '../planContract';
import raw from './fixtures/pilot-dryrun-plan.json';

const pilot = raw as unknown as BuildPlan;
const PRJ = '248d9d63-2543-45a1-b3f9-d1f691a8428a';
const AT = new Date('2026-08-14T00:00:00Z');

const stored = (over: Record<string, unknown> = {}) => ({
  id: 'plan-1', project_id: PRJ, version: 3, status: 'published',
  plan: pilot, plan_sha256: 'abc123', gate_ok: true, gate_violations: [],
  model: null, attempts: 1, correlation_id: 'corr-1',
  published_at: '2026-08-14T00:00:00Z', created_at: '2026-08-13T00:00:00Z', ...over,
});

/** Minimal STORE-zip reader, enough to list and read entries. */
function readZip(buf: Buffer): Record<string, string> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) { if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; } }
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const out: Record<string, string> = {};
  for (let n = 0; n < count; n++) {
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.subarray(offset + 46, offset + 46 + nameLen).toString('utf8');
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const size = buf.readUInt32LE(localOffset + 22);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    out[name] = buf.subarray(start, start + size).toString('utf8');
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPublished.mockResolvedValue(stored());
  mockLatest.mockResolvedValue(null);
});

describe('buildDocsBundle', () => {
  it('contains exactly the repo document set plus the connect notice', async () => {
    const bundle = await buildDocsBundle(PRJ, { generatedAt: AT });
    const inRepo = renderDocs(pilot, {
      repoUrl: null, generatedAt: AT.toISOString(), planVersion: 3, planSha256: 'abc123', correlationId: 'corr-1',
    });

    const entries = readZip(bundle.bytes);
    expect(Object.keys(entries).sort()).toEqual([BUNDLE_NOTICE_PATH, ...inRepo.map((f) => f.path)].sort());

    // PARITY, byte for byte. This is the assertion that stops the download and
    // the repo from drifting into two different products.
    for (const file of inRepo) expect(entries[file.path]).toBe(file.content);
  });

  it('cites no clone URL, because there is no repo to clone', async () => {
    const entries = readZip((await buildDocsBundle(PRJ, { generatedAt: AT })).bytes);
    expect(entries['CLAUDE.md']).not.toContain('## This repo');
    expect(entries['CLAUDE.md']).not.toMatch(/https:\/\/github\.com\/\S+/);
  });

  it('leads with a notice that says verification and points need a repo', async () => {
    const notice = readZip((await buildDocsBundle(PRJ, { generatedAt: AT })).bytes)[BUNDLE_NOTICE_PATH];
    expect(notice).toMatch(/no points are awarded/i);
    expect(notice).toMatch(/verified/i);
    expect(notice).toMatch(/Connect your repo/i);
    // It is a nudge, not a scolding: it says what connecting GIVES you.
    expect(notice).toMatch(/under your own account/i);
    expect(notice).toMatch(/your code/i);
  });

  it('is the first entry, so it is the first thing in any archive listing', async () => {
    const bundle = await buildDocsBundle(PRJ, { generatedAt: AT });
    expect(bundle.paths[0]).toBe(BUNDLE_NOTICE_PATH);
  });

  it('names the file after the project and the plan version', async () => {
    const bundle = await buildDocsBundle(PRJ, { generatedAt: AT });
    expect(bundle.filename).toMatch(/^[a-z0-9-]+-build-docs-v3\.zip$/);
    // ASCII only, so no Content-Disposition encoding dance is needed.
    expect(bundle.filename).toMatch(/^[\x20-\x7e]+$/);
    expect(bundle.published).toBe(true);
  });

  it('is deterministic for a fixed generation time', async () => {
    const a = await buildDocsBundle(PRJ, { generatedAt: AT });
    const b = await buildDocsBundle(PRJ, { generatedAt: AT });
    expect(a.bytes.equals(b.bytes)).toBe(true);
  });

  it('falls back to the latest draft and SAYS it is a draft', async () => {
    mockPublished.mockResolvedValue(null);
    mockLatest.mockResolvedValue(stored({ status: 'draft', version: 1, published_at: null }));
    const bundle = await buildDocsBundle(PRJ, { generatedAt: AT });
    expect(bundle.published).toBe(false);
    expect(bundle.planVersion).toBe(1);
  });

  it('refuses clearly when there is no plan at all', async () => {
    mockPublished.mockResolvedValue(null);
    mockLatest.mockResolvedValue(null);
    await expect(buildDocsBundle(PRJ)).rejects.toMatchObject({
      error_class: 'NoPublishedPlan',
      http_status: 409,
    });
    await expect(buildDocsBundle(PRJ)).rejects.toBeInstanceOf(RepoConnectError);
  });
});

describe('renderBundleNotice', () => {
  it('is a repo-shaped path, so connecting later does not leave a stray root file', () => {
    expect(BUNDLE_NOTICE_PATH.startsWith('docs/')).toBe(true);
  });

  it('names the project and warns that unzipping overwrites the doc paths', () => {
    const notice = renderBundleNotice('Nightshift Dispatch', PRJ);
    expect(notice).toContain('Nightshift Dispatch');
    expect(notice).toContain(PRJ);
    expect(notice).toMatch(/overwrite/i);
    // And states the write allowlist, so "will this touch my code" is answered.
    expect(notice).toMatch(/source code is never touched/i);
  });
});
