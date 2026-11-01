import {
  toAutoHide, needsRequirements, qualifyUrl, renderUploadEmail, renderVetSummaryEmail,
  type SweepOpportunity,
} from '../govOpportunitySweep';
import type { VettingStage } from '../../govOpportunityVetting';

const opp = (uuid: string, fitScore: number | null, title = 'T', agency = 'A'): SweepOpportunity => ({ uuid, title, agency, fitScore });
const stages = (m: Record<string, VettingStage>): Map<string, VettingStage> => new Map(Object.entries(m));

describe('qualifyUrl', () => {
  it('matches the discovery page Qualify link shape', () => {
    expect(qualifyUrl('abc')).toContain('/admin/gov-qualification?gws=');
    expect(qualifyUrl('abc')).toContain(encodeURIComponent('gws:abc'));
  });
});

describe('toAutoHide', () => {
  it('hides fit strictly below the threshold', () => {
    const r = toAutoHide([opp('a', 59), opp('b', 60), opp('c', 10)], new Set(), new Map());
    expect(r.map((o) => o.uuid).sort()).toEqual(['a', 'c']);
  });
  it('never hides an already-dismissed row', () => {
    expect(toAutoHide([opp('a', 10)], new Set(['a']), new Map())).toEqual([]);
  });
  it('never hides a row whose qualification has started', () => {
    expect(toAutoHide([opp('a', 10)], new Set(), stages({ a: 'in_review' }))).toEqual([]);
  });
  it('ignores a missing fit score', () => {
    expect(toAutoHide([opp('a', null)], new Set(), new Map())).toEqual([]);
  });
});

describe('needsRequirements', () => {
  it('is good-fit, not dismissed, and not yet qualified', () => {
    const r = needsRequirements([opp('a', 80), opp('b', 59), opp('c', 90)], new Set(), stages({ c: 'vetted' }));
    expect(r.map((o) => o.uuid)).toEqual(['a']); // b too low, c already vetted
  });
  it('excludes dismissed rows', () => {
    expect(needsRequirements([opp('a', 80)], new Set(['a']), new Map())).toEqual([]);
  });
});

describe('email renderers', () => {
  it('upload email lists each row with its Qualify link and escapes the title', () => {
    const html = renderUploadEmail([opp('u1', 80, 'A & B <RFP>')]);
    expect(html).toContain('requirements uploaded');
    expect(html).toContain(qualifyUrl('u1'));
    expect(html).toContain('A &amp; B &lt;RFP&gt;');
    expect(html).not.toContain('<RFP>');
  });
  it('adds a View-on-Bonfire link, beside the Qualify CTA, when the row has an http(s) source URL (escaped)', () => {
    const row: SweepOpportunity = { uuid: 'u2', title: 'T', agency: 'A', fitScore: 80, sourceUrl: 'https://op.colaberry.ai/b?a=1&b=2' };
    const html = renderUploadEmail([row]);
    expect(html).toContain('View on Bonfire');
    expect(html).toContain('href="https://op.colaberry.ai/b?a=1&amp;b=2"');
    expect(html).toContain(qualifyUrl('u2')); // still present, in addition to the Bonfire link
  });
  it('omits the Bonfire link when the source URL is missing or not http(s)', () => {
    expect(renderUploadEmail([{ uuid: 'u3', title: 'T', agency: 'A', fitScore: 80, sourceUrl: null }])).not.toContain('View on Bonfire');
    const bad = renderUploadEmail([{ uuid: 'u4', title: 'T', agency: 'A', fitScore: 80, sourceUrl: 'javascript:alert(1)' }]);
    expect(bad).not.toContain('View on Bonfire');
    expect(bad).not.toContain('javascript:');
  });
  it('vet summary email shows per-stage counts and links to the board, omitting zero rows', () => {
    const html = renderVetSummaryEmail({ inReview: 22, needsRequirements: 17, awaitingApproval: 0, total: 39 });
    expect(html).toContain('39 opportunities are ready to vet + assign');
    expect(html).toContain('22 in review');
    expect(html).toContain('17 with requirements being established');
    expect(html).not.toContain('awaiting a second-admin approval'); // 0 -> row omitted
    expect(html).toContain('/admin/gov-opportunities');
  });
  it('vet summary email uses the singular for a single opportunity', () => {
    expect(renderVetSummaryEmail({ inReview: 1, needsRequirements: 0, awaitingApproval: 0, total: 1 }))
      .toContain('1 opportunity is ready to vet + assign');
  });
});
