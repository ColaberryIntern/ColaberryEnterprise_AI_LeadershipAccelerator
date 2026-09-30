/**
 * The Sankey's one non-negotiable property is CONSERVATION.
 *
 * Band width is proportional to sessions, so the diagram is a quantitative claim
 * in a way a node-and-edge graph never was. If the two link layers disagree the
 * picture misstates volume — and it does so convincingly, because a Sankey with
 * wrong numbers still looks like a Sankey. Every test here exists to make that
 * failure loud.
 */

jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { buildSankey, normaliseSource, FlowRow } from '../visitorFlowSankeyService';

const rows: FlowRow[] = [
  { source: 'google.com', site: 'enterprise', outcome: 'Identified', sessions: 10 },
  { source: 'www.google.co.uk', site: 'enterprise', outcome: 'Engaged', sessions: 5 },
  { source: 'linkedin.com', site: 'enterprise', outcome: 'Bounced', sessions: 7 },
  { source: '', site: 'colaberry', outcome: 'Engaged', sessions: 20 },
  { source: 'lnkd.in', site: 'colaberry', outcome: 'Left', sessions: 3 },
];

function sumLinksFromStage(built: ReturnType<typeof buildSankey>, stage: string): number {
  return built.links
    .filter((l) => built.nodes[l.source].stage === stage)
    .reduce((acc, l) => acc + l.value, 0);
}

describe('normaliseSource', () => {
  it('collapses a search engine to one recognisable name', () => {
    expect(normaliseSource('google.com')).toBe('Google');
    expect(normaliseSource('www.google.co.uk')).toBe('Google');
    // Same answer to "where did they come from" — splitting them makes several
    // thin bands that say less than the one they came from.
    expect(normaliseSource('google.com')).toBe(normaliseSource('www.google.co.uk'));
  });

  it('folds LinkedIn short links into LinkedIn', () => {
    expect(normaliseSource('lnkd.in')).toBe('LinkedIn');
    expect(normaliseSource('www.linkedin.com')).toBe('LinkedIn');
  });

  it('treats a missing referrer as Direct rather than unknown', () => {
    expect(normaliseSource(null)).toBe('Direct');
    expect(normaliseSource(undefined)).toBe('Direct');
    expect(normaliseSource('')).toBe('Direct');
    expect(normaliseSource('   ')).toBe('Direct');
  });

  it('keeps an unrecognised host as itself rather than burying it in Other', () => {
    expect(normaliseSource('some-partner.io')).toBe('some-partner.io');
  });

  /**
   * `notgoogle.com` must not become Google. The patterns anchor on a dot or the
   * start of the host precisely so a substring match cannot rewrite a real
   * referrer into a brand it has nothing to do with.
   */
  it('does not match a brand inside an unrelated hostname', () => {
    expect(normaliseSource('notgoogle.com')).toBe('notgoogle.com');
    expect(normaliseSource('mylinkedinclone.net')).toBe('mylinkedinclone.net');
  });
});

describe('buildSankey — conservation', () => {
  it('conserves value across both hops', () => {
    const built = buildSankey(rows, 30);
    const firstHop = sumLinksFromStage(built, 'source');
    const secondHop = sumLinksFromStage(built, 'site');

    expect(firstHop).toBe(45); // 10 + 5 + 7 + 20 + 3
    expect(secondHop).toBe(45);
    expect(built.total_sessions).toBe(45);
  });

  it('reports a total that matches the table it ships beside the chart', () => {
    const built = buildSankey(rows, 30);
    const tableTotal = built.table.reduce((acc, r) => acc + r.sessions, 0);
    expect(tableTotal).toBe(built.total_sessions);
  });

  it('merges the two Google spellings into one band', () => {
    const built = buildSankey(rows, 30);
    const googleNodes = built.nodes.filter((n) => n.stage === 'source' && n.name === 'Google');
    expect(googleNodes).toHaveLength(1);

    const googleIndex = built.nodes.findIndex((n) => n.stage === 'source' && n.name === 'Google');
    const outbound = built.links.filter((l) => l.source === googleIndex).reduce((a, l) => a + l.value, 0);
    expect(outbound).toBe(15); // 10 + 5, not two bands of 10 and 5
  });
});

describe('buildSankey — node indexing', () => {
  it('never lets a link point at a node in the wrong stage', () => {
    const built = buildSankey(rows, 30);
    for (const link of built.links) {
      const from = built.nodes[link.source];
      const to = built.nodes[link.target];
      expect(from).toBeDefined();
      expect(to).toBeDefined();
      // Only two hops exist, and both go forwards.
      expect(
        (from.stage === 'source' && to.stage === 'site') || (from.stage === 'site' && to.stage === 'outcome')
      ).toBe(true);
    }
  });

  /**
   * A site and a source can legitimately share a name — a referrer of
   * `colaberry.ai` alongside a site slug of `colaberry`. Indexing per stage is
   * what stops one being drawn as the other.
   */
  it('keeps a source and a site with the same name apart', () => {
    const built = buildSankey(
      [{ source: 'enterprise', site: 'enterprise', outcome: 'Engaged', sessions: 4 }],
      30
    );
    const sourceNode = built.nodes.findIndex((n) => n.stage === 'source' && n.name === 'enterprise');
    const siteNode = built.nodes.findIndex((n) => n.stage === 'site' && n.name === 'enterprise');

    expect(sourceNode).not.toBe(siteNode);
    expect(built.links).toContainEqual({ source: sourceNode, target: siteNode, value: 4 });
    expect(sumLinksFromStage(built, 'source')).toBe(4);
    expect(sumLinksFromStage(built, 'site')).toBe(4);
  });

  it('survives a hostname containing separators without misattributing it', () => {
    const built = buildSankey(
      [{ source: 'a b.example.com', site: 'x y', outcome: 'Engaged', sessions: 9 }],
      30
    );
    expect(sumLinksFromStage(built, 'source')).toBe(9);
    expect(sumLinksFromStage(built, 'site')).toBe(9);
    expect(built.nodes.filter((n) => n.stage === 'site')).toHaveLength(1);
  });
});

describe('buildSankey — folding and ordering', () => {
  it('folds the long tail into Other without losing its volume', () => {
    const many: FlowRow[] = Array.from({ length: 12 }, (_, i) => ({
      source: `partner-${i}.com`,
      site: 'enterprise',
      outcome: 'Engaged',
      sessions: 12 - i, // descending, so the tail is the small ones
    }));
    const built = buildSankey(many, 30);
    const expected = many.reduce((a, r) => a + r.sessions, 0);

    const sourceNodes = built.nodes.filter((n) => n.stage === 'source');
    expect(sourceNodes.length).toBeLessThanOrEqual(7); // 6 kept + Other
    expect(sourceNodes.some((n) => n.name === 'Other')).toBe(true);
    // The fold must not lose sessions — that is the difference between
    // summarising and quietly under-reporting.
    expect(sumLinksFromStage(built, 'source')).toBe(expected);
    expect(built.total_sessions).toBe(expected);
  });

  it('orders outcomes best-to-worst, not by volume', () => {
    const built = buildSankey(
      [
        { source: '', site: 's', outcome: 'Bounced', sessions: 100 },
        { source: '', site: 's', outcome: 'Identified', sessions: 1 },
      ],
      30
    );
    const outcomes = built.nodes.filter((n) => n.stage === 'outcome').map((n) => n.name);
    // Identified leads despite being far smaller: this column is a scale, and
    // re-ranking it by volume would move a label's height on every refresh.
    expect(outcomes).toEqual(['Identified', 'Bounced']);
  });

  it('returns an empty, renderable shape when there is no traffic', () => {
    const built = buildSankey([], 30);
    expect(built.nodes).toEqual([]);
    expect(built.links).toEqual([]);
    expect(built.total_sessions).toBe(0);
    expect(built.table).toEqual([]);
  });

  it('drops zero and negative counts rather than drawing a zero-width band', () => {
    const built = buildSankey(
      [
        { source: '', site: 's', outcome: 'Engaged', sessions: 0 },
        { source: '', site: 's', outcome: 'Engaged', sessions: 5 },
      ],
      30
    );
    expect(built.total_sessions).toBe(5);
    expect(built.links.every((l) => l.value > 0)).toBe(true);
  });
});
