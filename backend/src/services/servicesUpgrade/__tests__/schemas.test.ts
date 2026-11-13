import { CapabilityFitBaseline, CatalogSnapshot, Manifest, ManifestRecord, TaxonomyV2 } from '../schemas';

const uuid = '11111111-1111-4111-8111-111111111111';

const record = {
  sourceFile: 'Utilities - Scam Reporting Tool.pdf', sha256: 'a'.repeat(64), basecampUploadId: 1, title: 'Scam Reporting Tool',
  industry: 'Utilities', clientDescriptor: 'a major utility company', problem: 'p', solution: 's', capabilities: ['Web Application Development'],
  techStack: ['AWS'], outcomes: [], pageCount: 3, gaps: [], extractedBy: 'deterministic' as const,
};

describe('servicesUpgrade schemas', () => {
  it('accepts a valid catalog snapshot and rejects a rowCount mismatch', () => {
    const row = { id: uuid, name: 'X', description: null, category: null, keywords: [], naicsCodes: [], pscCodes: [], pastPerformance: null, status: 'active', updatedAt: null };
    expect(CatalogSnapshot.safeParse({ kind: 'service_catalog_snapshot', takenOn: '2026-11-13', tenantId: uuid, rowCount: 1, rows: [row] }).success).toBe(true);
    expect(CatalogSnapshot.safeParse({ kind: 'service_catalog_snapshot', takenOn: '2026-11-13', tenantId: uuid, rowCount: 2, rows: [row] }).success).toBe(false);
  });

  it('rejects a fit result missing assessment', () => {
    const base = { kind: 'capability_fit_baseline', takenOn: '2026-11-13', activeServiceCount: 1, selectionRule: 'r' };
    const cap = { id: 'CAP-01', name: 'n', matchedServiceId: null, rationale: 'r' };
    const pursuit = { canonicalOpportunityId: 'gws:1', source: 'fresh_run', title: null, requirementCount: 3, verdict: null, coveragePct: null, completedAt: null, error: null };
    expect(CapabilityFitBaseline.safeParse({ ...base, pursuits: [{ ...pursuit, capabilities: [{ ...cap, assessment: 'new' }] }] }).success).toBe(true);
    expect(CapabilityFitBaseline.safeParse({ ...base, pursuits: [{ ...pursuit, capabilities: [cap] }] }).success).toBe(false);
  });

  it('rejects a manifest record without source_file and duplicate source files', () => {
    expect(ManifestRecord.safeParse(record).success).toBe(true);
    const { sourceFile, ...noFile } = record; void sourceFile;
    expect(ManifestRecord.safeParse(noFile).success).toBe(false);
    expect(Manifest.safeParse({ kind: 'whitepaper_manifest', version: 1, recordCount: 1, records: [record] }).success).toBe(true);
    expect(Manifest.safeParse({ kind: 'whitepaper_manifest', version: 1, recordCount: 2, records: [record, record] }).success).toBe(false);
  });

  it('accepts a minimal taxonomy', () => {
    const svc = { key: 'k', action: 'NEW', existingIds: [], name: 'Name', category: 'Cat', description: 'A description long enough.', keywords: ['ab'],
      naics: [], psc: [], industries: [], capabilities: [], caseStudies: [], thinEvidence: true, rationale: 'because why' };
    expect(TaxonomyV2.safeParse({ kind: 'services_taxonomy_v2', proposedOn: '2026-11-13', status: 'proposed', basedOnSnapshot: 'a', basedOnManifest: 'b',
      services: [svc], untouchedExistingIds: [], noHome: [] }).success).toBe(true);
  });
});
