import { buildLeadAlert, decideNotify, shown, type AlertLead } from '../leadAlertMessage';

/**
 * The "a lead arrived" alert.
 *
 * The defect being fixed is not that nothing was sent — it is that the old handler
 * returned `ok: true` while sending nothing. So the assertions that matter most here are
 * the ones about **refusing with a reason**, not the ones about formatting.
 */

const lead = (over: Partial<AlertLead> = {}): AlertLead => ({
  id: 24880,
  name: 'Dana Whitfield',
  email: 'dana@northgate.example',
  company: 'Northgate Transit',
  phone: '555-0100',
  title: 'Head of Operations',
  message: 'Riders cannot see accurate arrival times, so they call the depot.',
  source: 'ai-flotation',
  ...over,
});

describe('decideNotify', () => {
  const ok = { transporterConfigured: true, recipients: 'ali@colaberry.com', alreadyNotified: false };

  it('sends when there is somebody to tell and nothing has been sent', () => {
    expect(decideNotify(ok)).toEqual({ send: true, recipients: 'ali@colaberry.com' });
  });

  it('refuses with a reason when no recipient is configured', () => {
    expect(decideNotify({ ...ok, recipients: '   ' })).toMatchObject({
      send: false, reason: 'no_recipient_configured',
    });
  });

  it('refuses with a reason when SMTP is not configured', () => {
    // The old stub's exact blind spot: no transport, and it still reported success.
    expect(decideNotify({ ...ok, transporterConfigured: false })).toMatchObject({
      send: false, reason: 'smtp_not_configured',
    });
  });

  it('refuses a second alert for the same lead, with no time window', () => {
    // A lead is ingested once. A second alert is always a duplicate, however long the
    // gap, so this is deliberately not a dedup window.
    expect(decideNotify({ ...ok, alreadyNotified: true })).toMatchObject({
      send: false, reason: 'already_notified',
    });
  });

  it('reports the missing recipient first when several conditions fail', () => {
    // With nobody to tell, the rest does not matter, and "no recipient configured" is
    // the one an operator can act on.
    expect(decideNotify({ transporterConfigured: false, recipients: '', alreadyNotified: true }))
      .toMatchObject({ reason: 'no_recipient_configured' });
  });

  it('never returns send:false without a reason', () => {
    const cases = [
      { ...ok, recipients: '' },
      { ...ok, transporterConfigured: false },
      { ...ok, alreadyNotified: true },
    ];
    for (const c of cases) {
      const d = decideNotify(c);
      expect(d.send).toBe(false);
      expect(typeof d.reason).toBe('string');
      expect(d.reason!.length).toBeGreaterThan(0);
    }
  });
});

describe('buildLeadAlert', () => {
  it('names who and where in the subject, so it is readable on a phone', () => {
    expect(buildLeadAlert(lead()).subject).toBe('New ai-flotation lead: Dana Whitfield — Northgate Transit');
  });

  it("carries the lead's own words, unedited", () => {
    const { html, text } = buildLeadAlert(lead());
    expect(html).toContain('Riders cannot see accurate arrival times, so they call the depot.');
    expect(text).toContain('Riders cannot see accurate arrival times, so they call the depot.');
  });

  it('says so plainly when there was no message', () => {
    const { html, text } = buildLeadAlert(lead({ message: '   ' }));
    expect(html).toContain('They did not write a message.');
    expect(text).toContain('They did not write a message.');
  });

  it('states an absence rather than leaving an empty cell', () => {
    const { text } = buildLeadAlert(lead({ phone: null, title: '' }));
    expect(text).toContain('Phone: not given');
    expect(text).toContain('Role: not given');
  });

  it('still produces a usable subject with no name or company', () => {
    expect(buildLeadAlert(lead({ name: null, company: null })).subject)
      .toBe('New ai-flotation lead: Someone — no company given');
  });

  it('escapes what a stranger typed', () => {
    // The message field is attacker-controlled: it arrives from a public form.
    const { html } = buildLeadAlert(lead({ message: '<script>alert(1)</script>', company: 'A & B <Ltd>' }));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A &amp; B &lt;Ltd&gt;');
  });

  it('includes the convert link only when one is given', () => {
    expect(buildLeadAlert(lead()).html).not.toContain('Convert this lead');
    expect(buildLeadAlert(lead(), { convertUrl: 'https://x.test/convert/24880' }).html)
      .toContain('https://x.test/convert/24880');
  });

  it('always carries the lead id, because that is what the operator acts on', () => {
    expect(buildLeadAlert(lead()).text).toContain('Lead ID: 24880');
  });
});

describe('shown', () => {
  it('passes through real values, trimmed', () => {
    expect(shown('  Acme  ')).toBe('Acme');
  });

  it('states the absence for empty, whitespace and null', () => {
    expect(shown('')).toBe('not given');
    expect(shown('   ')).toBe('not given');
    expect(shown(null)).toBe('not given');
    expect(shown(undefined)).toBe('not given');
  });

  it('takes a caller-supplied absence label', () => {
    expect(shown(null, 'no company given')).toBe('no company given');
  });
});
