import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getOrgRoster, inviteMembers } from '../../../services/orgApi';
import type { OrgRosterMember } from '../../../services/orgApi';
import type { CampusPresence } from '../campusApi';
import { useCampusTeam } from '../home/useCampusTeam';
import { wd } from '../home/conciergeCopy';
import { INVITE_MAX, csvFileName, onCampusIds, parseInviteEmails, partnerRows, rosterCsv } from './teamRoster';
import './partner.css';

/**
 * C23 WP-9 (Q12: "Dashboard, invite and CSV now from /api/portal/org/*"): the Partner Office's team panel. The roster
 * (GET /api/portal/org/members), each person's readiness and whether they are on campus now, a privacy note, an invite sheet
 * (POST /api/portal/org/invites) and a CSV of the roster built in the browser. Seats, certifications and Demo Day are not here:
 * the server has no seat count tied to a company, so the panel shows only what it can prove.
 */
type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready'; roster: OrgRosterMember[] };

export const PARTNER_ROWS_SHOWN = 8;

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function InviteSheet({ onSent }: { onSent: (n: number) => void }): React.ReactElement {
  const [text, setText] = useState('');
  const [team, setTeam] = useState('');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const { emails, bad } = parseInviteEmails(text);
    if (bad.length) { setMsg({ ok: false, text: `Check ${bad.length === 1 ? 'this address' : 'these addresses'}: ${bad.slice(0, 3).join(', ')}` }); return; }
    if (!emails.length) { setMsg({ ok: false, text: 'Enter at least one work email.' }); return; }
    if (emails.length > INVITE_MAX) { setMsg({ ok: false, text: `Up to ${INVITE_MAX} at a time, please.` }); return; }
    setSending(true); setMsg(null);
    try {
      await inviteMembers({ emails, team: team.trim() || undefined });
      setText(''); setTeam('');
      setMsg({ ok: true, text: `Invite sent to ${emails.length === 1 ? emails[0] : `${emails.length} people`}.` });
      onSent(emails.length);
    } catch {
      setMsg({ ok: false, text: 'Could not send the invite. Please try again.' });
    } finally { setSending(false); }
  };
  return (
    <form className="cm-pt-invite" onSubmit={send} data-testid="cm-pt-invite" onClick={(e) => e.stopPropagation()}>
      <label htmlFor="cm-pt-emails">Invite people</label>
      <textarea id="cm-pt-emails" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="name@company.com, another@company.com" data-testid="cm-pt-emails" />
      <div className="row">
        <input aria-label="Team (optional)" value={team} onChange={(e) => setTeam(e.target.value)} placeholder="Team (optional)" maxLength={120} data-testid="cm-pt-team" />
        <button type="submit" className="cm-btn-red" disabled={sending} data-testid="cm-pt-send">{sending ? 'Sending…' : 'Send invite'}</button>
      </div>
      {msg && <p className={msg.ok ? 'ok' : 'err'} role={msg.ok ? 'status' : 'alert'} data-testid="cm-pt-msg">{msg.text}</p>}
    </form>
  );
}

export default function PartnerTeam({ presence, onOpen, workplace = false }: { presence: CampusPresence | null | undefined; onOpen: (route: string) => void; workplace?: boolean }): React.ReactElement {
  const w = (t: string) => wd(t, workplace); // Workplace names: Training Room, at HQ
  const company = useCampusTeam(true)?.company ?? null; // names the CSV file; "my-team-…" without a real company name
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [inviting, setInviting] = useState(false);
  const fetchRoster = useCallback(() => {
    let alive = true;
    getOrgRoster().then((roster) => { if (alive) setLoad({ state: 'ready', roster }); }).catch(() => { if (alive) setLoad({ state: 'error' }); });
    return () => { alive = false; };
  }, []);
  useEffect(() => fetchRoster(), [fetchRoster]);
  const here = useMemo(() => onCampusIds(presence), [presence]);
  const roster = load.state === 'ready' ? load.roster : [];
  const rows = useMemo(() => partnerRows(roster, here), [roster, here]);
  const onNow = rows.filter((r) => r.onCampus).length;
  return (
    <div className="cm-pt" data-testid="cm-partner-team">
      <div className="cm-sec">Your team{load.state === 'ready' && roster.length ? ` · ${roster.length} ${roster.length === 1 ? 'person' : 'people'}${presence ? w(` · ${onNow} on campus now`) : ''}` : ''}</div>
      <p className="cm-pt-what">{w('They learn in the Classroom, build in the Project Studio and prepare for certification here. You see each person’s readiness and whether they are on campus.')}</p>
      {load.state === 'loading' && <p className="cm-pt-none" data-testid="cm-pt-loading">Loading your team…</p>}
      {load.state === 'error' && <p className="cm-pt-none" role="alert" data-testid="cm-pt-error">Your team could not be loaded. <button type="button" className="cm-linkbtn" onClick={() => { setLoad({ state: 'loading' }); fetchRoster(); }}>Try again</button></p>}
      {load.state === 'ready' && !rows.length && <p className="cm-pt-none" data-testid="cm-pt-empty">Nobody on your team yet. Invite them below.</p>}
      {rows.length > 0 && (
        <ul className="cm-pt-rows" data-testid="cm-pt-rows">
          {rows.slice(0, PARTNER_ROWS_SHOWN).map((r) => (
            <li key={r.id} data-testid="cm-pt-row">
              <span className="n"><b>{r.name}</b><small>{r.team}</small></span>
              <span className="pct" aria-label={`Readiness ${r.readiness} percent`}><i style={{ width: `${Math.max(3, r.readiness)}%` }} aria-hidden="true" /><em>{r.readiness}%</em></span>
              <span className={`pill${r.onCampus ? ' is-on' : ''}`} data-testid="cm-pt-pill">{r.onCampus ? (workplace ? 'At HQ' : 'On campus') : 'Away'}</span>
            </li>
          ))}
        </ul>
      )}
      {rows.length > PARTNER_ROWS_SHOWN && <p className="cm-pt-more">and {rows.length - PARTNER_ROWS_SHOWN} more on your company page</p>}
      <p className="cm-pt-privacy" data-testid="cm-pt-privacy">Private: only your company's managers can see this list and its download.</p>
      <div className="cm-pt-acts">
        <button type="button" className="cm-btn-line" onClick={(e) => { e.stopPropagation(); setInviting((v) => !v); }} aria-expanded={inviting} data-testid="cm-pt-invite-toggle">{inviting ? 'Close invite' : 'Invite people'}</button>
        <button type="button" className="cm-btn-line" disabled={!roster.length} onClick={(e) => { e.stopPropagation(); download(csvFileName(company, new Date()), rosterCsv(roster, here)); }} data-testid="cm-pt-csv">Download CSV</button>
        <button type="button" className="cm-btn-line" onClick={(e) => { e.stopPropagation(); onOpen('/portal/company'); }} data-testid="cm-pt-company">Company page</button>
      </div>
      {inviting && <InviteSheet onSent={() => fetchRoster()} />}
    </div>
  );
}
