import React, { useCallback, useEffect, useRef, useState } from 'react';
import PortalShell from '../today/PortalShell';
import '../today/TodayShell.css';
import '../feed/feed.css';
import './community.css';
import Avatar from './Avatar';
import LevelBadge from './LevelBadge';
import PostCard from './PostCard';
import Composer, { ComposerSubmit } from './Composer';
import EventStrip from './EventStrip';
import MemberProfileDrawer from './MemberProfileDrawer';
import {
  fetchPosts, createPost, fetchMyProfile, fetchMembers, pingPresence,
  fetchLeaderboard, fetchCalendar, levelProgress,
  CommunityPost, CommunityMemberProfile, COMMUNITY_CATEGORIES,
  LeaderboardEntry, LeaderboardPeriod, CommunityEvent,
} from '../../../services/communityApi';

const PAGE_SIZE = 20;

const CommunityPage: React.FC = () => {
  const [posts, setPosts] = useState<CommunityPost[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [category, setCategory] = useState<string>('');
  const [myProfile, setMyProfile] = useState<CommunityMemberProfile | null>(null);
  const [members, setMembers] = useState<CommunityMemberProfile[] | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[] | null>(null);
  const [lbPeriod, setLbPeriod] = useState<LeaderboardPeriod>('30d');
  const [events, setEvents] = useState<CommunityEvent[] | null>(null);
  const [profileMemberId, setProfileMemberId] = useState<string | null>(null);
  const pingRef = useRef<number | null>(null);

  const loadPosts = useCallback(async (cat: string) => {
    setPosts(null);
    const page = await fetchPosts({ category: cat || undefined, limit: PAGE_SIZE });
    setPosts(page.posts);
    setNextCursor(page.next_cursor);
  }, []);

  useEffect(() => { loadPosts(category); }, [category, loadPosts]);

  useEffect(() => {
    fetchMyProfile().then(setMyProfile).catch(() => {});
    fetchMembers().then(setMembers).catch(() => {});
    fetchCalendar().then(setEvents).catch(() => setEvents([]));
  }, []);

  useEffect(() => {
    setLeaderboard(null);
    fetchLeaderboard(lbPeriod).then(setLeaderboard).catch(() => setLeaderboard([]));
  }, [lbPeriod]);

  // Lite poll-presence: ping on mount, then every 45s while this tab is open.
  useEffect(() => {
    const ping = () => { pingPresence().catch(() => {}); };
    ping();
    pingRef.current = window.setInterval(ping, 45_000);
    return () => { if (pingRef.current) window.clearInterval(pingRef.current); };
  }, []);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchPosts({ category: category || undefined, cursor: nextCursor, limit: PAGE_SIZE });
      setPosts((prev) => (prev ? [...prev, ...page.posts] : page.posts));
      setNextCursor(page.next_cursor);
    } catch { /* leave the current feed intact; the button stays for a retry */ } finally {
      setLoadingMore(false);
    }
  };

  // Returns success so the composer can preserve the draft on failure.
  const submitPost = async (input: ComposerSubmit): Promise<boolean> => {
    try {
      await createPost({ body: input.body, category: input.category, media_urls: input.media_urls });
      await loadPosts(category);
      return true;
    } catch {
      return false;
    }
  };

  const handlePostChanged = (updated: CommunityPost) => {
    setPosts((prev) => (prev ? prev.map((p) => (p.id === updated.id ? updated : p)) : prev));
  };

  const onlineCount = members?.filter((m) => m.presence === 'online').length ?? 0;

  return (
    <PortalShell>
      <div className="page-h">
        <div className="crumbs0">Belong</div>
        <h1>Community</h1>
        <div className="sub">Post a win, ask for help, or cheer someone on — everyone in your cohort is here.</div>
      </div>

      <div className="cm-layout">
        <div className="cm-main">
          <Composer
            me={myProfile}
            categories={COMMUNITY_CATEGORIES}
            defaultCategory={COMMUNITY_CATEGORIES[0]}
            onSubmit={submitPost}
          />

          <EventStrip events={events} />

          <div className="te-feed-filter cm-filter">
            <span className={`fchip${category === '' ? ' active' : ''}`} onClick={() => setCategory('')}>All</span>
            {COMMUNITY_CATEGORIES.map((c) => (
              <span key={c} className={`fchip${category === c ? ' active' : ''}`} onClick={() => setCategory(c)}>{c}</span>
            ))}
          </div>

          <div className="te-feed cm-feed">
            {posts === null && <div className="fc-empty">Loading the feed…</div>}
            {posts !== null && posts.length === 0 && (
              <div className="fc-empty">No posts yet in {category || 'this cohort'} — start the conversation.</div>
            )}
            {posts?.map((p) => (
              <PostCard key={p.id} post={p} myMemberId={myProfile?.id ?? null} onChanged={handlePostChanged} onOpenProfile={setProfileMemberId} />
            ))}
            {posts !== null && nextCursor && (
              <button type="button" className="cm-load-more" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load more posts'}
              </button>
            )}
          </div>
        </div>

        <div className="cm-rail">
          <aside className="cm-side">
            {myProfile && (
              <div className="te-card cm-profile-card">
                <div className="cm-profile-top">
                  <Avatar name={myProfile.display_name} src={myProfile.avatar_url} size="lg" />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="cm-profile-name">{myProfile.display_name}</div>
                    <LevelBadge level={myProfile.level} size="sm" />
                  </div>
                </div>
                {(() => {
                  const { next, pctToNext } = levelProgress(myProfile.points);
                  return (
                    <div className="cm-lvl-progress">
                      <div className="cm-lvl-progress-row">
                        <span>{next ? `${next.min - myProfile.points} pts to Level ${next.level} · ${next.name}` : 'Max level reached'}</span>
                        <b>{myProfile.points}{next ? ` / ${next.min}` : ''}</b>
                      </div>
                      <div className="cm-lvl-track"><i style={{ width: `${pctToNext}%` }} /></div>
                    </div>
                  );
                })()}
                <div className="cm-profile-stats">
                  <div className="cm-profile-stat"><b>{myProfile.points}</b><span>Points</span></div>
                  <div className="cm-profile-stat"><b>{myProfile.level}</b><span>Level</span></div>
                </div>
              </div>
            )}

            <div className="te-card te-scard">
              <div className="cm-leader-head">
                <h3 style={{ margin: 0 }}><svg viewBox="0 0 24 24" fill="none"><path d="M12 2l2.6 7.4H22l-6.2 4.6 2.4 7.4L12 16.9 5.8 21.4l2.4-7.4L2 9.4h7.4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg> Leaderboard</h3>
                <div className="cm-lb-tabs" role="tablist" aria-label="Leaderboard period">
                  {(['7d', '30d', 'all_time'] as LeaderboardPeriod[]).map((p) => (
                    <button key={p} type="button" role="tab" aria-selected={lbPeriod === p} className={lbPeriod === p ? 'active' : ''} onClick={() => setLbPeriod(p)}>
                      {p === 'all_time' ? 'All-time' : p}
                    </button>
                  ))}
                </div>
              </div>
              {leaderboard === null && <div className="cm-empty">Loading…</div>}
              {leaderboard !== null && leaderboard.length === 0 && <div className="cm-empty">No activity yet</div>}
              {leaderboard?.map((m) => (
                <div key={m.member_id} className={`cm-leader-row${myProfile?.id === m.member_id ? ' me' : ''}`}>
                  <span className="cm-leader-rank">{m.rank}</span>
                  <Avatar name={m.display_name} size="sm" onClick={() => setProfileMemberId(m.member_id)} />
                  <span className="cm-leader-name">{m.display_name}</span>
                  <span className="cm-leader-pts">{m.points} pts</span>
                </div>
              ))}
            </div>
          </aside>

          <aside className="cm-contacts te-card te-scard">
            <div className="cm-contacts-head">
              <h3><svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="2" /><path d="M3 19c0-3 3-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M16 7a3 3 0 0 1 0 6M18 19c0-2-1-3.5-2.5-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> Your cohort</h3>
              {members !== null && <span className="cm-contacts-count">{onlineCount} online · {members.length}</span>}
            </div>
            {members === null && <div className="cm-empty">Loading…</div>}
            {members !== null && members.length === 0 && <div className="cm-empty">No members yet</div>}
            {members?.map((m) => (
              <button type="button" key={m.id} className="cm-contact-row" onClick={() => setProfileMemberId(m.id)}>
                <span className="cm-contact-av">
                  <Avatar name={m.display_name} src={m.avatar_url} size="sm" />
                  <span className={`cm-dot ${m.presence}`} title={m.presence} />
                </span>
                <span className="cm-contact-name">{m.display_name}</span>
                <LevelBadge level={m.level} size="sm" />
              </button>
            ))}
          </aside>
        </div>
      </div>

      <MemberProfileDrawer memberId={profileMemberId} onClose={() => setProfileMemberId(null)} />
    </PortalShell>
  );
};

export default CommunityPage;
