import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import './TodayShell.css';
import {
  fetchPoints, fetchSchedule, fetchOnboardingProfile, rsvpOpenHouse, ingestBackground,
  levelFor, PointsSummary, OnboardingSchedule, OnboardingProfileView,
} from '../../../services/onboardingApi';
import PortalShell from './PortalShell';
import {
  readParticipant, countdown, firstClassTargetMs,
  StreakState, loadStreak, saveStreak, todayKey, dowMonFirst,
  fmtCentralDateTime, fmtCentralDate,
} from './shellUtils';
import FeedCard from '../feed/FeedCard';
import { buildTodayFeed } from '../feed/todayFeed';
import { useProjectsList, nextTask } from '../projects/projectsStore';

const TodayShell: React.FC = () => {
  const [points, setPoints] = useState<PointsSummary | null>(null);
  const [schedule, setSchedule] = useState<OnboardingSchedule | null>(null);
  const [profile, setProfile] = useState<OnboardingProfileView | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [toast, setToast] = useState<string>('');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [streak, setStreak] = useState<StreakState>(() => loadStreak());
  const [feedFilter, setFeedFilter] = useState<string>('all');
  const projects = useProjectsList();

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

  // Resume / LinkedIn are BOTH uploads. LinkedIn can't be scraped from a link,
  // so the user exports their LinkedIn profile to PDF (profile → More → Save to
  // PDF) or uploads a resume. Text files are read here; binary files (PDF/DOCX)
  // are captured and parsed server-side where the LLM key exists (degrades to a
  // no-op locally). Extraction feeds the background ProjectDNA prefill silently.
  const onFilePicked = async (file: File | null) => {
    if (!file || busy) return;
    setBusy(true);
    setUploadName(file.name);
    try {
      const isText = /\.(txt|md)$/i.test(file.name) || file.type.startsWith('text/');
      const text = isText ? await file.text() : `[Uploaded file: ${file.name}]`;
      const r = await ingestBackground({ resume_text: text });
      await loadAll();
      setShowUpload(false);
      flash(r.parsed ? 'Got it — personalizing your experience in the background' : 'Uploaded — we will personalize as you go');
    } catch { flash('Could not upload that right now'); } finally { setBusy(false); }
  };

  const claimedToday = streak.lastClaim === todayKey();
  const doClaimStreak = () => {
    if (claimedToday) return;
    const week = [...streak.week]; week[dowMonFirst()] = true;
    const next: StreakState = { count: streak.count + 1, lastClaim: todayKey(), week };
    setStreak(next); saveStreak(next);
    flash(`Daily streak — ${next.count} day${next.count === 1 ? '' : 's'}`);
  };

  const steps = [
    { key: 'account', title: 'Create your free account', done: true, meta: 'Welcome to Colaberry', pts: 0, action: null as null | (() => void) },
    { key: 'rsvp', title: 'RSVP to the next open house', done: rsvped, meta: oh ? oh.title : 'No open house scheduled yet', pts: 10, action: oh && !rsvped ? doRsvp : null },
    { key: 'resume', title: 'Upload your resume or LinkedIn PDF', done: hasBackground, meta: 'Personalizes your experience in the background', pts: 25, action: !hasBackground ? () => setShowUpload((v) => !v) : null },
  ];

  const setupRemaining = steps.filter((s) => !s.done).length;
  const setupDone = steps.filter((s) => s.done).length;
  const setupPct = Math.round((setupDone / steps.length) * 100);
  const streakDow = dowMonFirst();

  // Aggregated Today timeline — the "big feed" pulling from every page.
  const firstClassLabel = schedule?.first_class?.start_date
    ? new Date(`${schedule.first_class.start_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;
  const primaryBuild = projects[0] || null;
  const projectHint = primaryBuild
    ? { name: primaryBuild.name, status: primaryBuild.status, nextTaskTitle: nextTask(primaryBuild)?.task.title || null }
    : null;
  const feedItems = buildTodayFeed(
    {
      ohTitle: oh?.title || null,
      ohWhen: oh ? fmtCentralDate(oh.starts_at) : null,
      rsvped, hasBackground, firstClassLabel, project: projectHint,
    },
    { onRsvp: doRsvp, onUpload: () => setShowUpload(true), onSoon: (label) => flash(`${label} unlocks when you enroll`) },
  );
  const feedSources = Array.from(new Set(feedItems.map((i) => i.source)));
  const filteredFeed = feedFilter === 'all' ? feedItems : feedItems.filter((i) => i.source === feedFilter);

  return (
    <PortalShell todayBadge={setupRemaining}>
      {toast && <div className="te-toast">{toast}</div>}

      <div className="te-page-h">
        <div className="crumb">Command Center</div>
        <h1>Welcome{me.email ? `, ${me.email.split('@')[0]}` : ''}</h1>
        <div className="sub">Let's get you set up. A few quick steps unlock your first points and your seat.</div>
      </div>

      <div className="te-grid">
        <div>
          {/* hero */}
          <div className="te-hero">
            <div className="eyebrow"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z" /></svg> Your next step</div>
            <h2>{hasBackground ? "You're set up — we're personalizing as you go" : 'Upload your resume or LinkedIn to personalize everything'}</h2>
            <p>{hasBackground
              ? 'Thanks for sharing your background. Your program tailors itself quietly in the background as you engage — nothing else to do right now.'
              : "LinkedIn can't be imported by link, so export your LinkedIn profile to PDF (profile → More → Save to PDF) or grab your resume, and upload it. We tailor your experience from it in the background."}</p>
            {!hasBackground && <button className="te-btn cherry" onClick={() => setShowUpload(true)}>Upload resume / LinkedIn</button>}
          </div>

          {/* open house strip */}
          {oh && (
            <div className="te-oh">
              <span className="ic">◷</span>
              <div className="body">
                <div className="t">{oh.title}</div>
                <div className="w">{fmtCentralDateTime(oh.starts_at)} {ohCd && <>· <span className="cd">{ohCd.d}d {ohCd.h}h {ohCd.m}m {ohCd.s}s</span></>}</div>
              </div>
              <button className="te-btn berry sm" onClick={doRsvp} disabled={busy || rsvped}>{rsvped ? "RSVP'd" : 'RSVP (+10)'}</button>
            </div>
          )}

          {/* background upload — both resume and LinkedIn are uploads */}
          {showUpload && (
            <div className="te-card te-upload">
              <div className="te-sec-title" style={{ margin: '0 0 4px' }}>Upload your background</div>
              <p className="te-muted" style={{ margin: '0 0 14px' }}>
                Two options, both uploads: your <b>resume</b>, or your <b>LinkedIn profile exported to PDF</b> (on LinkedIn:
                your profile → More → Save to PDF). We can't read your LinkedIn from a link.
              </p>
              <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt,.md" style={{ display: 'none' }}
                onChange={(e) => onFilePicked(e.target.files?.[0] || null)} />
              <button className="te-drop" type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
                <span className="ic"><svg viewBox="0 0 24 24" width="22" height="22" fill="none"><path d="M12 16V4m0 0L8 8m4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>
                <span className="t">{uploadName || 'Choose a file'}</span>
                <span className="s">Resume or LinkedIn PDF · PDF, DOCX, or TXT</span>
              </button>
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button className="te-btn ghost sm" onClick={() => setShowUpload(false)} disabled={busy}>Cancel</button>
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

          {/* ── aggregated timeline — the big feed pulling from every page ── */}
          <div className="te-feed">
            <div className="te-feed-head">
              <span className="h">
                <svg viewBox="0 0 24 24" fill="none"><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.5 2.5M16.5 16.5L19 19M19 5l-2.5 2.5M7.5 16.5L5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="12" r="3.4" stroke="currentColor" strokeWidth="2" /></svg>
                Your timeline · everything in one place
              </span>
            </div>
            <div className="te-feed-filter">
              <button type="button" className={`fchip${feedFilter === 'all' ? ' active' : ''}`} onClick={() => setFeedFilter('all')}>All <span className="ct">{feedItems.length}</span></button>
              {feedSources.map((s) => {
                const label = feedItems.find((i) => i.source === s)?.sourceLabel || s;
                const count = feedItems.filter((i) => i.source === s).length;
                return (
                  <button key={s} type="button" className={`fchip${feedFilter === s ? ' active' : ''}`} onClick={() => setFeedFilter(s)}>
                    {label} <span className="ct">{count}</span>
                  </button>
                );
              })}
            </div>
            {filteredFeed.length
              ? filteredFeed.map((it) => <FeedCard key={it.id} item={it} />)
              : <div className="fc-empty">Nothing in this filter yet.</div>}
          </div>
        </div>

        {/* ── right sidebar ── */}
        <aside className="te-side">
          {/* Your day */}
          <div className="te-card te-scard accent-leaf">
            <h3><svg viewBox="0 0 24 24" fill="none"><path d="M12 2l2.6 7.4H22l-6.2 4.6 2.4 7.4L12 16.9 5.8 21.4l2.4-7.4L2 9.4h7.4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg> Your day</h3>
            <div className="te-stat"><span className="lab">{lvl.name}</span><span className="num">{total.toLocaleString()} pts</span></div>
            <div className="te-ribbon"><i style={{ width: `${lvl.pct}%`, background: 'var(--leaf)' }} /></div>
            <div className="te-muted" style={{ margin: '-4px 0 12px' }}>{lvl.next ? `${lvl.next.min - total} pts to ${lvl.next.name}` : 'Max level reached'}</div>
            <div className="te-stat"><span className="lab">Setup progress</span><span className="num">{setupDone}/{steps.length}</span></div>
            <div className="te-ribbon"><i style={{ width: `${setupPct}%`, background: 'var(--berry)' }} /></div>
            <div className="te-stat"><span className="lab">Architect Readiness</span><span className="num">0/100</span></div>
            <div className="te-ribbon" style={{ marginBottom: 4 }}><i style={{ width: '2%', background: 'var(--cherry)' }} /></div>
            <div className="te-muted" style={{ fontSize: 12 }}>Grows as you build once the program starts.</div>
            <Link className="te-btn ghost sm" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} to="/portal/path">See your path</Link>
            <div className="te-chip guest" style={{ marginTop: 12 }}>Free preview account</div>
          </div>

          {/* Daily streak */}
          <div className="te-card te-scard te-streak accent-amber">
            <h3><svg viewBox="0 0 24 24" fill="none"><path d="M12 2c1 3-1 4.5-2.5 6.5C8 10.5 7 12 7 14a5 5 0 0 0 10 0c0-2-1-3.4-2-5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg> Daily streak</h3>
            <div className="te-streak-top">
              <span className="fl"><svg viewBox="0 0 24 24" fill="none"><path d="M12 2c1 3-1 4.5-2.5 6.5C8 10.5 7 12 7 14a5 5 0 0 0 10 0c0-2-1-3.4-2-5 .5 1 .5 2 .2 2.8C16.8 9.4 15 8 14.5 5.5 14 3.5 13 2.6 12 2z" fill="#E8920C" /><path d="M12 21a3 3 0 0 0 3-3c0-1.6-1.3-2.6-2-4-.7 1.4-2 2-2 4a1 1 0 0 0 1 3z" fill="#FB2832" /></svg></span>
              <div className="ct"><b>{streak.count}</b><span>day{streak.count === 1 ? '' : 's'} streak</span></div>
            </div>
            <div className="te-streak-week">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => (
                <div key={d} className={`sd${streak.week[i] ? ' hit' : ''}${i === streakDow ? ' today' : ''}`}>
                  <span className="dot"><svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg></span>
                  <span className="lbl">{d}</span>
                </div>
              ))}
            </div>
            <button className="te-btn leaf sm" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={doClaimStreak} disabled={claimedToday}>{claimedToday ? 'Claimed today' : 'Claim today'}</button>
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
                <div className="te-muted">{fmtCentralDateTime(oh.starts_at)}</div>
                <button className="te-btn berry sm" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={doRsvp} disabled={busy || rsvped}>{rsvped ? "RSVP'd" : 'RSVP to the open house'}</button>
              </>
            ) : <div className="te-muted">No open house scheduled yet — check back soon.</div>}
          </div>
        </aside>
      </div>
    </PortalShell>
  );
};

export default TodayShell;
