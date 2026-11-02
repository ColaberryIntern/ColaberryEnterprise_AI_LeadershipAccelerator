import { toExtractionResult } from '../govExtractionJobService';

describe('toExtractionResult', () => {
  const sampleReqs = [
    { canonicalReqId: 'REQ-001', statement: 'The system shall X.', extractedText: 'shall X', sourceDocument: 'rfp.pdf', section: '3.1', kind: 'functional', priority: 'must' },
    { canonicalReqId: 'REQ-002', statement: 'The system shall Y.', extractedText: 'shall Y', sourceDocument: 'rfp.pdf', section: '3.2', kind: 'functional', priority: 'should' },
  ];
  const result = { fileCount: 3, files: [{ name: 'rfp.pdf', status: 'extracted' }] };
  const aiMeta = { mode: 'deterministic', model: null, aiKept: 0, aiDropped: 0, aiError: null };

  it('maps requirements to the exact candidate shape the frontend consumes', () => {
    const out = toExtractionResult(sampleReqs as any, [{ id: 'item-1' }], result as any, aiMeta);
    expect(out.candidates).toHaveLength(2);
    expect(out.candidates[0]).toEqual({
      id: 'REQ-001', text: 'The system shall X.', extractedText: 'shall X',
      sourceDocument: 'rfp.pdf', section: '3.1', kind: 'functional', priority: 'must',
    });
  });

  it('passes fileCount, files, items and extraction through unchanged', () => {
    const items = [{ id: 'item-1', category: 'submit' }];
    const out = toExtractionResult(sampleReqs as any, items, result as any, aiMeta);
    expect(out.fileCount).toBe(3);
    expect(out.files).toBe(result.files);
    expect(out.items).toBe(items);
    expect(out.extraction).toBe(aiMeta);
  });

  it('tolerates an empty/missing requirements array', () => {
    expect(toExtractionResult(undefined as any, null, { fileCount: 0, files: [] } as any, null).candidates).toEqual([]);
  });
});
