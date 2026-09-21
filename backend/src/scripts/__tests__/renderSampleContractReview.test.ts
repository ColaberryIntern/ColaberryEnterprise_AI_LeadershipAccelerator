/**
 * The rendered review must be generated FROM the sample data and show the things a manager
 * reads: both tracks, every task's executor and accountable human, and a clean requirement→task
 * coverage table (no uncited requirement).
 */
import { renderSampleReviewHtml } from '../renderSampleContractReview';

describe('renderSampleReviewHtml', () => {
  const html = renderSampleReviewHtml();

  it('shows both tracks', () => {
    expect(html).toContain('proposal track');
    expect(html).toContain('solution_build track');
  });

  it('shows an agent executor with a human accountable on the extraction task', () => {
    expect(html).toContain('Extract requirements from the solicitation');
    expect(html).toMatch(/pill agent">agent/);       // an agent performs it
    expect(html).toMatch(/Compliance Analyst .*pill human">human/s); // a human is accountable
  });

  it('renders a requirement→task coverage table with every requirement cited', () => {
    for (const req of ['REQ-1', 'REQ-2', 'REQ-3', 'REQ-4']) expect(html).toContain(req);
    expect(html).not.toContain('uncited');           // every requirement is covered
  });

  it('renders the old→new role map', () => {
    expect(html).toContain('Old &rarr; new role map'.replace('&rarr;', '→'));
    expect(html).toContain('Manual compliance reviewer');
  });

  it('is generated from data, not hardcoded — the sample title is present', () => {
    expect(html).toContain('AI Government Contract Finder');
    expect(html).toContain('factoryValidate() with zero errors');
  });
});
