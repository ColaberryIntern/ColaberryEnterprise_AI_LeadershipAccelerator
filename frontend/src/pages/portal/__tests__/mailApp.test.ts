import { mailApp, GMAIL_HREF, OUTLOOK_HREF } from '../mailApp';

/**
 * The provider list is a pile of regexes, which is exactly the kind of thing that looks
 * right and matches the wrong domain. The cases below are the ones that would actually
 * reach this screen: the five providers Aleem's design named, a company address on its
 * own domain, and the malformed input a locked-out learner produces while retyping.
 */
describe('mailApp', () => {
  it('sends the five named providers to their own inbox', () => {
    expect(mailApp('ada@gmail.com')).toEqual({ name: 'Gmail', href: GMAIL_HREF });
    expect(mailApp('ada@googlemail.com').name).toBe('Gmail');
    expect(mailApp('ada@outlook.com')).toEqual({ name: 'Outlook', href: OUTLOOK_HREF });
    expect(mailApp('ada@hotmail.co.uk').name).toBe('Outlook');
    expect(mailApp('ada@yahoo.com').name).toBe('Yahoo Mail');
    expect(mailApp('ada@icloud.com').name).toBe('iCloud Mail');
    expect(mailApp('ada@proton.me').name).toBe('Proton Mail');
  });

  it('is case and whitespace insensitive, because the field is typed by hand', () => {
    expect(mailApp('  Ada@GMAIL.CoM  ').name).toBe('Gmail');
  });

  it('falls back for a company domain rather than guessing an inbox URL', () => {
    const r = mailApp('ada@colaberry.com');
    expect(r.fallback).toBe(true);
    expect(r.href).toBeUndefined();
  });

  it('does not match a lookalike domain', () => {
    // The Gmail and iCloud patterns are anchored, so these must NOT be treated as
    // the real provider - sending someone to the wrong webmail is worse than the
    // two-button fallback.
    expect(mailApp('ada@gmail.com.evil.test').fallback).toBe(true);
    expect(mailApp('ada@notgmail.com').fallback).toBe(true);
    expect(mailApp('ada@icloud.com.co').fallback).toBe(true);
  });

  it('never throws on input that is not an address', () => {
    // This runs on a screen someone has already reached; a bad value here means show
    // the fallback, not break the page.
    for (const bad of ['', '   ', 'ada', 'ada@', '@gmail.com', 'a@@b']) {
      expect(() => mailApp(bad)).not.toThrow();
      expect(mailApp(bad).fallback).toBe(true);
    }
  });
});
