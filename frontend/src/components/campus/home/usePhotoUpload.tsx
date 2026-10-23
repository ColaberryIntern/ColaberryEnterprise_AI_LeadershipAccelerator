import React, { useCallback, useRef, useState } from 'react';
import { downscaleImageToSquare, uploadAvatar } from '../../../services/portalSettingsApi';
import { cheer } from '../campusCheerBus';
import { isReadOnlySession } from '../campusApi';

/**
 * Add or change your photo from the campus (WP-7, E M4; the prototype's #photoIn): pick a file, it is cropped to a 128 px square in
 * the browser (JPEG .85, a few KB) and saved with the portal's own POST /api/portal/settings/avatar. uploadAvatar refreshes the
 * avatar cache and fires 'te-avatar-changed', so the top bar, your pin, the gate ID, the Me panel and your room figure all change
 * at once, with no reload ("applied everywhere at once"). Classmates see it on their next presence read.
 *
 * Failures: an unreadable image or a refused upload (the server checks type and size) shows the reason and keeps the old photo; a
 * read-only "view as" session cannot change anyone's photo, so it is refused before any request.
 */
export const PHOTO_PX = 128;

export interface PhotoUpload {
  /** Opens the file picker. */
  pick: () => void;
  /** The hidden file input to render once. */
  input: React.ReactElement;
  busy: boolean;
  error: string | null;
}

export function usePhotoUpload(): PhotoUpload {
  const ref = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pick = useCallback(() => {
    setError(null);
    if (isReadOnlySession()) { setError('This is a read-only view, so the photo cannot be changed here.'); return; }
    ref.current?.click();
  }, []);
  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true);
    try {
      await uploadAvatar(await downscaleImageToSquare(f, PHOTO_PX));
      cheer({ big: '📷', title: 'Photo added', detail: 'People now see your face on campus, on cards and in messages', ms: 3200 });
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || (err as Error)?.message;
      setError(msg ? `We could not save that photo: ${msg}` : 'We could not save that photo. Try another image.');
    } finally {
      setBusy(false);
    }
  };
  const input = <input ref={ref} type="file" accept="image/*" hidden onChange={onChange} data-testid="cm-photo-input" />;
  return { pick, input, busy, error };
}
