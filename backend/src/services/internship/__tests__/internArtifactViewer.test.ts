jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import fs from 'fs';
import os from 'os';
import path from 'path';
import { readUpload, shapeArtifact } from '../internArtifactViewer';

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
