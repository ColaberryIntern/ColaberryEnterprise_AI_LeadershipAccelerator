import { deliverableKind, deliverablesFromTree } from '../repoDeliverables';

describe('deliverableKind', () => {
  it('classifies structured documents by extension', () => {
    expect(deliverableKind('a.pdf')).toBe('pdf');
    expect(deliverableKind('a.docx')).toBe('word');
    expect(deliverableKind('a.doc')).toBe('word');
    expect(deliverableKind('a.pptx')).toBe('slides');
    expect(deliverableKind('a.ppt')).toBe('slides');
    expect(deliverableKind('a.xlsx')).toBe('spreadsheet');
    expect(deliverableKind('a.xls')).toBe('spreadsheet');
    expect(deliverableKind('a.csv')).toBe('csv');
    expect(deliverableKind('a.rtf')).toBe('other');
  });

  it('classifies video as its own kind', () => {
    expect(deliverableKind('demo.mp4')).toBe('video');
    expect(deliverableKind('demo.mov')).toBe('video');
    expect(deliverableKind('demo.webm')).toBe('video');
    expect(deliverableKind('demo.m4v')).toBe('video');
  });

  it('EXCLUDES markup and plain-text files (not structured documents)', () => {
    for (const n of ['index.html', 'page.htm', 'README.md', 'notes.txt']) {
      expect(deliverableKind(n)).toBeNull();
    }
  });

  it('returns null for non-deliverable (source/secret/unknown) files', () => {
    for (const n of ['server/auth.js', 'main.ts', '.env', 'Dockerfile', 'a.png', 'a.json', 'noext']) {
      expect(deliverableKind(n)).toBeNull();
    }
  });

  it('is case-insensitive on the extension', () => {
    expect(deliverableKind('REPORT.PDF')).toBe('pdf');
    expect(deliverableKind('DEMO.MP4')).toBe('video');
  });
});

describe('deliverablesFromTree', () => {
  it('keeps blob deliverables + video, drops trees, source, and markup/text, derives basename', () => {
    const out = deliverablesFromTree([
      { path: 'docs/plan.pdf', type: 'blob' },
      { path: 'docs', type: 'tree' },
      { path: 'server/app.js', type: 'blob' },
      { path: 'README.md', type: 'blob' },
      { path: 'site/index.html', type: 'blob' },
      { path: 'media/walkthrough.mp4', type: 'blob' },
    ]);
    expect(out).toEqual([
      { path: 'docs/plan.pdf', name: 'plan.pdf', kind: 'pdf' },
      { path: 'media/walkthrough.mp4', name: 'walkthrough.mp4', kind: 'video' },
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
