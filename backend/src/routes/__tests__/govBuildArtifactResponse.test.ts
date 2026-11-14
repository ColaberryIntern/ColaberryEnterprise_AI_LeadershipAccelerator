/**
 * serveGovBuildArtifact — the shared HTTP half for the gov build-artifact file routes. The resolver is mocked;
 * these prove the id guards, the success headers (nosniff + attachment so HTML never renders on our origin),
 * and that a non-matching artifact is a 404 that never streams.
 */
jest.mock('../../services/factory/govBuildArtifacts', () => ({ resolveGovBuildArtifactFile: jest.fn() }));

import { resolveGovBuildArtifactFile } from '../../services/factory/govBuildArtifacts';
import { serveGovBuildArtifact } from '../govBuildArtifactResponse';

const resolve = resolveGovBuildArtifactFile as jest.Mock;

function mockRes(): any {
  const res: any = { headers: {}, statusCode: 200, body: undefined, headersSent: false };
  res.status = jest.fn((c: number) => { res.statusCode = c; return res; });
  res.json = jest.fn((b: any) => { res.body = b; res.headersSent = true; return res; });
  res.setHeader = jest.fn((k: string, v: any) => { res.headers[k] = v; });
  res.send = jest.fn((b: any) => { res.body = b; res.headersSent = true; return res; });
  return res;
}

beforeEach(() => jest.clearAllMocks());

describe('serveGovBuildArtifact', () => {
  it('400 on a missing project id or artifact id, nothing resolved', async () => {
    const r1 = mockRes(); await serveGovBuildArtifact('', 'a1', r1);
    const r2 = mockRes(); await serveGovBuildArtifact('dp', '', r2);
    expect(r1.statusCode).toBe(400);
    expect(r2.statusCode).toBe(400);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('streams the bytes with nosniff + attachment on success', async () => {
    resolve.mockResolvedValue({ ok: true, bytes: Buffer.from('<h1>hi</h1>'), name: 'project-overview.html', kind: 'html', contentType: 'text/html; charset=utf-8' });
    const res = mockRes();
    await serveGovBuildArtifact('dp', 'a1', res);
    expect(resolve).toHaveBeenCalledWith('dp', 'a1');
    expect(res.headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(String(res.headers['Content-Disposition'])).toContain('attachment');
    expect(res.send).toHaveBeenCalled();
  });

  it('404 when the artifact is not this project\'s build (never streamed)', async () => {
    resolve.mockResolvedValue({ ok: false, status: 404 });
    const res = mockRes();
    await serveGovBuildArtifact('dp', 'a1', res);
    expect(res.statusCode).toBe(404);
    expect(res.send).not.toHaveBeenCalled();
  });

  it('502 when the repo fetch throws', async () => {
    resolve.mockRejectedValue(new Error('upstream'));
    const res = mockRes();
    await serveGovBuildArtifact('dp', 'a1', res);
    expect(res.statusCode).toBe(502);
  });
});
