import React, { useEffect, useState } from 'react';
import Avatar from './Avatar';
import LevelBadge from './LevelBadge';
import { fetchMemberProfile, levelName, CommunityMemberProfile, MEMBER_ROLE_META } from '../../../services/communityApi';
import { sendFriendRequest } from '../../../services/cohortPresenceApi';

const PRESENCE_LABEL: Record<string, string> = {
  online: 'Online now',
  away: 'Away',
  offline: 'Offline',
};

/**
 * Slide-in member profile (Design E). Opens on avatar/name clicks anywhere in
 * the feed, the People directory, or the contacts rail. Profile lookups are
 * platform-wide (not cohort-scoped) — "not available" here means the member
 * genuinely doesn't exist. Message opens a 1:1 DM (via the shared `te-open-dm`
 * bridge → ChatDock in PortalShell) — still cohort-scoped for students in
 * dmService.ts, so a cross-cohort Message attempt surfaces PortalShell's error
 * toast. Connect sends a friend request and works cross-cohort for everyone.
 * Both are enrollment-keyed (profile.enrollment_id).
 */
const MemberProfileDrawer: React.FC<{
  memberId: string | null;
  onClose: () => void;
}> = ({ memberId, onClose }) => {
  const [profile, setProfile] = useState<CommunityMemberProfile | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [connect, setConnect] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  useEffect(() => {
    if (!memberId) return;
    let active = true;
    setProfile(null);
    setState('loading');
    setConnect('idle');
    fetchMemberProfile(memberId)
      .then((p) => { if (active) { setProfile(p); setState('idle'); } })
      .catch(() => { if (active) setState('error'); });
    return () => { active = false; };
  }, [memberId]);

  // Close on Escape while open.
  useEffect(() => {
    if (!memberId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [memberId, onClose]);

  if (!memberId) return null;

  return (
    <div className="cm-drawer-overlay" onClick={onClose}>
      <aside
        className="cm-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Member profile"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="cm-drawer-close" onClick={onClose} aria-label="Close profile">×</button>

        {state === 'loading' && <div className="cm-empty">Loading profile…</div>}
        {state === 'error' && <div className="cm-empty">This member’s profile isn’t available.</div>}

        {profile && (
          <>
            <div className="cm-drawer-hero">
              <Avatar name={profile.display_name} src={profile.avatar_url} size="lg" />
              <div className="cm-drawer-name">{profile.display_name}</div>
              <div className="cm-drawer-badges">
                <LevelBadge level={profile.level} />
                {profile.role !== 'student' && (
                  <span className={`cm-role-chip ${profile.role}`}>
                    {MEMBER_ROLE_META[profile.role].emoji} {MEMBER_ROLE_META[profile.role].label}
                  </span>
                )}
                <span className={`cm-dot ${profile.presence}`} /> <span className="cm-drawer-presence">{PRESENCE_LABEL[profile.presence] ?? profile.presence}</span>
              </div>
            </div>

            {profile.bio && <p className="cm-drawer-bio">{profile.bio}</p>}

            <div className="cm-drawer-stats">
              <div><b>{profile.points}</b><span>Points</span></div>
              <div><b>{profile.level}</b><span>{levelName(profile.level)}</span></div>
            </div>

            {profile.badges.length > 0 && (
              <div className="cm-drawer-badgelist">
                {profile.badges.map((b) => (
                  <span key={b.category} className="cm-badge-pill" title={`${b.label} ×${b.count}`}>
                    {b.emoji} {b.label}{b.count > 1 ? ` ×${b.count}` : ''}
                  </span>
                ))}
              </div>
            )}

            <div className="cm-drawer-actions">
              <button
                type="button"
                className="te-btn cherry sm"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('te-open-dm', {
                    detail: { enrollmentId: profile.enrollment_id, name: profile.display_name },
                  }));
                  onClose();
                }}
              >
                Message
              </button>
              <button
                type="button"
                className="te-btn sm"
                disabled={connect === 'sending' || connect === 'sent'}
                onClick={() => {
                  setConnect('sending');
                  sendFriendRequest(profile.enrollment_id)
                    .then(() => setConnect('sent'))
                    .catch(() => setConnect('error'));
                }}
              >
                {connect === 'sent' ? 'Request sent' : connect === 'sending' ? 'Connecting…' : connect === 'error' ? 'Try again' : 'Connect'}
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
};

export default MemberProfileDrawer;
