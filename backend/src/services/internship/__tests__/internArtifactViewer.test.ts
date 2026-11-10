jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import fs from 'fs';
import os from 'os';
import path from 'path';
import { csvRows, fileKind, readUpload, safeUploadPath, shapeArtifact } from '../internArtifactViewer';

describe('readUpload: only small text files inside the uploads folder', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-'));
  const inside = path.join(root, 'a.md');
  fs.writeFileSync(inside, '# Demo script');

  it('reads a text file inside the root', () => {
    expect(readUpload(inside, 'text/markdown', root)).toEqual({ text: '# Demo script', note: null });
  });

  it('refuses a path that escapes the root (traversal)', () => {
    expect(readUpload(path.join(root, '..', 'etc-passwd'), 'text/plain', root).note).toBe('file outside the uploads folder');
  });

  it('does not read binary files', () => {
    expect(readUpload(inside, 'application/pdf', root)).toEqual({ text: null, note: 'binary file (application/pdf)' });
  });

  it('a missing file is a note, not a throw', () => {
    expect(readUpload(path.join(root, 'gone.md'), 'text/markdown', root).note).toBe('file is no longer on the server');
  });
});

describe('shapeArtifact: one shape per kind', () => {
  const base = { id: 'i', kind: 'k', title: 'T', created_at: '2026-11-09T12:00:00Z', intern: 'Kal' };

  it('a field guide carries its HTML', () => {
    const v = shapeArtifact({ ...base, kind: 'field_guide', content: { body_html: '<html>g</html>', week: 1 } });
    expect(v.html).toBe('<html>g</html>');
    expect(v.data).toEqual({ week: 1 });
  });

  it('a Claude Studio artifact carries its claude.ai link, and only https links', () => {
    expect(shapeArtifact({ ...base, content: { artifact_url: 'https://claude.ai/artifact/x' } }).externalUrl).toBe('https://claude.ai/artifact/x');
    expect(shapeArtifact({ ...base, content: { artifact_url: 'javascript:alert(1)' } }).externalUrl).toBeNull();
  });

  it('never exposes server file paths', () => {
    const v = shapeArtifact({ ...base, content: { stored_path: '/nowhere/x.md', stored_name: 'x.md', filename: 'demo.md', mimetype: 'text/markdown' } });
    expect(JSON.stringify(v.data)).not.toContain('/nowhere');
    expect(v.file?.name).toBe('demo.md');
  });
});

describe('the right viewer per file (Ali, 10 Nov 2026: a PDF viewer and a CSV viewer)', () => {
  it('fileKind from the extension, then the mimetype', () => {
    expect(fileKind('brief.pdf')).toBe('pdf');
    expect(fileKind('blob', 'application/pdf')).toBe('pdf');
    expect(fileKind('coreops_program_inventory.csv')).toBe('csv');
    expect(fileKind('x.tsv')).toBe('csv');
    expect(fileKind('data-flow-diagram.docx')).toBe('word');
    expect(fileKind('deck.pptx')).toBe('slides');
    expect(fileKind('model.xlsx')).toBe('spreadsheet');
    expect(fileKind('shot.PNG')).toBe('image');
    expect(fileKind('notes.md')).toBe('text');
    expect(fileKind('thing.bin', 'application/octet-stream')).toBe('other');
  });

  it('csvRows parses quoted cells with commas and newlines, like the real inventory CSV', () => {
    const rows = csvRows('Deliverable,Exists,Verdict\n"Workspace & CLAUDE.md","Yes - 3 real files, dense",Solid\nAgent skills,"Yes - 14 dirs\nmostly real",Thin\n');
    expect(rows).toEqual([
      ['Deliverable', 'Exists', 'Verdict'],
      ['Workspace & CLAUDE.md', 'Yes - 3 real files, dense', 'Solid'],
      ['Agent skills', 'Yes - 14 dirs\nmostly real', 'Thin'],
    ]);
  });

  it('csvRows tolerates ragged rows and a BOM, and gives null rather than throwing on garbage', () => {
    expect(csvRows('﻿a,b\n1,2,3\n')).toEqual([['a', 'b'], ['1', '2', '3']]);
    expect(csvRows('a,"b\n')).toBeNull();
  });

  it('safeUploadPath never resolves outside the uploads root', () => {
    const root = path.resolve(os.tmpdir(), 'uploads-root');
    expect(safeUploadPath(path.join(root, 'a.pdf'), root)).toBe(path.join(root, 'a.pdf'));
    expect(safeUploadPath(path.join(root, '..', 'etc', 'passwd'), root)).toBeNull();
    expect(safeUploadPath(`${root}-evil/a.pdf`, root)).toBeNull();
    expect(safeUploadPath(null, root)).toBeNull();
  });

  it('a PDF upload is located for streaming, not read as text', () => {
    const v = shapeArtifact({ id: 'i', kind: 'build_artifact', title: 'T', created_at: '2026-11-09T12:00:00Z', intern: 'Kal', content: { stored_path: '/nowhere/brief.pdf', filename: 'brief.pdf', mimetype: 'application/pdf' } });
    expect(v.file).toEqual(expect.objectContaining({ name: 'brief.pdf', kind: 'pdf', text: null, table: null, available: false }));
  });
});
