/**
 * The intro video's life: a new upload is always a DRAFT, replacing one removes the old files,
 * only a PUBLISHED asset (or a draft with the studio's signed token) is ever served, and an
 * analysis result becomes captions and coaching. The database is mocked; files are real, in a
 * temp root.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'hire-video-svc-'));
process.env.HIRE_VIDEO_DIR = ROOT;

jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../config/env', () => ({ env: { jwtSecret: 'test-secret' } }));

import { sequelize } from '../../../config/database';
import {
  applyAnalysis, deleteVideo, previewToken, readStudioVideo, resolveVideoFile, saveVideo, updateVideo, verifyPreviewToken,
} from '../hireVideoService';
import type { Runner } from '../hireVideoTranscode';

const q = sequelize.query as unknown as jest.Mock;
const ME = '11111111-1111-4111-8111-111111111111';
const NOW = Date.UTC(2026, 10, 13, 15, 0, 0);
const OLD = 'a'.repeat(24);
const SLOT = 'b'.repeat(24);

/** A runner that "transcodes" by writing the two files, and probes as 84 s. */
const okRun: Runner = async (cmd, args) => {
  if (cmd === 'ffprobe') return '84.2\n';
  const out = String(args[args.length - 1]);
  fs.writeFileSync(out, cmd === 'ffmpeg' && out.endsWith('.jpg') ? 'jpg' : 'mp4');
  return '';
};

function seed(id: string, files: string[] = ['stream.mp4', 'poster.jpg']) {
  fs.mkdirSync(path.join(ROOT, id), { recursive: true });
  for (const f of files) fs.writeFileSync(path.join(ROOT, id, f), 'x');
}

let row: Record<string, unknown> | null;
beforeEach(() => {
  jest.clearAllMocks();
  row = null;
  for (const d of fs.readdirSync(ROOT)) fs.rmSync(path.join(ROOT, d), { recursive: true, force: true });
  q.mockImplementation(async (sql: string, opts: { bind: unknown[] }) => {
    const b = opts.bind;
    if (/INSERT INTO hire_profile_intro/.test(sql)) {
      const prev = row?.video_asset_id ?? null;
      row = { video_asset_id: b[1], video_status: 'draft', video_seconds: b[2], captions_url: null, video_coaching: null, video_captions_wanted: true };
      return [[{ prev_asset_id: prev }]];
    }
    if (/UPDATE hire_profile_intro SET video_asset_id = NULL/.test(sql)) {
      const prev = row?.video_asset_id ?? null; row = { ...row, video_asset_id: null }; return [[{ prev_asset_id: prev }]];
    }
    if (/UPDATE hire_profile_intro SET video_status/.test(sql)) {
      if (!row || row.video_asset_id !== b[1]) return [[]];
      row = { ...row, video_status: b[2] ?? row.video_status, video_captions_wanted: b[3] ?? row.video_captions_wanted, captions_url: b[4] };
      return [[{ video_asset_id: b[1] }]];
    }
    if (/UPDATE hire_profile_intro SET video_coaching/.test(sql)) {
      row = { ...row, video_coaching: b[1] ? JSON.parse(String(b[1])) : null, captions_url: b[2] && row?.video_captions_wanted ? b[2] : row?.captions_url };
      return [[{ video_asset_id: b[0] }]];
    }
    if (/WHERE video_asset_id = \$1/.test(sql)) return [row && row.video_asset_id === b[0] ? [row] : []];
    if (/WHERE enrollment_id = \$1/.test(sql)) return [row ? [row] : []];
    throw new Error(`unexpected SQL: ${sql.slice(0, 60)}`);
  });
});
afterAll(() => fs.rmSync(ROOT, { recursive: true, force: true }));

describe('upload', () => {
  test('a new upload is a draft with signed preview URLs, and the analysis is honestly off', async () => {
    const v = (await saveVideo(ME, '/tmp/in.upload', okRun, NOW))!;
    expect(v).toMatchObject({ status: 'draft', seconds: 84, captionsUrl: null, captionsWanted: true, analysis: 'off', coaching: null });
    const id = String(row!.video_asset_id);
    expect(v.streamUrl).toMatch(new RegExp(`^/api/public/hire/video/${id}/stream\\?t=\\d{13}\\.[0-9a-f]{64}$`));
    expect(fs.existsSync(path.join(ROOT, id, 'stream.mp4'))).toBe(true);
  });

  test('replacing a video removes the old files, so uploading twice leaves exactly one asset', async () => {
    seed(OLD);
    row = { video_asset_id: OLD, video_status: 'published', video_seconds: 70 };
    await saveVideo(ME, '/tmp/1', okRun, NOW);
    await saveVideo(ME, '/tmp/2', okRun, NOW);
    expect(fs.existsSync(path.join(ROOT, OLD))).toBe(false);
    expect(fs.readdirSync(ROOT)).toEqual([row!.video_asset_id]);
    expect(row!.video_status).toBe('draft'); // a replacement never goes public by itself
  });

  test('a rejected file leaves nothing behind: no row change, no directory', async () => {
    const before = fs.readdirSync(ROOT);
    const tooLong: Runner = async (cmd) => (cmd === 'ffprobe' ? '600' : '');
    await expect(saveVideo(ME, '/tmp/x', tooLong, NOW)).rejects.toMatchObject({ status: 400 });
    expect(fs.readdirSync(ROOT)).toEqual(before);
    expect(q.mock.calls.some(([sql]) => /INSERT/.test(sql))).toBe(false);
  });
});

describe('publish, captions, delete', () => {
  test('publish and unpublish act on the current asset only', async () => {
    seed(SLOT);
    row = { video_asset_id: SLOT, video_status: 'draft', video_seconds: 80, captions_url: null, video_captions_wanted: true };
    expect((await updateVideo(ME, { published: true }, NOW))!.status).toBe('published');
    expect((await updateVideo(ME, { published: false }, NOW))!.status).toBe('draft');
  });

  test('captions off drops the public track; back on restores it when one was made', async () => {
    seed(SLOT, ['stream.mp4', 'poster.jpg', 'captions.vtt']);
    row = { video_asset_id: SLOT, video_status: 'published', video_seconds: 80, captions_url: `/api/public/hire/video/${SLOT}/captions`, video_captions_wanted: true };
    expect((await updateVideo(ME, { captionsWanted: false }, NOW))!.captionsUrl).toBeNull();
    expect(row!.captions_url).toBeNull();
    expect((await updateVideo(ME, { captionsWanted: true }, NOW))!.captionsUrl).toMatch(/\/captions\?t=/);
  });

  test('with no video there is nothing to publish', async () => {
    await expect(updateVideo(ME, { published: true }, NOW)).rejects.toMatchObject({ status: 404 });
  });

  test('delete removes the files', async () => {
    seed(SLOT);
    row = { video_asset_id: SLOT, video_status: 'published' };
    await deleteVideo(ME);
    expect(fs.existsSync(path.join(ROOT, SLOT))).toBe(false);
    expect(await readStudioVideo(ME, NOW)).toBeNull();
  });
});

describe('what the public route may serve', () => {
  beforeEach(() => seed(SLOT, ['stream.mp4', 'poster.jpg']));

  test('a published asset is public; a draft needs a valid, unexpired, untampered token', async () => {
    row = { video_asset_id: SLOT, video_status: 'published', captions_url: null };
    expect(await resolveVideoFile(SLOT, 'stream', undefined, NOW)).toMatchObject({ type: 'video/mp4', published: true });
    row = { ...row, video_status: 'draft' };
    expect(await resolveVideoFile(SLOT, 'stream', undefined, NOW)).toBeNull();
    const t = previewToken(SLOT, NOW);
    expect(await resolveVideoFile(SLOT, 'poster', t, NOW)).toMatchObject({ type: 'image/jpeg', published: false });
    expect(await resolveVideoFile(SLOT, 'stream', t, NOW + 3 * 60 * 60 * 1000)).toBeNull(); // expired
    expect(await resolveVideoFile(SLOT, 'stream', t.replace(/.$/, (c) => (c === '0' ? '1' : '0')), NOW)).toBeNull();
    expect(await resolveVideoFile(SLOT, 'stream', previewToken(OLD, NOW), NOW)).toBeNull(); // another asset's token
  });

  test('captions only when the row has them; a bad id never reaches the database', async () => {
    row = { video_asset_id: SLOT, video_status: 'published', captions_url: null };
    expect(await resolveVideoFile(SLOT, 'captions', undefined, NOW)).toBeNull();
    q.mockClear();
    expect(await resolveVideoFile('../../etc', 'stream', undefined, NOW)).toBeNull();
    expect(q).not.toHaveBeenCalled();
  });

  test('the token is bound to its secret', () => {
    expect(verifyPreviewToken(SLOT, previewToken(SLOT, NOW, 'other'), NOW)).toBe(false);
    expect(verifyPreviewToken(SLOT, previewToken(SLOT, NOW), NOW)).toBe(true);
  });
});

describe('an analysis result', () => {
  const RESULT = {
    metrics: {
      fwrd_counts: "{'um': 4}", transcript_length: '200', fwrd_rate: '2',
      transcript_json: JSON.stringify({ results: { items: [
        { start_time: '0.1', end_time: '0.4', type: 'pronunciation', alternatives: [{ content: 'Hello' }] },
        { type: 'punctuation', alternatives: [{ content: '.' }] },
      ] } }),
    },
  };

  test('becomes captions and coaching, and applying it twice changes nothing more', async () => {
    seed(SLOT);
    row = { video_asset_id: SLOT, video_status: 'draft', video_seconds: 84, captions_url: null, video_captions_wanted: true };
    expect(await applyAnalysis(SLOT, RESULT)).toBe(true);
    const once = { ...row };
    expect(await applyAnalysis(SLOT, RESULT)).toBe(true);
    expect(row).toEqual(once);
    expect(fs.readFileSync(path.join(ROOT, SLOT, 'captions.vtt'), 'utf8')).toContain('Hello.');
    const v = (await readStudioVideo(ME, NOW))!;
    expect(v.analysis).toBe('done');
    expect(v.coaching!.notes).toContain('You said "um" 4 times.');
    expect(v.captionsUrl).toMatch(/\/captions\?t=/);
  });

  test('a candidate who turned captions off gets coaching but no public track', async () => {
    seed(SLOT);
    row = { video_asset_id: SLOT, video_status: 'published', video_seconds: 84, captions_url: null, video_captions_wanted: false };
    await applyAnalysis(SLOT, RESULT);
    expect(row!.captions_url).toBeNull();
    expect(row!.video_coaching).not.toBeNull();
  });
});
