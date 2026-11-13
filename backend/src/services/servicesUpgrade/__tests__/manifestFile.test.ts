/**
 * Guards the COMMITTED whitepaper manifest (docs/services/whitepaper_manifest.json): if someone hand-edits it or a
 * regenerated version regresses, the build fails rather than seeding a wrong catalog in SV2.
 */
import fs from 'fs';
import path from 'path';
import { Manifest } from '../schemas';

const FILE = path.join(__dirname, '..', '..', '..', '..', '..', 'docs', 'services', 'whitepaper_manifest.json');

describe('committed whitepaper manifest', () => {
  const m = Manifest.parse(JSON.parse(fs.readFileSync(FILE, 'utf8')));

  it('holds exactly the 39 unique source whitepapers, each linked to its Basecamp upload', () => {
    expect(m.recordCount).toBe(39);
    expect(new Set(m.records.map((r) => r.sha256)).size).toBe(39);
    expect(m.records.every((r) => typeof r.basecampUploadId === 'number')).toBe(true);
    expect(m.records.some((r) => /^Copy of /i.test(r.sourceFile))).toBe(false);
  });

  it('every record has a title, industry and at least one capability; problem+solution on at least 37', () => {
    for (const r of m.records) {
      expect(r.title.length).toBeGreaterThan(3);
      expect(r.industry).not.toBe('Other');
      expect(r.capabilities.length).toBeGreaterThan(0);
    }
    expect(m.records.filter((r) => r.problem && r.solution).length).toBeGreaterThanOrEqual(37);
  });

  it('every outcome carries a page number and at least one number', () => {
    for (const o of m.records.flatMap((r) => r.outcomes)) {
      expect(o.page).toBeGreaterThanOrEqual(1);
      expect(o.numbers.length).toBeGreaterThan(0);
    }
  });

  it('is stored in a stable order (sorted by source file)', () => {
    const files = m.records.map((r) => r.sourceFile);
    expect(files).toEqual([...files].sort());
  });
});
