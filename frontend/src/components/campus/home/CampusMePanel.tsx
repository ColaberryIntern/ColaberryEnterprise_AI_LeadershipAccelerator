import React, { useRef } from 'react';
import type { CampusAudience } from '../campusMap';
import { useCampus } from '../CampusContext';
import LockerGrid from '../LockerGrid';
import { useCardFocus } from '../useCardFocus';
import { trapTab } from '../focusTrap';
import MeHeader from './MeHeader';
import MeSettings from './MeSettings';
import { usePhotoUpload } from './usePhotoUpload';
import '../campusPanels.css';

/**
 * "Me" (C11b; WP-7 the prototype's Me panel, renderMe D:3205-3218): you (your figure with gear and photo, level and the bar to the
 * next unlock, the photo button), your locker (tiles, earned with points, never bought; learners only, as in the prototype), and
 * the campus settings. One panel for the whole campus (CampusContext.meOpen): the home's top bar, a page's banner, an unlock cheer.
 */
export interface CampusMePanelProps {
  audience: CampusAudience;
  fullName: string;
  initials: string;
  photo: string | null;
  onClose: () => void;
}

export default function CampusMePanel({ audience, fullName, initials, photo, onClose }: CampusMePanelProps): React.ReactElement {
  const { look, lookError, saveLook } = useCampus();
  const heading = useRef<HTMLHeadingElement | null>(null);
  const upload = usePhotoUpload();
  const earns = audience === 'member' || audience === 'explorer';
  useCardFocus(heading);
  return (
    <>
      {/* the map dims behind the panel, as in the prototype; a press outside closes it */}
      <div className="cm-me-backdrop" aria-hidden="true" onClick={onClose} data-testid="cm-me-backdrop" />
      <aside className="cm-me-panel" role="dialog" aria-modal="false" aria-labelledby="cm-me-name" data-testid="cm-me"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } else trapTab(e); }}>
        <button type="button" className="cm-me-x" onClick={onClose} aria-label="Close">{'×'}</button>
        <MeHeader audience={audience} fullName={fullName} initials={initials} photo={photo} look={look} headingRef={heading}
          onPhoto={upload.pick} photoBusy={upload.busy} />
        {upload.input}
        {upload.error && <p className="cm-me-err" role="alert" data-testid="cm-me-photo-error">{upload.error}</p>}
        {earns ? (
          <section aria-labelledby="cm-me-locker-h" data-testid="cm-look">
            <h3 className="cm-me-sec" id="cm-me-locker-h">Your locker <small>· earned with points, never bought</small></h3>
            {!look && lookError && <p className="cm-me-note" role="status" data-testid="cm-look-broken">We can&rsquo;t load your locker right now.</p>}
            {!look && !lookError && <p className="cm-me-note">Loading&hellip;</p>}
            {look && <LockerGrid look={look} onSave={saveLook} />}
          </section>
        ) : <p className="cm-me-note" data-testid="cm-me-earners">Accessories and levels are earned by learners with learning points.</p>}
        <h3 className="cm-me-sec">Settings</h3>
        <MeSettings onClose={onClose} />
      </aside>
    </>
  );
}
