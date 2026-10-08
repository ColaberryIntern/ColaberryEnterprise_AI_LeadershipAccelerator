import { tidyName, MAX_NAME_LENGTH, MIN_BRIEF_LENGTH, suggestLandingPageName } from '../landingPageNameService';

/**
 * Naming a page from its brief.
 *
 * `tidyName` is the part worth pinning hardest: the model is TOLD not to send quotes, trailing
 * punctuation or newlines, and a model being told something is not a guarantee. The name seeds a
 * URL slug, so a stray quote or a 200-character sentence arriving here becomes a bad address
 * rather than a bad label.
 *
 * The short-brief refusal is checked against the real function because it happens BEFORE any
 * model call - no network, no key, no mock.
 */

describe('tidyName - the model is told, not trusted', () => {
  it('strips the surrounding quotes models add to JSON string values', () => {
    expect(tidyName('"AI Learning Platform"')).toBe('AI Learning Platform');
    expect(tidyName("'Analyst Upskilling Class'")).toBe('Analyst Upskilling Class');
  });

  it('drops trailing punctuation, which would otherwise land in a slug', () => {
    expect(tidyName('AI Learning Platform.')).toBe('AI Learning Platform');
    expect(tidyName('Start Here!')).toBe('Start Here');
    expect(tidyName('Why AI?')).toBe('Why AI');
  });

  it('flattens newlines rather than letting them into a single-line field', () => {
    expect(tidyName('AI Learning\nPlatform')).toBe('AI Learning Platform');
  });

  it('collapses runs of whitespace', () => {
    expect(tidyName('AI    Learning   Platform')).toBe('AI Learning Platform');
  });

  it('caps the length, because this seeds a URL', () => {
    const long = 'A'.repeat(200);
    expect(tidyName(long).length).toBe(MAX_NAME_LENGTH);
  });

  it('never leaves trailing whitespace after the cap', () => {
    // Slicing mid-sentence can land on a space, which would then be slugified.
    const name = tidyName(`${'word '.repeat(40)}`);
    expect(name).toBe(name.trim());
  });

  it('returns empty for an empty or punctuation-only answer, so the caller can refuse it', () => {
    expect(tidyName('')).toBe('');
    expect(tidyName('   ')).toBe('');
    expect(tidyName('"..."')).toBe('');
  });
});

describe('a brief too short to name anything from', () => {
  it('refuses before calling the model at all', async () => {
    // No network and no API key needed: the guard runs first.
    await expect(suggestLandingPageName('too short')).rejects.toMatchObject({ status: 400 });
  });

  it('refuses whitespace padded out to look long enough', async () => {
    await expect(suggestLandingPageName('   ' + ' '.repeat(50))).rejects.toMatchObject({ status: 400 });
  });

  it('says what to do rather than just failing', async () => {
    await expect(suggestLandingPageName('short')).rejects.toThrow(/couple of sentences/i);
  });

  it('agrees with the threshold the UI disables its button on', () => {
    // The button is disabled under 20 characters; a different number here would mean an enabled
    // button that always 400s, or a disabled one on a brief the service would have accepted.
    expect(MIN_BRIEF_LENGTH).toBe(20);
  });
});
