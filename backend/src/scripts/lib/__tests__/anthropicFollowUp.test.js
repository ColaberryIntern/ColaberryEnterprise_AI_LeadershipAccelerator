// Tests for the Claude Partner Network follow-up sequence.
//
// The three things that must never break, in priority order:
//   1. We never mail the same note twice, and never mail at all once they reply.
//   2. Every note passes the outbound style preflight (em-dashes, signature).
//   3. The sequence is finite and every claim about a fact is one we can prove.

const os = require('os');
const fs = require('fs');
const path = require('path');

const { SEQUENCE, SEQUENCE_LENGTH } = require('../anthropicFollowUpMessages');
const { renderMessage } = require('../anthropicFollowUpRender');
const { validateBeforeSend } = require('../mandrillPreflight');
const { classifySender } = require('../anthropicReplyWatch');
const L = require('../anthropicFollowUpLedger');

// A Wednesday, inside the send window.
const WEDNESDAY = { dayOfWeek: 3, date: '2026-08-19', hour: 8, minute: 35, minutesOfDay: 8 * 60 + 35, label: 'Wednesday 2026-08-19 08:35 CT' };
const SATURDAY = { ...WEDNESDAY, dayOfWeek: 6, date: '2026-08-22' };
const WINDOW = { startMinutes: 8 * 60 + 30, endMinutes: 9 * 60 + 10 };

const decide = (over = {}) => L.decide({
  ledger: L.emptyLedger(), central: WEDNESDAY, reply: null, sequenceLength: SEQUENCE_LENGTH, window: WINDOW, ...over,
});

// ------------------------------------------------------------------ content

describe('message sequence content', () => {
  test('is finite and three weeks of weekdays long', () => {
    expect(SEQUENCE_LENGTH).toBe(15);
  });

  test('every note passes the outbound Mandrill preflight', () => {
    SEQUENCE.forEach((m, i) => {
      const r = renderMessage(m, i + 1);
      expect(() => validateBeforeSend(r.html, r.text)).not.toThrow();
    });
  });

  test('no note contains an em-dash in subject, text, or html', () => {
    SEQUENCE.forEach((m, i) => {
      const r = renderMessage(m, i + 1);
      expect(r.subject).not.toMatch(/—/);
      expect(r.text).not.toMatch(/—/);
      expect(r.html).not.toMatch(/—/);
    });
  });

  test('every subject line is distinct, so no two days look like a resend', () => {
    const subjects = SEQUENCE.map((m) => m.subject);
    expect(new Set(subjects).size).toBe(subjects.length);
  });

  test('every angle is distinct, so the argument never repeats itself', () => {
    const angles = SEQUENCE.map((m) => m.angle);
    expect(new Set(angles).size).toBe(angles.length);
  });

  test('the signature appears exactly once per note', () => {
    SEQUENCE.forEach((m, i) => {
      const r = renderMessage(m, i + 1);
      expect((r.text.match(/Ali Muwwakkil/g) || []).length).toBe(1);
      expect((r.html.match(/Ali Muwwakkil/g) || []).length).toBe(1);
    });
  });

  test('no note counts days, scolds, or claims a number we cannot prove', () => {
    // The only figures allowed anywhere: the June 24 submission, the four
    // course names, 10 submitted, 11 finishers, 44 of 40 completions.
    const forbidden = [
      /\b\d+\s*(days?|weeks?|months?)\s+(since|ago|without)/i,
      /still (waiting|no|have not heard)/i,
      /\b(unacceptable|disappointed|ignore[dr]?|chasing you)\b/i,
      /\bsecond|third|fourth|fifth\s+(request|attempt|follow.?up)\b/i,
    ];
    SEQUENCE.forEach((m, i) => {
      const body = renderMessage(m, i + 1).text;
      forbidden.forEach((rx) => {
        expect({ note: i + 1, angle: m.angle, match: body.match(rx) }).toEqual({ note: i + 1, angle: m.angle, match: null });
      });
    });
  });

  test('the final note stands down gracefully rather than just stopping', () => {
    const last = renderMessage(SEQUENCE[SEQUENCE_LENGTH - 1], SEQUENCE_LENGTH);
    expect(last.angle).toBe('graceful-pause');
    expect(last.text).toMatch(/last of our daily notes/i);
  });
});

// ------------------------------------------------------------------ decision

describe('send decision', () => {
  test('sends on a weekday inside the window when nothing has gone out', () => {
    const d = decide();
    expect(d).toMatchObject({ send: true, dayNumber: 1, occurrenceKey: '2026-08-19' });
  });

  test('refuses on a weekend', () => {
    expect(decide({ central: SATURDAY })).toMatchObject({ send: false, reason: 'weekend' });
  });

  test('refuses outside the morning window', () => {
    const late = { ...WEDNESDAY, hour: 22, minutesOfDay: 22 * 60 };
    expect(decide({ central: late })).toMatchObject({ send: false, reason: 'outside-window' });
  });

  test('--force overrides the window but never a terminal halt', () => {
    const late = { ...WEDNESDAY, hour: 22, minutesOfDay: 22 * 60 };
    expect(decide({ central: late, force: true })).toMatchObject({ send: true });

    const halted = L.halt(L.emptyLedger(), 'replied');
    expect(decide({ ledger: halted, force: true })).toMatchObject({ send: false, terminal: true });
  });

  test('a detected reply halts terminally', () => {
    const d = decide({ reply: { found: true, from: 'someone@anthropic.com' } });
    expect(d).toMatchObject({ send: false, reason: 'reply-detected', terminal: true });
  });

  test('an unverifiable inbox blocks today WITHOUT killing the campaign', () => {
    const d = decide({ reply: { found: true, blocking: true, why: 'token expired' } });
    expect(d).toMatchObject({ send: false, reason: 'reply-check-unavailable' });
    expect(d.terminal).toBeFalsy();
  });

  test('stops once the sequence is exhausted', () => {
    const ledger = L.emptyLedger();
    for (let i = 1; i <= SEQUENCE_LENGTH; i++) {
      ledger.entries[`2026-07-${String(i).padStart(2, '0')}`] = { dayNumber: i, status: 'sent' };
    }
    expect(decide({ ledger })).toMatchObject({ send: false, reason: 'sequence-complete', terminal: true });
  });
});

// --------------------------------------------------------------- idempotency

describe('idempotency', () => {
  test('a second tick on the same day does not send again', () => {
    const ledger = L.emptyLedger();
    const first = decide({ ledger });
    L.claim(ledger, { occurrenceKey: first.occurrenceKey, dayNumber: 1, angle: 'a', subject: 's' });
    L.commit(ledger, { occurrenceKey: first.occurrenceKey, messageId: '<x>' });

    expect(decide({ ledger })).toMatchObject({ send: false, reason: 'already-sent-today' });
  });

  test('a crash between claim and send leaves the day blocked, not open', () => {
    const ledger = L.emptyLedger();
    const first = decide({ ledger });
    L.claim(ledger, { occurrenceKey: first.occurrenceKey, dayNumber: 1, angle: 'a', subject: 's' });
    // no commit: this is the crash

    expect(decide({ ledger })).toMatchObject({ send: false, reason: 'claimed-today-unconfirmed' });
  });

  test('an unconfirmed claim still consumes its note, so no wording repeats', () => {
    const ledger = L.emptyLedger();
    L.claim(ledger, { occurrenceKey: '2026-08-18', dayNumber: 1, angle: 'a', subject: 's' });
    expect(L.nextDayNumber(ledger)).toBe(2);
  });

  test('claiming the same day twice is refused loudly', () => {
    const ledger = L.emptyLedger();
    L.claim(ledger, { occurrenceKey: '2026-08-19', dayNumber: 1, angle: 'a', subject: 's' });
    expect(() => L.claim(ledger, { occurrenceKey: '2026-08-19', dayNumber: 2, angle: 'b', subject: 't' }))
      .toThrow(/refusing to re-claim/);
  });

  test('releasing a failed claim frees the day and the note number', () => {
    const ledger = L.emptyLedger();
    L.claim(ledger, { occurrenceKey: '2026-08-19', dayNumber: 1, angle: 'a', subject: 's' });
    L.release(ledger, '2026-08-19');
    expect(L.nextDayNumber(ledger)).toBe(1);
    expect(decide({ ledger })).toMatchObject({ send: true, dayNumber: 1 });
  });

  test('release never removes a committed send', () => {
    const ledger = L.emptyLedger();
    L.claim(ledger, { occurrenceKey: '2026-08-19', dayNumber: 1, angle: 'a', subject: 's' });
    L.commit(ledger, { occurrenceKey: '2026-08-19', messageId: '<x>' });
    L.release(ledger, '2026-08-19');
    expect(L.sentEntries(ledger)).toHaveLength(1);
  });
});

// -------------------------------------------------------------- persistence

describe('ledger persistence', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anthropic-followup-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  test('a missing ledger is a clean first run, not an error', () => {
    const l = L.loadLedger(path.join(dir, 'nope.json'));
    expect(l.entries).toEqual({});
    expect(l.halt).toBeNull();
  });

  test('a corrupt ledger refuses to authorise a send', () => {
    const p = path.join(dir, 'ledger.json');
    fs.writeFileSync(p, '{ this is not json');
    expect(() => L.loadLedger(p)).toThrow(/corrupt/);
    try { L.loadLedger(p); } catch (e) { expect(e.error_class).toBe('StateUnavailable'); }
  });

  test('save then load round-trips the campaign state', () => {
    const p = path.join(dir, 'ledger.json');
    const ledger = L.emptyLedger();
    L.claim(ledger, { occurrenceKey: '2026-08-19', dayNumber: 1, angle: 'reintroduction', subject: 's' });
    L.commit(ledger, { occurrenceKey: '2026-08-19', messageId: '<abc>' });
    L.saveLedger(ledger, p);

    const back = L.loadLedger(p);
    expect(back.entries['2026-08-19']).toMatchObject({ status: 'sent', messageId: '<abc>', dayNumber: 1 });
  });
});

// ----------------------------------------------------------- reply detection

describe('reply classification', () => {
  test('a human on the bare domain is a reply', () => {
    expect(classifySender('Partner Support <partner-support@anthropic.com>').isReply).toBe(true);
    expect(classifySender('jordan@anthropic.com').isReply).toBe(true);
  });

  test('billing and marketing robots on subdomains are not a reply', () => {
    [
      'invoice+statements@mail.anthropic.com',
      'failed-payments@mail.anthropic.com',
      'no-reply-v040aLZnDIdXuaLfwXAM8w@mail.anthropic.com',
      'team@email.anthropic.com',
    ].forEach((from) => expect(classifySender(from).isReply).toBe(false));
  });

  test('a no-reply address on the bare domain is not a reply', () => {
    expect(classifySender('no-reply@anthropic.com').isReply).toBe(false);
  });

  test('non-Anthropic senders are ignored', () => {
    expect(classifySender('ram@colaberry.com').isReply).toBe(false);
    expect(classifySender('someone@anthropic.com.phishing.io').isReply).toBe(false);
  });

  test('an unfamiliar Anthropic human counts, because stopping is the safe error', () => {
    expect(classifySender('"A Person" <aperson@anthropic.com>').isReply).toBe(true);
  });
});
