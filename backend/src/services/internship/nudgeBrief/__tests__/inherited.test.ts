import { isSendableText, sanitizeInherited } from '../inherited';
import { briefProblems } from '../types';

/**
 * The intern's own punctuation must not be the reason we cannot reach them.
 *
 * Measured on production 2026-11-11: Omolola Makinde's brief was held `unsendable_text`. The only
 * offending character in the whole message was U+2013, an en dash, and it came from the subject
 * SHE wrote: "Saratoga Springs Municipal System – project update and stakeholder briefing". The
 * composer inherits a subject verbatim for a reply and repeats it in the body, so her dash landed
 * in both and `briefProblems()` refused the result. She was, on the same day, the intern with the
 * nearest deadline on the roster: one day.
 */

const HER_SUBJECT = 'Saratoga Springs Municipal System – project update and stakeholder briefing';

describe('text inherited from an intern', () => {
  it('POSITIVE CONTROL: the real subject genuinely does break the sender', () => {
    // If this ever stops failing, the rest of this file is proving nothing.
    expect(isSendableText(HER_SUBJECT)).toBe(false);
    expect(briefProblems(`Thank you for your note about "${HER_SUBJECT}".`))
      .toContain('contains an em or en dash');
  });

  it('makes her real subject sendable, and keeps the words', () => {
    const clean = sanitizeInherited(HER_SUBJECT);
    expect(isSendableText(clean)).toBe(true);
    expect(briefProblems(`Thank you for the update about "${clean}".`)).toEqual([]);
    expect(clean).toBe('Saratoga Springs Municipal System - project update and stakeholder briefing');
  });

  it('turns an em dash into a hyphen rather than deleting the clause break', () => {
    expect(sanitizeInherited('the sync replaced it — partway through a story'))
      .toBe('the sync replaced it - partway through a story');
  });

  it('removes angle brackets, which the sender renders as visible entities', () => {
    expect(sanitizeInherited('see Internship <Projects> for the list'))
      .toBe('see Internship Projects for the list');
    expect(isSendableText(sanitizeInherited('a <b> c'))).toBe(true);
  });

  it('normalises curly quotes so they do not sit beside our straight ones', () => {
    expect(sanitizeInherited('“the set is empty” and it’s blocking me'))
      .toBe('"the set is empty" and it\'s blocking me');
  });

  it('collapses the newlines an inherited subject arrives with', () => {
    expect(sanitizeInherited('Re:  project update\n  and  briefing')).toBe('Re: project update and briefing');
  });

  it('returns an empty string for nothing, so a caller can test the result', () => {
    expect(sanitizeInherited(null)).toBe('');
    expect(sanitizeInherited(undefined)).toBe('');
    expect(sanitizeInherited('   ')).toBe('');
  });

  it('leaves text that was already clean exactly as it was', () => {
    const plain = 'Read route needed for admissions.CAP.page_event_admissions_enrichment';
    expect(sanitizeInherited(plain)).toBe(plain);
  });
});
