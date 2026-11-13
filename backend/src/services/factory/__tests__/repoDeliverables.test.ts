import { deliverableKind, deliverablesFromTree } from '../repoDeliverables';

describe('deliverableKind', () => {
  it('classifies deliverable documents by extension', () => {
    expect(deliverableKind('a.pdf')).toBe('pdf');
    expect(deliverableKind('a.docx')).toBe('word');
    expect(deliverableKind('a.doc')).toBe('word');
    expect(deliverableKind('a.pptx')).toBe('slides');
    expect(deliverableKind('a.xlsx')).toBe('spreadsheet');
    expect(deliverableKind('a.xls')).toBe('spreadsheet');
    expect(deliverableKind('a.csv')).toBe('csv');
    expect(deliverableKind('a.md')).toBe('text');
    expect(deliverableKind('a.txt')).toBe('text');
    expect(deliverableKind('a.rtf')).toBe('other');
    expect(deliverableKind('index.html')).toBe('html');
    expect(deliverableKind('page.htm')).toBe('html');
  });

  it('returns null for non-deliverable (source/secret/unknown) files', () => {
    for (const n of ['server/auth.js', 'main.ts', '.env', 'Dockerfile', 'a.png', 'a.json', 'noext']) {
      expect(deliverableKind(n)).toBeNull();
    }
  });

  it('is case-insensitive on the extension', () => {
    expect(deliverableKind('REPORT.PDF')).toBe('pdf');
    expect(deliverableKind('INDEX.HTML')).toBe('html');
  });
});

describe('deliverablesFromTree', () => {
  it('keeps blob deliverables, drops trees and source, derives basename', () => {
    const out = deliverablesFromTree([
      { path: 'docs/plan.pdf', type: 'blob' },
      { path: 'docs', type: 'tree' },
      { path: 'server/app.js', type: 'blob' },
      { path: 'README.md', type: 'blob' },
    ]);
    expect(out).toEqual([
      { path: 'docs/plan.pdf', name: 'plan.pdf', kind: 'pdf' },
      { path: 'README.md', name: 'README.md', kind: 'text' },
    ]);
  });

  it('a malformed/absent tree yields [] (never throws)', () => {
    expect(deliverablesFromTree(undefined)).toEqual([]);
    expect(deliverablesFromTree('not-an-array' as unknown)).toEqual([]);
    expect(deliverablesFromTree(null)).toEqual([]);
    expect(deliverablesFromTree([null, {}, { type: 'blob' }, { path: 5, type: 'blob' }])).toEqual([]);
  });

  it('caps the list', () => {
    const tree = Array.from({ length: 500 }, (_, i) => ({ path: `d/f${i}.pdf`, type: 'blob' }));
    expect(deliverablesFromTree(tree, 300)).toHaveLength(300);
  });
});
