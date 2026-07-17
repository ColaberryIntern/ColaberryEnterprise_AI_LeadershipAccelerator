import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import LevelBadge from './community/LevelBadge';
import '../portal/community/community.css';
import {
  fetchMyProfile, fetchPosts, fetchMembers, pingPresence, levelProgress,
  CommunityPost, CommunityMemberProfile,
} from '../../services/communityApi';
import { SectionHeader } from './CoryHomeParts';

const HOME_POST_LIMIT = 4;
const HOME_ONLINE_LIMIT = 6;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

const cardStyle: React.CSSProperties = { background: 'white', border: '1px solid var(--color-border)', borderRadius: 6 };

// Compact, read-only surface for the student home. Full post/like/comment
// interaction stays on /portal/community — this widget's job is presence +
// orientation, not a second feed implementation (REQ-C11).
const CommunityHomeWidget: React.FC = () => {
  const [profile, setProfile] = useState<CommunityMemberProfile | null>(null);
  const [posts, setPosts] = useState<CommunityPost[] | null>(null);
  const [members, setMembers] = useState<CommunityMemberProfile[] | null>(null);
  const pingRef = useRef<number | null>(null);

  useEffect(() => {
    fetchMyProfile().then(setProfile).catch(() => {});
    fetchPosts().then((list) => setPosts(list.slice(0, HOME_POST_LIMIT))).catch(() => setPosts([]));
    fetchMembers().then(setMembers).catch(() => setMembers([]));
  }, []);

  // Landing on home counts as presence too, not just the full community page.
  useEffect(() => {
    const ping = () => { pingPresence().catch(() => {}); };
    ping();
    pingRef.current = window.setInterval(ping, 45_000);
    return () => { if (pingRef.current) window.clearInterval(pingRef.current); };
  }, []);

  const online = (members || []).filter((m) => m.presence === 'online').slice(0, HOME_ONLINE_LIMIT);
  const onlineCount = (members || []).filter((m) => m.presence === 'online').length;

  return (
    <section className="mb-3" data-testid="community-home-widget">
      <SectionHeader
        title="Community"
        badge={onlineCount > 0 ? `${onlineCount} online` : undefined}
        aside=""
      />
      <div className="row g-3">
        <div className="col-md-5">
          {profile && (() => {
            const { next, pctToNext } = levelProgress(profile.points);
            return (
              <div style={{ ...cardStyle, padding: '0.85rem 1rem' }} data-testid="community-home-points">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="cm-avatar" style={{ width: 36, height: 36, fontSize: 13 }}>{initials(profile.display_name)}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text)' }}>{profile.display_name}</div>
                    <LevelBadge level={profile.level} size="sm" />
                  </div>
                </div>
                <div className="cm-lvl-progress">
                  <div className="cm-lvl-progress-row">
                    <span>{next ? `${next.min - profile.points} pts to Level ${next.level}` : 'Max level reached'}</span>
                    <b>{profile.points}{next ? ` / ${next.min}` : ''}</b>
                  </div>
                  <div className="cm-lvl-track"><i style={{ width: `${pctToNext}%` }} /></div>
                </div>
              </div>
            );
          })()}

          <div style={{ ...cardStyle, padding: '0.85rem 1rem', marginTop: 12 }} data-testid="community-home-presence">
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-light)', fontWeight: 600, marginBottom: 8 }}>
              Who's online
            </div>
            {members === null && <div className="cm-empty">Loading…</div>}
            {members !== null && online.length === 0 && (
              <div style={{ fontSize: 12.5, color: 'var(--color-text-light)' }}>No one from your cohort is online right now.</div>
            )}
            {online.map((m) => (
              <div key={m.id} className="cm-contact-row">
                <span className="cm-avatar sm">{initials(m.display_name)}</span>
                <span className="cm-contact-name">{m.display_name}</span>
                <span className="cm-dot online" title="online" />
              </div>
            ))}
          </div>
        </div>

        <div className="col-md-7">
          <div style={{ ...cardStyle, overflow: 'hidden' }} data-testid="community-home-feed">
            {posts === null && <div className="cm-empty">Loading the feed…</div>}
            {posts !== null && posts.length === 0 && (
              <div className="cm-empty">No posts yet — be the first to share something.</div>
            )}
            {posts?.map((p, i) => (
              <div
                key={p.id}
                style={{
                  padding: '0.7rem 1rem',
                  borderBottom: i < posts.length - 1 ? '1px solid var(--color-border)' : 'none',
                  display: 'flex',
                  gap: 10,
                }}
              >
                <span className="cm-avatar sm">{initials(p.member.display_name)}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text)' }}>
                    {p.member.display_name}
                    <span style={{ fontWeight: 400, color: 'var(--color-text-light)' }}> · {timeAgo(p.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--color-text-light)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.locked ? `Locked until Level ${p.min_level}` : p.body}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Link to="/portal/community" className="btn btn-sm mt-2" style={{ border: '1px solid #FB2832', color: '#FB2832', background: 'transparent' }}>
            <i className="bi bi-arrow-right me-1"></i>Go to Community
          </Link>
        </div>
      </div>
    </section>
  );
};

export default CommunityHomeWidget;
