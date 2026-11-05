/**
 * assemblePackageCore — the P6 export gate + assembly, tested with injected deps. A package is BLOCKED (and nothing
 * rendered) while a required form is unsigned or a required redacted copy is missing; when ready, it renders every
 * non-pricing document and emits the manifest.
 */
import { assemblePackageCore, type PackageDeps } from '../buildProposalPackage';
import type { PackageDoc } from '../proposalPackageCore';

const okDoc = (over: Partial<PackageDoc> = {}): PackageDoc => ({
  key: 'technical', title: 'Technical Proposal', passes: true, goldApproved: true, fatalCount: 0,
  version: 2, pageCount: 12, blueprintVersion: 1, contentSha256: 'h', fileName: 'technical.pdf', adminOnly: false, ...over,
});

function deps(over: Partial<PackageDeps>): PackageDeps {
  return {
    loadDocs: async () => [okDoc(), okDoc({ key: 'pricing', fileName: 'price.xlsx', adminOnly: true })],
    missingSignatures: async () => [],
    requiresRedactedCopy: async () => false,
    hasRedactedCopy: async () => false,
    renderDoc: async () => 12,
    now: () => '2026-11-04T00:00:00Z',
    ...over,
  };
}

describe('assemblePackageCore', () => {
  it('blocks (and renders nothing) when a required form is unsigned', async () => {
    const renderDoc = jest.fn(async () => 12);
    const r = await assemblePackageCore(deps({ missingSignatures: async () => ['hsp'], renderDoc }));
    expect(r.ok).toBe(false);
    expect(r.blocking.some((b) => b.startsWith('unsigned_required_forms'))).toBe(true);
    expect(renderDoc).not.toHaveBeenCalled();
  });

  it('blocks when a required redacted copy is missing', async () => {
    const r = await assemblePackageCore(deps({ requiresRedactedCopy: async () => true, hasRedactedCopy: async () => false }));
    expect(r.ok).toBe(false);
    expect(r.blocking).toContain('redacted_copy_required');
  });

  it('blocks on a failing document', async () => {
    const r = await assemblePackageCore(deps({ loadDocs: async () => [okDoc({ passes: false })] }));
    expect(r.ok).toBe(false);
  });

  it('assembles when ready: renders each NON-pricing doc and emits the manifest', async () => {
    const renderDoc = jest.fn(async () => 12);
    const r = await assemblePackageCore(deps({ renderDoc }));
    expect(r.ok).toBe(true);
    expect(r.rendered).toBe(1); // only the technical doc; the pricing file is the sealed passthrough, not rendered
    expect(renderDoc).toHaveBeenCalledTimes(1);
    expect(r.manifest?.fileCount).toBe(2); // the manifest still lists both, pricing flagged sealed
    expect(r.manifest?.items.find((i) => i.fileName === 'price.xlsx')?.sealed).toBe(true);
  });
});
