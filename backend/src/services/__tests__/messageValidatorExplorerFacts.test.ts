import { validateGeneratedMessage } from '../messageValidatorService';
import type { CompositeContext } from '../contextGraphService';

/**
 * Proves the Explorer fact guard is WIRED, not merely written.
 *
 * `explorerFactGuard` has its own unit tests. This file exists for a different
 * reason: a correct guard that nothing calls is the failure mode this codebase
 * keeps producing — a well-built producer with no consumer, green tests over a
 * path that never runs. So these tests go through the real
 * `validateGeneratedMessage` and assert on its `issues`.
 *
 * The second property matters as much as the first: every NON-Explorer send
 * must be completely unaffected. This validator is on the live outbound path
 * for every campaign in the system.
 */

function ctx(over: Partial<CompositeContext> = {}): CompositeContext {
  return {
    lead: {
      name: 'Dara Okonkwo',
      firstName: 'Dara',
      email: 'dara@example.com',
      company: 'Acme',
      title: 'Analyst',
      industry: 'Retail',
      phone: '',
      temperature: 'warm',
      pipelineStage: 'nurture',
      score: 10,
      notes: '',
    },
    campaign: {
      name: 'Explorer Activation',
      type: 'warm_nurture',
      senderName: 'Ali Muwwakkil',
      senderRelationship: 'founder',
      step: 0,
      totalSteps: 3,
      stepGoal: 'reactivate',
    },
    engagement: { bookingAttempts: 0 } as any,
    previousMessages: [],
    ...over,
  } as CompositeContext;
}

const factIssues = (r: { issues: string[] }) => r.issues.filter((i) => i.includes('§11.4'));

describe('the Explorer fact guard is reachable through the real validator', () => {
  it('rejects an invented cohort date on an Explorer send', () => {
    const context = ctx({ explorer: { dates: ['November 3'], prices: [], seats: [] } });

    const result = validateGeneratedMessage('Your cohort starts April 14.', context, 'email');

    expect(factIssues(result)).toHaveLength(1);
    expect(result.issues.join(' ')).toContain('April 14');
    expect(result.valid).toBe(false);
  });

  it('allows the date that was actually resolved', () => {
    const context = ctx({ explorer: { dates: ['November 3'], prices: [], seats: [] } });

    const result = validateGeneratedMessage('Your cohort starts November 3.', context, 'email');

    expect(factIssues(result)).toEqual([]);
  });

  it('rejects an invented price', () => {
    const context = ctx({ explorer: { dates: [], prices: ['$149'], seats: [] } });

    const result = validateGeneratedMessage('Just $99 a month.', context, 'email');

    expect(factIssues(result)).toHaveLength(1);
  });

  it('fails closed when the Explorer context resolved nothing', () => {
    // Present-but-empty is the STRICTEST state, not the most permissive.
    const context = ctx({ explorer: { dates: [], prices: [], seats: [] } });

    const result = validateGeneratedMessage('Starts November 3.', context, 'email');

    expect(factIssues(result)).toHaveLength(1);
  });
});

describe('non-Explorer sends are untouched', () => {
  it('does not apply the fact guard when there is no explorer context', () => {
    // This validator sits on the live outbound path for every campaign in the
    // system. A date in an ordinary sales email is none of this rule's business.
    const result = validateGeneratedMessage('Let us meet April 14.', ctx(), 'email');

    expect(factIssues(result)).toEqual([]);
  });

  it('leaves the message content unchanged either way', () => {
    const body = 'Your cohort starts April 14.';
    const context = ctx({ explorer: { dates: [], prices: [], seats: [] } });

    // The guard REPORTS; it must not silently rewrite copy. An auto-fix here
    // would mean quietly editing a factual claim rather than refusing it.
    expect(validateGeneratedMessage(body, context, 'email').content).toContain('April 14');
  });
});
