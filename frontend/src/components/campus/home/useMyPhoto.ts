import { useEffect, useState } from 'react';
import { fetchSettings, readCachedAvatar } from '../../../services/portalSettingsApi';

/**
 * Your own photo for the campus (WP-3, the prototype's myPhoto on the pin), from the portal's avatar cache (PortalShell's pattern):
 * the cached data URL, kept in step when Settings changes it ('te-avatar-changed', another tab's 'storage'), and read from the
 * server once when nothing is cached yet (the campus home is full-bleed, so PortalShell may never have filled the cache).
 * '' or null = no photo: the pin shows your initials.
 */
export function useMyPhoto(active: boolean): string | null {
  const [photo, setPhoto] = useState<string | null>(() => readCachedAvatar() || null);
  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    const sync = () => setPhoto(readCachedAvatar() || null);
    window.addEventListener('te-avatar-changed', sync);
    window.addEventListener('storage', sync);
    if (readCachedAvatar() === null) {
      fetchSettings().then((s) => { if (alive) setPhoto(s.avatar_data_url || null); })
        .catch((e) => console.warn(JSON.stringify({ event: 'campus_photo_unavailable', error_class: (e as Error)?.name ?? 'Error' })));
    }
    return () => { alive = false; window.removeEventListener('te-avatar-changed', sync); window.removeEventListener('storage', sync); };
  }, [active]);
  return photo;
}
