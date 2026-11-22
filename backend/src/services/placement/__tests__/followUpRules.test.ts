import { centralInstant, draftProblem, firstName, fromName, linkIn, MAX_TRIES, mergeBody, mergedProblem, nextAttemptAt, sendOnProblem, TEXT } from '../followUpRules';

/** CP10.3 (kit F8): the follow-up message rules, the Central send time and the retry schedule. PURE. */
const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);
const ok = { subject: 'Checking in on our offer', body: 'Hi {first},\n\nJust checking in on our offer.\n\nDana' };

describe('draftProblem: what may be saved', () => {
  it('passes a plain message with {first}', () => expect(draftProblem(ok)).toBeNull());
  it('refuses an em dash or an en dash in the message, with the clear message', () => {
    expect(draftProblem({ ...ok, body: `Hi {first} ${EM} quick note` })).toBe(TEXT.dashBody);
    expect(draftProblem({ ...ok, body: `Days 1${EN}3` })).toBe(TEXT.dashBody);
    expect(TEXT.dashBody).toMatch(/long dash/);
  });
  it('refuses a long dash in the subject too', () => expect(draftProblem({ ...ok, subject: `Offer ${EM} next steps` })).toBe(TEXT.dashSubject));
  it('allows at most one link, counting {booking link}', () => {
    expect(draftProblem({ ...ok, body: 'See https://a.example/x' })).toBeNull();
    expect(draftProblem({ ...ok, body: 'See https://a.example/x and www.b.example' })).toBe(TEXT.oneLink);
    expect(draftProblem({ ...ok, body: 'Pick: {booking link} or https://a.example', bookingLink: 'https://cal.example/dana' })).toBe(TEXT.oneLink);
    expect(draftProblem({ ...ok, body: '{booking link} {booking link}', bookingLink: 'https://cal.example/dana' })).toBe(TEXT.oneLink);
  });
  it('{booking link} needs an https link, and a link needs {booking link}', () => {
    expect(draftProblem({ ...ok, body: 'Pick a time: {booking link}' })).toBe(TEXT.needLink);
    expect(draftProblem({ ...ok, body: 'Pick a time: {booking link}', bookingLink: 'https://cal.example/dana' })).toBeNull();
    for (const bad of ['http://cal.example/x', 'javascript:alert(1)', 'https://cal.example/a b', `https://x.example/${'a'.repeat(600)}`, `https://cal.example/a${EM}b`]) {
      expect(draftProblem({ ...ok, body: 'Pick: {booking link}', bookingLink: bad })).toBe(TEXT.badLink);
    }
    expect(draftProblem({ ...ok, bookingLink: 'https://cal.example/dana' })).toBe(TEXT.unusedLink);
  });
  it('only {first} and {booking link} are merge fields', () => {
    expect(draftProblem({ ...ok, body: 'Hi {name},' })).toBe('Only {first} and {booking link} can be filled in for you. Remove {name}.');
  });
  it('no attachments', () => {
    expect(draftProblem({ ...ok, attachments: [{ filename: 'offer.pdf' }] })).toBe(TEXT.attachments);
    expect(draftProblem({ ...ok, attachments: 'offer.pdf' })).toBe(TEXT.attachments);
    expect(draftProblem({ ...ok, attachments: [] })).toBeNull();
  });
  it('boundaries: blank, one-line subject, the length ceilings', () => {
    expect(draftProblem({ ...ok, subject: '  ' })).toBe(TEXT.subjectBlank);
    expect(draftProblem({ ...ok, subject: 'a\nb' })).toBe(TEXT.subjectLines);
    expect(draftProblem({ ...ok, subject: 'a'.repeat(150) })).toBeNull();
    expect(draftProblem({ ...ok, subject: 'a'.repeat(151) })).toBe(TEXT.subjectLong);
    expect(draftProblem({ ...ok, body: ' \n ' })).toBe(TEXT.bodyBlank);
    expect(draftProblem({ ...ok, body: 'a'.repeat(5000) })).toBeNull();
    expect(draftProblem({ ...ok, body: 'a'.repeat(5001) })).toBe(TEXT.bodyLong);
  });
});

describe('merging at send time', () => {
  it('fills {first} and {booking link}; "there" without a name; a dash in a name becomes a hyphen', () => {
    expect(mergeBody('Hi {first}: {booking link}', { fullName: 'Ann Marie Lee', bookingLink: 'https://cal.example/d' })).toBe('Hi Ann: https://cal.example/d');
    expect(firstName(null)).toBe('there');
    expect(firstName(`Jean${EN}Luc Picard`)).toBe('Jean-Luc');
  });
  it('the merged message is checked again, and its one link is found for click tracking', () => {
    expect(mergedProblem(`Hi ${EM}`)).toBe(TEXT.dashBody);
    expect(mergedProblem('https://a.example https://b.example')).toBe(TEXT.oneLink);
    expect(mergedProblem('Hi Ann')).toBeNull();
    expect(linkIn('Pick: https://cal.example/d\n\nDana')).toBe('https://cal.example/d');
    expect(linkIn('No link')).toBeNull();
  });
});

describe('send time in Central', () => {
  it('DST: 2026-11-01 09:00 Central (after the 2 AM fall back) is 15:00Z', () => {
    expect(centralInstant('2026-11-01', '09:00')?.toISOString()).toBe('2026-11-01T15:00:00.000Z');
  });
  it('the day before, still daylight time, is 14:00Z; spring forward 2027-03-14 09:00 is 14:00Z', () => {
    expect(centralInstant('2026-10-31', '09:00')?.toISOString()).toBe('2026-10-31T14:00:00.000Z');
    expect(centralInstant('2027-03-14', '09:00')?.toISOString()).toBe('2027-03-14T14:00:00.000Z');
    expect(centralInstant('2026-12-31', '23:30')?.toISOString()).toBe('2027-01-01T05:30:00.000Z');
  });
  it('refuses anything that is not a date and a 24-hour time', () => {
    for (const [d, t] of [['2026-11-1', '09:00'], ['2026-11-01', '9:00'], ['2026-11-01', '24:00'], ['x', 'y']]) expect(centralInstant(d, t)).toBeNull();
  });
  it('a send time from now (5 minutes of page clock lag allowed) to 90 days ahead', () => {
    const now = new Date('2026-11-22T15:00:00Z');
    expect(sendOnProblem(new Date('2026-11-22T14:56:00Z'), now)).toBeNull();
    expect(sendOnProblem(new Date('2026-11-22T14:54:00Z'), now)).toBe(TEXT.past);
    expect(sendOnProblem(new Date('2027-02-20T15:00:00Z'), now)).toBeNull();
    expect(sendOnProblem(new Date('2027-02-20T15:01:00Z'), now)).toBe(TEXT.tooFar);
    expect(sendOnProblem(new Date('nope'), now)).toBe(TEXT.past);
  });
});

describe('retries and the sender name', () => {
  it('the first try and 3 retries (5, 15, 45 minutes), then no retry left', () => {
    const now = new Date('2026-11-22T15:00:00Z');
    expect(MAX_TRIES).toBe(4);
    expect([1, 2, 3].map((a) => nextAttemptAt(a, now)?.toISOString())).toEqual(['2026-11-22T15:05:00.000Z', '2026-11-22T15:15:00.000Z', '2026-11-22T15:45:00.000Z']);
    expect(nextAttemptAt(4, now)).toBeNull();
  });
  it('"<person> at <company> via Refactored.ai"; header-breaking characters removed', () => {
    expect(fromName('Dana Ruiz', 'Meridian Freight')).toBe('Dana Ruiz at Meridian Freight via Refactored.ai');
    expect(fromName(null, 'Meridian Freight')).toBe('Meridian Freight via Refactored.ai');
    expect(fromName('Dana "x" <evil@x>\r\nBcc: y', 'Co')).toBe('Dana x evil@xBcc: y at Co via Refactored.ai');
  });
});
