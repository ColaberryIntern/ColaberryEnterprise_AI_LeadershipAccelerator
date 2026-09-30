import { milestonesFor, MILESTONES } from '../billingHealthCheck';
import { renderReport } from '../billingHealthReport';
import type { HealthResult, Finding } from '../billingHealthCheck';

const result = (over: Partial<HealthResult> = {}): HealthResult => ({
  findings: [],
  milestones: [],
  needsAttention: false,
  checkedAt: '2026-08-23T12:00:00.000Z',
  ...over,
});

const finding = (over: Partial<Finding> = {}): Finding => ({
  severity: 'soon',
  code: 'test',
  headline: 'Something happened',
  detail: 'Detail.',
  action: 'Do the thing.',
  ...over,
});

describe('milestones', () => {
  it('fires only on the exact date, not before or after', () => {
    expect(milestonesFor('2026-12-12').map((m) => m.what)).toEqual([
      expect.stringContaining('Elizabeth Nzau'),
    ]);
    expect(milestonesFor('2026-12-11')).toHaveLength(0);
    expect(milestonesFor('2026-12-13')).toHaveLength(0);
  });

  it('says nothing on an ordinary day', () => {
    expect(milestonesFor('2026-10-05')).toHaveLength(0);
  });

  // Every milestone must explain why it matters, or the email is just a date.
  it('gives every milestone a reason a human can act on', () => {
    MILESTONES.forEach((m) => {
      expect(m.on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(m.why.length).toBeGreaterThan(30);
    });
  });
});

describe('the email only arrives when it should', () => {
  // The core of the design: a daily all-clear teaches you to ignore it, and then
  // the one that matters gets ignored too.
  it('leads with the count when something needs acting on now', () => {
    const r = result({ findings: [finding({ severity: 'act_now' })], needsAttention: true });
    expect(renderReport(r).subject).toBe('[Billing] 1 thing needs you now');
  });

  it('pluralises honestly', () => {
    const r = result({
      findings: [finding({ severity: 'act_now' }), finding({ severity: 'act_now' })],
      needsAttention: true,
    });
    expect(renderReport(r).subject).toBe('[Billing] 2 things need you now');
  });

  it('softens the subject when nothing is urgent', () => {
    const r = result({ findings: [finding({ severity: 'watch' })], needsAttention: true });
    expect(renderReport(r).subject).toBe('[Billing] 1 thing to look at');
  });

  it('uses the milestone as the subject when that is the only reason to write', () => {
    const r = result({
      milestones: [{ on: '2026-12-12', what: 'Schedule 4504746 fires', why: 'First ever automatic charge.' }],
      needsAttention: true,
    });
    expect(renderReport(r).subject).toBe('[Billing] Milestone: Schedule 4504746 fires');
  });

  it('always tells the reader what to do, not just what is wrong', () => {
    const r = result({ findings: [finding({ action: 'Reconcile before creating more schedules.' })], needsAttention: true });
    const { text, html } = renderReport(r);
    expect(text).toMatch(/What to do: Reconcile before creating more schedules\./);
    expect(html).toMatch(/What to do:/);
  });

  it('caps a long row list rather than mailing hundreds of lines', () => {
    const rows = Array.from({ length: 30 }, (_, i) => `member ${i}`);
    const r = result({ findings: [finding({ rows })], needsAttention: true });
    const { text } = renderReport(r);
    expect(text).toMatch(/\.\.\.and 18 more/);
    expect(text).not.toMatch(/member 20/);
  });

  it('escapes anything a member could have put in their own name', () => {
    const r = result({
      findings: [finding({ rows: ['<script>alert(1)</script> &co'] })],
      needsAttention: true,
    });
    const { html } = renderReport(r);
    expect(html).not.toMatch(/<script>/);
    expect(html).toMatch(/&lt;script&gt;/);
    expect(html).toMatch(/&amp;co/);
  });
});
