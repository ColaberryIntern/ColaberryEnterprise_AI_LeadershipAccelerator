import { buildBucketMermaid, mermaidLabel, nodeIdFromMermaidGroupId, MermaidCardLike } from '../bucketMermaid';

const icon = (t: string) => (t === 'media' ? '🎬' : '🎴');

describe('mermaidLabel', () => {
  it('strips characters that can break the mermaid parser', () => {
    expect(mermaidLabel('a[b]{c}|d<e>#f;')).toBe('a b c d e f');
  });

  it('folds quotes and backticks to apostrophes', () => {
    expect(mermaidLabel('say "hi" `now`')).toBe("say 'hi' 'now'");
  });

  it('truncates long titles with an ellipsis and stays within the cap', () => {
    const out = mermaidLabel('x'.repeat(60));
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.endsWith('…')).toBe(true);
  });

  it('falls back to Untitled for empty/blank input', () => {
    expect(mermaidLabel('   ')).toBe('Untitled');
    expect(mermaidLabel('')).toBe('Untitled');
  });
});

describe('nodeIdFromMermaidGroupId', () => {
  // Real ids rendered by mermaid@11 have a varying renderId prefix + trailing counter.
  it('extracts the node id past the render-id prefix and counter', () => {
    expect(nodeIdFromMermaidGroupId('te-minimap-pre_class-svg-flowchart-n0-0')).toBe('n0');
    expect(nodeIdFromMermaidGroupId('gid-flowchart-n12-12')).toBe('n12');
    expect(nodeIdFromMermaidGroupId('x-flowchart-more-8')).toBe('more');
  });
  it('is not fooled by an "n" in the bucket/prefix', () => {
    expect(nodeIdFromMermaidGroupId('te-minimap-learn-svg-flowchart-n3-3')).toBe('n3');
  });
  it('returns null for edges / non-node ids / empty', () => {
    expect(nodeIdFromMermaidGroupId('te-minimap-learn-svg-edgePaths')).toBeNull();
    expect(nodeIdFromMermaidGroupId('')).toBeNull();
    expect(nodeIdFromMermaidGroupId(null)).toBeNull();
  });
});

describe('buildBucketMermaid', () => {
  const two: MermaidCardLike[] = [
    { title: 'Welcome', type: 'media', visibility: 'published' },
    { title: 'Draft one', type: 'quiz', visibility: 'draft' },
  ];

  it('emits an LR flowchart with one node per card, classed by visibility', () => {
    const chart = buildBucketMermaid(two, icon);
    expect(chart.startsWith('flowchart LR')).toBe(true);
    expect(chart).toContain('n0["🎬 Welcome"]:::live');
    expect(chart).toContain(':::draft');
    expect(chart).toContain('n0 --> n1');
    expect(chart).toContain('classDef live');
  });

  it('folds overflow beyond the cap into a single +N more node', () => {
    const many: MermaidCardLike[] = Array.from({ length: 11 }, (_, i) => ({
      title: `card ${i}`, type: 'quiz', visibility: 'draft',
    }));
    const chart = buildBucketMermaid(many, icon);
    expect(chart).toContain('more["+3 more"]');
    expect(chart).toContain('--> more');
  });

  it('wraps into rows of at most 3, with no edge crossing a row boundary', () => {
    const five: MermaidCardLike[] = Array.from({ length: 5 }, (_, i) => ({
      title: `card ${i}`, type: 'quiz', visibility: 'draft',
    }));
    const chart = buildBucketMermaid(five, icon);
    // row 1: n0 → n1 → n2
    expect(chart).toContain('n0 --> n1');
    expect(chart).toContain('n1 --> n2');
    // row break — no edge from the end of row 1 into row 2
    expect(chart).not.toContain('n2 --> n3');
    // row 2: n3 → n4 (only two cards left)
    expect(chart).toContain('n3 --> n4');
    expect(chart).not.toContain('n4 --> n5');
  });

  it('renders a single card with no edges', () => {
    const chart = buildBucketMermaid(
      [{ title: 'Solo', type: 'media', visibility: 'published' }],
      icon,
    );
    expect(chart).toContain('n0[');
    expect(chart).not.toContain('-->');
  });

  it('falls back to the type slug when a card has no title', () => {
    const chart = buildBucketMermaid(
      [{ title: null, type: 'live_class', visibility: 'draft' }],
      icon,
    );
    expect(chart).toContain('live class');
  });
});
