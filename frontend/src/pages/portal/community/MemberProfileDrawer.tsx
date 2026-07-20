import React, { useEffect, useState } from 'react';
import Avatar from './Avatar';
import LevelBadge from './LevelBadge';
import { fetchMemberProfile, levelName, CommunityMemberProfile } from '../../../services/communityApi';

const PRESENCE_LABEL: Record<string, string> = {
  online: 'Online now',
  away: 'Away',
  offline: 'Offline',
};

/**
 * Slide-in member profile (Design E). Opens on avatar/name clicks anywhere in
 * the feed or contacts rail. Cohort privacy is preserved server-side: a member
 * in another cohort resolves to 404, which surfaces here as "not available".
 * Direct messaging is intentionally a disabled "coming soon" affordance — the
 * DM schema lands in PR 2 behind COMMUNITY_DIRECT_MESSAGES_ENABLED.
 */
const MemberProfileDrawer: React.FC<{
  memberId: string | null;
  onClose: () => void;
}> = ({ memberId, onClose }) => {
  const [profile, setProfile] = useState<CommunityMemberProfile | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');

  useEffect(() => {
    if (!memberId) return;
    let active = true;
    setProfile(null);
    setState('loading');
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
                <span className={`cm-dot ${profile.presence}`} /> <span className="cm-drawer-presence">{PRESENCE_LABEL[profile.presence] ?? profile.presence}</span>
              </div>
            </div>

            {profile.bio && <p className="cm-drawer-bio">{profile.bio}</p>}

            <div className="cm-drawer-stats">
              <div><b>{profile.points}</b><span>Points</span></div>
              <div><b>{profile.level}</b><span>{levelName(profile.level)}</span></div>
            </div>

            <div className="cm-drawer-actions">
              <button type="button" className="te-btn cherry sm" disabled title="Direct messages arrive in the next release">
                Message
              </button>
              <span className="cm-drawer-soon">Direct messages coming soon</span>
            </div>
          </>
        )}
      </aside>
    </div>
  );
};

export default MemberProfileDrawer;
