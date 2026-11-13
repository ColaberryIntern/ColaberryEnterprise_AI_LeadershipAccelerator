import fs from 'fs';
import path from 'path';
import { CatalogSnapshot, Manifest, TaxonomyV2 } from '../schemas';
import { leadSentence, validateTaxonomy } from '../taxonomyValidator';

const DOCS = path.join(__dirname, '..', '..', '..', '..', '..', 'docs', 'services');
const load = <T>(schema: { parse: (v: unknown) => T }, f: string): T => schema.parse(JSON.parse(fs.readFileSync(path.join(DOCS, f), 'utf8')));
const snapshot = load(CatalogSnapshot, 'baseline/catalog_2026-11-13.json');
const manifest = load(Manifest, 'whitepaper_manifest.json');
const taxonomy = load(TaxonomyV2, 'taxonomy_v2.json');
const clone = (): TaxonomyV2 => JSON.parse(JSON.stringify(taxonomy));

describe('committed Services v2 taxonomy', () => {
  it('passes every Gov AI Compatibility Contract rule', () => {
    expect(validateTaxonomy(taxonomy, snapshot, manifest)).toEqual([]);
  });
  it('assigns all 39 case studies', () => {
    const assigned = new Set(taxonomy.services.flatMap((s) => s.caseStudies));
    expect(assigned.size + taxonomy.noHome.length).toBe(manifest.recordCount);
  });
});

describe('validateTaxonomy rejects', () => {
  it('an UPDATE whose id is not in the snapshot', () => {
    const t = clone();
    t.services.find((s) => s.action === 'UPDATE')!.existingIds = ['00000000-0000-4000-8000-000000000000'];
    expect(validateTaxonomy(t, snapshot, manifest).join('\n')).toMatch(/unknown existing id/);
  });
  it('a lead sentence over 200 chars', () => {
    const t = clone();
    t.services[0].description = `${'x'.repeat(210)}. Second sentence.`;
    expect(validateTaxonomy(t, snapshot, manifest).join('\n')).toMatch(/lead sentence over 200/);
  });
  it('a dropped case study, a reused id, and a retired id', () => {
    const t = clone();
    const upd = t.services.filter((s) => s.action === 'UPDATE');
    upd[1].existingIds = [...upd[0].existingIds];
    const retired = snapshot.rows.find((r) => r.status === 'retired')!;
    upd[2].existingIds = [retired.id];
    t.services = t.services.filter((s) => s.key !== 'digital-financial-inclusion-risk');
    const out = validateTaxonomy(t, snapshot, manifest).join('\n');
    expect(out).toMatch(/already claimed/);
    expect(out).toMatch(/retired/);
    expect(out).toMatch(/no service and no noHome reason: AgTech - ALLIN/);
  });
  it('an unflagged single-case-study service and bad keyword counts', () => {
    const t = clone();
    const s = t.services.find((x) => x.thinEvidence)!;
    s.thinEvidence = false;
    s.keywords = ['a1', 'b2'];
    const out = validateTaxonomy(t, snapshot, manifest).join('\n');
    expect(out).toMatch(/thinEvidence/);
    expect(out).toMatch(/3-12 keywords/);
  });
  it('a number in a description that its case studies do not contain', () => {
    const t = clone();
    t.services[0].description = 'Delivered agents that cut handling time by 73% for a utility.';
    expect(validateTaxonomy(t, snapshot, manifest).join('\n')).toMatch(/number "73%" in description/);
  });
  it('leadSentence takes the first sentence only', () => {
    expect(leadSentence('One. Two.')).toBe('One.');
    expect(leadSentence('No period')).toBe('No period');
  });
});
