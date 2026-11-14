jest.mock('../../models/Project', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../myWork/myWorkService', () => ({ getMyWorkFile: jest.fn() }));

import Project from '../../models/Project';
import { sequelize } from '../../config/database';
import { getMyWorkFile } from '../myWork/myWorkService';
import { documentKind, listProjectDocuments, getProjectDocumentFile } from '../projectDocuments';

const findByPk = (Project as unknown as { findByPk: jest.Mock }).findByPk;
const query = sequelize.query as jest.Mock;
const myWorkFile = getMyWorkFile as jest.Mock;

const row = (id: string, kind: string, title: string, content: Record<string, unknown>) =>
  ({ id, kind, title, created_at: '2026-11-14T00:00:00.000Z', competencies: [], content });

beforeEach(() => jest.clearAllMocks());

describe('documentKind', () => {
  it('classifies structured documents + video', () => {
    expect(documentKind('a.pdf')).toBe('pdf');
    expect(documentKind('a.csv')).toBe('csv');
    expect(documentKind('a.docx')).toBe('word');
    expect(documentKind('a.doc')).toBe('word');
    expect(documentKind('a.pptx')).toBe('slides');
    expect(documentKind('a.ppt')).toBe('slides');
    expect(documentKind('a.xlsx')).toBe('spreadsheet');
    expect(documentKind('a.xls')).toBe('spreadsheet');
    expect(documentKind('a.rtf')).toBe('other');
    expect(documentKind('demo.mp4')).toBe('video');
    expect(documentKind('demo.mov')).toBe('video');
    expect(documentKind('demo.webm')).toBe('video');
    expect(documentKind('demo.m4v')).toBe('video');
  });

  it('EXCLUDES markup, plain text, images, and source', () => {
    for (const n of ['index.html', 'page.htm', 'README.md', 'notes.txt', 'a.png', 'app.js', 'main.ts', '.env', 'noext']) {
      expect(documentKind(n)).toBeNull();
    }
  });

  it('is case-insensitive', () => {
    expect(documentKind('REPORT.PDF')).toBe('pdf');
    expect(documentKind('DEMO.MP4')).toBe('video');
  });
});

describe('listProjectDocuments', () => {
  it('returns only the enrollment\'s document/video pieces, newest-first shape', async () => {
    findByPk.mockResolvedValue({ enrollment_id: 'e1' });
    query.mockResolvedValue([
      row('1', 'build_artifact', 'Build — Lesson A — plan.pdf', { filename: 'plan.pdf' }),
      row('2', 'build_artifact', 'Build — Lesson B — notes.txt', { filename: 'notes.txt' }),  // text — excluded
      row('3', 'field_guide', 'Field Guide — Governance', {}),                                 // no file — excluded
      row('4', 'build_artifact', 'Build — Lesson C — demo.mp4', { stored_path: 'u/demo.mp4' }), // video via stored_path
      row('5', 'build_artifact', 'Build — Lesson D — app.js', { filename: 'app.js' }),          // source — excluded
    ]);
    const out = await listProjectDocuments('p1');
    expect(out).toEqual([
      { id: '1', name: 'plan.pdf', title: 'plan.pdf', from: 'Lesson A', kind: 'pdf' },
      { id: '4', name: 'demo.mp4', title: 'demo.mp4', from: 'Lesson C', kind: 'video' },
    ]);
    expect(query).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ replacements: { enrollmentId: 'e1' } }));
  });

  it('a missing project or a project without an enrollment yields [] (no query)', async () => {
    findByPk.mockResolvedValue(null);
    expect(await listProjectDocuments('p1')).toEqual([]);
    findByPk.mockResolvedValue({ enrollment_id: null });
    expect(await listProjectDocuments('p1')).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('getProjectDocumentFile', () => {
  const file = (name: string, contentType = 'application/octet-stream') =>
    ({ absPath: `/u/${name}`, name, kind: 'other', contentType, title: name });

  it('returns a document file scoped to the project\'s enrollment', async () => {
    findByPk.mockResolvedValue({ enrollment_id: 'e1' });
    myWorkFile.mockResolvedValue(file('plan.pdf', 'application/pdf'));
    const f = await getProjectDocumentFile('p1', 'a1');
    expect(f).toMatchObject({ name: 'plan.pdf', contentType: 'application/pdf' });
    expect(myWorkFile).toHaveBeenCalledWith('e1', 'a1');
  });

  it('overrides the Content-Type for video so the inline player can play it', async () => {
    findByPk.mockResolvedValue({ enrollment_id: 'e1' });
    myWorkFile.mockResolvedValue(file('demo.mp4'));
    const f = await getProjectDocumentFile('p1', 'a1');
    expect(f!.contentType).toBe('video/mp4');
  });

  it('refuses a non-document piece even when its id is known (null, never served)', async () => {
    findByPk.mockResolvedValue({ enrollment_id: 'e1' });
    myWorkFile.mockResolvedValue(file('secret.env'));
    expect(await getProjectDocumentFile('p1', 'a1')).toBeNull();
  });

  it('null for a missing project, missing enrollment, or missing piece', async () => {
    findByPk.mockResolvedValue(null);
    expect(await getProjectDocumentFile('p1', 'a1')).toBeNull();
    findByPk.mockResolvedValue({ enrollment_id: 'e1' });
    myWorkFile.mockResolvedValue(null);
    expect(await getProjectDocumentFile('p1', 'a1')).toBeNull();
  });
});
