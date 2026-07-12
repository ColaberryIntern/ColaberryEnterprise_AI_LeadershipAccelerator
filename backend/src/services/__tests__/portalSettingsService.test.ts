// Unit tests for the PURE validators/sanitizers behind the student Settings
// page. No DB is touched — the model graph is stubbed — so these are fast and
// deterministic. Covers happy path, failure path, boundaries, and idempotency.

jest.mock('../../models', () => ({ Enrollment: {}, OnboardingProfile: {}, Cohort: {} }));

import {
  base64Bytes, validateAvatarDataUrl, validateResumeUpload, sanitizeProfilePatch,
  AVATAR_MAX_CHARS, RESUME_MAX_BYTES,
} from '../portalSettingsService';

// A 1x1 transparent PNG data URL (valid, tiny).
const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('base64Bytes', () => {
  it('computes decoded length for padded strings', () => {
    expect(base64Bytes('QQ==')).toBe(1); // "A"
    expect(base64Bytes('QUI=')).toBe(2); // "AB"
    expect(base64Bytes('QUJD')).toBe(3); // "ABC"
  });
  it('ignores whitespace and returns 0 for empty', () => {
    expect(base64Bytes('')).toBe(0);
    expect(base64Bytes('QU\nJD')).toBe(3);
  });
});

describe('validateAvatarDataUrl', () => {
  it('accepts png/jpeg/webp/gif data URLs (happy path)', () => {
    expect(validateAvatarDataUrl(PNG_DATA_URL).ok).toBe(true);
    expect(validateAvatarDataUrl('data:image/jpeg;base64,QUJD').ok).toBe(true);
    expect(validateAvatarDataUrl('data:image/webp;base64,QUJD').ok).toBe(true);
    expect(validateAvatarDataUrl('data:image/gif;base64,QUJD').ok).toBe(true);
  });
  it('rejects non-image / non-string / empty (failure path)', () => {
    expect(validateAvatarDataUrl('data:application/pdf;base64,QUJD').ok).toBe(false);
    expect(validateAvatarDataUrl('https://example.com/a.png').ok).toBe(false);
    expect(validateAvatarDataUrl('').ok).toBe(false);
    expect(validateAvatarDataUrl(undefined).ok).toBe(false);
    expect(validateAvatarDataUrl(123 as unknown).ok).toBe(false);
  });
  it('rejects an oversized image (boundary)', () => {
    const huge = 'data:image/png;base64,' + 'A'.repeat(AVATAR_MAX_CHARS);
    expect(validateAvatarDataUrl(huge).ok).toBe(false);
  });
});

describe('validateResumeUpload', () => {
  const okData = 'QUJD'; // small
  it('accepts an allowed type with name + data (happy path)', () => {
    expect(validateResumeUpload({ file_name: 'cv.pdf', mime: 'application/pdf', data_base64: okData }).ok).toBe(true);
    expect(validateResumeUpload({ file_name: 'cv.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data_base64: okData }).ok).toBe(true);
  });
  it('rejects disallowed mime, missing name, missing data (failure path)', () => {
    expect(validateResumeUpload({ file_name: 'a.exe', mime: 'application/x-msdownload', data_base64: okData }).ok).toBe(false);
    expect(validateResumeUpload({ file_name: '  ', mime: 'application/pdf', data_base64: okData }).ok).toBe(false);
    expect(validateResumeUpload({ file_name: 'cv.pdf', mime: 'application/pdf', data_base64: '' }).ok).toBe(false);
  });
  it('rejects a file over the size cap (boundary)', () => {
    // base64 length ~ bytes * 4/3; make decoded length exceed RESUME_MAX_BYTES.
    const over = 'A'.repeat(Math.ceil((RESUME_MAX_BYTES + 16) * 4 / 3));
    expect(validateResumeUpload({ file_name: 'big.pdf', mime: 'application/pdf', data_base64: over }).ok).toBe(false);
  });
});

describe('sanitizeProfilePatch', () => {
  it('trims, caps, and only writes provided keys (happy path)', () => {
    const r = sanitizeProfilePatch({ full_name: '  Ada Lovelace  ', title: ' Engineer ', phone: ' 555 ' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.patch.enrollment).toEqual({ full_name: 'Ada Lovelace', title: 'Engineer', phone: '555' });
      expect(r.patch.linkedin_url).toBeUndefined(); // not provided → untouched
    }
  });
  it('rejects an empty full_name and an empty patch (failure path)', () => {
    expect(sanitizeProfilePatch({ full_name: '   ' }).ok).toBe(false);
    expect(sanitizeProfilePatch({}).ok).toBe(false);
  });
  it('clears an optional field with empty string and validates LinkedIn', () => {
    const cleared = sanitizeProfilePatch({ title: '' });
    expect(cleared.ok).toBe(true);
    if (cleared.ok) expect(cleared.patch.enrollment.title).toBe('');

    expect(sanitizeProfilePatch({ linkedin_url: 'not-a-url' }).ok).toBe(false);
    const good = sanitizeProfilePatch({ linkedin_url: 'https://www.linkedin.com/in/ada' });
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.patch.linkedin_url).toBe('https://www.linkedin.com/in/ada');

    const emptyLinkedin = sanitizeProfilePatch({ linkedin_url: '' });
    expect(emptyLinkedin.ok).toBe(true);
    if (emptyLinkedin.ok) expect(emptyLinkedin.patch.linkedin_url).toBeNull();
  });
  it('is pure — same input yields same output and does not mutate input (idempotency)', () => {
    const input = { full_name: 'Grace Hopper', company: 'Navy' };
    const snapshot = JSON.parse(JSON.stringify(input));
    const a = sanitizeProfilePatch(input);
    const b = sanitizeProfilePatch(input);
    expect(a).toEqual(b);
    expect(input).toEqual(snapshot);
  });
});
