import { summarizeNeeds } from '../govProjectProjection';

describe('summarizeNeeds (v3 T05)', () => {
  it('counts the project total, the fatal subset, and per-document', () => {
    const out = summarizeNeeds([
      { blocking: 'fatal', usedIn: [{ docKey: 'cover' }, { docKey: 'tech' }] },
      { blocking: 'score', usedIn: [{ docKey: 'tech' }] },
      { blocking: 'fatal', usedIn: [] },
    ]);
    expect(out.total).toBe(3);
    expect(out.fatal).toBe(2);
    expect(out.byDoc.cover).toEqual({ total: 1, fatal: 1 });
    expect(out.byDoc.tech).toEqual({ total: 2, fatal: 1 });
  });

  it('counts a need once per document even if it lists the doc twice', () => {
    const out = summarizeNeeds([{ blocking: 'score', usedIn: [{ docKey: 'a' }, { docKey: 'a' }] }]);
    expect(out.total).toBe(1);
    expect(out.byDoc.a).toEqual({ total: 1, fatal: 0 });
  });

  it('is empty and safe on no needs or junk', () => {
    expect(summarizeNeeds([])).toEqual({ total: 0, fatal: 0, byDoc: {} });
    expect(summarizeNeeds([{ usedIn: undefined }])).toEqual({ total: 1, fatal: 0, byDoc: {} });
  });
});
