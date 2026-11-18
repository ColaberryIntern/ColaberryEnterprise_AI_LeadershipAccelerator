/**
 * OH1n (found in the Nov 18 post-deploy check of PR #4196): the countdown draft sample showed
 * "AI unavailable" on every step. validateGeneratedMessage read context.campaign.type on a
 * context that had only previousMessages, threw, and every draft became the plain fallback.
 * The scheduler can hand the same partial context when its context graph build fails and
 * earlier countdown emails exist. Pinned here: a partial context never throws, and the sampler
 * builds the context the way the scheduler does.
 */
import { validateGeneratedMessage, validateSubjectLine } from '../messageValidatorService';
import { sampleCompositeContext } from '../../scripts/ensureOpenHouseCountdownCampaign';

const JOIN = 'https://enterprise.colaberry.ai/portal/class-checkin/8c92ba87-4766-4a83-9da4-ad529f68b2dc';
const BODY = `<p>Hi Aaron, the Open House is this afternoon. <a href="${JOIN}">Join here</a>.</p>`;

describe('validateGeneratedMessage with a partial context', () => {
  it('does not throw when the context has only previousMessages (the OH1f sampler shape)', () => {
    const partial: any = { previousMessages: [{ channel: 'email', subject: 's', bodyPreview: 'an earlier email', sentAt: 'Nov 12' }] };
    const r = validateGeneratedMessage(BODY, partial, 'email');
    expect(r.content).toContain(JOIN);
  });

  it('does not throw on an empty context (the scheduler fallback when the graph build fails)', () => {
    expect(() => validateGeneratedMessage(BODY, {} as any, 'email')).not.toThrow();
    expect(() => validateSubjectLine('Today at 2:30', {} as any)).not.toThrow();
  });

  it('never injects a booking link when there is no booking URL', () => {
    const partial: any = { campaign: { stepGoal: 'book a strategy call' } };
    const r = validateGeneratedMessage(BODY, partial, 'email');
    expect(r.content).not.toMatch(/Strategy Call/);
  });

  it('still runs the repetition check on whatever earlier messages are present', () => {
    const partial: any = { previousMessages: [{ bodyPreview: 'Hi Aaron, the Open House is this afternoon. Join here.' }] };
    const r = validateGeneratedMessage(BODY, partial, 'email');
    expect(r.issues.join(' ')).toMatch(/similar to last message/);
  });
});

describe('sampleCompositeContext', () => {
  it('uses the scheduler builder and points every allowed URL at the Join link', async () => {
    const build = jest.fn(async () => ({ campaign: { type: 'behavioral_trigger', senderName: 'Maya' }, allowedUrls: { booking: 'https://x/book' }, previousMessages: [] }));
    const ctx = await sampleCompositeContext(42, 'camp-1', 2, JOIN, build);
    expect(build).toHaveBeenCalledWith(42, 'camp-1', 2);
    expect(ctx.campaign.type).toBe('behavioral_trigger');
    expect(ctx.allowedUrls).toEqual({ booking: JOIN, landingPage: JOIN, mainSite: 'https://enterprise.colaberry.ai' });
  });

  it('falls back to links only when there is no lead or the build fails, and the validator accepts it', async () => {
    const failing = jest.fn(async () => { throw new Error('graph down'); });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const a = await sampleCompositeContext(42, 'camp-1', 0, JOIN, failing);
    const b = await sampleCompositeContext(null, 'camp-1', 0, JOIN, failing);
    warn.mockRestore();
    expect(failing).toHaveBeenCalledTimes(1);
    for (const ctx of [a, b]) {
      expect(ctx.allowedUrls.booking).toBe(JOIN);
      expect(() => validateGeneratedMessage(BODY, ctx as any, 'email')).not.toThrow();
    }
  });
});
