import React, { useState } from 'react';
import type { CampusAudience } from '../campusMap';
import { readCachedAvatar } from '../../../services/portalSettingsApi';
import { isReadOnlySession } from '../campusApi';
import { usePhotoUpload } from './usePhotoUpload';

/**
 * The side panel's photo prompt (WP-7, A3.5; the prototype's renderPhotoPrompt, D:3255-3256): "Add a photo so classmates (a
 * partner: your team) recognize you · It shows on your avatar, cards and messages. Nobody gets a made-up face." [Add photo] [×].
 * Shown only when we KNOW there is no photo (the avatar cache says "fetched, none"), so it never flashes while the photo loads;
 * never to staff (as the prototype) or in a read-only "view as" session; × hides it for this visit.
 */
export const PHOTO_NO_KEY = 'colaberry.campus.photo.no';

function dismissed(): boolean {
  try { return window.sessionStorage.getItem(PHOTO_NO_KEY) === '1'; } catch { return false; }
}

export default function PhotoPrompt({ audience, photo }: { audience: CampusAudience; photo: string | null }): React.ReactElement | null {
  const [no, setNo] = useState(dismissed);
  const upload = usePhotoUpload();
  if (photo || no || audience === 'staff' || readCachedAvatar() !== '' || isReadOnlySession()) return null;
  const hide = () => { setNo(true); try { window.sessionStorage.setItem(PHOTO_NO_KEY, '1'); } catch { /* no storage: hidden until reload */ } };
  return (
    <div className="cm-photo-p" data-testid="cm-photo-prompt">
      <span className="pp-ic" aria-hidden="true">📷</span>
      <div>
        <b>Add a photo so {audience === 'business' ? 'your team' : 'classmates'} recognize you</b>
        <small>It shows on your avatar, cards and messages. Nobody gets a made-up face.</small>
        {upload.error && <small role="alert">{upload.error}</small>}
      </div>
      <button type="button" className="cm-btn-line" onClick={upload.pick} disabled={upload.busy} data-testid="cm-photo-add">{upload.busy ? 'Saving…' : 'Add photo'}</button>
      <button type="button" className="pp-x" onClick={hide} aria-label="Not now" data-testid="cm-photo-no">{'×'}</button>
      {upload.input}
    </div>
  );
}
