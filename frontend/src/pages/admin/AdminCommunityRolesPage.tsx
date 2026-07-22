import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader, SectionCard } from '../../components/admin/shell';
import {
  fetchCommunityMembers, setCommunityMemberRole, setCommunityMemberFreeAccess, fetchViewAsUrl,
  AdminCommunityMember, CommunityMemberRole,
} from '../../services/communityAdminApi';

const ROLES: CommunityMemberRole[] = ['student', 'mentor', 'staff'];
const ROLE_LABEL: Record<CommunityMemberRole, string> = { student: 'Member', mentor: 'Mentor', staff: 'Staff' };

// Floored "X ago" label (GitHub-style: "3 days ago" means >=3 and <4 days).
// Pure — computed from the client clock at render; the roster arrives ordered
// newest-first from the backend, so this only labels, it does not sort.
function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const secs = Math.floor((Date.now() - then) / 1000);
  if (secs < 45) return 'just now';
  const units: [number, string][] = [
    [60, 'minute'], [60, 'hour'], [24, 'day'], [7, 'week'], [4.348, 'month'], [12, 'year'],
  ];
  let value = secs / 60; // minutes
  let label = 'minute';
  for (let i = 1; i < units.length; i += 1) {
    if (value < units[i][0]) break;
    value /= units[i][0];
    label = units[i][1];
  }
  const n = Math.floor(value);
  return `${n} ${label}${n === 1 ? '' : 's'} ago`;
}

// Full local date/time for the cell tooltip (exact sign-up moment).
function exactSignup(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d.toLocaleString();
}

/**
 * Community Roles — assign the mentor/staff role that shows on a member's card
 * in the People directory. Everyone defaults to Member; this is the only surface
 * that promotes them. Backed by /api/admin/community/members (list) +
 * PATCH /api/admin/community/members/:id/role.
 */
export default function AdminCommunityRolesPage() {
  const [members, setMembers] = useState<AdminCommunityMember[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      setMembers(await fetchCommunityMembers(q));
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to load members');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(''); }, [load]);

  const onSearch = (e: React.FormEvent) => { e.preventDefault(); load(search); };

  const onRole = async (m: AdminCommunityMember, role: CommunityMemberRole) => {
    if (role === m.role) return;
    setSavingId(m.id);
    setNotice(null);
    setError(null);
    try {
      const updated = await setCommunityMemberRole(m.id, role);
      setMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, role: updated } : x)));
      setNotice(`${m.display_name} is now ${ROLE_LABEL[updated]}.`);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to update role');
    } finally {
      setSavingId(null);
    }
  };

  // Grant/revoke a comped "Free Access" seat ($0, normal student — not staff).
  const onFreeAccess = async (m: AdminCommunityMember, grant: boolean) => {
    setSavingId(m.id);
    setNotice(null);
    setError(null);
    try {
      const free = await setCommunityMemberFreeAccess(m.id, grant);
      setMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, free_access: free } : x)));
      setNotice(`${m.display_name} ${free ? 'now has Free Access' : 'no longer has Free Access'}.`);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to update Free Access');
    } finally {
      setSavingId(null);
    }
  };

  // Open the member's portal in a new tab, READ-ONLY (server-enforced). Mints a
  // fresh read-only token per click.
  const onViewAs = async (m: AdminCommunityMember) => {
    if (!m.enrollment_id) { setError(`${m.display_name} has no enrollment to view.`); return; }
    setSavingId(m.id);
    setError(null);
    try {
      const url = await fetchViewAsUrl(m.enrollment_id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to open read-only view');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <>
      <PageHeader title="Community Roles" subtitle="Assign the mentor / staff role shown on member cards in the People directory. Everyone starts as Member." />
      <SectionCard>
        <form className="row g-2 align-items-end mb-3" onSubmit={onSearch}>
          <div className="col-md-6">
            <label className="form-label small fw-medium">Search by name</label>
            <input
              className="form-control form-control-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Start typing a name…"
            />
          </div>
          <div className="col-md-2">
            <button type="submit" className="btn btn-sm btn-outline-primary w-100">Search</button>
          </div>
        </form>

        {error && <div className="alert alert-danger py-2">{error}</div>}
        {notice && <div className="alert alert-success py-2">{notice}</div>}

        {loading ? (
          <div className="text-muted small">Loading members…</div>
        ) : members.length === 0 ? (
          <div className="text-muted small">No members match that search.</div>
        ) : (
          <div className="table-responsive">
            <table className="table table-sm align-middle mb-0">
              <thead>
                <tr><th>Name</th><th>Email</th><th style={{ width: 140 }}>Signed up</th><th style={{ width: 120 }}>Free Access</th><th style={{ width: 200 }}>Role</th><th style={{ width: 110 }}>View as</th></tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td className="fw-semibold">{m.display_name}</td>
                    <td className="text-muted small">{m.email ?? '—'}</td>
                    <td className="text-muted small" title={exactSignup(m.signed_up_at)}>{timeAgo(m.signed_up_at)}</td>
                    <td>
                      <div className="form-check form-switch mb-0">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          role="switch"
                          checked={m.free_access}
                          disabled={savingId === m.id}
                          onChange={(e) => onFreeAccess(m, e.target.checked)}
                          aria-label={`Free Access for ${m.display_name}`}
                        />
                      </div>
                    </td>
                    <td>
                      <select
                        className="form-select form-select-sm"
                        value={m.role}
                        disabled={savingId === m.id}
                        onChange={(e) => onRole(m, e.target.value as CommunityMemberRole)}
                        aria-label={`Role for ${m.display_name}`}
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        disabled={savingId === m.id || !m.enrollment_id}
                        onClick={() => onViewAs(m)}
                        title={`Open ${m.display_name}'s portal, read-only`}
                      >
                        <i className="ri-eye-line me-1" aria-hidden="true"></i>View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}
