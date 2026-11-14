/**
 * repoArtifactStore — the step that makes an ingested artifact openable.
 *
 * The behaviours pinned here are the ones that decide whether a viewer can render the
 * file at all, and the ones that keep a cohort-wide re-run cheap and safe.
 */
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  extensionOf,
  parseRepoUrl,
  storeRepoFile,
  storedNameFor,
} from '../repoArtifactStore';
import { MAX_ARTIFACT_BYTES } from '../repoArtifactScan';

const SHA = 'a'.repeat(40);

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'repo-artifact-store-'));
}

function input(over: Partial<Parameters<typeof storeRepoFile>[0]> = {}) {
  return {
    repoUrl: 'https://github.com/peacecrowne-oss/Saratoga-Springs-Municipal',
    repoPath: 'docs/TEST REPORT.docx',
    filename: 'TEST REPORT.docx',
    blobSha: SHA,
    sizeBytes: 1024,
    ...over,
  };
}

describe('parseRepoUrl', () => {
  it.each([
    ['https://github.com/owner/repo', 'owner', 'repo'],
    ['https://github.com/owner/repo.git', 'owner', 'repo'],
    ['https://github.com/owner/repo/', 'owner', 'repo'],
    ['git@github.com:owner/repo.git', 'owner', 'repo'],
  ])('reads %s', (url, owner, repo) => {
    expect(parseRepoUrl(url)).toEqual({ owner, repo });
  });

  it.each([null, undefined, '', '   ', 'https://gitlab.com/owner/repo', 'not a url'])(
    'refuses %p rather than guessing', (url) => {
      expect(parseRepoUrl(url)).toBeNull();
    },
  );
});

describe('extensionOf', () => {
  it('lowercases, because the viewers key off the extension', () => {
    expect(extensionOf('REPORT.DOCX')).toBe('.docx');
  });

  it('is empty for a file with no extension', () => {
    expect(extensionOf('LICENSE')).toBe('');
  });

  it('is empty for a dotfile, whose leading dot is not an extension', () => {
    expect(extensionOf('.gitignore')).toBe('');
  });

  it('refuses an absurdly long extension rather than putting it on disk', () => {
    expect(extensionOf('x.' + 'a'.repeat(40))).toBe('');
  });
});

describe('storedNameFor', () => {
  it('names a file by its blob sha, so the same content always lands in one place', () => {
    expect(storedNameFor(SHA, 'report.pdf')).toBe(`${SHA}.pdf`);
  });

  it('is case-insensitive about the sha, so one blob never gets two copies', () => {
    expect(storedNameFor(SHA.toUpperCase(), 'r.pdf')).toBe(storedNameFor(SHA, 'r.pdf'));
  });

  it('stays deterministic when the tree gave no blob sha', () => {
    const a = storedNameFor(null, 'docs/x.pdf');
    expect(a).toBe(storedNameFor(null, 'docs/x.pdf'));
    expect(a).toMatch(/^[0-9a-f]{40}\.pdf$/);
  });

  it('cannot carry a path out of the artifact directory', () => {
    // A filename is attacker-shaped data: it is whatever a student committed.
    const name = storedNameFor('../../etc/passwd', '../../../etc/passwd');
    expect(name).toMatch(/^[0-9a-f]+$/);
    expect(name).not.toContain('/');
    expect(name).not.toContain('..');
  });
});

describe('storeRepoFile', () => {
  it('writes the bytes and reports where the viewers will find them', async () => {
    const dir = await tmpDir();
    const bytes = Buffer.from('PK\u0003\u0004 a docx is a zip');
    const result = await storeRepoFile(input(), { dir, fetchRaw: async () => bytes });

    expect(result).toMatchObject({ ok: true, reused: false, sizeBytes: bytes.length, storedName: `${SHA}.docx` });
    if (!result.ok) throw new Error('expected a stored file');
    await expect(fs.readFile(result.storedPath)).resolves.toEqual(bytes);
    expect(path.dirname(result.storedPath)).toBe(dir);
  });

  it('does not call GitHub again for content it already has', async () => {
    const dir = await tmpDir();
    const fetchRaw = jest.fn(async () => Buffer.from('once'));
    await storeRepoFile(input(), { dir, fetchRaw });
    const second = await storeRepoFile(input(), { dir, fetchRaw });

    expect(fetchRaw).toHaveBeenCalledTimes(1);
    expect(second).toMatchObject({ ok: true, reused: true });
  });

  it('passes the owner and repo it parsed, not the raw URL', async () => {
    const dir = await tmpDir();
    const fetchRaw = jest.fn(async () => Buffer.from('x'));
    await storeRepoFile(input(), { dir, fetchRaw });
    expect(fetchRaw).toHaveBeenCalledWith('peacecrowne-oss', 'Saratoga-Springs-Municipal', 'docs/TEST REPORT.docx');
  });

  it('classifies a missing file rather than writing an empty one', async () => {
    const dir = await tmpDir();
    const result = await storeRepoFile(input(), { dir, fetchRaw: async () => null });
    expect(result).toEqual({ ok: false, failure: 'not_found' });
    await expect(fs.readdir(dir)).resolves.toEqual([]);
  });

  it('refuses a zero-byte file, which no viewer can render', async () => {
    const dir = await tmpDir();
    const result = await storeRepoFile(input(), { dir, fetchRaw: async () => Buffer.alloc(0) });
    expect(result).toEqual({ ok: false, failure: 'empty' });
  });

  it('refuses before the download when the tree already says it is too big', async () => {
    const dir = await tmpDir();
    const fetchRaw = jest.fn(async () => Buffer.from('x'));
    const result = await storeRepoFile(input({ sizeBytes: MAX_ARTIFACT_BYTES + 1 }), { dir, fetchRaw });

    expect(result).toMatchObject({ ok: false, failure: 'too_large' });
    expect(fetchRaw).not.toHaveBeenCalled();
  });

  it('refuses after the download when the tree understated the size', async () => {
    const dir = await tmpDir();
    const big = Buffer.alloc(MAX_ARTIFACT_BYTES + 1);
    const result = await storeRepoFile(input({ sizeBytes: 10 }), { dir, fetchRaw: async () => big });
    expect(result).toMatchObject({ ok: false, failure: 'too_large' });
  });

  it('turns a GitHub failure into a classification instead of throwing', async () => {
    const dir = await tmpDir();
    const result = await storeRepoFile(input(), {
      dir,
      fetchRaw: async () => { throw Object.assign(new Error('rate limited'), { error_class: 'RateLimited' }); },
    });
    expect(result).toEqual({ ok: false, failure: 'fetch_failed', detail: 'RateLimited' });
  });

  it('needs a repo URL it can read, and says so without calling out', async () => {
    const dir = await tmpDir();
    const fetchRaw = jest.fn(async () => Buffer.from('x'));
    const result = await storeRepoFile(input({ repoUrl: null }), { dir, fetchRaw });

    expect(result).toEqual({ ok: false, failure: 'no_repo_url' });
    expect(fetchRaw).not.toHaveBeenCalled();
  });

  it('leaves no partial file behind when the write fails', async () => {
    const dir = await tmpDir();
    const spy = jest.spyOn(fs, 'writeFile').mockRejectedValueOnce(Object.assign(new Error('no space'), { code: 'ENOSPC' }));
    const result = await storeRepoFile(input(), { dir, fetchRaw: async () => Buffer.from('x') });

    expect(result).toMatchObject({ ok: false, failure: 'write_failed', detail: 'ENOSPC' });
    await expect(fs.readdir(dir)).resolves.toEqual([]);
    spy.mockRestore();
  });

  it('replaces a truncated file rather than trusting its content-addressed name', async () => {
    // A zero-byte file at the right path is the fingerprint of a crash mid-write.
    const dir = await tmpDir();
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${SHA}.docx`), Buffer.alloc(0));

    const result = await storeRepoFile(input(), { dir, fetchRaw: async () => Buffer.from('real bytes') });
    expect(result).toMatchObject({ ok: true, reused: false, sizeBytes: 10 });
  });
});
