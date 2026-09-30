import { composeAssigneeDigest, DIGEST_LINE_CAP, HANDOFF_ADMIN_PATH, rankForDigest, safeField, slaLabel, type DigestHandoff } from '../assigneeDigest';

/**
 * T517 - the assignee digest's compose step, pure: rows in, one mail out.
 * Order (urgent, then priority, then age), what a line carries, what it never
 * carries (an `@` from any row string is replaced and counted), the cap, the
 * subject, the escaping. No model, no send, no mock.
 */

const AS_OF = new Date('2026-09-21T12:30:00.000Z');
const HOUR = 3_600_000;
let seq = 0;
const row = (over: Partial<DigestHandoff> = {}): DigestHandoff => ({
  id: `h-${(seq += 1)}`, brand_id: 'b-ent', owner_queue: 'sales', priority: 'medium', urgent: false, reason: 'requires_human_review:deferred',
  sla_due_at: new Date(AS_OF.getTime() + 4 * HOUR), created_at: new Date(AS_OF.getTime() - 2 * HOUR), ...over,
});
const brands = new Map([['b-ent', 'Colaberry Business'], ['b-cpn', 'CPN']]);
const compose = (rows: DigestHandoff[], baseUrl = 'https://www.refactored.ai') => composeAssigneeDigest({ rows, brandNames: brands, baseUrl, asOf: AS_OF });

beforeEach(() => { seq = 0; });

describe('acceptance 1: the order', () => {
  it('urgent beats priority: an urgent low row lists before a critical one that is not', () => {
    const critical = row({ priority: 'critical' });
    const urgentLow = row({ priority: 'low', urgent: true });
    expect(rankForDigest([critical, urgentLow]).map((r) => r.id)).toEqual([urgentLow.id, critical.id]);
  });

  it('priority beats age: a newer critical row lists before an older medium one; age breaks a priority tie, the older first', () => {
    const oldMedium = row({ priority: 'medium', created_at: new Date(AS_OF.getTime() - 30 * HOUR) });
    const newCritical = row({ priority: 'critical', created_at: new Date(AS_OF.getTime() - HOUR) });
    const oldCritical = row({ priority: 'critical', created_at: new Date(AS_OF.getTime() - 20 * HOUR) });
    expect(rankForDigest([oldMedium, newCritical, oldCritical]).map((r) => r.id)).toEqual([oldCritical.id, newCritical.id, oldMedium.id]);
  });

  it('the full ladder - critical > high > medium > low, an unknown priority last - and the id breaks an exact tie the same way twice', () => {
    const at = new Date(AS_OF.getTime() - HOUR);
    const rows = [row({ id: 'z', priority: 'low', created_at: at }), row({ id: 'y', priority: 'weird', created_at: at }), row({ id: 'x', priority: 'high', created_at: at }), row({ id: 'w', priority: 'critical', created_at: at }), row({ id: 'v', priority: 'medium', created_at: at }), row({ id: 'a', priority: 'medium', created_at: at })];
    const once = rankForDigest(rows).map((r) => r.id);
    expect(once).toEqual(['w', 'x', 'a', 'v', 'z', 'y']);
    expect(rankForDigest([...rows].reverse()).map((r) => r.id)).toEqual(once);
  });

  it('the composed lines follow that order, numbered, the urgent ones flagged', () => {
    const d = compose([row({ priority: 'high' }), row({ urgent: true, priority: 'low' })])!;
    const lines = d.text.split('\n').filter((l) => /^\d+\. /.test(l));
    expect(lines).toEqual(['1. [URGENT] low · sales · Colaberry Business', '2. high · sales · Colaberry Business']);
    expect(d.html.indexOf('<strong>URGENT</strong>')).toBeLessThan(d.html.indexOf('high · sales'));
  });
});

describe('what a line carries', () => {
  it('nothing open -> null: no mail is composed for nobody', () => {
    expect(compose([])).toBeNull();
  });

  it('the id in the link, the brand by name, the queue, the priority, the reason, the SLA - in text and html', () => {
    const d = compose([row({ id: 'h-77', brand_id: 'b-cpn', owner_queue: 'admissions', priority: 'critical', reason: 'reply_route:question', sla_due_at: new Date(AS_OF.getTime() - 3 * HOUR) })])!;
    expect(d).toMatchObject({ count: 1, urgent: 0, redacted: 0, subject: 'Growth Journey: 1 handoff waiting for you' });
    expect(d.text).toBe([
      'You have 1 open handoff assigned to you. Most urgent first, then the oldest.',
      '',
      '1. critical · admissions · CPN',
      '   overdue by 3h · reason: reply_route:question',
      `   https://www.refactored.ai${HANDOFF_ADMIN_PATH}/h-77`,
    ].join('\n'));
    expect(d.html).toContain(`<a href="https://www.refactored.ai${HANDOFF_ADMIN_PATH}/h-77">`);
    expect(d.html).toContain('overdue by 3h · reason: reply_route:question');
  });

  it('a trailing slash on the base url is not doubled; an unknown brand is listed, by a neutral label', () => {
    const d = compose([row({ brand_id: 'b-nowhere' })], 'https://www.refactored.ai/')!;
    expect(d.text).toContain(`https://www.refactored.ai${HANDOFF_ADMIN_PATH}/h-1`);
    expect(d.text).toContain('medium · sales · unknown brand');
  });

  it('the subject counts the urgent ones and pluralises', () => {
    const d = compose([row({ urgent: true }), row(), row({ urgent: true })])!;
    expect(d.subject).toBe('Growth Journey: 3 handoffs waiting for you (2 urgent)');
    expect(d.text).toContain('You have 3 open handoffs assigned to you, 2 urgent.');
  });

  it('the cap: fifty-one rows -> fifty lines and one count for the rest; the subject still says fifty-one', () => {
    const rows = Array.from({ length: DIGEST_LINE_CAP + 1 }, (_, i) => row({ created_at: new Date(AS_OF.getTime() - i * HOUR) }));
    const d = compose(rows)!;
    expect(d.text.split('\n').filter((l) => /^\d+\. /.test(l))).toHaveLength(DIGEST_LINE_CAP);
    expect(d.text.endsWith('… and 1 more in the queue')).toBe(true);
    expect(d.html).toContain('<p>… and 1 more in the queue</p>');
    expect(d.count).toBe(DIGEST_LINE_CAP + 1);
  });

  it('html is escaped: a reason with markup renders as text, never as markup', () => {
    const d = compose([row({ reason: 'manual:<b>look</b> & "quote"' })])!;
    expect(d.html).toContain('reason: manual:&lt;b&gt;look&lt;/b&gt; &amp; &quot;quote&quot;');
    expect(d.html).not.toContain('<b>look</b>');
  });
});

describe('acceptance 4: no address, ever', () => {
  it('a reason that carries an address is replaced by `redacted` and counted; the mail has no @', () => {
    const d = compose([row({ reason: 'manual:call priya@example.com back' }), row()])!;
    expect(d.redacted).toBe(1);
    expect(d.text).toContain('reason: redacted');
    expect(d.text).not.toContain('@');
    expect(d.html).not.toContain('@');
    expect(d.subject).not.toContain('@');
  });

  it('a brand name, a queue, an id or the base url carrying an address is replaced the same way', () => {
    const names = new Map([['b-ent', 'ops@colaberry.com']]);
    const d = composeAssigneeDigest({ rows: [row({ owner_queue: 'sales@x.io', id: 'h@1' })], brandNames: names, baseUrl: 'https://user@host.example', asOf: AS_OF })!;
    expect(d.redacted).toBe(4);
    expect(`${d.subject}\n${d.text}\n${d.html}`).not.toContain('@');
  });

  it('safeField: empty or non-string -> unknown; long -> bounded at 120; an @ anywhere -> redacted', () => {
    expect(safeField('')).toEqual({ value: 'unknown', redacted: false });
    expect(safeField(null)).toEqual({ value: 'unknown', redacted: false });
    expect(safeField('x'.repeat(200)).value).toHaveLength(120);
    expect(safeField('a@b')).toEqual({ value: 'redacted', redacted: true });
  });

  it('the composed mail never names a lead: the row type has no name, address or message field to copy', () => {
    const smuggled = { ...row(), lead_name: 'Priya Natarajan', email: 'priya@example.com', message: 'please call me' } as DigestHandoff;
    const d = compose([smuggled])!;
    expect(`${d.subject}\n${d.text}\n${d.html}`).not.toMatch(/Priya|Natarajan|please call me|@/);
  });
});

describe('the SLA label', () => {
  it.each([
    [null, 'no SLA'],
    [new Date(AS_OF.getTime() + 30 * 60_000), 'due in 1h'],
    [new Date(AS_OF.getTime() + 90 * 60_000), 'due in 2h'],
    [new Date(AS_OF.getTime() + 47 * HOUR), 'due in 47h'],
    [new Date(AS_OF.getTime() + 49 * HOUR), 'due in 2d'],
    [new Date(AS_OF.getTime() - 3 * HOUR), 'overdue by 3h'],
    [new Date(AS_OF.getTime() - 5 * 24 * HOUR), 'overdue by 5d'],
  ])('%s -> %s', (dueAt, label) => {
    expect(slaLabel(dueAt as Date | null, AS_OF)).toBe(label);
  });
});
