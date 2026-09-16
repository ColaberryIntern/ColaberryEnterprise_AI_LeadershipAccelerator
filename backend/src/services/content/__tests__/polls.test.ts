/**
 * Polls, end to end without a network: the one schema, the per-network rules, the LinkedIn
 * wire shape, and what the handoff package tells a person to do. Every number here is pinned
 * to providerCapabilities so a table edit fails a test rather than silently changing what
 * publishes.
 */

import { PollSchema, pollFromMetadata, pollProblems, type PollSpec } from '../pollSpec';
import { validateVariant, validateSubmission, type VariantContext } from '../composerValidation';
import type { Variant } from '../composerVariants';
import { getProviderCapabilities } from '../../publishing/providerCapabilities';
import { LinkedInAdapter, type LinkedInHttp } from '../../publishing/linkedInAdapter';
import { HandoffAdapter } from '../../publishing/handoffAdapter';
import type { PublishPayload } from '../../publishing/socialProviderAdapter';

const NOW = new Date('2026-09-15T22:00:00Z').getTime();
const poll: PollSpec = { question: 'Which AI skill should we teach first?', options: ['Prompting', 'Agents', 'Data pipelines'], durationDays: 3 };

function v(provider: Variant['provider'], text = 'Vote below.'): Variant {
  return { provider, text, source: 'generated', canonicalFingerprint: 'x', stale: false };
}
function ctx(over: Partial<VariantContext> = {}): VariantContext {
  return { contentType: 'poll', mediaCount: 0, media: [], poll, links: [], ...over };
}
const pollProblemsFor = (provider: Variant['provider'], c: VariantContext) => validateVariant(v(provider), c, NOW).problems.filter((p) => p.field === 'poll' || p.field === 'contentType');

describe('PollSchema: the one shape', () => {
  it('accepts a real poll and trims', () => {
    const r = PollSchema.safeParse({ question: '  Which?  ', options: [' A ', 'B'], durationDays: 7 });
    expect(r.success && r.data).toEqual({ question: 'Which?', options: ['A', 'B'], durationDays: 7 });
  });

  it('refuses one option, five options, duplicate options, a blank option, and a fractional duration', () => {
    expect(PollSchema.safeParse({ question: 'Q', options: ['A'], durationDays: 1 }).success).toBe(false);
    expect(PollSchema.safeParse({ question: 'Q', options: ['A', 'B', 'C', 'D', 'E'], durationDays: 1 }).success).toBe(false);
    expect(PollSchema.safeParse({ question: 'Q', options: ['Yes', 'yes'], durationDays: 1 }).success).toBe(false);
    expect(PollSchema.safeParse({ question: 'Q', options: ['A', '  '], durationDays: 1 }).success).toBe(false);
    expect(PollSchema.safeParse({ question: 'Q', options: ['A', 'B'], durationDays: 1.5 }).success).toBe(false);
  });

  it('reads a poll off metadata and returns null for none or a broken one, never throwing', () => {
    expect(pollFromMetadata({ isPaid: false, poll })).toEqual(poll);
    expect(pollFromMetadata({ isPaid: false })).toBeNull();
    expect(pollFromMetadata({ poll: { question: 'Q', options: ['only one'], durationDays: 1 } })).toBeNull();
    expect(pollFromMetadata(null)).toBeNull();
  });
});

describe('the capability table declares who has polls', () => {
  it('LinkedIn (both) and X do; Facebook, Instagram, YouTube and TikTok do not', () => {
    expect(getProviderCapabilities('linkedin_member').poll).toEqual({ minOptions: 2, maxOptions: 4, maxOptionChars: 30, maxQuestionChars: 140, durationsDays: [1, 3, 7, 14] });
    expect(getProviderCapabilities('linkedin_organization').poll).toEqual(getProviderCapabilities('linkedin_member').poll);
    expect(getProviderCapabilities('x').poll).toEqual({ minOptions: 2, maxOptions: 4, maxOptionChars: 25, maxQuestionChars: 280, durationsDays: [1, 2, 3, 4, 5, 6, 7] });
    for (const p of ['meta_facebook_page', 'meta_instagram', 'youtube', 'tiktok'] as const) {
      expect(getProviderCapabilities(p).poll).toBeNull();
      expect(getProviderCapabilities(p).contentTypes).not.toContain('poll');
    }
  });
});

describe('validation, per network', () => {
  it('a 3-option, 3-day poll passes LinkedIn and X', () => {
    expect(pollProblemsFor('linkedin_member', ctx())).toEqual([]);
    expect(pollProblemsFor('x', ctx())).toEqual([]);
  });

  it('a network with no poll post is blocked at the content-type check', () => {
    const [p] = pollProblemsFor('meta_instagram', ctx());
    expect(p).toMatchObject({ field: 'contentType', severity: 'block' });
    expect(p.message).toMatch(/does not accept poll posts/);
  });

  it('a poll post with no poll is blocked, naming what is missing', () => {
    const [p] = pollProblemsFor('linkedin_member', ctx({ poll: null }));
    expect(p.message).toBe('LinkedIn (personal profile): a poll post needs a question and 2 to 4 options.');
  });

  it('an option over the network limit: 30 on LinkedIn, 25 on X - the same option can pass one and fail the other', () => {
    const long = { ...poll, options: ['Prompting', 'Building agents with tools', 'Data'] }; // 26 chars
    expect(pollProblemsFor('linkedin_member', ctx({ poll: long }))).toEqual([]);
    const [p] = pollProblemsFor('x', ctx({ poll: long }));
    expect(p.message).toBe('X: option 2 is 26 characters, limit 25.');
  });

  it('a duration the network does not offer: LinkedIn has 1/3/7/14, X has any of 1-7', () => {
    const [li] = pollProblemsFor('linkedin_member', ctx({ poll: { ...poll, durationDays: 5 } }));
    expect(li.message).toBe('LinkedIn (personal profile): polls run for 1, 3, 7, 14 days; 5 is not offered.');
    expect(pollProblemsFor('x', ctx({ poll: { ...poll, durationDays: 5 } }))).toEqual([]);
    const [x] = pollProblemsFor('x', ctx({ poll: { ...poll, durationDays: 14 } }));
    expect(x.message).toMatch(/1, 2, 3, 4, 5, 6, 7 days; 14 is not offered/);
  });

  it('a question over 140 characters is blocked on LinkedIn only', () => {
    const q = { ...poll, question: 'q'.repeat(150) };
    expect(pollProblemsFor('linkedin_member', ctx({ poll: q }))[0].message).toMatch(/question is 150 characters, limit 140/);
    expect(pollProblemsFor('x', ctx({ poll: q }))).toEqual([]);
  });

  it('a poll with an attachment is blocked: content is one-of', () => {
    const problems = pollProblemsFor('linkedin_member', ctx({ mediaCount: 1, media: [{ mimeType: 'image/png', byteSize: 100, width: 1200, height: 628, durationMs: null, codecFamily: null }] }));
    expect(problems.map((p) => p.message)).toContain('LinkedIn (personal profile): a poll cannot carry media. Remove the attachment or change the content type.');
  });

  it('submission across LinkedIn + Instagram is blocked as a whole, so no partial publish', () => {
    const r = validateSubmission([v('linkedin_member'), v('meta_instagram')], () => ctx(), NOW);
    expect(r.ok).toBe(false);
    expect(r.blockers.map((b) => b.provider)).toEqual(['meta_instagram']);
  });

  it('pollProblems says nothing for a poll that fits', () => {
    expect(pollProblems('LinkedIn', getProviderCapabilities('linkedin_member').poll!, poll)).toEqual([]);
  });
});

function payload(over: Partial<PublishPayload> = {}): PublishPayload {
  return {
    jobId: 'job-1', provider: 'linkedin_member', contentItemId: 'ci-1', variantId: 'cv-1', accountId: 'acc-1',
    text: 'Vote below.', mediaRefs: [], media: [], poll, linkUrl: null, disclosureText: null,
    scheduledFor: '2026-09-16T14:00:00.000Z', contentRevision: 1, ...over,
  };
}

describe('LinkedIn wire shape', () => {
  const TOKEN = ['AQV', 'p0llT0k3n', 'xyz'].join('');
  function adapter(http: LinkedInHttp) {
    return new LinkedInAdapter({ provider: 'linkedin_member', getToken: async () => TOKEN, getAuthorUrn: async () => 'urn:li:person:abc', readMedia: async () => Buffer.alloc(0), http, clock: () => new Date(NOW), sleep: async () => undefined });
  }

  it('sends content.poll with option objects and a NAMED duration, and no image steps', async () => {
    const calls: Array<Parameters<LinkedInHttp>[0]> = [];
    const http: LinkedInHttp = async (c) => { calls.push(c); return { status: 201, headers: { 'x-restli-id': 'urn:li:share:9' }, body: {} }; };
    const receipt = await adapter(http).publish(payload(), 'idem-1');
    expect(calls).toHaveLength(1);
    expect((calls[0].body as { content: unknown }).content).toEqual({
      poll: { question: poll.question, options: [{ text: 'Prompting' }, { text: 'Agents' }, { text: 'Data pipelines' }], settings: { duration: 'THREE_DAYS' } },
    });
    expect((calls[0].body as { commentary: string }).commentary).toBe('Vote below.');
    expect(receipt.requestMetadata).toMatchObject({ poll_options: 3, media_count: 0 });
  });

  it('validate refuses what the wire would refuse: a 5-day window, a 31-character option, a poll with media', async () => {
    const a = adapter(async () => ({ status: 201, headers: {}, body: {} }));
    const r1 = await a.validate(payload({ poll: { ...poll, durationDays: 5 } }));
    expect((r1 as { reasons: string[] }).reasons.join(' ')).toMatch(/5 is not offered/);
    const r2 = await a.validate(payload({ poll: { ...poll, options: ['a'.repeat(31), 'b'] } }));
    expect((r2 as { reasons: string[] }).reasons.join(' ')).toMatch(/31 characters, limit 30/);
    const r3 = await a.validate(payload({ media: [{ ref: 'media/b/x.png', mimeType: 'image/png', altText: 'x', byteSize: 10 }], mediaRefs: ['media/b/x.png'] }));
    expect((r3 as { reasons: string[] }).reasons.join(' ')).toMatch(/cannot carry media/);
    expect(await a.validate(payload())).toEqual({ ok: true });
  });
});

describe('handoff package', () => {
  it('tells the person the question, the options in order, and how long it runs', () => {
    const pkg = new HandoffAdapter('x', () => new Date(NOW)).buildPackage(payload({ provider: 'x' }));
    expect(pkg.poll).toEqual(poll);
    expect(pkg.instructions).toMatch(/3\. Create a poll\. Question: "Which AI skill should we teach first\?"\. Options, in order: 1\) Prompting  2\) Agents  3\) Data pipelines\. Runs 3 days\./);
  });

  it('says one day, singular', () => {
    const pkg = new HandoffAdapter('x', () => new Date(NOW)).buildPackage(payload({ provider: 'x', poll: { ...poll, durationDays: 1 } }));
    expect(pkg.instructions).toMatch(/Runs 1 day\./);
  });
});
