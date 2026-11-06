/**
 * The directory's assembly (pure) and its query contract. The gate itself is
 * hireTalentIndex.test.ts; this is what the API makes of the people the gate lets through.
 */
import { assembleDirectory, sortListed } from '../hireTalentDirectory';
import { parseHireTalentQuery, trackFor } from '../hireTalentQuery';
import { availabilityOf, pickSignature, toTalentCard, type HireCaseStudyCard, type HireTalentCard } from '../hireTalentProjection';

const cs = (slug: string, over: Partial<HireCaseStudyCard> = {}): HireCaseStudyCard => ({
  slug, title: 'Title ' + slug, summary: null, industry: 'Insurance', featured: false,
  publishedAt: '2026-11-01T00:00:00.000Z', heroMetric: null, outcomes: [], ...over,
});
const tcard = (slug: string, over: Partial<HireTalentCard> = {}): HireTalentCard => ({
  slug, name: 'N ' + slug, avatarUrl: null, role: null, track: null, headline: null, location: null,
  cohort: null, availability: null, caseStudyCount: 1, verifiedCommitCount: 0, capabilities: [],
  signature: null, spotlight: false, ...over,
});
const listed = (slug: string, cardOver: Partial<HireTalentCard> = {}, cases = [cs('cs-' + slug)]) => ({
  card: tcard(slug, { caseStudyCount: cases.length, ...cardOver }),
  entry: { page: {} as any, facts: {} as any, cases },
});

describe('query contract', () => {
  it('accepts the documented parameters', () => {
    const r = parseHireTalentQuery({ q: 'claims', track: 'fde', sort: 'newest', limit: '12', cursor: '24', industry: 'insurance' });
    expect(r).toEqual({ ok: true, query: { q: 'claims', track: 'fde', sort: 'newest', limit: 12, cursor: '24', industry: 'insurance' } });
  });

  it('rejects an unknown track, an unknown sort, a 500-char q, an unknown field and a repeated param', () => {
    expect(parseHireTalentQuery({ track: 'wizard' }).ok).toBe(false);
    expect(parseHireTalentQuery({ sort: 'random' }).ok).toBe(false);
    expect(parseHireTalentQuery({ q: 'x'.repeat(500) }).ok).toBe(false);
    expect(parseHireTalentQuery({ email: 'a@b.c' }).ok).toBe(false);
    expect(parseHireTalentQuery({ track: ['fde', 'architect'] }).ok).toBe(false);
    expect(parseHireTalentQuery({ limit: '49' }).ok).toBe(false);
  });

  it('treats SQL metacharacters in q as text (it is never interpolated anywhere)', () => {
    expect(parseHireTalentQuery({ q: "'; DROP TABLE x; --" })).toEqual({ ok: true, query: { q: "'; DROP TABLE x; --" } });
  });
});

describe('trackFor - a small explicit map, never a guess', () => {
  it('maps role words to tracks, and leaves an unknown role trackless', () => {
    expect(trackFor('Forward Deployed Engineer')).toBe('fde');
    expect(trackFor('AI Systems Architect')).toBe('architect');
    expect(trackFor('Power BI Data Analyst')).toBe('analytics');
    expect(trackFor('Frontier AI Engineer')).toBe('ai-engineer');
    expect(trackFor('Barista')).toBeNull();
    expect(trackFor(null)).toBeNull();
  });
});

describe('cards', () => {
  it('signature = featured first, then the latest published', () => {
    expect(pickSignature([cs('a', { publishedAt: '2026-10-01' }), cs('b', { publishedAt: '2026-11-01' })])?.slug).toBe('b');
    expect(pickSignature([cs('a', { featured: true, publishedAt: '2026-01-01' }), cs('b', { publishedAt: '2026-11-01' })])?.slug).toBe('a');
    expect(pickSignature([])).toBeNull();
  });

  it('renders availability only when a known kind AND a label are set - never inferred', () => {
    const f = (s: string | null, l: string | null) => ({ slug: 'x', availabilityStatus: s, availabilityLabel: l, hireSpotlight: false });
    expect(availabilityOf(f('open', 'Open to FDE roles'))).toEqual({ kind: 'open', label: 'Open to FDE roles' });
    expect(availabilityOf(f('open', null))).toBeNull();
    expect(availabilityOf(f('busy', 'Busy'))).toBeNull();
    expect(availabilityOf(f(null, null))).toBeNull();
  });

  it('builds the card from the public projection only: no email, no invented headline', () => {
    const portfolio: any = {
      identity: { full_name: 'Ann Lee', headline: 'AI Systems Architect', cohort_name: 'July 2026', avatar_data_url: null, linkedin_url: null, email: 'ann@x.com', location: 'Dallas', github_url: null },
      capabilities: [{ name: 'A', count: 1 }, { name: 'B', count: 1, proven: true }, { name: 'C', count: 1 }, { name: 'D', count: 1, proven: true }],
      verified_commits: [{}, {}, {}],
    };
    const c = toTalentCard(portfolio, { slug: 'ann', availabilityStatus: null, availabilityLabel: null, hireSpotlight: true }, [cs('x'), cs('y')]);
    expect(JSON.stringify(c)).not.toContain('ann@x.com');
    expect(c.headline).toBeNull();
    expect(c.track).toBe('architect');
    expect(c.capabilities.map((x) => x.name)).toEqual(['B', 'D', 'A']); // proven first, max 3
    expect(c.caseStudyCount).toBe(2);
    expect(c.verifiedCommitCount).toBe(3);
    expect(c.spotlight).toBe(true);
  });
});

describe('assembleDirectory', () => {
  it('labels a fallback spotlight "latest", and uses flagged picks when there are any', () => {
    const people = [listed('a'), listed('b'), listed('c'), listed('d')];
    const fallback = assembleDirectory(people, {});
    expect(fallback.spotlightSource).toBe('latest');
    expect(fallback.spotlight).toHaveLength(3);
    const flagged = assembleDirectory([listed('a', { spotlight: true }), listed('b')], {});
    expect(flagged.spotlightSource).toBe('flagged');
    expect(flagged.spotlight.map((t) => t.slug)).toEqual(['a']);
  });

  it('counts totals over everyone listed, whatever the filter', () => {
    const d = assembleDirectory([
      listed('a', { verifiedCommitCount: 3, track: 'fde' }, [cs('1', { industry: 'Insurance' }), cs('2', { industry: 'Retail' })]),
      listed('b', { verifiedCommitCount: 4 }, [cs('3', { industry: 'Insurance' })]),
    ], { track: 'fde' });
    expect(d.totals).toEqual({ listed: 2, caseStudies: 3, verifiedCommits: 7, industries: 2 });
    expect(d.talent.map((t) => t.slug)).toEqual(['a']);
  });

  it('filters by industry, capability and free text over the card\'s own public words', () => {
    const people = [
      listed('a', { capabilities: [{ name: 'Agent Skills', proven: true }] }, [cs('x', { industry: 'Insurance', title: 'Claims triage' })]),
      listed('b', {}, [cs('y', { industry: 'Retail', title: 'Shelf audit' })]),
    ];
    expect(assembleDirectory(people, { industry: 'insurance' }).talent.map((t) => t.slug)).toEqual(['a']);
    expect(assembleDirectory(people, { capability: 'agent-skills' }).talent.map((t) => t.slug)).toEqual(['a']);
    expect(assembleDirectory(people, { q: 'shelf' }).talent.map((t) => t.slug)).toEqual(['b']);
    expect(assembleDirectory(people, { q: 'nothing matches' }).talent).toEqual([]);
  });

  it('sorts by the requested key and pages with an opaque cursor', () => {
    const people = [listed('a', { caseStudyCount: 1 }), listed('b', { caseStudyCount: 3 }), listed('c', { caseStudyCount: 2 })];
    expect(sortListed(people, 'case_studies').map((l) => l.card.slug)).toEqual(['b', 'c', 'a']);
    const first = assembleDirectory(people, { sort: 'case_studies', limit: 2 });
    expect(first.talent.map((t) => t.slug)).toEqual(['b', 'c']);
    expect(first.nextCursor).toBe('2');
    const second = assembleDirectory(people, { sort: 'case_studies', limit: 2, cursor: '2' });
    expect(second.talent.map((t) => t.slug)).toEqual(['a']);
    expect(second.nextCursor).toBeNull();
  });

  it('is honest about an empty directory', () => {
    const d = assembleDirectory([], {});
    expect(d.totals).toEqual({ listed: 0, caseStudies: 0, verifiedCommits: 0, industries: 0 });
    expect(d.talent).toEqual([]);
    expect(d.spotlight).toEqual([]);
  });
});
