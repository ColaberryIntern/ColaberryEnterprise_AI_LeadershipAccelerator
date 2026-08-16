import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getOrgRoster, inviteMembers, OrgRosterMember } from '../../../services/orgApi';

/**
 * TeamSection — the business-account replacement for the Enrollment tab.
 *
 * A manager holds a dual account: their own free student enrollment plus the
 * organization. The Enrollment tab reserves a cohort seat for *them*, which is
 * the wrong action at this level — a manager places their team, and enrolling
 * themselves from Settings would drop them into a cohort they did not choose.
 * This is the equivalent action at company scale: invite people, see who is on
 * the roster.
 *
 * Deliberately a SUMMARY, not a second company dashboard. /portal/company already
 * owns readiness, XP, the feed and per-member drilldown; duplicating that here
 * would mean two surfaces to keep in step. This answers "who is on my team and
 * how do I add someone", then links onward.
 */

interface Props {
  onToast: (message: string, kind?: 'ok' | 'err') => void;
}

function TeamSection({ onToast }: Props): React.ReactElement {
  const [roster, setRoster] = useState<OrgRosterMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [emails, setEmails] = useState('');
  const [team, setTeam] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRoster(await getOrgRoster());
      setLoadError(null);
    } catch {
      // A failed load and an empty team are different facts and must not look
      // the same — the admin leads page shipped that bug and told an operator
      // their database was empty when the request had simply failed.
      setLoadError('Could not load your team. This is a load failure, not an empty roster.');
      setRoster([]);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    // Split on comma / whitespace / newline so a pasted column from a
    // spreadsheet works as readily as a typed list.
    const list = emails
      .split(/[\s,;]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (!list.length) {
      onToast('Enter at least one email address', 'err');
      return;
    }

    setBusy(true);
    try {
      await inviteMembers({ emails: list, team: team.trim() || undefined });
      setEmails('');
      setTeam('');
      // Re-read rather than optimistically appending: the server dedupes by
      // (org_id, email), so someone already on the roster produces no new row
      // and an optimistic append would show a duplicate that does not exist.
      await load();
      onToast(`Invited ${list.length} ${list.length === 1 ? 'teammate' : 'teammates'}`);
    } catch {
      onToast('Could not send those invitations', 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="te-card set-section">
        <h2 className="set-h2">Invite your team</h2>
        <p className="set-hint">
          Each teammate gets their own free builder account. They receive an email with an
          activation link.
        </p>

        <form onSubmit={onInvite} style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          <label className="set-field">
            <span className="set-label">Email addresses</span>
            <textarea
              className="set-input"
              rows={3}
              placeholder="dana@company.com, sam@company.com"
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              disabled={busy}
            />
            <span className="set-hint">Separate with commas, spaces or new lines.</span>
          </label>

          <label className="set-field">
            <span className="set-label">Team or department (optional)</span>
            <input
              className="set-input"
              placeholder="Operations"
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              disabled={busy}
            />
          </label>

          <div>
            <button type="submit" className="set-btn primary" disabled={busy || !emails.trim()}>
              {busy ? 'Sending…' : 'Send invitations'}
            </button>
          </div>
        </form>
      </section>

      <section className="te-card set-section">
        <h2 className="set-h2">Your team ({roster.length})</h2>

        {loading ? (
          <p className="set-hint">Loading…</p>
        ) : loadError ? (
          <p className="set-hint" style={{ color: 'var(--status-danger, #c0392b)' }}>
            {loadError}
          </p>
        ) : roster.length === 0 ? (
          <p className="set-hint">
            Nobody has joined yet. Invite a teammate above and they will appear here.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'grid', gap: 8 }}>
            {roster.map((m) => (
              <li
                key={m.enrollment_id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  border: '1px solid var(--border-subtle, #e2e8f0)',
                  borderRadius: 8,
                }}
              >
                <span>
                  <strong>{m.name}</strong>
                  {m.team ? <span className="set-hint"> · {m.team}</span> : null}
                </span>
                <span className="set-hint">{prettyLevel(m.level)}</span>
              </li>
            ))}
          </ul>
        )}

        <p className="set-hint" style={{ marginTop: 16 }}>
          <Link to="/portal/company">Open the full company view →</Link> for readiness, evidence
          and per-person progress.
        </p>
      </section>
    </>
  );
}

/** `ai_aware_1` → `AI Aware 1`. Mirrors companyUi's treatment of the same field. */
function prettyLevel(level: string): string {
  if (!level) return '—';
  return level
    .split('_')
    .map((w) => (w.toLowerCase() === 'ai' ? 'AI' : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

export default TeamSection;
