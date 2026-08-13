import React from 'react';
import { useParticipantAuth } from '../../contexts/ParticipantAuthContext';
import { decodeParticipantClaims } from '../../utils/participantToken';

/**
 * Persistent banner shown whenever the portal is being viewed through an admin
 * "View as member" READ-ONLY session (the participant JWT carries read_only).
 * The server already blocks every write; this is the visible signal so the
 * admin always knows they're observing, not acting. Reactive via the auth
 * context token, so it appears the moment the read-only session is established.
 */
export default function ReadOnlyBanner() {
  const { token } = useParticipantAuth();
  const claims = decodeParticipantClaims(token);
  if (!claims?.read_only) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 20000,
        background: '#7c2d12', color: '#fff', textAlign: 'center',
        fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.02em',
        padding: '6px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      }}
    >
      <i className="bi bi-eye-fill" aria-hidden="true" style={{ marginRight: 6 }}></i>
      Viewing as {claims.email || 'this member'} — READ ONLY. Nothing you do here changes their account.
    </div>
  );
}
