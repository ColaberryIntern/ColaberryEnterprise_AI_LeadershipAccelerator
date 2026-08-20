/**
 * docsBundle — the archive must never carry a file the student owns.
 *
 * ## The defect these tests exist to close
 *
 * The bundle was assembled by handing `renderDocs`' raw output to a human, and
 * `renderDocs` is a PURE renderer: it always emits `.colaberry/progress.json`
 * with every criterion `passed: false`, and `.colaberry/profile.json` as a
 * virgin seed. Every OTHER consumer of that render launders it through
 * `repoWriter`, which merges progress field by field and seeds a profile once
 * and never again. The download was the one path that skipped both guards, and
 * the UI told the student to "unzip them into your repo".
 *
 * A student who followed that instruction overwrote the file recording their
 * own verified progress and lost every tick they had earned.
 *
 * The ownership model is already stated in `profileContract.ts`:
 *
 *   .colaberry/plan.json      platform-owned  · replaced wholesale
 *   .colaberry/progress.json  co-owned        · merged field by field
 *   .colaberry/profile.json   STUDENT-OWNED   · seeded once, never overwritten
 *
 * These tests hold the bundle to it. The property under test is deliberately
 * stronger than "we warn about it": following the on-screen instruction
 * LITERALLY — a blind `unzip -o` over the student's folder — must not be able
 * to destroy anything, whatever the copy happens to say.
 */

const mockPublished = jest.fn();
const mockLatest = jest.fn();
jest.mock('../planStore', () => ({
  getPublishedPlan: (...a: unknown[]) => mockPublished(...a),
  getPlan: (...a: unknown[]) => mockLatest(...a),
}));

import { buildDocsBundle } from '../docsBundle';
import { PROGRESS_FILE_PATH } from '../verification/progressContract';
import { PROFILE_FILE_PATH } from '../profileContract';
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

describe('the archive never lands on a student-owned path', () => {
  it('carries no file at the live .colaberry/progress.json path', async () => {
    const entries = readZip((await buildDocsBundle(PRJ, { generatedAt: AT })).bytes);
    expect(Object.keys(entries)).not.toContain(PROGRESS_FILE_PATH);
  });

  it('carries no file at the live .colaberry/profile.json path', async () => {
    const entries = readZip((await buildDocsBundle(PRJ, { generatedAt: AT })).bytes);
    expect(Object.keys(entries)).not.toContain(PROFILE_FILE_PATH);
  });

  it('reports the same paths in `paths` as it actually wrote into the zip', async () => {
    const bundle = await buildDocsBundle(PRJ, { generatedAt: AT });
    expect(bundle.paths.sort()).toEqual(Object.keys(readZip(bundle.bytes)).sort());
  });
});

/**
 * THE PROPERTY. Not "does the copy warn about it" — the copy is the symptom.
 * This extracts the whole archive over a student's folder exactly the way
 * `unzip -o` would, and asserts the ticks are still there afterwards.
 */
describe('extracting the whole archive over a working repo', () => {
  /** A repo whose agent has ticked the first two criteria of STORY-001. */
  function studentRepo(): Record<string, string> {
    const story = pilot.stories.find((s) => s.id === 'STORY-001')!;
    const acceptance = (story as unknown as { acceptance: string[] }).acceptance;
    return {
      [PROGRESS_FILE_PATH]: `${JSON.stringify({
        schema_version: 1,
        project: pilot.project_name,
        stories: [{
          id: 'STORY-001',
          acceptance_total: acceptance.length,
          criteria: acceptance.map((text, i) => ({ text, passed: i < 2 })),
          files_touched: ['src/auth/magicLink.ts'],
          tests_added: ['src/auth/__tests__/magicLink.test.ts'],
          notes: 'Hand-repaired after the sync landed nothing.',
          updated_at: '2026-08-18T09:00:00Z',
        }],
      }, null, 2)}\n`,
      [PROFILE_FILE_PATH]: `${JSON.stringify({
        schema_version: 1,
        disclosure: 'public',
        headline: 'I build access-control systems that auditors like.',
      }, null, 2)}\n`,
    };
  }

  /** `unzip -o`: every entry replaces whatever is at that path. */
  function extractOver(folder: Record<string, string>, entries: Record<string, string>) {
    for (const [path, content] of Object.entries(entries)) folder[path] = content;
    return folder;
  }

  it('leaves every earned tick exactly where it was', async () => {
    const folder = studentRepo();
    const before = JSON.parse(folder[PROGRESS_FILE_PATH]);

    extractOver(folder, readZip((await buildDocsBundle(PRJ, { generatedAt: AT })).bytes));

    const after = JSON.parse(folder[PROGRESS_FILE_PATH]);
    const passedIn = (f: { stories: Array<{ criteria: Array<{ passed: boolean }> }> }) =>
      f.stories.flatMap((s) => s.criteria).filter((c) => c.passed).length;

    expect(passedIn(after)).toBe(passedIn(before));
    expect(after).toEqual(before);
  });

  it('leaves the student-authored profile exactly where it was', async () => {
    const folder = studentRepo();
    const before = folder[PROFILE_FILE_PATH];

    extractOver(folder, readZip((await buildDocsBundle(PRJ, { generatedAt: AT })).bytes));

    expect(folder[PROFILE_FILE_PATH]).toBe(before);
  });
});

/**
 * The copy is not the fix, but it must stop being false. On the broken version
 * this section opened with the word "Safe." and named only REQUIREMENTS.md.
 */
describe('the notice tells the truth about extraction', () => {
  it('names the progress file as something the archive does not carry', async () => {
    const notice = readZip((await buildDocsBundle(PRJ, { generatedAt: AT })).bytes)['docs/CONNECT-YOUR-REPO.md'];
    expect(notice).toContain(PROGRESS_FILE_PATH);
    expect(notice).toMatch(/cannot overwrite anything you wrote/i);
  });

  it('tells a student who already has a progress file not to copy over it', async () => {
    const notice = readZip((await buildDocsBundle(PRJ, { generatedAt: AT })).bytes)['docs/CONNECT-YOUR-REPO.md'];
    expect(notice).toMatch(/do not copy over it/i);
  });

  it('no longer claims unzipping is flatly "Safe."', async () => {
    const notice = readZip((await buildDocsBundle(PRJ, { generatedAt: AT })).bytes)['docs/CONNECT-YOUR-REPO.md'];
    expect(notice).not.toMatch(/^Safe\./m);
  });
});
