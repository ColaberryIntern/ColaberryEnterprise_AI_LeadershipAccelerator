import React, { useCallback, useEffect, useState } from 'react';
import PortalShell from '../today/PortalShell';
import '../today/TodayShell.css';
import './community.css';
import Avatar from './Avatar';
import LevelBadge from './LevelBadge';
import MemberProfileDrawer from './MemberProfileDrawer';
import {
  fetchDirectory, CommunityMemberProfile, CommunityMemberRole, MEMBER_ROLE_META, DirectoryQuery,
} from '../../../services/communityApi';

const PAGE_SIZE = 24;

const ROLE_FILTERS: { key: CommunityMemberRole | 'all'; label: string }[] = [
  { key: 'all', label: 'Everyone' },
  { key: 'mentor', label: 'Mentors' },
  { key: 'staff', label: 'Staff' },
  { key: 'student', label: 'Members' },
];

/**
 * People directory (Feature #3) — a dedicated, browsable, searchable roster of
 * the viewer's cohort (staff/mgmt see every member on the platform instead —
 * see communityService.ts's listMembers). Role/badges come from the backend
 * (/api/portal/community/members). Clicking a card opens the shared
 * MemberProfileDrawer (which now wires Message + Connect).
 */
const PeopleDirectoryPage: React.FC = () => {
  const [members, setMembers] = useState<CommunityMemberProfile[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [role, setRole] = useState<CommunityMemberRole | 'all'>('all');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(false);
  const [profileMemberId, setProfileMemberId] = useState<string | null>(null);

  // Debounce the search box so we don't fire a request per keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const load = useCallback(async (offset: number, append: boolean) => {
    setLoading(true);
    try {
      const query: DirectoryQuery = { limit: PAGE_SIZE, offset };
      if (debounced.trim()) query.search = debounced.trim();
      if (role !== 'all') query.role = role;
      const page = await fetchDirectory(query);
      setTotal(page.total);
      setHasMore(page.has_more);
      setMembers((prev) => (append ? [...prev, ...page.members] : page.members));
    } catch {
      if (!append) { setMembers([]); setTotal(0); setHasMore(false); }
    } finally {
      setLoading(false);
    }
  }, [debounced, role]);

  // Reload from the first page whenever the search or role filter changes.
  useEffect(() => { load(0, false); }, [load]);

  return (
    <PortalShell>
      <div className="cm-people">
        <header className="cm-people-head">
          <h1>People</h1>
          <p>{total} {total === 1 ? 'person' : 'people'} in your cohort</p>
        </header>

        <div className="cm-people-controls">
          <input
            className="cm-people-search"
            type="search"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search people by name"
          />
          <div className="cm-people-filters" role="group" aria-label="Filter by role">
            {ROLE_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`cm-chip${role === f.key ? ' active' : ''}`}
                aria-pressed={role === f.key}
                onClick={() => setRole(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {members.length === 0 && !loading && (
          <div className="cm-empty">No one matches that search.</div>
        )}

        <div className="cm-people-grid">
          {members.map((m) => (
            <button key={m.id} type="button" className="cm-person-card" onClick={() => setProfileMemberId(m.id)}>
              <div className="cm-person-top">
                <Avatar name={m.display_name} src={m.avatar_url} size="lg" />
                <span className={`cm-dot ${m.presence}`} title={m.presence} />
              </div>
              <div className="cm-person-name">{m.display_name}</div>
              {m.role !== 'student' && (
                <span className={`cm-role-chip ${m.role}`}>
                  {MEMBER_ROLE_META[m.role].emoji} {MEMBER_ROLE_META[m.role].label}
                </span>
              )}
              <LevelBadge level={m.level} size="sm" />
              {m.badges.length > 0 && (
                <div className="cm-person-badges">
                  {m.badges.slice(0, 3).map((b) => (
                    <span key={b.category} className="cm-badge-chip" title={`${b.label} ×${b.count}`}>{b.emoji}</span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>

        {hasMore && (
          <div className="cm-people-more">
            <button type="button" className="te-btn sm" disabled={loading} onClick={() => load(members.length, true)}>
              {loading ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>

      <MemberProfileDrawer memberId={profileMemberId} onClose={() => setProfileMemberId(null)} />
    </PortalShell>
  );
};

export default PeopleDirectoryPage;
