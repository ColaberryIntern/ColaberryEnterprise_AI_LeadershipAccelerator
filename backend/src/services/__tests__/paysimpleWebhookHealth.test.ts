import {
  recordWebhookOutcome,
  resetWebhookHealth,
  webhookHealthSnapshot,
  evaluateWebhookHealth,
} from '../paysimpleWebhookHealth';

/**
 * These thresholds decide whether a payment outage wakes anyone. On 2026-08-12 the
 * PaySimple webhook rejected 39 consecutive deliveries and nothing noticed until a
 * colleague emailed about a missing payment. The load-bearing cases here are the
 * NEGATIVE ones: alerting on a quiet hour or a single odd request would train
 * everyone to ignore this, which is the same outcome as having no alert at all.
 */
describe('paysimpleWebhookHealth', () => {
  const T = Date.parse('2026-08-12T18:00:00Z');
  beforeEach(() => resetWebhookHealth());

  describe('snapshot', () => {
    it('counts outcomes inside the rolling hour', () => {
      recordWebhookOutcome('accepted', T);
      recordWebhookOutcome('rejected_signature', T + 1000);
      recordWebhookOutcome('rejected_other', T + 2000);
      const s = webhookHealthSnapshot(T + 3000);
      expect(s).toMatchObject({ total: 3, accepted: 1, rejectedSignature: 1, rejectedOther: 1 });
      expect(s.msSinceLastAccepted).toBe(3000);
    });

    it('drops samples older than the window', () => {
      recordWebhookOutcome('rejected_signature', T);
      const s = webhookHealthSnapshot(T + 61 * 60 * 1000);
      expect(s.total).toBe(0);
      expect(s.msSinceLastAccepted).toBeNull();
    });
  });

  describe('evaluate', () => {
    const snap = (o: Partial<ReturnType<typeof webhookHealthSnapshot>>) => ({
      total: 0, accepted: 0, rejectedSignature: 0, rejectedOther: 0, msSinceLastAccepted: null,
      ...o,
    });

    it('CRITICAL when every delivery is rejected (the 2026-08-12 outage)', () => {
      const v = evaluateWebhookHealth(snap({ total: 39, rejectedSignature: 39 }));
      expect(v.alert).toBe(true);
      expect(v.type).toBe('critical');
      expect(v.title).toMatch(/rejecting every delivery/i);
      // Must point at the actual cause so the alert is actionable, not just noisy.
      expect(v.description).toMatch(/PAYSIMPLE_WEBHOOK_SECRET/);
    });

    it('does NOT alert on silence - a quiet hour is normal for a bursty retry sender', () => {
      expect(evaluateWebhookHealth(snap({ total: 0 })).alert).toBe(false);
    });

    it('does NOT alert when everything is succeeding', () => {
      expect(evaluateWebhookHealth(snap({ total: 20, accepted: 20 })).alert).toBe(false);
    });

    it('does NOT alert on too few failures to be conclusive', () => {
      expect(evaluateWebhookHealth(snap({ total: 3, rejectedSignature: 3 })).alert).toBe(false);
    });

    it('does NOT escalate to critical while some deliveries still succeed', () => {
      const v = evaluateWebhookHealth(snap({ total: 20, accepted: 8, rejectedSignature: 12 }));
      expect(v.alert).toBe(true);
      expect(v.type).toBe('warning');
    });

    it('does NOT alert on a minority failure rate', () => {
      expect(evaluateWebhookHealth(snap({ total: 20, accepted: 17, rejectedSignature: 3 })).alert).toBe(false);
    });

    it('blames the route, not the secret, when failures are not signature related', () => {
      const v = evaluateWebhookHealth(snap({ total: 10, rejectedOther: 10 }));
      expect(v.type).toBe('critical');
      expect(v.description).toMatch(/webhook route/i);
      expect(v.description).not.toMatch(/PAYSIMPLE_WEBHOOK_SECRET/);
    });

    it('end to end: recording real rejections produces the critical verdict', () => {
      for (let i = 0; i < 39; i++) recordWebhookOutcome('rejected_signature', T + i * 1000);
      expect(evaluateWebhookHealth(webhookHealthSnapshot(T + 40_000)).alert).toBe(true);
    });

    it('de-escalates from critical to warning as soon as deliveries succeed again', () => {
      for (let i = 0; i < 39; i++) recordWebhookOutcome('rejected_signature', T + i * 1000);
      expect(evaluateWebhookHealth(webhookHealthSnapshot(T + 40_000)).type).toBe('critical');

      for (let i = 0; i < 39; i++) recordWebhookOutcome('accepted', T + 60_000 + i * 1000);
      const after = evaluateWebhookHealth(webhookHealthSnapshot(T + 120_000));
      // Still worth a warning: the hour genuinely contains a large run of failures.
      // It must NOT stay critical once payments are activating again.
      expect(after.type).toBe('warning');
    });

    it('clears completely once the failures age out of the window', () => {
      for (let i = 0; i < 39; i++) recordWebhookOutcome('rejected_signature', T + i * 1000);
      for (let i = 0; i < 39; i++) recordWebhookOutcome('accepted', T + 60_000 + i * 1000);
      // One hour after the last rejection, only the successes remain in view.
      expect(evaluateWebhookHealth(webhookHealthSnapshot(T + 61 * 60 * 1000)).alert).toBe(false);
    });
  });

  it('recording never throws, even on a bad outcome value', () => {
    expect(() => recordWebhookOutcome('nonsense' as any, T)).not.toThrow();
  });
});
