import React, { useCallback, useEffect, useState } from 'react';
import PortalShell from '../today/PortalShell';
import CompanyMomentumDashboard from '../../../components/capability/CompanyMomentumDashboard';
import CompanyMemberDrilldown from './CompanyMemberDrilldown';
import { card, h2, muted, sub, inputStyle, pillBtn, initials, lvlTone, prettyLevel } from './companyUi';
import {
  getOrgOverview, getOrgRoster, getOrgFeed, getOrgMember, inviteMembers,
  OrgOverview, OrgRosterMember, OrgFeedItem, OrgMemberDetail,
} from '../../../services/orgApi';
import { fetchSettings } from '../../../services/portalSettingsApi';

/**
 * CompanyPage (/portal/company) — the REAL, authed manager surface, rendered
 * inside the portal shell. Fetches the live org rollup, roster, and feed; a row
 * click drills into the per-student detail. Every fetch degrades gracefully: a
 * total failure (e.g. a non-manager hitting the route → 403) shows a friendly
 * error, and each section has its own empty state.
 */

const KIND_TONE: Record<OrgFeedItem['kind'], string> = {
  promotion: '#E8920C', artifact: '#5BA63C', evidence: '#7A5AF0', evaluation: '#367895', streak: '#FB2832',
};

function fmtWhen(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  const day = 864e5;
  if (diff >= 0 && diff < day) return 'Today';
  if (diff < 2 * day) return 'Yesterday';
  if (diff < 7 * day) return `${Math.floor(diff / day)} days ago`;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(t);
}

const CompanyPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState(false);
  const [orgName, setOrgName] = useState<string>('Your company');
  const [overview, setOverview] = useState<OrgOverview | null>(null);
  const [roster, setRoster] = useState<OrgRosterMember[]>([]);
  const [feed, setFeed] = useState<OrgFeedItem[]>([]);

  // Drilldown
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrgMemberDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Invite panel
  const [email, setEmail] = useState('');
  const [team, setTeam] = useState('');
  const [sending, setSending] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [invited, setInvited] = useState<{ email: string; team: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setFatal(false);
    const [s, o, r, f] = await Promise.allSettled([
      fetchSettings(), getOrgOverview(), getOrgRoster(), getOrgFeed(),
    ]);
    if (s.status === 'fulfilled') setOrgName(s.value.account.org?.name || 'Your company');
    if (o.status === 'fulfilled') setOverview(o.value);
    if (r.status === 'fulfilled') setRoster(r.value);
    if (f.status === 'fulfilled') setFeed(f.value);
    // Fatal only when the core company reads all fail (e.g. not a manager / 403).
    if (o.status === 'rejected' && r.status === 'rejected') setFatal(true);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openMember = useCallback(async (id: string) => {
    setSelectedId(id); setDetail(null); setDetailError(null); setDetailLoading(true);
    try { setDetail(await getOrgMember(id)); }
    catch { setDetailError('Could not load this member right now. Please try again.'); }
    finally { setDetailLoading(false); }
  }, []);

  const submitInvite = useCallback(async () => {
    const e = email.trim();
    if (!e || !/\S+@\S+\.\S+/.test(e)) { setInviteMsg({ ok: false, text: 'Enter a valid work email.' }); return; }
    setSending(true); setInviteMsg(null);
    try {
      await inviteMembers({ emails: [e], team: team.trim() || undefined });
      setInvited((prev) => [...prev.filter((i) => i.email !== e), { email: e, team: team.trim() || 'Unassigned' }]);
      setEmail(''); setTeam('');
      setInviteMsg({ ok: true, text: `Free invite sent to ${e}.` });
      void load(); // pull the new member into the rollup + roster
    } catch {
      setInviteMsg({ ok: false, text: 'Could not send that invite. Please try again.' });
    } finally { setSending(false); }
  }, [email, team, load]);

  const rosterById = (id: string) => roster.find((m) => m.enrollment_id === id);

  // ── States ─────────────────────────────────────────────────────────────────
  if (loading) {
    return <PortalShell><div style={{ ...muted, padding: 'var(--space-8)', textAlign: 'center' }}>Loading your company…</div></PortalShell>;
  }
  if (fatal) {
    return (
      <PortalShell>
        <div style={{ ...card, maxWidth: 560, margin: 'var(--space-8) auto', textAlign: 'center' }}>
          <h2 style={h2}>We couldn&rsquo;t load your company view</h2>
          <p style={{ ...muted, margin: 'var(--space-3) 0 var(--space-5)' }}>
            This page is for organization managers. If you just created a free management account, try again in a moment.
            Otherwise you can explore the sample company view.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" style={pillBtn} onClick={() => load()}>Try again</button>
            <a href="/try" style={{ ...pillBtn, background: 'var(--surface-subtle)', color: 'var(--text-body)', textDecoration: 'none' }}>See the sample view</a>
          </div>
        </div>
      </PortalShell>
    );
  }

  // Drilldown takes over the main region when a member is selected.
  if (selectedId) {
    return (
      <PortalShell>
        {detailLoading && <div style={{ ...muted, padding: 'var(--space-8)', textAlign: 'center' }}>Loading member…</div>}
        {!detailLoading && detailError && (
          <div style={{ ...card, maxWidth: 520, margin: 'var(--space-8) auto', textAlign: 'center' }}>
            <p style={{ ...muted, marginBottom: 'var(--space-4)' }}>{detailError}</p>
            <button type="button" style={pillBtn} onClick={() => openMember(selectedId)}>Retry</button>
            <button type="button" style={{ background: 'none', border: 'none', color: 'var(--text-link)', cursor: 'pointer', fontWeight: 700, marginLeft: 'var(--space-4)' }} onClick={() => setSelectedId(null)}>Back</button>
          </div>
        )}
        {!detailLoading && detail && (
          <CompanyMemberDrilldown detail={detail} roster={rosterById(selectedId)} onBack={() => setSelectedId(null)} />
        )}
        <style>{`@media (max-width: 860px){ .try-cols { grid-template-columns: 1fr !important; } }`}</style>
      </PortalShell>
    );
  }

  // ── Main company view ────────────────────────────────────────────────────────
  return (
    <PortalShell>
      <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
        <div>
          <div style={{ ...sub, color: 'var(--brand-accent)' }}>Your company</div>
          <h1 style={{ ...h2, fontSize: 'var(--fs-h2)', fontWeight: 900 }}>{orgName}, on the rise in AI</h1>
          <p style={muted}>
            Where you are, how fast you are moving, and when you reach the next level, from the real data your people earn every day.{' '}
            <a href="/portal/today" style={{ color: 'var(--text-link)', fontWeight: 600 }}>Your account also includes free student learning &rarr;</a>
          </p>
        </div>

        {overview
          ? <CompanyMomentumDashboard overview={overview} />
          : <div style={{ ...card, textAlign: 'center' }}><p style={muted}>Your company momentum will appear here as your team logs progress.</p></div>}

        <div style={{ display: 'grid', gap: 'var(--space-6)', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)' }} className="try-cols">
          {/* Accomplishments feed */}
          <div style={card}>
            <h2 style={h2}>Team accomplishments</h2>
            <p style={{ ...muted, marginBottom: 'var(--space-5)' }}>Promotions, validated evidence, evaluations passed, artifacts shipped, and streaks. Click a name for the full picture.</p>
            {feed.length === 0 ? (
              <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-subtle)' }}>No activity yet. Invite your team to fill this with live progress.</div>
            ) : (
              <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {feed.map((f, i) => {
                  const tone = lvlTone(rosterById(f.enrollment_id)?.rank ?? 0);
                  return (
                    <li key={`${f.enrollment_id}-${i}`} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 'var(--space-4)', paddingBottom: i === feed.length - 1 ? 0 : 'var(--space-5)' }}>
                      <button type="button" onClick={() => openMember(f.enrollment_id)} title={`Open ${f.who}`} style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: 'pointer', background: `color-mix(in srgb, ${tone} 16%, white)`, color: 'var(--text-strong)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'var(--fs-caption)' }}>{initials(f.who)}</button>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                          <button type="button" onClick={() => openMember(f.enrollment_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 700, color: 'var(--text-strong)', fontSize: 'var(--fs-body-sm)' }}>{f.who}</button>
                          <span style={{ fontSize: 'var(--fs-caption)', color: '#fff', background: KIND_TONE[f.kind], padding: '1px 8px', borderRadius: 'var(--radius-pill)', fontWeight: 700, textTransform: 'capitalize' }}>{f.kind}</span>
                          <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-subtle)' }}>· {fmtWhen(f.when)}</span>
                        </div>
                        <div style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--text-body)' }}>{f.text}</div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          {/* Roster */}
          <div style={card}>
            <h2 style={h2}>Where your team sits</h2>
            <p style={{ ...muted, marginBottom: 'var(--space-4)' }}>Builder level, Architect Readiness, and Builder-XP velocity. Click anyone to drill in.</p>
            {roster.length === 0 ? (
              <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-subtle)' }}>No members yet. Send your first free invite below.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {roster.map((mm) => (
                  <button key={mm.enrollment_id || mm.name} type="button" onClick={() => mm.enrollment_id && openMember(mm.enrollment_id)} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 'var(--space-3)', alignItems: 'center', textAlign: 'left', background: 'none', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', padding: 'var(--space-2)' }} onMouseOver={(e) => { e.currentTarget.style.background = 'var(--surface-subtle)'; }} onMouseOut={(e) => { e.currentTarget.style.background = 'none'; }}>
                    <span style={{ display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: '50%', background: `color-mix(in srgb, ${lvlTone(mm.rank)} 16%, white)`, color: 'var(--text-strong)', fontWeight: 800, fontSize: 11 }}>{initials(mm.name)}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 'var(--fs-body-sm)', fontWeight: 600, color: 'var(--text-strong)' }}>{mm.name}</div>
                      <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-subtle)' }}>{mm.team || 'Unassigned'} · {mm.readiness}% ready · +{mm.builder_xp_week} bXP/wk</div>
                    </div>
                    <span style={{ fontSize: 'var(--fs-caption)', color: '#fff', background: lvlTone(mm.rank), padding: '2px 10px', borderRadius: 'var(--radius-pill)', fontWeight: 700 }}>{prettyLevel(mm.level)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Invite panel */}
        <div id="invite" style={{ ...card, borderTop: '4px solid #5BA63C' }}>
          <h2 style={h2}>Send free test invites to your employees</h2>
          <p style={{ ...muted, marginBottom: 'var(--space-4)' }}>Send free test invites so your team can try it too. Their progress appears on your dashboard as they go. Tag their team so it shows up in your reporting.</p>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: invited.length || inviteMsg ? 'var(--space-4)' : 0 }}>
            <input style={{ ...inputStyle, flex: 2, minWidth: 200 }} type="email" placeholder="teammate@company.com" value={email} disabled={sending} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitInvite(); }} />
            <input style={{ ...inputStyle, flex: 1, minWidth: 140 }} type="text" placeholder="Team / department (optional)" value={team} disabled={sending} onChange={(e) => setTeam(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitInvite(); }} />
            <button style={{ ...pillBtn, opacity: sending ? 0.7 : 1 }} onClick={submitInvite} disabled={sending} data-track="company_invite_add">{sending ? 'Sending…' : 'Send free test invite'}</button>
          </div>
          {inviteMsg && <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: inviteMsg.ok ? 'var(--status-success)' : 'var(--status-danger, #C20E1E)', marginBottom: invited.length ? 'var(--space-3)' : 0 }}>{inviteMsg.text}</div>}
          {invited.length > 0 && (
            <div>
              <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--text-strong)', marginBottom: 'var(--space-2)' }}>{invited.length} invited this session · free member accounts</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>{invited.map((i) => (<span key={i.email} style={{ fontSize: 'var(--fs-caption)', background: 'var(--surface-green-subtle)', color: 'var(--status-success)', padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontWeight: 600 }}>{i.email} · {i.team}</span>))}</div>
            </div>
          )}
          <div style={{ marginTop: 'var(--space-5)', paddingTop: 'var(--space-4)', borderTop: 'var(--border-1) solid var(--border-subtle)', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'baseline' }}>
            <a href="/pricing" data-track="company_activate_licenses" style={{ color: 'var(--text-link)', fontWeight: 700, fontSize: 'var(--fs-body-sm)', textDecoration: 'none' }}>Activate licenses for instant access &rarr;</a>
            <span style={{ ...muted, fontSize: 'var(--fs-caption)' }}>when you are ready</span>
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 860px){ .try-cols { grid-template-columns: 1fr !important; } }`}</style>
    </PortalShell>
  );
};

export default CompanyPage;
