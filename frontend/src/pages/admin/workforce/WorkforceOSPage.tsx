import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../../utils/api';
import { workforceCss, readTheme, writeTheme } from './themeKit';
import StatusBadge from '../../../components/admin/shell/StatusBadge';
import { getTicketTypeTone, getTicketTypeLabel } from '../../../utils/ticketTypeMeta';
import { fmtCentralDateTime } from '../../../utils/centralTime';
import OrgChartSection from './orgchart/OrgChartSection';

/**
 * WorkforceOSPage — the AI Workforce Operating System. An executive opens one
 * page and observes a functioning AI organization: the Chief of Staff briefing,
 * the daily leadership meeting (each Director speaks + action items get
 * assigned), the REAL org chart (Human Employees -> AI Leadership -> AI Staff,
 * see orgchart/OrgChartSection.tsx), cross-department communication, and
 * workforce analytics. Light-default, dark-supported, instant theme switch.
 * Consumes /api/admin/workforce/* + the frozen Ops Center.
 *
 * Org-chart hierarchy build (2026-08-19): the old "AI Executive Team" roster
 * (a static, fictional AI_ORG director list — "Ada Sterling, CEO" etc., not
 * real people) and the separate real "Live Agents" grid both answered "who's
 * in this org" for the same page, one fictionally and one flatly. Both are
 * replaced by OrgChartSection below, the one real, drill-down answer. The
 * Chief of Staff briefing / Daily Leadership Meeting sections stay unchanged —
 * `emps`/`byslug()`/`cos` are still real dependencies of those sections, not
 * dead code (see their own usage below).
 */

interface Employee { slug: string; name: string; role: string; department: string; avatar: string; supervisor: string | null; mission: string; ops_domain: string | null; workload: number; status: string }
interface Meeting { meeting_date: string; agenda: any; contributions: Array<{ slug: string; name: string; role: string; line: string }>; action_items: Array<{ owner: string; title: string; severity: string; rec_key: string }>; participants: string[] }

interface LiveAgentActivityEvent { agent_id: string; agent_name: string; agent_display_name: string; ticket_id: string; ticket_number: number | null; title: string; type: string; status: string; priority: string; occurred_at: string | null }

const initials = (n: string) => n.split(/\s+/).slice(0, 2).map((w) => w[0]).join('');
const av = (color: string, name: string, cls = '') => <span className={`wf-av ${cls}`} style={{ background: color }}>{initials(name)}</span>;

const WorkforceOSPage: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>(readTheme);
  const [emps, setEmps] = useState<Employee[]>([]);
  const [brief, setBrief] = useState<any>(null);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [liveAgentActivity, setLiveAgentActivity] = useState<LiveAgentActivityEvent[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setBusy('load'); setError('');
    try {
      const [r, b, m, msg, an, lt] = await Promise.all([
        api.get('/api/admin/workforce/roster'),
        api.get('/api/admin/workforce/briefing'),
        api.post('/api/admin/workforce/meeting/daily'),
        api.get('/api/admin/workforce/messages'),
        api.get('/api/admin/workforce/analytics'),
        api.get('/api/admin/workforce/live-agents/activity'),
      ]);
      setEmps(r.data.employees); setBrief(b.data); setMeeting(m.data.meeting); setMessages(msg.data.messages); setAnalytics(an.data);
      setLiveAgentActivity(lt.data.activity || []);
    } catch (e: any) { setError(e?.response?.data?.error || 'Could not load the AI Workforce.'); } finally { setBusy(''); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const toggleTheme = () => { const t = theme === 'dark' ? 'light' : 'dark'; setTheme(t); writeTheme(t); };
  const byslug = (slug: string) => emps.find((e) => e.slug === slug);

  if (error) return <div className="wf" data-theme={theme}><style>{workforceCss}</style><div className="wf-wrap"><div className="wf-err">{error} <button className="wf-btn" onClick={load}>Retry</button></div></div></div>;

  const cos = byslug('chief_of_staff');
  const health = brief?.health;

  return (
    <div className="wf" data-theme={theme}>
      <style>{workforceCss}</style>
      <div className="wf-wrap">
        <header className="wf-top">
          <div><div className="wf-kick">The School Runs on AI</div><h1 className="wf-h1">AI Workforce</h1></div>
          <div className="wf-actions">
            <button className="wf-btn pri" disabled={busy === 'load'} onClick={load}>{busy === 'load' ? 'Convening…' : '↻ Run standup'}</button>
            <button className="wf-toggle" title={theme === 'dark' ? 'Light mode' : 'Dark mode'} onClick={toggleTheme}>
              {theme === 'dark'
                ? <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="2" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                : <svg viewBox="0 0 24 24" fill="none"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>}
            </button>
          </div>
        </header>

        {!brief ? <div className="wf-muted" style={{ padding: 40 }}>Assembling the workforce…</div> : (
        <>
        <div className="wf-grid">
          {/* Chief of Staff briefing */}
          <section className="wf-card">
            <div className="wf-lab">Chief of Staff · morning briefing</div>
            <div style={{ display: 'flex', gap: 11, alignItems: 'center', marginBottom: 10 }}>{cos && av(cos.avatar, cos.name)}<div><b>{cos?.name}</b> <span className="wf-muted">· {cos?.role}</span></div></div>
            <h2 className="wf-morning">{brief.briefing.good_morning}</h2>
            <p className="wf-muted" style={{ margin: '0 0 12px' }}>{brief.briefing.yesterday}</p>
            <div className="wf-cols">
              <div><div className="wf-sub">Today's priorities</div><ul className="wf-list">{brief.briefing.priorities.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul></div>
              <div><div className="wf-sub">Risks</div><ul className="wf-list risk">{brief.briefing.risks.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul>
                <div className="wf-sub" style={{ marginTop: 10 }}>Wins</div><ul className="wf-list win">{brief.briefing.wins.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul></div>
            </div>
          </section>
          {/* School health */}
          <section className="wf-card" style={{ textAlign: 'center' }}>
            <div className="wf-lab">School Health</div>
            {health && <><div className="wf-hp" style={{ justifyContent: 'center' }}><b>{health.overall}</b><span>/100 · {health.band}</span></div>
              <div style={{ marginTop: 12, textAlign: 'left' }}>{health.subs.slice(0, 8).map((s: any) => (
                <div key={s.key} style={{ display: 'grid', gridTemplateColumns: '86px 1fr 26px', gap: 8, alignItems: 'center', fontSize: 12, marginBottom: 6 }}>
                  <span className="wf-muted">{s.label}</span><span style={{ height: 6, borderRadius: 999, background: 'var(--panel2)', overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: `${s.score}%`, background: s.score >= 70 ? 'var(--leaf)' : s.score >= 45 ? 'var(--amber)' : 'var(--cherry)' }} /></span><span className="wf-mono" style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>{s.score}</span>
                </div>))}</div></>}
          </section>
        </div>

        {/* Daily leadership meeting */}
        {meeting && (
          <section className="wf-card" style={{ marginTop: 16 }}>
            <div className="wf-lab">Daily Leadership Meeting · {meeting.meeting_date} · {meeting.participants.length} attending</div>
            <div className="wf-grid" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
              <div>
                <div className="wf-sub">Around the table</div>
                {meeting.contributions.map((c) => { const e = byslug(c.slug); return (
                  <div className="wf-mtg" key={c.slug}><span className="mav" style={{ background: e?.avatar || '#367895' }}>{initials(c.name)}</span><div><b>{c.name}</b> <span className="wf-muted">· {c.role}</span><div className="wf-muted" style={{ marginTop: 2 }}>{c.line}</div></div></div>
                ); })}
              </div>
              <div>
                <div className="wf-sub">Action items assigned</div>
                {meeting.action_items.map((a, i) => { const e = byslug(a.owner); return (
                  <div className="wf-ai" key={i}><span className="who">{e?.name || a.owner}</span><div><span className={`wf-sev ${a.severity}`}>{a.severity}</span>{a.title}</div></div>
                ); })}
                {(meeting.agenda?.cross_department || []).length > 0 && <><div className="wf-sub" style={{ marginTop: 12 }}>Cross-department</div><ul className="wf-list">{meeting.agenda.cross_department.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></>}
              </div>
            </div>
          </section>
        )}

        {/* The real org chart — Human Employees -> AI Leadership -> AI Staff
            (org-chart hierarchy build, 2026-08-19). Replaces the old fictional
            AI_ORG director roster + the separate real Live Agents grid: both
            answered "who's in this org" for this page, one fictionally, one
            flatly. Self-fetching (owns its own /api/admin/workforce/org-chart
            call) — see orgchart/OrgChartSection.tsx. */}
        <OrgChartSection />

        {/* Activity Timeline — real, chronological ProofDesk ticket events across
            every AI Leadership/AI Staff agent in the org chart above. Driven
            ONLY by real ticket data (see liveAgentsService.ts) — an
            independent fetch from OrgChartSection's own data, unaffected by
            the org-chart hierarchy build. */}
        <section className="wf-card" style={{ marginTop: 16 }}>
          <div className="wf-lab">Activity Timeline</div>
          {liveAgentActivity.length === 0 ? (
            <div className="wf-muted">No activity yet.</div>
          ) : (
            liveAgentActivity.map((ev) => (
              // Clickable through to the ticket — reuses the exact same route
              // pattern AgentDetailPage.tsx's Ticket activity table already
              // uses (`/admin/tickets?open=<id>`) rather than inventing a
              // second navigation pattern.
              <Link
                to={`/admin/tickets?open=${ev.ticket_id}`}
                className="wf-msg"
                key={ev.ticket_id}
                style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
              >
                <div className="rt">{ev.agent_display_name} · TK-{ev.ticket_number ?? '—'} · {ev.occurred_at ? fmtCentralDateTime(ev.occurred_at) : ''}</div>
                <div className="sb" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {ev.title}
                  <StatusBadge label={getTicketTypeLabel(ev.type)} tone={getTicketTypeTone(ev.type)} />
                </div>
                <div className="wf-muted">{ev.status}</div>
              </Link>
            ))
          )}
        </section>

        {/* Communication + analytics */}
        <div className="wf-grid" style={{ marginTop: 16 }}>
          <section className="wf-card">
            <div className="wf-lab">Workforce communication</div>
            {messages.length === 0 ? <div className="wf-muted">No messages yet — run a standup.</div> : messages.slice(0, 8).map((m, i) => (
              <div className="wf-msg" key={i}><div className="rt">{m.from_name} → {m.to_name}</div><div className="sb">{m.subject}</div><div className="wf-muted">{m.body}</div></div>
            ))}
          </section>
          <section className="wf-card">
            <div className="wf-lab">Workforce analytics</div>
            {analytics && <div className="wf-anal">
              <div className="a"><b>{analytics.employees}</b><span>employees</span></div>
              <div className="a"><b>{analytics.tasks_total}</b><span>tasks</span></div>
              <div className="a"><b>{analytics.by_status?.completed || 0}</b><span>completed</span></div>
              <div className="a"><b>{analytics.meetings}</b><span>meetings</span></div>
              <div className="a"><b>{analytics.messages}</b><span>messages</span></div>
            </div>}
          </section>
        </div>
        </>
        )}
      </div>
    </div>
  );
};

export default WorkforceOSPage;
