/**
 * insertArtifactFigure — deterministic figure numbering + traceable caption + the figure block, the service that
 * appends it as a new version, and the P4 extension to the sanitize XSS rail (an <img> survives ONLY with the app's
 * own artifact-route src; a <figure> keeps only data-artifact; everything else is still attribute-stripped).
 */
const artFindByPk = jest.fn();
const draftMock = jest.fn();
const listMock = jest.fn();

jest.mock('../../../../config/upload', () => ({ GOV_BUILD_ARTIFACT_DIR: '/tmp/gov-artifacts' }));
jest.mock('../../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
// sanitizeProposalHtml lives in govProposalDocumentDraftAI, which imports openaiInstrumented → aiEventService →
// a real model at import time. Mock the OpenAI shim to cut that chain (sanitize itself uses no OpenAI).
jest.mock('../../../openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));
jest.mock('../../../../models/GovBuildArtifact', () => ({ __esModule: true, default: { findByPk: (...a: any[]) => artFindByPk(...a), findOne: jest.fn(), create: jest.fn() } }));
jest.mock('../../../../models/GovBuildDemo', () => ({ __esModule: true, default: { findByPk: jest.fn(), upsert: jest.fn() } }));
jest.mock('../govProposalDocumentActions', () => ({ draftProposalDocument: (...a: any[]) => draftMock(...a) }));
jest.mock('../govProposalDocumentStore', () => ({
  listProposalDocuments: (...a: any[]) => listMock(...a),
  ProposalDocumentError: class extends Error { reason: string; constructor(m: string, r: string) { super(m); this.reason = r; this.name = 'ProposalDocumentError'; } },
}));

import { nextFigureNumber, figureCaption, figureBlock, insertArtifactFigure } from '../insertArtifactFigure';
import { sanitizeProposalHtml } from '../govProposalDocumentDraftAI';

beforeEach(() => jest.clearAllMocks());

describe('pure figure helpers', () => {
  it('numbers the next figure by counting existing <figure> blocks', () => {
    expect(nextFigureNumber(null)).toBe(1);
    expect(nextFigureNumber('<p>x</p>')).toBe(1);
    expect(nextFigureNumber('<figure data-artifact="a"></figure><figure></figure>')).toBe(3);
  });
  it('builds a traceable caption with the date, story and commit', () => {
    const c = figureCaption(2, 'Permit search results', 'STORY-REQ-7', 'abcdef1234', '2026-11-04T00:00:00Z');
    expect(c).toBe('Figure 2. Permit search results, captured from the verified build on 2026-11-04 (story STORY-REQ-7, commit abcdef1).');
  });
  it('builds the figure block with data-artifact + the img src', () => {
    const b = figureBlock('a1', '/api/admin/gov-contracts/p1/artifacts/a1/image', 'Figure 1. x.');
    expect(b).toContain('data-artifact="a1"');
    expect(b).toContain('<img src="/api/admin/gov-contracts/p1/artifacts/a1/image">');
  });
});

describe('insertArtifactFigure service', () => {
  it('appends the figure to the current content and drafts a new version', async () => {
    artFindByPk.mockResolvedValue({ id: 'a1', delivery_project_id: 'dp-1', status: 'captured', file_path: 'x.png', story_id: 'STORY-REQ-1', commit_sha: 'abc1234', caption: 'Dashboard', captured_at: '2026-11-04T00:00:00Z' });
    listMock.mockResolvedValue([{ key: 'technical', contentHtml: '<p>Approach.</p>' }]);
    draftMock.mockResolvedValue({ key: 'technical', status: 'drafted' });
    await insertArtifactFigure('dp-1', 'technical', 'a1', 'me');
    const draftArg = draftMock.mock.calls[0][0];
    expect(draftArg.manualHtml).toContain('<p>Approach.</p>');
    expect(draftArg.manualHtml).toContain('data-artifact="a1"');
    expect(draftArg.manualHtml).toMatch(/Figure 1\./);
  });
  it('refuses an artifact that is not this project\'s or not captured', async () => {
    artFindByPk.mockResolvedValue({ id: 'a1', delivery_project_id: 'OTHER', status: 'captured', file_path: 'x.png' });
    await expect(insertArtifactFigure('dp-1', 'technical', 'a1', 'me')).rejects.toMatchObject({ reason: 'not_found' });
  });
});

describe('sanitizeProposalHtml — P4 figure/img extension', () => {
  it('keeps a figure+img that point at the app artifact route', () => {
    const html = '<figure data-artifact="a1"><img src="/api/admin/gov-contracts/p1/artifacts/a1/image"><figcaption>Figure 1. x.</figcaption></figure>';
    const out = sanitizeProposalHtml(html);
    expect(out).toContain('data-artifact="a1"');
    expect(out).toContain('<img src="/api/admin/gov-contracts/p1/artifacts/a1/image">');
    expect(out).toContain('<figcaption>');
  });
  it('strips an img whose src is external, data:, or javascript:', () => {
    expect(sanitizeProposalHtml('<img src="https://evil.com/x.png">')).not.toContain('<img');
    expect(sanitizeProposalHtml('<img src="javascript:alert(1)">')).not.toContain('<img');
    expect(sanitizeProposalHtml('<img src="data:image/png;base64,AAAA">')).not.toContain('<img');
  });
  it('strips every other attribute (an onclick on a figure, an href on a link)', () => {
    expect(sanitizeProposalHtml('<figure data-artifact="a1" onclick="steal()">')).toBe('<figure data-artifact="a1">');
    expect(sanitizeProposalHtml('<a href="https://evil.com">text</a>')).toBe('text');
  });
});
