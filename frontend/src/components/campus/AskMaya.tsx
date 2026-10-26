import React, { Suspense, lazy, useState } from 'react';

// C6: Maya is the website's admissions chat. Loaded only when a learner asks, so portal pages do not carry it otherwise.
const MayaChatWidget = lazy(() => import('../MayaChatWidget'));

/** True when this browser already has the public site's visitor id (written only by the site's own tracker). The campus
 *  only READS it: creating one in the portal would be a tracking/consent change, which is Ali's decision. */
export function hasSiteVisitorId(): boolean {
  try { return !!window.localStorage.getItem('cb_visitor_fp'); } catch { return false; }
}

/** The widget hides itself entirely for Do Not Track browsers (site and campus alike); the desk says so instead. */
export function doNotTrackOn(): boolean {
  return typeof navigator !== 'undefined' && navigator.doNotTrack === '1';
}

const ENROLL_PAGE = '/enroll';

/**
 * "Ask Maya about enrolling" (C6, shared since C54): Maya speaks through the website's chat, so asking her opens that chat embedded
 * here when this browser already has the site's visitor id, else links to the enrollment page where she chats (a new tab). Do Not
 * Track browsers get a line instead. Used by her desk card and the Explorer's pass on Today. The caller decides when she is on duty.
 */
export default function AskMaya({ className = 'cm-btn is-secondary' }: { className?: string }): React.ReactElement {
  const [open, setOpen] = useState(false);
  if (doNotTrackOn()) return <p className="cm-pc-note" data-testid="cm-maya-dnt">Your browser asks sites not to track you, so Maya's chat stays hidden.</p>;
  if (!hasSiteVisitorId()) {
    return (
      <>
        <a className={className} href={ENROLL_PAGE} target="_blank" rel="noopener noreferrer" data-testid="cm-ask-maya-site">Ask Maya about enrolling</a>
        <p className="cm-pc-note">Maya chats on our enrollment page; it opens in a new tab.</p>
      </>
    );
  }
  return (
    <>
      <button type="button" className={className} data-testid="cm-ask-maya" onClick={() => setOpen(true)}>Ask Maya about enrolling</button>
      {open && (
        // C11: Esc inside Maya's chat closes the chat, not the card and map around it.
        <div onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } }} data-testid="cm-maya-chat">
          <Suspense fallback={null}>
            <MayaChatWidget mode="embedded" open onClose={() => setOpen(false)} />
          </Suspense>
        </div>
      )}
    </>
  );
}
