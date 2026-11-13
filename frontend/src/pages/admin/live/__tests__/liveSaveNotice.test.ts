/**
 * D18 — the admin-facing half of "a refused broadcast must not look like a successful save".
 *
 * The backend half is covered by backend/src/services/__tests__/acceleratorService.liveWarning
 * (the sentence reaches the response). This file covers what the page then does with it.
 *
 * The load-bearing case is the FOURTH one: a confirmation when there is nothing to warn about.
 * Without it, returning a warning unconditionally would pass everything else, and the page
 * would cry wolf on every single save.
 */

import { liveSaveNotice, WARNING_TOAST_MS } from '../liveSaveNotice';

describe('liveSaveNotice', () => {
  it('surfaces the backend sentence verbatim, as a warning', () => {
    const notice = liveSaveNotice(
      { live_warning: 'This class was saved, but Colaberry Live was not set up for it: no_room.' },
      'Session created',
    );

    expect(notice.tone).toBe('warning');
    // Verbatim: the reason inside the sentence is the only actionable part, so the page must
    // not replace it with a generic "something went wrong".
    expect(notice.message).toContain('no_room');
    expect(notice.message).not.toBe('Session created');
  });

  it('gives the warning longer than the default toast life', () => {
    const notice = liveSaveNotice({ live_warning: 'refused: no_live_input.' }, 'Session created');

    // 4000 is ToastProvider's default. A sentence the reader has to act on needs more.
    expect(notice.durationMs).toBe(WARNING_TOAST_MS);
    expect(WARNING_TOAST_MS).toBeGreaterThan(4000);
  });

  it('confirms the save when there is nothing to report', () => {
    const notice = liveSaveNotice({ live_warning: null }, 'Session created');

    expect(notice).toEqual({ message: 'Session created', tone: 'success' });
    // No override: a plain confirmation should not linger.
    expect(notice.durationMs).toBeUndefined();
  });

  it('confirms the save when the field is absent entirely', () => {
    // An older backend, or any endpoint that never grew the field, must still get a
    // confirmation rather than a silent nothing.
    expect(liveSaveNotice({}, 'Session updated').tone).toBe('success');
    expect(liveSaveNotice(undefined, 'Session updated').tone).toBe('success');
    expect(liveSaveNotice(null, 'Session updated').message).toBe('Session updated');
  });

  it('treats an empty or blank warning as an absence, not a problem', () => {
    // An empty yellow toast tells the reader there is a problem and not what it is, which is
    // worse than the confirmation it replaced.
    expect(liveSaveNotice({ live_warning: '' }, 'Session created').tone).toBe('success');
    expect(liveSaveNotice({ live_warning: '   ' }, 'Session created').tone).toBe('success');
  });
});
