import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader, SectionCard } from '../../components/admin/shell';
import {
  fetchCommunityMembers, setCommunityMemberRole, AdminCommunityMember, CommunityMemberRole,
} from '../../services/communityAdminApi';

const ROLES: CommunityMemberRole[] = ['student', 'mentor', 'staff'];
const ROLE_LABEL: Record<CommunityMemberRole, string> = { student: 'Member', mentor: 'Mentor', staff: 'Staff' };

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
                <tr><th>Name</th><th>Email</th><th style={{ width: 200 }}>Role</th></tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td className="fw-semibold">{m.display_name}</td>
                    <td className="text-muted small">{m.email ?? '—'}</td>
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
