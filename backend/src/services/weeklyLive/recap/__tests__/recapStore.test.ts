import { sequelize } from '../../../../config/database';
import { upsertRecap, claimSend } from '../recapStore';

/**
 * The SQL contracts the recap depends on, asserted on the statement text (the CI Postgres tier runs
 * the real thing). WL1.4 verifier follow-up: a change to the overview or the link must void the test
 * copy, and an unchanged save must keep it. WL1.3: a row is claimed only from queued|failed under the
 * attempt cap.
 */
let q: jest.SpyInstance;
beforeEach(() => { q = jest.spyOn(sequelize, 'query').mockResolvedValue([] as never); });
afterEach(() => q.mockRestore());

it('upsertRecap voids test_sent_at only when the summary or the link actually changes', async () => {
  await upsertRecap('s1', { summary: { headline: 'h', intro: '', ideas: [{ icon: '', title: 'tt', text: '' }], steps: [], quote: '', homework: '' } });
  const sql = String(q.mock.calls[0][0]).replace(/\s+/g, ' ');
  expect(sql).toContain('test_sent_at = CASE');
  expect(sql).toContain('CAST(:summary AS JSONB) IS DISTINCT FROM weekly_live_recaps.summary THEN NULL');
  expect(sql).toContain(':urlSet AND :url IS DISTINCT FROM weekly_live_recaps.next_event_url THEN NULL');
  expect(sql).toContain('ELSE weekly_live_recaps.test_sent_at END');
  expect(q.mock.calls[0][1].replacements).toMatchObject({ urlSet: false });
});

it('saving only the link passes urlSet and leaves the summary untouched', async () => {
  await upsertRecap('s1', { nextEventUrl: 'https://www.eventbrite.com/e/2' });
  expect(q.mock.calls[0][1].replacements).toMatchObject({ summary: null, url: 'https://www.eventbrite.com/e/2', urlSet: true });
});

it('claimSend claims only queued or failed rows under the attempt cap, atomically', async () => {
  q.mockResolvedValueOnce([{ id: 'r1' }] as never);
  expect(await claimSend('s1', 'a@x.com')).toBe(true);
  const sql = String(q.mock.calls[0][0]).replace(/\s+/g, ' ');
  expect(sql).toContain("SET status = 'sending', attempts = attempts + 1");
  expect(sql).toContain("status IN ('queued', 'failed') AND attempts < :max RETURNING id");
  q.mockResolvedValueOnce([] as never);
  expect(await claimSend('s1', 'a@x.com')).toBe(false);
});
