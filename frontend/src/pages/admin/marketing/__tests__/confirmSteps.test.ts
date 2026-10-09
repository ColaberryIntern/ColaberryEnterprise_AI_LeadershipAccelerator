import { confirmLadder } from '../composer/confirmSteps';
import type { ConfirmationSummary } from '../../../../services/contentComposerApi';

/**
 * The ladder out of the composer.
 *
 * Built from a real production case: item `eb29ad46`, "Reel 10", a 77 MB video attached, a time
 * set for 09:00 CDT, and four dead buttons. It was at revision 8 with validation never run, so
 * `clean` was false and nothing could fire. The reason was on screen, last and muted.
 */

function summary(over: Partial<ConfirmationSummary> = {}): ConfirmationSummary {
  return {
    item: { id: 'i-1', title: 'Reel 10', status: 'draft', contentType: 'video', revision: 8, poll: null },
    brand: { id: 'b-1', name: 'Colaberry Training', timezone: 'America/Chicago', timezoneSource: 'brand' },
    campaign: null,
    accounts: [],
    schedule: null,
    copy: [],
    assets: [],
    links: [],
    linkGaps: [],
    approval: { label: 'Not requested', itemStatus: 'draft', humanApproved: false, request: null },
    validation: { ran: false, ok: false, blockerCount: 0, blockers: [] },
    readiness: { canSaveDraft: true, canSendForApproval: false, canSchedule: false, canPublishNow: false, publishLabel: 'Publish now', reasons: [] },
    ...over,
  } as ConfirmationSummary;
}

describe("Ali's actual post, as the server saw it", () => {
  const ladder = confirmLadder(summary({
    schedule: { utc: '2026-10-01T14:00:00.000Z', utcLabel: '14:00Z', local: { day: '2026-10-01', time: '9:00 AM', zone: 'CDT', offset: '-05:00', dayLabel: 'Thu, Oct 1' }, timezone: 'America/Chicago', differsFromUtc: true },
    readiness: { canSaveDraft: true, canSendForApproval: false, canSchedule: false, canPublishNow: false, publishLabel: 'Publish now', reasons: ['Validation has not been run for this revision.'] },
  } as Partial<ConfirmationSummary>));

  it('says it is a draft and names the next step, rather than leaving it to be inferred', () => {
    expect(ladder.headline).toBe('This post is a draft. Next: validate.');
  });

  it('puts validation as the current step and explains the revision trap', () => {
    const v = ladder.steps.find((s) => s.key === 'validate')!;
    expect(v.state).toBe('current');
    // The part nobody could have guessed: an edit invalidates an earlier validation.
    expect(v.detail).toMatch(/any edit since the last run means it has to run again/);
  });

  it('marks the later steps BLOCKED, not merely incomplete', () => {
    expect(ladder.steps.find((s) => s.key === 'approve')!.state).toBe('blocked');
    expect(ladder.steps.find((s) => s.key === 'schedule')!.state).toBe('blocked');
  });

  it('offers no next action, because none of the four would have worked', () => {
    expect(ladder.nextAction).toBeNull();
    expect(ladder.nextLabel).toBeNull();
  });

  it('carries the server reasons rather than inventing its own', () => {
    expect(ladder.blockers).toEqual(['Validation has not been run for this revision.']);
  });
});

describe('once validation passes', () => {
  const ladder = confirmLadder(summary({
    validation: { ran: true, ok: true, blockerCount: 0, blockers: [] },
    readiness: { canSaveDraft: true, canSendForApproval: true, canSchedule: false, canPublishNow: false, publishLabel: 'Publish now', reasons: ['Publishing needs an approved item; this one is draft.'] },
  } as Partial<ConfirmationSummary>));

  it('moves the current step to approval and says a draft publishes nothing', () => {
    expect(ladder.steps.find((s) => s.key === 'validate')!.state).toBe('done');
    const a = ladder.steps.find((s) => s.key === 'approve')!;
    expect(a.state).toBe('current');
    expect(a.detail).toMatch(/Nothing publishes from a draft/);
  });

  it('names the one button worth pressing', () => {
    expect(ladder.nextAction).toBe('send_for_approval');
    expect(ladder.nextLabel).toBe('Send for approval');
  });
});

describe('validation that ran and failed', () => {
  it('counts the problems instead of claiming it never ran', () => {
    const l = confirmLadder(summary({ validation: { ran: true, ok: false, blockerCount: 3, blockers: [] } } as Partial<ConfirmationSummary>));
    expect(l.steps[0].detail).toBe('3 problems to fix, listed below.');
  });

  it('reads in the singular for one', () => {
    const l = confirmLadder(summary({ validation: { ran: true, ok: false, blockerCount: 1, blockers: [] } } as Partial<ConfirmationSummary>));
    expect(l.steps[0].detail).toBe('1 problem to fix, listed below.');
  });
});

describe('approved and waiting on a time', () => {
  const ladder = confirmLadder(summary({
    item: { id: 'i-1', title: 'Reel 10', status: 'approved', contentType: 'video', revision: 8, poll: null },
    validation: { ran: true, ok: true, blockerCount: 0, blockers: [] },
    approval: { label: 'Approved', itemStatus: 'approved', humanApproved: true, request: null },
    readiness: { canSaveDraft: true, canSendForApproval: false, canSchedule: false, canPublishNow: true, publishLabel: 'Publish now', reasons: ['Set a time to schedule, or publish now.'] },
  } as Partial<ConfirmationSummary>));

  it('says to set a time or publish now', () => {
    expect(ladder.steps.find((s) => s.key === 'schedule')!.detail).toBe('Set a time, or publish now.');
  });

  it('prefers publishing now when that is the only thing enabled', () => {
    expect(ladder.nextAction).toBe('publish_now');
  });

  it('uses the server label, so a handoff is never called a publish', () => {
    const l = confirmLadder(summary({
      item: { id: 'i-1', title: 'R', status: 'approved', contentType: 'video', revision: 8, poll: null },
      validation: { ran: true, ok: true, blockerCount: 0, blockers: [] },
      approval: { label: 'Approved', itemStatus: 'approved', humanApproved: true, request: null },
      readiness: { canSaveDraft: true, canSendForApproval: false, canSchedule: false, canPublishNow: true, publishLabel: 'Create handoff packages', reasons: [] },
    } as Partial<ConfirmationSummary>));
    expect(l.nextLabel).toBe('Create handoff packages');
  });
});

describe('scheduled, and beyond', () => {
  it('states the local time rather than "scheduled"', () => {
    const l = confirmLadder(summary({
      item: { id: 'i-1', title: 'R', status: 'scheduled', contentType: 'video', revision: 8, poll: null },
      validation: { ran: true, ok: true, blockerCount: 0, blockers: [] },
      approval: { label: 'Approved', itemStatus: 'scheduled', humanApproved: true, request: null },
      schedule: { utc: '2026-10-01T14:00:00.000Z', utcLabel: '14:00Z', local: { day: '2026-10-01', time: '9:00 AM', zone: 'CDT', offset: '-05:00', dayLabel: 'Thu, Oct 1' }, timezone: 'America/Chicago', differsFromUtc: true },
    } as Partial<ConfirmationSummary>));
    expect(l.headline).toBe('Scheduled for 9:00 AM CDT, Thu, Oct 1.');
    expect(l.steps.every((s) => s.state === 'done')).toBe(true);
  });

  it('a published post offers nothing to press', () => {
    const l = confirmLadder(summary({ item: { id: 'i-1', title: 'R', status: 'published', contentType: 'video', revision: 8, poll: null } } as Partial<ConfirmationSummary>));
    expect(l.headline).toBe('This post has gone out.');
    expect(l.nextAction).toBeNull();
  });

  it('a post mid-flight says so, rather than claiming it is done', () => {
    const l = confirmLadder(summary({ item: { id: 'i-1', title: 'R', status: 'publishing', contentType: 'video', revision: 8, poll: null } } as Partial<ConfirmationSummary>));
    expect(l.headline).toBe('This post is going out now.');
  });
});
