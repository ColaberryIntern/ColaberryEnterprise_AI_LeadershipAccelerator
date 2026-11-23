import React, { useState } from 'react';
import { useParticipantAuth } from '../../contexts/ParticipantAuthContext';
import { decodeParticipantClaims } from '../../utils/participantToken';
import ViewAsAccessSheet from './ViewAsAccessPanel';

/**
 * Persistent banner shown whenever the portal is being viewed through an admin
 * "View as member" READ-ONLY session (the participant JWT carries read_only).
 * The server already blocks every write; this is the visible signal so the
 * admin always knows they're observing, not acting. Reactive via the auth
 * context token, so it appears the moment the read-only session is established.
 *
 * AF2.7: it also carries the one-line reason the Management Portal entry is missing. That entry
 * is withheld for the whole session (mgmtBridgeGate.ts), and a nav item that simply vanishes is
 * its own small untruth — so the explanation lives on the one element guaranteed to be on screen
 * for exactly as long as the thing it explains is absent.
 *
 * AF12.18: and now it carries the answer to the question that absence raises. Saying "employee
 * tools are hidden" tells the viewer what THEY cannot do and nothing about what the person they
 * are viewing can do, so a withheld bridge reads as a missing grant. Ali read exactly that off a
 * campus screenshot on 2026-11-22 and concluded a builder had lost her Marketing access, which
 * she had not. The button opens `ViewAsAccessPanel`, which states that person's admin reach, read
 * from their own session. It is a description and not a door: no session is minted, nobody is
 * impersonated, and the bridge stays refused.
 *
 * The panel is a SIBLING of the banner, not a child, for two reasons that are easy to miss. The
 * banner is a `role="status"` `aria-live` region, so a dialog rendered inside it would be read
 * out as a status update rather than entered as a dialog; and the banner sets white, centred,
 * semibold, letter-spaced text that every unstyled node in the panel would inherit.
 *
 * It also mounts only while open, so a view-as session that never asks makes no extra request.
 */
export default function ReadOnlyBanner() {
  const { token } = useParticipantAuth();
  const [showAccess, setShowAccess] = useState(false);
  const claims = decodeParticipantClaims(token);
  if (!claims?.read_only) return null;

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        className="ro-banner"
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 20000,
          background: '#7c2d12', color: '#fff', textAlign: 'center',
          fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.02em',
          padding: '6px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        }}
      >
        <i className="bi bi-eye-fill" aria-hidden="true" style={{ marginRight: 6 }}></i>
        <span className="ro-long">
          Viewing as {claims.email || 'this member'} — READ ONLY. Nothing you do here changes their account.
          {' '}Employee-only tools, including the Management Portal, are hidden while you view as someone else.
        </span>
        {/* C127: on a phone the long text wrapped to four lines and covered the top bar (responsive.css swaps them). */}
        <span className="ro-short" style={{ display: 'none' }}>
          READ ONLY · {claims.email || 'this member'} · employee tools hidden
        </span>
        {/* Outside both spans, so the one affordance is present at every width rather than only at
            the width responsive.css happens to be showing. The label names no one, so it does not
            grow with the length of an email address in a fixed-height bar. */}
        <button
          type="button"
          onClick={() => setShowAccess(true)}
          data-testid="ro-see-access"
          style={{
            marginLeft: 8, background: 'rgba(255,255,255,0.18)', color: '#fff',
            border: '1px solid rgba(255,255,255,0.35)', borderRadius: 5,
            padding: '1px 8px', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer',
            letterSpacing: '0.02em', whiteSpace: 'nowrap',
          }}
        >
          What can they reach?
        </button>
      </div>
      {showAccess && <ViewAsAccessSheet email={claims.email || ''} onClose={() => setShowAccess(false)} />}
    </>
  );
}
