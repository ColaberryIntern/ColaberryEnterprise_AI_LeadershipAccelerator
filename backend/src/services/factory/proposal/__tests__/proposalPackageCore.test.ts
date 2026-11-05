/**
 * proposalPackageCore — the export gate (blocked on any failing doc / unapproved Gold / fatal item), the manifest
 * shape (version, page count, sha256, blueprint version, sealed pricing), and the redacted-copy transform.
 */
import { evaluatePackageReadiness, buildPackageManifest, redactHtml, type PackageDoc } from '../proposalPackageCore';

const doc = (over: Partial<PackageDoc> = {}): PackageDoc => ({
  key: 'technical', title: 'Technical Proposal', passes: true, goldApproved: true, fatalCount: 0,
  version: 3, pageCount: 18, blueprintVersion: 2, contentSha256: 'abc', fileName: 'technical.pdf', adminOnly: false, ...over,
});

describe('evaluatePackageReadiness', () => {
  it('ready when every document passes, Gold is approved, and nothing is fatal', () => {
    expect(evaluatePackageReadiness([doc(), doc({ key: 'pricing', adminOnly: true })]).ok).toBe(true);
  });
  it('blocked by a failing document', () => {
    expect(evaluatePackageReadiness([doc({ passes: false })]).blocking.some((b) => b.startsWith('documents_not_passing'))).toBe(true);
  });
  it('blocked by an unapproved Gold gate', () => {
    expect(evaluatePackageReadiness([doc({ goldApproved: false })]).blocking.some((b) => b.startsWith('gold_gate_unapproved'))).toBe(true);
  });
  it('blocked by a fatal item', () => {
    expect(evaluatePackageReadiness([doc({ fatalCount: 1 })]).blocking.some((b) => b.startsWith('fatal_items'))).toBe(true);
  });
  it('blocked when there are no documents', () => {
    expect(evaluatePackageReadiness([]).blocking).toEqual(['no_documents']);
  });
});

describe('buildPackageManifest', () => {
  it('lists each file in file-name order with version, page count, sha256, blueprint version, and the sealed flag', () => {
    const m = buildPackageManifest([doc({ key: 'pricing', fileName: 'price.xlsx', adminOnly: true, contentSha256: 'p1' }), doc()], '2026-11-04T00:00:00Z');
    expect(m.fileCount).toBe(2);
    expect(m.items.map((i) => i.fileName)).toEqual(['price.xlsx', 'technical.pdf']); // sorted
    expect(m.items.find((i) => i.fileName === 'price.xlsx')?.sealed).toBe(true);
    expect(m.items.find((i) => i.fileName === 'technical.pdf')).toMatchObject({ version: 3, pageCount: 18, sha256: 'abc', blueprintVersion: 2, sealed: false });
    expect(m.blueprintVersion).toBe(2);
  });
});

describe('redactHtml', () => {
  it('replaces marked spans with [REDACTED], right-to-left, honoring a label', () => {
    const text = 'Our rate is 200 dollars and our client is Acme.';
    // redact "200 dollars" (12..23) and "Acme" (42..46)
    const out = redactHtml(text, [{ span_start: 12, span_end: 23, label: 'price' }, { span_start: 42, span_end: 46 }]);
    expect(out).toContain('[REDACTED: price]');
    expect(out).toContain('[REDACTED]');
    expect(out).not.toContain('200 dollars');
    expect(out).not.toContain('Acme');
  });
  it('ignores out-of-range / inverted spans and is total on garbage', () => {
    expect(redactHtml('hello', [{ span_start: 2, span_end: 1 }, { span_start: 10, span_end: 20 }])).toBe('hello');
    expect(redactHtml(null as any, null as any)).toBe('');
  });
});
