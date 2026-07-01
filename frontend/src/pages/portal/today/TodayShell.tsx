import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import './TodayShell.css';
import {
  fetchPoints, fetchSchedule, fetchOnboardingProfile, rsvpOpenHouse, ingestBackground,
  levelFor, PointsSummary, OnboardingSchedule, OnboardingProfileView,
} from '../../../services/onboardingApi';

function readParticipant(): { email: string; initials: string } {
  try {
    const t = localStorage.getItem('participant_token');
    if (!t) return { email: '', initials: 'YOU' };
    const p = JSON.parse(atob(t.split('.')[1] || ''));
    const email: string = p.email || '';
    const initials = (email.split('@')[0] || 'you').slice(0, 2).toUpperCase();
    return { email, initials };
  } catch { return { email: '', initials: 'YOU' }; }
}

function firstClassTargetMs(fc: OnboardingSchedule['first_class']): number | null {
  if (!fc || !fc.start_date) return null;
  // Best-effort: date + optional core_time (frontend renders the live countdown).
  const t = new Date(`${fc.start_date}T00:00:00`).getTime();
  return isNaN(t) ? null : t;
}

function countdown(targetMs: number | null, nowMs: number): { d: number; h: number; m: number; s: number } | null {
  if (targetMs == null) return null;
  let diff = targetMs - nowMs;
  if (diff < 0) diff = 0;
  return {
    d: Math.floor(diff / 864e5),
    h: Math.floor((diff % 864e5) / 36e5),
    m: Math.floor((diff % 36e5) / 6e4),
    s: Math.floor((diff % 6e4) / 1e3),
  };
}

const NAV = [
  { label: 'Today', to: '/portal/today', active: true },
  { label: 'Projects', to: '/portal/project-builder', active: false },
  { label: 'Classroom', to: '/portal/curriculum', active: false },
  { label: 'Sessions', to: '/portal/sessions', active: false },
  { label: 'Progress', to: '/portal/progress', active: false },
  { label: 'Portfolio', to: '/portal/project/portfolio', active: false },
];

const TodayShell: React.FC = () => {
  const [points, setPoints] = useState<PointsSummary | null>(null);
  const [schedule, setSchedule] = useState<OnboardingSchedule | null>(null);
  const [profile, setProfile] = useState<OnboardingProfileView | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [toast, setToast] = useState<string>('');
  const [showResume, setShowResume] = useState(false);
  const [resumeText, setResumeText] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [busy, setBusy] = useState(false);

  const me = useMemo(readParticipant, []);

  const loadAll = useCallback(async () => {
    const [p, s, pr] = await Promise.allSettled([fetchPoints(), fetchSchedule(), fetchOnboardingProfile()]);
    if (p.status === 'fulfilled') setPoints(p.value);
    if (s.status === 'fulfilled') setSchedule(s.value);
    if (pr.status === 'fulfilled') setProfile(pr.value);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const flash = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(''), 2600); };

  const total = points?.total ?? 0;
  const lvl = levelFor(total);
  const oh = schedule?.next_open_house || null;
  const ohCd = countdown(oh ? new Date(oh.starts_at).getTime() : null, now);
  const fcCd = countdown(firstClassTargetMs(schedule?.first_class ?? null), now);
  const hasBackground = !!(profile && (profile.has_resume || profile.linkedin_url));
  const rsvped = !!schedule?.my_rsvp;

  const doRsvp = async () => {
    if (!oh || busy) return;
    setBusy(true);
    try {
      const r = await rsvpOpenHouse(oh.id);
      await loadAll();
      flash(r.awarded ? `RSVP confirmed — +${r.points} points` : 'You are already RSVP\'d');
    } catch { flash('Could not RSVP right now'); } finally { setBusy(false); }
  };

  const doIngest = async () => {
    if (busy || (!resumeText.trim() && !linkedin.trim())) return;
    setBusy(true);
    try {
      const r = await ingestBackground({ resume_text: resumeText.trim() || undefined, linkedin_url: linkedin.trim() || undefined });
      await loadAll();
      setShowResume(false); setResumeText(''); setLinkedin('');
      flash(r.parsed ? 'Analyzed — your project is pre-filled from your background' : 'Saved — we will personalize as you go');
    } catch { flash('Could not analyze that right now'); } finally { setBusy(false); }
  };

  const steps = [
    { key: 'account', title: 'Create your free account', done: true, meta: 'Welcome to Colaberry', pts: 0, action: null as null | (() => void) },
    { key: 'rsvp', title: 'RSVP to the next open house', done: rsvped, meta: oh ? oh.title : 'No open house scheduled yet', pts: 10, action: oh && !rsvped ? doRsvp : null },
    { key: 'resume', title: 'Load your resume or LinkedIn', done: hasBackground, meta: 'We pre-fill your project in the background', pts: 25, action: !hasBackground ? () => setShowResume((v) => !v) : null },
    { key: 'dna', title: 'Shape your project (Project DNA)', done: false, meta: 'Personalized to your background', pts: 40, action: null },
  ];

  return (
    <div className="te-shell">
      {toast && <div className="te-toast">{toast}</div>}

      {/* ── topbar ── */}
      <header className="te-top">
        <div className="te-brand">
          <span className="te-mark">C</span>
          <div><b><span className="cc">C</span>olaberry</b><span>AI Systems Architect Accelerator</span></div>
        </div>
        <div className="te-top-right">
          {(oh || schedule?.first_class) && (
            <div className="te-cdchip" title="Your next milestone">
              <span className="ic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="13" r="8" stroke="currentColor" strokeWidth="2" /><path d="M12 9v4l2.5 2M9 2h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>
              <span>
                <span className="lbl">{oh ? 'Next open house' : 'First class'}</span>
                <span className="val">
                  {ohCd ? <><span className="mono">{ohCd.d}d {ohCd.h}h {ohCd.m}m</span></>
                    : fcCd ? <><span className="mono">{fcCd.d}d {fcCd.h}h</span></> : '--'}
                </span>
              </span>
            </div>
          )}
          <div className="te-hud">
            <div className="row"><span className="lvl">{lvl.name}</span><span className="pts">{total.toLocaleString()} pts</span></div>
            <div className="bar"><i style={{ width: `${lvl.pct}%` }} /></div>
            <div className="next">{lvl.next ? `${lvl.next.min - total} pts to ${lvl.next.name}` : 'Max level'}</div>
          </div>
          <div className="te-avatar" title={me.email}>{me.initials}</div>
        </div>
      </header>

      {/* ── nav ── */}
      <nav className="te-nav">
        <div className="grp">Your day</div>
        {NAV.map((n) => n.active
          ? <span key={n.to} className="te-navbtn active"><span className="dot">◆</span>{n.label}</span>
          : <Link key={n.to} className="te-navbtn" to={n.to}><span className="dot">•</span>{n.label}</Link>)}
      </nav>

      {/* ── main ── */}
      <main className="te-main">
        <div className="te-page-h">
          <div className="crumb">Command Center</div>
          <h1>Welcome{me.email ? `, ${me.email.split('@')[0]}` : ''}</h1>
          <div className="sub">Let's get you set up. A few quick steps unlock your personalized project and your first points.</div>
        </div>

        <div className="te-grid">
          <div>
            {/* hero */}
            <div className="te-hero">
              <div className="eyebrow">★ Your next step</div>
              <h2>{hasBackground ? 'Shape your project with the Project DNA' : 'Load your background to personalize everything'}</h2>
              <p>{hasBackground
                ? 'Your background is loaded. Finish your Project DNA and we generate a tailored build plan with real tasks.'
                : 'Add your resume or LinkedIn and the ProjectDnaWizard pre-fills in the background, so your project fits your experience.'}</p>
              {hasBackground
                ? <Link className="te-btn cherry" to="/portal/project-builder">Shape my project</Link>
                : <button className="te-btn cherry" onClick={() => setShowResume(true)}>Load resume / LinkedIn</button>}
            </div>

            {/* open house strip */}
            {oh && (
              <div className="te-oh">
                <span className="ic">◷</span>
                <div className="body">
                  <div className="t">{oh.title}</div>
                  <div className="w">{new Date(oh.starts_at).toLocaleString()} {ohCd && <>· <span className="cd">{ohCd.d}d {ohCd.h}h {ohCd.m}m {ohCd.s}s</span></>}</div>
                </div>
                <button className="te-btn berry sm" onClick={doRsvp} disabled={busy || rsvped}>{rsvped ? 'RSVP\'d ✓' : 'RSVP (+10)'}</button>
              </div>
            )}

            {/* resume inline */}
            {showResume && (
              <div className="te-card" style={{ padding: 18, marginBottom: 18 }}>
                <div className="te-sec-title" style={{ margin: '0 0 10px' }}>Load your background</div>
                <input style={{ display: 'block', width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', margin: '0 0 10px', fontFamily: 'inherit', fontSize: 14 }}
                  placeholder="LinkedIn profile URL (optional)" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} />
                <textarea style={{ width: '100%', minHeight: 120, padding: '11px 14px', border: '1px solid var(--border)', borderRadius: 12, fontFamily: 'inherit', fontSize: 14, resize: 'vertical' }}
                  placeholder="Paste your resume text here…" value={resumeText} onChange={(e) => setResumeText(e.target.value)} />
                <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                  <button className="te-btn cherry sm" onClick={doIngest} disabled={busy || (!resumeText.trim() && !linkedin.trim())}>Analyze &amp; pre-fill</button>
                  <button className="te-btn ghost sm" onClick={() => setShowResume(false)}>Cancel</button>
                </div>
              </div>
            )}

            {/* onboarding steps queue */}
            <div className="te-sec-title">Get set up · earn your first points</div>
            <div className="te-queue">
              {steps.map((s) => (
                <button key={s.key} className={`te-step${s.done ? ' done' : ''}`} disabled={!s.action} onClick={s.action || undefined}>
                  <span className="te-check">{s.done ? '✓' : ''}</span>
                  <span className="b">
                    <span className="tt">{s.title}</span>
                    <span className="mt">
                      {s.pts > 0 && <span className={`te-pts${s.done ? ' earned' : ''}`}>+{s.pts} pts</span>}
                      {s.meta}
                    </span>
                  </span>
                  {s.action && !s.done && <span style={{ color: 'var(--cherry)', fontWeight: 700 }}>→</span>}
                </button>
              ))}
            </div>
          </div>

          {/* ── right sidebar ── */}
          <aside className="te-side">
            <div className="te-card te-scard">
              <h3>Your points</h3>
              <div className="te-stat"><span className="lab">{lvl.name}</span><span className="num">{total.toLocaleString()} pts</span></div>
              <div className="te-ribbon"><i style={{ width: `${lvl.pct}%`, background: 'var(--leaf)' }} /></div>
              <div className="te-muted" style={{ marginTop: -8 }}>{lvl.next ? `${lvl.next.min - total} pts to ${lvl.next.name}` : 'Max level reached'}</div>
              <div className="te-chip guest" style={{ marginTop: 14 }}>Free preview account</div>
            </div>

            {schedule?.first_class && (
              <div className="te-card te-scard">
                <h3>Countdown to your first class</h3>
                <div className="te-muted">{schedule.first_class.cohort_name || 'Your cohort'}{schedule.first_class.core_day ? ` · ${schedule.first_class.core_day}s ${schedule.first_class.core_time || ''}` : ''}</div>
                {fcCd && (
                  <div className="te-count">
                    <div className="seg"><b>{fcCd.d}</b><span>days</span></div>
                    <div className="seg"><b>{fcCd.h}</b><span>hrs</span></div>
                    <div className="seg"><b>{fcCd.m}</b><span>min</span></div>
                  </div>
                )}
                {schedule.first_class.source === 'next_open_cohort' && <div className="te-muted" style={{ marginTop: 8 }}>Next cohort start (join to lock your seat)</div>}
              </div>
            )}

            <div className="te-card te-scard">
              <h3>Coming up</h3>
              {oh ? (
                <>
                  <div className="te-stat"><span className="lab">{oh.title}</span></div>
                  <div className="te-muted">{new Date(oh.starts_at).toLocaleString()}</div>
                  <button className="te-btn berry sm" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={doRsvp} disabled={busy || rsvped}>{rsvped ? 'RSVP\'d ✓' : 'RSVP to the open house'}</button>
                </>
              ) : <div className="te-muted">No open house scheduled yet — check back soon.</div>}
            </div>

            <div className="te-card te-scard">
              <h3>Quick actions</h3>
              <div className="te-quick">
                <button className="te-btn ghost sm" onClick={() => setShowResume(true)}>Load resume / LinkedIn</button>
                <Link className="te-btn ghost sm" to="/portal/project-builder">Shape your project</Link>
                <Link className="te-btn ghost sm" to="/portal/curriculum">Explore the classroom</Link>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default TodayShell;
