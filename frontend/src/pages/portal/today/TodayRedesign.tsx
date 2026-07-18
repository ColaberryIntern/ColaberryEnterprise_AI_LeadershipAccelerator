// Redesigned Today (flag: PORTAL_TODAY_REDESIGN_ENABLED). Desktop folds the
// greeting + primary next step + the three progress meters into one command band
// (reclaiming the wasted top). Mobile lays it out like a familiar feed: app bar
// (in PortalShell) → stories quick-actions → one progress capsule → the timeline
// → a bottom tab bar (in PortalShell). Data + handlers mirror the classic Today;
// only the presentation above the feed changed.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import './TodayShell.css';
import {
  fetchPoints, fetchSchedule, fetchOnboardingProfile, fetchParticipantName,
  rsvpOpenHouse, ingestBackground,
  levelFor, PointsSummary, OnboardingSchedule, OnboardingProfileView,
} from '../../../services/onboardingApi';
import PortalShell from './PortalShell';
import OpenOnPhone from './OpenOnPhone';
import {
  countdown, firstClassTargetMs,
  StreakState, loadStreak, saveStreak, todayKey, dowMonFirst,
  fmtCentralDateTime, fmtCentralDate,
} from './shellUtils';
import FeedCard from '../feed/FeedCard';
import { buildTodayFeed } from '../feed/todayFeed';
import { useProjectsList, nextTask } from '../projects/projectsStore';

const StarIcon = () => (
  <svg className="star" viewBox="0 0 24 24" fill="none"><path d="M12 2l2.8 6.6 7.2.6-5.5 4.7 1.7 7L12 17.8 5.8 21.5l1.7-7L2 9.8l7.2-.6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
);

const TodayRedesign: React.FC = () => {
  const [points, setPoints] = useState<PointsSummary | null>(null);
  const [schedule, setSchedule] = useState<OnboardingSchedule | null>(null);
  const [profile, setProfile] = useState<OnboardingProfileView | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [toast, setToast] = useState<string>('');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [streak, setStreak] = useState<StreakState>(() => loadStreak());
  const [feedFilter, setFeedFilter] = useState<string>('all');
  const projects = useProjectsList();

  const loadAll = useCallback(async () => {
    const [p, s, pr] = await Promise.allSettled([fetchPoints(), fetchSchedule(), fetchOnboardingProfile()]);
    if (p.status === 'fulfilled') setPoints(p.value);
    if (s.status === 'fulfilled') setSchedule(s.value);
    if (pr.status === 'fulfilled') setProfile(pr.value);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { fetchParticipantName().then(setName); }, []);
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
  // Real first name from the profile — never the raw email prefix. Falls back to
  // a nameless greeting rather than showing "nzeribeikenna".
  const firstName = useMemo(() => (name ? name.trim().split(/\s+/)[0] : ''), [name]);

  const doRsvp = async () => {
    if (!oh || busy) return;
    setBusy(true);
    try {
      const r = await rsvpOpenHouse(oh.id);
      await loadAll();
      flash(r.awarded ? `RSVP confirmed — +${r.points} points` : 'You are already RSVP\'d');
    } catch { flash('Could not RSVP right now'); } finally { setBusy(false); }
  };

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

      {/* ── command band ── */}
      <div className="te-band">
        <div>
          <div className="crumb">◆ Command Center</div>
          <h2>{firstName ? `Welcome back, ${firstName} 👋` : 'Welcome back 👋'}</h2>
          <p className="statline">
            {hasBackground
              ? <>You're all set — <b>we're personalizing your experience in the background.</b></>
              : <>One step from your first points — <b>upload your résumé and you're set.</b> About 2 minutes.</>}
          </p>
          <div className="ctas">
            {!hasBackground && (
              <button className="te-btn cherry" type="button" onClick={() => setShowUpload(true)}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 16V4m0 0l-4 4m4-4l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                Upload résumé / LinkedIn
              </button>
            )}
            <Link className="te-btn ghost" to="/portal/path">See your path</Link>
          </div>
        </div>

        <div className="te-cluster">
          <div className="te-ringwrap lf">
            <div className="te-ring" style={{ '--p': lvl.pct, '--c': 'var(--leaf)' } as React.CSSProperties}>
              <div className="v"><b>{total}</b><span>pts</span></div>
            </div>
            <div className="cap">{lvl.name}</div>
          </div>
          <div className="te-ringwrap">
            <div className="te-ring" style={{ '--p': setupPct, '--c': 'var(--berry)' } as React.CSSProperties}>
              <div className="v"><b>{setupDone}/{steps.length}</b><span>setup</span></div>
            </div>
            <div className="cap">Setup</div>
          </div>
          <div className="te-ringwrap">
            <div className="te-ring" style={{ '--p': 2, '--c': 'var(--cherry)' } as React.CSSProperties}>
              <div className="v"><b>0</b><span>/100</span></div>
            </div>
            <div className="cap">Readiness</div>
          </div>
          <div className="te-metacol">
            <span className="lab">Next tier</span>
            <span className="big">{lvl.next ? lvl.next.name : 'Max level'}</span>
            <span className="to">{lvl.next ? `${lvl.next.min - total} pts to go` : 'Top tier reached'}</span>
            <button className="te-bandflame" type="button" onClick={doClaimStreak} disabled={claimedToday}>
              🔥 {streak.count}-day streak · {claimedToday ? 'claimed' : 'claim +5'}
            </button>
            <OpenOnPhone />
          </div>
        </div>
      </div>

      {/* ── mobile: stories quick-actions ── */}
      <div className="te-stories">
        <button className="te-story you" type="button" onClick={() => (hasBackground ? flash('Résumé already on file') : setShowUpload(true))}>
          <span className="av">
            <svg viewBox="0 0 24 24" fill="none"><path d="M12 16V4m0 0l-4 4m4-4l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            <span className="plus">{hasBackground ? '✓' : '+'}</span>
          </span>
          <span className="cap">{hasBackground ? 'Résumé' : 'Add résumé'}</span>
        </button>
        <button className="te-story" type="button" onClick={doRsvp} disabled={busy || rsvped}>
          <span className="av rb"><svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="2" /><path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>
          <span className="cap">{rsvped ? "RSVP'd" : 'RSVP'}</span>
        </button>
        <button className="te-story" type="button" onClick={doClaimStreak} disabled={claimedToday}>
          <span className="av ra">🔥</span>
          <span className="cap">{claimedToday ? 'Claimed' : 'Claim +5'}</span>
        </button>
        <Link className="te-story" to="/portal/path">
          <span className="av rl"><svg viewBox="0 0 24 24" fill="none"><circle cx="5" cy="6" r="2.4" stroke="currentColor" strokeWidth="2" /><circle cx="19" cy="18" r="2.4" stroke="currentColor" strokeWidth="2" /><path d="M5 8.4c0 5 7 2 7 7s7 0 7 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>
          <span className="cap">Your path</span>
        </Link>
        <Link className="te-story" to="/portal/classroom">
          <span className="av rc"><svg viewBox="0 0 24 24" fill="none"><path d="M3 8l9-4 9 4-9 4-9-4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M7 11v5c0 1 2 2 5 2s5-1 5-2v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>
          <span className="cap">Classroom</span>
        </Link>
      </div>

      {/* ── mobile: compact progress capsule ── */}
      <div className="te-mprog">
        <div className="r1">
          <span className="lvl"><StarIcon />{lvl.name} <span className="pts">{total.toLocaleString()} pts</span></span>
          <span className="to">{lvl.next ? `${lvl.next.min - total} to ${lvl.next.name}` : 'Max level'}</span>
        </div>
        <div className="bar"><i style={{ width: `${lvl.pct}%` }} /></div>
        <div className="mini">
          <div className="seg"><b>{setupDone}/{steps.length}</b><span>Setup</span></div>
          <div className="seg"><b>0/100</b><span>Readiness</span></div>
          <div className="seg"><b>{streak.count}</b><span>Day streak</span></div>
        </div>
      </div>

      <div className="te-grid">
        <div>
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

          {/* background upload */}
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

          {/* ── aggregated timeline ── */}
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

export default TodayRedesign;
