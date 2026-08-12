/**
 * buildArtifactService — unit tests for the pure extension guard. The DB-touching
 * path (uploadBuildArtifact / status) is integration-level; here we lock the
 * accept/reject behavior that must hold before any DB write. Mirrors the Testing
 * rules: happy + failure + boundary.
 */
import { isAcceptedBuildArtifact } from '../buildArtifactService';

describe('isAcceptedBuildArtifact', () => {
  it('accepts every documented build-artifact type (happy path)', () => {
    for (const name of ['plan.pdf', 'spec.docx', 'legacy.doc', 'deck.pptx', 'deck.ppt', 'model.xlsx', 'model.xls', 'notes.rtf', 'readme.txt', 'roadmap.md', 'data.csv']) {
      expect(isAcceptedBuildArtifact(name)).toBe(true);
    }
  });

  it('is case-insensitive on the extension', () => {
    expect(isAcceptedBuildArtifact('ROADMAP.MD')).toBe(true);
    expect(isAcceptedBuildArtifact('Plan.PDF')).toBe(true);
  });

  it('rejects non-document types (failure path)', () => {
    for (const name of ['diagram.png', 'photo.jpg', 'app.exe', 'archive.zip', 'page.html', 'script.js']) {
      expect(isAcceptedBuildArtifact(name)).toBe(false);
    }
  });

  it('rejects empty / missing / extension-less names (boundary)', () => {
    expect(isAcceptedBuildArtifact('')).toBe(false);
    expect(isAcceptedBuildArtifact(null)).toBe(false);
    expect(isAcceptedBuildArtifact(undefined)).toBe(false);
    expect(isAcceptedBuildArtifact('README')).toBe(false);
    expect(isAcceptedBuildArtifact('archive.tar.gz')).toBe(false);
  });

  it('keys on the final extension of a multi-dot name', () => {
    expect(isAcceptedBuildArtifact('project-overview.final.md')).toBe(true);
    expect(isAcceptedBuildArtifact('report.md.exe')).toBe(false);
  });
});
