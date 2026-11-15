/**
 * govBuildArtifacts — the intern's submitted build artifacts, resolved for the gov cockpit and served live from
 * the repo. The SQL + GitHub fetch are mocked; these prove the classification, the row -> card mapping, the
 * repo-scoped filtering, and that a file fetch re-scopes before reading.
 */
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../govConnectedRepo', () => ({ resolveConnectedRepo: jest.fn() }));
jest.mock('../../sbp/repoConnect/githubRepoClient', () => ({ fetchRepoFileRaw: jest.fn() }));

import { sequelize } from '../../../config/database';
import { resolveConnectedRepo } from '../govConnectedRepo';
import { fetchRepoFileRaw } from '../../sbp/repoConnect/githubRepoClient';
import { buildArtifactKind, listGovBuildArtifacts, resolveGovBuildArtifactFile } from '../govBuildArtifacts';

const query = sequelize.query as jest.Mock;
const resolveRepo = resolveConnectedRepo as jest.Mock;
const fetchRaw = fetchRepoFileRaw as jest.Mock;

const DP = '3867b241-0761-4f1f-9a32-ffe3b47bf186';
const CTX = [{ enrollment_id: 'enr-1', repo_owner: 'peacecrowne-oss', repo_name: 'Saratoga-Springs-Municipal' }];

beforeEach(() => { jest.clearAllMocks(); });

describe('buildArtifactKind', () => {
  it('classifies a build repo\'s real deliverables, not just structured documents', () => {
    expect(buildArtifactKind('project-overview.html')).toBe('html');
    expect(buildArtifactKind('diagram.png')).toBe('image');
    expect(buildArtifactKind('TEST-REPORT.md')).toBe('markdown');
    expect(buildArtifactKind('notes.txt')).toBe('markdown');
    expect(buildArtifactKind('plan.pdf')).toBe('pdf');
    expect(buildArtifactKind('data.csv')).toBe('csv');
    expect(buildArtifactKind('spec.docx')).toBe('word');
    expect(buildArtifactKind('deck.pptx')).toBe('slides');
    expect(buildArtifactKind('sheet.xlsx')).toBe('spreadsheet');
    expect(buildArtifactKind('demo.mp4')).toBe('video');
    expect(buildArtifactKind('server.js')).toBe('other');
  });
});

describe('listGovBuildArtifacts', () => {
  it('maps build_artifact rows to typed cards and drops rows with no repo path', async () => {
    query.mockResolvedValueOnce(CTX).mockResolvedValueOnce([
      { id: 'a1', title: 'project overview', filename: 'project-overview.html', mimetype: 'text/html', repo_path: 'docs/project-overview.html' },
      { id: 'a2', title: 'Architecture Diagram', filename: 'arch.png', mimetype: 'image/png', repo_path: 'docs/arch.png' },
      { id: 'a3', title: 'no path', filename: 'x.md', mimetype: 'text/markdown', repo_path: null },
    ]);
    const out = await listGovBuildArtifacts(DP);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: 'a1', kind: 'html', name: 'project-overview.html', repoPath: 'docs/project-overview.html' });
    expect(out[1]).toMatchObject({ id: 'a2', kind: 'image' });
    // scoped to this build's enrollment AND its connected repo (so a shared enrollment can't bleed across projects)
    const artsCall = query.mock.calls[1];
    expect(artsCall[0]).toContain("kind = 'build_artifact'");
    expect(artsCall[1].replacements).toMatchObject({ eid: 'enr-1', repoLike: '%/peacecrowne-oss/Saratoga-Springs-Municipal/%' });
  });

  it('returns [] when the gov project has no linked build repo', async () => {
    query.mockResolvedValueOnce([{ enrollment_id: null, repo_owner: null, repo_name: null }]);
    expect(await listGovBuildArtifacts(DP)).toEqual([]);
  });
});

describe('resolveGovBuildArtifactFile', () => {
  it('re-scopes the artifact then fetches its bytes live from the repo', async () => {
    query.mockResolvedValueOnce(CTX).mockResolvedValueOnce([
      { id: 'a1', title: 'project overview', filename: 'project-overview.html', mimetype: 'text/html', repo_path: 'docs/project-overview.html' },
    ]);
    resolveRepo.mockResolvedValue({ owner: 'peacecrowne-oss', name: 'Saratoga-Springs-Municipal' });
    fetchRaw.mockResolvedValue(Buffer.from('<h1>hi</h1>'));
    const r = await resolveGovBuildArtifactFile(DP, 'a1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.kind).toBe('html');
      expect(r.name).toBe('project-overview.html');
      expect(r.contentType).toBe('text/html; charset=utf-8');
      expect(r.bytes.toString()).toBe('<h1>hi</h1>');
    }
    expect(fetchRaw).toHaveBeenCalledWith('peacecrowne-oss', 'Saratoga-Springs-Municipal', 'docs/project-overview.html');
  });

  it('404 when the id is not a build artifact of this project (never fetched)', async () => {
    query.mockResolvedValueOnce(CTX).mockResolvedValueOnce([]);
    const r = await resolveGovBuildArtifactFile(DP, 'nope');
    expect(r).toEqual({ ok: false, status: 404 });
    expect(fetchRaw).not.toHaveBeenCalled();
  });

  it('404 when the project has no linked build repo', async () => {
    query.mockResolvedValueOnce([{ enrollment_id: null, repo_owner: null, repo_name: null }]);
    const r = await resolveGovBuildArtifactFile(DP, 'a1');
    expect(r).toEqual({ ok: false, status: 404 });
  });
});
