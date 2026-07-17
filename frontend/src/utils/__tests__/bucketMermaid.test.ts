import { buildBucketMermaid, mermaidLabel, MermaidCardLike } from '../bucketMermaid';

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
