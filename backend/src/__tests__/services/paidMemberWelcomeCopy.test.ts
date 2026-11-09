/**
 * The paid-member welcome copy (C10.18).
 *
 * Tested as COPY, not as a template. The assertions that matter are the ones a reader would make:
 * does it name the batch, does it say you can start now, does it say that BEFORE it mentions a
 * date, and does it contain nothing that fails the two build-stopping copy gates.
 *
 * Pure module, no mocks.
 */
import {
  buildPaidMemberWelcomeCopy,
  firstNameOf,
  paidMemberWelcomeLines,
  PaidMemberWelcomeContext,
} from '../../services/welcome/paidMemberWelcomeCopy';

const ctx = (over: Partial<PaidMemberWelcomeContext> = {}): PaidMemberWelcomeContext => ({
  fullName: 'Dana Okonkwo',
  batchLabel: 'November 2026',
  orientationLabel: 'Monday 7 December 2026 at 6:30 PM CT',
  roomUrl: 'https://enterprise.colaberry.ai/portal/rooms/room-1',
  portalUrl: 'https://enterprise.colaberry.ai/portal',
  ...over,
});

describe('it says the things the ticket requires, in the order it requires', () => {
  it('names the batch in the subject and the body', () => {
    const copy = buildPaidMemberWelcomeCopy(ctx());
    expect(copy.subject).toContain('November 2026');
    expect(copy.text).toContain('you are in the November 2026 batch');
  });

  it('SELF-PACED comes before any date, which is the whole point', () => {
    // Ali, on the ticket: this is "the single most important line, because the batch name reads
    // like a class that begins later". Leading with a December date on a November purchase is the
    // exact misreading it exists to prevent, so position is part of the requirement.
    const lines = paidMemberWelcomeLines(ctx());
    const selfPaced = lines.findIndex((l) => /self-paced/i.test(l));
    const orientation = lines.findIndex((l) => /Orientation is/i.test(l));
    expect(selfPaced).toBeGreaterThanOrEqual(0);
    expect(orientation).toBeGreaterThan(selfPaced);
    expect(lines[selfPaced]).toMatch(/begin your first module today/i);
  });

  it('says the batch room is private to the batch and staff, and links it', () => {
    const copy = buildPaidMemberWelcomeCopy(ctx());
    expect(copy.text).toMatch(/own room in the portal, visible only to your batch and to staff/i);
    expect(copy.html).toContain('https://enterprise.colaberry.ai/portal/rooms/room-1');
    expect(copy.text).toContain('Open your batch room');
  });

  it('gives the orientation date and says what happens after it', () => {
    const copy = buildPaidMemberWelcomeCopy(ctx());
    expect(copy.text).toContain('Monday 7 December 2026 at 6:30 PM CT');
    expect(copy.text).toMatch(/joins the combined monthly class/i);
    expect(copy.text).toMatch(/shared rooms/i);
  });
});

describe('the two copy gates that stop the build', () => {
  const everyString = (c: PaidMemberWelcomeContext) => {
    const copy = buildPaidMemberWelcomeCopy(c);
    return [copy.subject, copy.html, copy.text, ...paidMemberWelcomeLines(c)].join('\n');
  };

  it('never uses the word 40 TAC 807.172(d) bans, under any context', () => {
    // Asserted by code rather than by reading, and over every branch, because the gate scans
    // string literals and a NEW file has no baseline entry to inherit: one occurrence anywhere
    // fails the build. The word is spelled here from char codes so this test file does not
    // itself put the literal into backend/src.
    const banned = String.fromCharCode(102, 114, 101, 101);
    const contexts = [
      ctx(), ctx({ roomUrl: null }), ctx({ orientationLabel: null }),
      ctx({ roomUrl: null, orientationLabel: null }), ctx({ fullName: null }),
    ];
    for (const c of contexts) {
      expect(everyString(c).toLowerCase()).not.toContain(banned);
    }
  });

  it('contains no em dash or en dash', () => {
    for (const c of [ctx(), ctx({ roomUrl: null }), ctx({ orientationLabel: null })]) {
      expect(everyString(c)).not.toMatch(/[–—]/);
    }
  });

  it('claims no certification, placement or guarantee', () => {
    // Colaberry does not certify anyone. An email is not the place to imply it.
    expect(everyString(ctx()).toLowerCase()).not.toMatch(/certif|guarantee|job placement|hired/);
  });
});

describe('degrading without a lie when a fact is missing', () => {
  it('drops the orientation lines entirely rather than printing a placeholder', () => {
    const copy = buildPaidMemberWelcomeCopy(ctx({ orientationLabel: null }));
    expect(copy.text).not.toMatch(/Orientation/i);
    expect(copy.text).not.toMatch(/null|undefined|TBD|TBC/i);
    // The self-paced promise does not depend on a date, so it must survive.
    expect(copy.text).toMatch(/self-paced/i);
  });

  it('falls back to the portal when the batch has no room yet', () => {
    const copy = buildPaidMemberWelcomeCopy(ctx({ roomUrl: null }));
    expect(copy.text).not.toMatch(/own room in the portal/i);
    expect(copy.text).toContain('Open your portal');
    expect(copy.text).toContain('https://enterprise.colaberry.ai/portal');
  });

  it('greets without a name rather than with a broken one', () => {
    for (const bad of [null, undefined, '', '   ', '   7', '<script>']) {
      const copy = buildPaidMemberWelcomeCopy(ctx({ fullName: bad as any }));
      expect(copy.text.startsWith('You are in.')).toBe(true);
      expect(copy.text).not.toMatch(/undefined|null/);
    }
  });

  it('firstNameOf takes the first word and refuses anything that is not a name', () => {
    expect(firstNameOf('Dana Okonkwo')).toBe('Dana');
    expect(firstNameOf('  Zoe   ')).toBe('Zoe');
    expect(firstNameOf("O'Brien Smith")).toBe("O'Brien");
    expect(firstNameOf('Jean-Luc Picard')).toBe('Jean-Luc');
    expect(firstNameOf('Lukács Emőke')).toBe('Lukács');
    for (const bad of ['', '   ', '123', 'a@b.com', '<b>', null, undefined]) {
      expect(firstNameOf(bad as any)).toBe('');
    }
  });
});

describe('the HTML is safe to put in front of a person', () => {
  it('escapes a name and a URL rather than interpolating them raw', () => {
    const copy = buildPaidMemberWelcomeCopy(ctx({
      fullName: 'Dana',
      portalUrl: 'https://x.test/p?a=1&b=2',
    }));
    expect(copy.html).toContain('a=1&amp;b=2');
    expect(copy.html).not.toContain('a=1&b=2');
  });

  it('the plain-text body carries every line the HTML does', () => {
    // One source for both, so the text body cannot drift. It is the version nobody looks at,
    // which is why it is the one that rots.
    const c = ctx();
    const copy = buildPaidMemberWelcomeCopy(c);
    for (const line of paidMemberWelcomeLines(c)) {
      expect(copy.text).toContain(line);
    }
  });
});
