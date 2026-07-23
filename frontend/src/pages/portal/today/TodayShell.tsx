import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import './TodayShell.css';
import {
  fetchPoints, fetchOnboardingProfile, rsvpOpenHouse, ingestBackground,
  fetchStreak, claimDailyStreak, submitReferrals,
  levelFor, PointsSummary, OnboardingSchedule, OnboardingProfileView, StreakView,
} from '../../../services/onboardingApi';
import { loadSchedule } from '../scheduleCache';
import PortalShell from './PortalShell';
import OpenOnPhone from './OpenOnPhone';
import { usePortalFlags } from '../../../hooks/usePortalFlags';
import {
  readParticipant, countdown, firstClassTargetMs,
  fmtCentralDateTime,
} from './shellUtils';
import portalApi from '../../../utils/portalApi';
import { emitPointsEarned, onPointsEarned, emitCardCollected } from '../../../services/pointsFx';
import { uploadResume, fileToBase64 } from '../../../services/portalSettingsApi';
import { runtimeApi } from '../runtime/runtimeApi';
import { TimelineFeedCard } from '../../../components/timeline/TimelineCard';
import TodayFeedV2 from './TodayFeedV2';
import CardDetailDrawer from '../../../components/timeline/CardDetailDrawer';
import CommunityPulse from './CommunityPulse';
import NextLiveClassCard from './NextLiveClassCard';
import { useNextLiveSession } from './useNextLiveSession';
import '../../../components/timeline/timeline.css';
import { readViewSnapshot, restoreScroll, usePersistScrollOnScroll } from '../../../hooks/useScrollRestore';
import SkillMeter from '../SkillMeter';

// Persist the Today feed's scroll position so leaving for a card's runtime
// workspace and coming back — via its Back button OR the browser's own back
// button — returns the student to the same spot instead of resetting to the
// top. Same proven pattern as Classroom's 'classroom-view' key; see
// hooks/useScrollRestore for the restore/persist mechanics.
const TODAY_VIEW_KEY = 'today-view';

const TodayShell: React.FC = () => {
  const [points, setPoints] = useState<PointsSummary | null>(null);
  const [schedule, setSchedule] = useState<OnboardingSchedule | null>(null);
  const [profile, setProfile] = useState<OnboardingProfileView | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [toast, setToast] = useState<string>('');
  const [showUpload, setShowUpload] = useState(false);
  // The onboarding checklist ("Get set up") now lives in a modal off a small
  // persistent completion prompt above the skills chart, instead of eating the
  // top of the main column permanently — see the te-setup-modal render below.
  const [showSetupModal, setShowSetupModal] = useState(false);
  const openUpload = () => { setShowSetupModal(true); setShowUpload(true); };
  const [showReferral, setShowReferral] = useState(false);
  const [referralFriends, setReferralFriends] = useState([{ name: '', email: '' }]);
  const [referralSubmitted, setReferralSubmitted] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [streak, setStreak] = useState<StreakView | null>(null);
  const [curriculum, setCurriculum] = useState<TimelineFeedCard[]>([]);
  const [selectedCard, setSelectedCard] = useState<TimelineFeedCard | null>(null);

  const me = useMemo(readParticipant, []);
  const { flags } = usePortalFlags();
  // Next live class (from live_sessions). Null for Explorers/guests with no
  // scheduled session — the shell then falls back to the first-class card.
  const { session: nextLiveSession } = useNextLiveSession();

  const loadAll = useCallback(async () => {
    // fetchSchedule (via the shared scheduleCache, not a raw direct call) —
    // PortalShell's useEntitlement()/useIsExplorer() hooks (which wrap every
    // page, including this one) ALSO need this same payload. Calling the raw
    // fetchSchedule() here duplicated that request: two near-simultaneous GETs
    // to the same endpoint, which on a loaded box can each take seconds,
    // stalling this Promise.allSettled (and therefore curriculum, and
    // therefore the scroll-restore effect below, which waits on curriculum)
    // far longer than necessary for zero benefit — scheduleCache exists
    // exactly to make two callers share one in-flight request.
    const [p, s, pr, cl, st] = await Promise.allSettled([
      fetchPoints(), loadSchedule(), fetchOnboardingProfile(), portalApi.get('/api/portal/classroom'), fetchStreak(),
    ]);
    if (p.status === 'fulfilled') setPoints(p.value);
    if (s.status === 'fulfilled') setSchedule(s.value);
    if (pr.status === 'fulfilled') setProfile(pr.value);
    if (cl.status === 'fulfilled') setCurriculum(((cl.value.data?.cards as TimelineFeedCard[]) || []).sort((a, b) => (a.week ?? 0) - (b.week ?? 0) || a.order - b.order));
    if (st.status === 'fulfilled') setStreak(st.value);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  // Refetch the Today feed + status whenever points are earned (e.g. a quick-check
  // completed in the drawer) so the sidebar stays live without a navigation.
  useEffect(() => onPointsEarned(() => { void loadAll(); }), [loadAll]);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Restore scroll once the feed has loaded (restoreScroll itself waits for the
  // page to actually grow tall enough — thumbnails load after mount — so it's
  // safe to call as soon as we have cards to render). Runs once.
  const restoredScrollRef = React.useRef(false);
  useEffect(() => {
    if (restoredScrollRef.current || curriculum.length === 0) return;
    restoredScrollRef.current = true;
    const snap = readViewSnapshot<Record<string, never>>(TODAY_VIEW_KEY);
    if (snap) restoreScroll(snap.scrollY || 0);
  }, [curriculum]);
  usePersistScrollOnScroll<Record<string, never>>(TODAY_VIEW_KEY, curriculum.length > 0, () => ({}));

  const flash = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(''), 2600); };

  const total = points?.total ?? 0;
  const lvl = levelFor(total);
  const oh = schedule?.next_open_house || null;
  const ohCd = countdown(oh ? new Date(oh.starts_at).getTime() : null, now);
  const fcCd = countdown(firstClassTargetMs(schedule?.first_class ?? null), now);
  const hasBackground = !!(profile && (profile.has_resume || profile.linkedin_url));
  const hasReferral = !!profile?.has_referral;
  const rsvped = !!schedule?.my_rsvp;
  // Redesign flag (default ON while loading). firstName from the real profile —
  // never the raw email prefix.
  const redesign = flags?.today_redesign ?? true;
  const firstName = profile?.profile?.full_name?.trim().split(/\s+/)[0] || '';

  // The real registration lives on Eventbrite; RSVP here records it + awards
  // points, then sends the student to Eventbrite to secure their seat.
  const EVENTBRITE_OPEN_HOUSE_URL = 'https://www.eventbrite.com/e/colaberry-ai-systems-architect-accelerator-open-house-tickets-1992498063344';
  const doRsvp = async () => {
    if (!oh || busy) return;
    setBusy(true);
    try {
      const r = await rsvpOpenHouse(oh.id);
      await loadAll();
      emitPointsEarned(r.awarded ? (r.points ?? 0) : 0);
      flash(r.awarded ? `RSVP confirmed — +${r.points} points` : 'You are already RSVP\'d');
    } catch { flash('Could not RSVP right now'); } finally { setBusy(false); }
    window.open(EVENTBRITE_OPEN_HOUSE_URL, '_blank', 'noopener');
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
    const prevTotal = points?.total ?? 0;
    try {
      const isText = /\.(txt|md)$/i.test(file.name) || file.type.startsWith('text/');
      if (isText) {
        await ingestBackground({ resume_text: await file.text() });
      } else {
        // Binary (PDF/DOCX/etc — incl. LinkedIn "Save to PDF"): send the REAL
        // file bytes to the extracting endpoint, NOT a placeholder, so the
        // resume/LinkedIn actually parses server-side and fills the profile.
        const data_base64 = await fileToBase64(file);
        await uploadResume({ file_name: file.name, mime: file.type || 'application/octet-stream', data_base64 });
      }
      await loadAll();
      // Refresh the HUD total and celebrate any newly-awarded points (+25 the
      // first time a resume/LinkedIn is uploaded).
      try {
        const fresh = await fetchPoints();
        setPoints(fresh);
        const gained = (fresh?.total ?? 0) - prevTotal;
        if (gained > 0) emitPointsEarned(gained);
      } catch { /* keep prior total */ }
      setShowUpload(false);
      flash('Got it — personalizing your experience in the background');
    } catch { flash('Could not upload that right now'); } finally { setBusy(false); }
  };

  // "Recommend a friend" — one or more friends, one submission, same
  // capture-prevTotal/diff/celebrate pattern as the resume/LinkedIn upload above
  // (per Ali's choice: reuse the existing points-HUD burst, no new celebration modal).
  const addReferralRow = () => setReferralFriends((rows) => [...rows, { name: '', email: '' }]);
  const updateReferralRow = (i: number, field: 'name' | 'email', value: string) =>
    setReferralFriends((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  const removeReferralRow = (i: number) => setReferralFriends((rows) => (rows.length > 1 ? rows.filter((_, idx) => idx !== i) : rows));
  const submitReferralFriends = async () => {
    const valid = referralFriends
      .map((r) => ({ name: r.name.trim(), email: r.email.trim() }))
      .filter((r) => r.name && /\S+@\S+\.\S+/.test(r.email));
    if (valid.length === 0 || busy) { flash('Add at least one friend\'s name and email'); return; }
    setBusy(true);
    const prevTotal = points?.total ?? 0;
    try {
      await submitReferrals(valid);
      await loadAll();
      try {
        const fresh = await fetchPoints();
        setPoints(fresh);
        const gained = (fresh?.total ?? 0) - prevTotal;
        if (gained > 0) emitPointsEarned(gained);
      } catch { /* keep prior total */ }
      setReferralSubmitted(true);
    } catch { flash('Could not submit right now — please try again'); } finally { setBusy(false); }
  };

  const claimedToday = !!streak?.claimed_today;
  const doClaimStreak = async () => {
    if (claimedToday || busy) return;
    setBusy(true);
    try {
      const r = await claimDailyStreak();
      setStreak(r.streak);
      emitPointsEarned(r.awarded ? r.points : 0);
      // Streak points fold into the score — refresh the points total too.
      try { setPoints(await fetchPoints()); } catch { /* keep prior total */ }
      flash(r.awarded
        ? `Daily streak — ${r.streak.count} day${r.streak.count === 1 ? '' : 's'} · +${r.points} pts`
        : 'Already claimed today');
    } catch { flash('Could not claim your streak right now'); } finally { setBusy(false); }
  };

  const steps = [
    { key: 'account', title: 'Create your free account', done: true, meta: 'Welcome to Colaberry', pts: 0, action: null as null | (() => void) },
    { key: 'resume', title: 'Upload your resume or LinkedIn PDF', done: hasBackground, meta: 'Personalizes your experience in the background', pts: 25, action: !hasBackground ? () => setShowUpload((v) => !v) : null },
    { key: 'referral', title: 'Recommend a friend', done: hasReferral, meta: 'Know someone who’d love this?', pts: 25, action: !hasReferral ? () => setShowReferral((v) => !v) : null },
  ];

  const setupRemaining = steps.filter((s) => !s.done).length;
  const setupDone = steps.filter((s) => s.done).length;
  const setupPct = Math.round((setupDone / steps.length) * 100);
  const streakCount = streak?.count ?? 0;
  const streakWeek = streak?.week ?? [];
  // State-aware "what's next" for the command band — reflects the real setup state.
  const nextStepLabel = !hasBackground ? 'upload your résumé to personalize everything' : null;

  // The Today timeline mirrors the Classroom curriculum — an endless FB-style
  // feed of the real cards (Week 0 for a free Explorer). Cycles as you scroll so
  // the total is never shown. Category chips are labels-only for now (0) — the
  // other feed sources light up later.
  const CATEGORY_LABELS = ['Your setup', 'Projects', 'Schedule', 'Your path', 'Classroom', 'Cert Prep', 'Community'];

  return (
    <PortalShell todayBadge={setupRemaining}>
      {toast && <div className="te-toast">{toast}</div>}

      {redesign ? (
        /* command band — greeting + primary next step + the three meters in one row */
        <div className="te-band">
          <div>
            <div className="crumb">◆ {schedule?.is_explorer ? 'Free AI Preview' : 'Command Center'}</div>
            <h2>{firstName ? `Welcome back, ${firstName} 👋` : 'Welcome back 👋'}</h2>
            <p className="statline">
              {nextStepLabel
                ? (total > 0
                    ? <>You've earned <b>{total.toLocaleString()} points</b>. Next up — {nextStepLabel}.</>
                    : <>You're one step from your first points — <b>{nextStepLabel}</b>.</>)
                : <><b>{total.toLocaleString()} points</b> and set up — we're personalizing the rest in the background.</>}
            </p>
            <div className="ctas">
              {!hasBackground && (
                <button className="te-btn cherry" type="button" onClick={openUpload}>Upload résumé / LinkedIn</button>
              )}
              <Link className="te-btn ghost" to="/portal/path">See your path</Link>
              <Link className="te-btn ghost" to="/portal/points">Break down my points</Link>
            </div>
          </div>
          <div className="te-cluster">
            <div className="te-ringwrap lf">
              <div className="te-ring" style={{ '--p': lvl.pct, '--c': 'var(--leaf)' } as React.CSSProperties}><div className="v"><b>{total}</b><span>pts</span></div></div>
              <div className="cap">{lvl.name}</div>
            </div>
            <div className="te-ringwrap">
              <div className="te-ring" style={{ '--p': setupPct, '--c': 'var(--berry)' } as React.CSSProperties}><div className="v"><b>{setupDone}/{steps.length}</b><span>setup</span></div></div>
              <div className="cap">Setup</div>
            </div>
            <div className="te-ringwrap">
              <div className="te-ring" style={{ '--p': 2, '--c': 'var(--cherry)' } as React.CSSProperties}><div className="v"><b>0</b><span>/100</span></div></div>
              <div className="cap">Readiness</div>
            </div>
            <div className="te-metacol">
              <span className="lab">Next tier</span>
              <span className="big">{lvl.next ? lvl.next.name : 'Max level'}</span>
              <span className="to">{lvl.next ? `${lvl.next.min - total} pts to go` : 'Top tier reached'}</span>
              <button className="te-bandflame" type="button" onClick={doClaimStreak} disabled={claimedToday || busy}>
                🔥 {streakCount}-day streak · {claimedToday ? 'claimed' : `claim${streak ? ` +${streak.next_points}` : ''}`}
              </button>
              <OpenOnPhone />
            </div>
          </div>
        </div>
      ) : (
        <div className="te-page-h">
          <div className="crumb">{schedule?.is_explorer ? 'Free AI Preview' : 'Command Center'}</div>
          <h1>Welcome{me.email ? `, ${me.email.split('@')[0]}` : ''}</h1>
          <div className="sub">{schedule?.is_explorer
            ? "Explore AI for free — watch, listen, learn, and try. Enroll when you're ready to build for real."
            : "Let's get you set up. A few quick steps unlock your first points and your seat."}</div>
        </div>
      )}

      {schedule?.is_explorer && (
        <div className="te-card" style={{ background: 'linear-gradient(135deg,#2E6A86,#367895)', color: '#fff', padding: '20px 22px', marginBottom: 18, border: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', opacity: 0.9 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 8h16v8H4zM4 8l2-3h12l2 3M9 12h6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
            Free AI Preview
          </div>
          <h2 style={{ margin: '8px 0 6px', fontSize: 22, color: '#fff' }}>You're learning AI for free</h2>
          <p style={{ margin: '0 0 14px', opacity: 0.92, maxWidth: '54ch' }}>Enroll in the AI Systems Architect Accelerator to unlock all 12 weeks, the live build classes, the community, and your certification.</p>
          {(fcCd || ohCd) && (
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', margin: '2px 0 16px' }}>
              {fcCd && <div><div style={{ fontSize: 11, opacity: 0.82 }}>Next class starts in</div><div style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontWeight: 700, fontSize: 15 }}>{fcCd.d}d {fcCd.h}h {fcCd.m}m {fcCd.s}s</div></div>}
              {oh && ohCd && <div><div style={{ fontSize: 11, opacity: 0.82 }}>{oh.title} in</div><div style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontWeight: 700, fontSize: 15 }}>{ohCd.d}d {ohCd.h}h {ohCd.m}m {ohCd.s}s</div></div>}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link className="te-btn cherry" to="/portal/curriculum">Enroll to unlock →</Link>
            {oh && <button className="te-btn" style={{ color: '#fff', border: '1px solid rgba(255,255,255,.6)', background: 'rgba(255,255,255,.14)' }} onClick={doRsvp} disabled={busy || rsvped}>{rsvped ? "RSVP'd for the event" : 'RSVP for the event'}</button>}
          </div>
        </div>
      )}

      <div className="te-grid">
        <div>
          {/* hero — the command band carries the primary CTA when the redesign flag is on */}
          {!redesign && (
          <div className="te-hero">
            <div className="eyebrow"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z" /></svg> Your next step</div>
            <h2>{hasBackground ? "You're set up — we're personalizing as you go" : 'Upload your resume or LinkedIn to personalize everything'}</h2>
            <p>{hasBackground
              ? 'Thanks for sharing your background. Your program tailors itself quietly in the background as you engage — nothing else to do right now.'
              : "LinkedIn can't be imported by link, so export your LinkedIn profile to PDF (profile → More → Save to PDF) or grab your resume, and upload it. We tailor your experience from it in the background."}</p>
            {!hasBackground && <button className="te-btn cherry" onClick={openUpload}>Upload resume / LinkedIn</button>}
          </div>
          )}

          {/* open house strip */}
          {oh && (
            <div className="te-oh">
              <span className="ic">◷</span>
              <div className="body">
                <div className="t">{oh.title}</div>
                <div className="w">{fmtCentralDateTime(oh.starts_at)} {ohCd && <>· <span className="cd">{ohCd.d}d {ohCd.h}h {ohCd.m}m {ohCd.s}s</span></>}</div>
              </div>
              <button className="te-btn berry sm" onClick={doRsvp} disabled={busy || rsvped}>{rsvped ? "RSVP'd" : 'RSVP for the next event'}</button>
            </div>
          )}

          {/* skills chart replaces the old permanent "Get set up" checklist — the
              checklist now lives behind a small completion prompt (shown only
              while steps remain) that opens it in a modal. */}
          {setupRemaining > 0 && (
            <button type="button" className="te-setup-prompt" onClick={() => setShowSetupModal(true)}>
              <span className="ic">✦</span>
              <span className="t">{setupDone} of {steps.length} set up · finish for +{steps.filter((s) => !s.done).reduce((sum, s) => sum + s.pts, 0)} pts</span>
              <span className="go">→</span>
            </button>
          )}
          <SkillMeter cards={curriculum} />

          {showSetupModal && (
            <div className="te-setup-backdrop" onClick={() => setShowSetupModal(false)}>
              <div className="te-setup-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Get set up">
                <div className="te-setup-modal-head">
                  <div className="te-sec-title" style={{ margin: 0 }}>Get set up · earn your first points</div>
                  <button type="button" className="te-setup-close" onClick={() => setShowSetupModal(false)} aria-label="Close">×</button>
                </div>

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

                {/* background upload — both resume and LinkedIn are uploads */}
                {showUpload && (
                  <div className="te-card te-upload" style={{ marginTop: 14 }}>
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

                {/* recommend a friend — add 1+, submit once, celebrate with the same HUD burst */}
                {showReferral && (
                  <div className="te-card te-upload" style={{ marginTop: 14 }}>
                    {referralSubmitted ? (
                      <div style={{ textAlign: 'center', padding: '8px 0' }}>
                        <div className="te-check" style={{ background: 'var(--leaf)', borderColor: 'var(--leaf)', margin: '0 auto 10px' }}>✓</div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--strong)' }}>Thanks! +25 points</div>
                        <div className="te-muted" style={{ marginTop: 4 }}>We'll let them know you sent them.</div>
                        <button type="button" className="te-btn ghost sm" style={{ marginTop: 14 }}
                          onClick={() => { setShowReferral(false); setReferralSubmitted(false); setReferralFriends([{ name: '', email: '' }]); }}>
                          Close
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="te-sec-title" style={{ margin: '0 0 4px' }}>Recommend a friend</div>
                        <p className="te-muted" style={{ margin: '0 0 14px' }}>
                          Know someone who'd love this program? Add their name and email — we'll do the rest.
                        </p>
                        {referralFriends.map((f, i) => (
                          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                            <input className="te-input" placeholder="Friend's name" value={f.name} disabled={busy}
                              onChange={(e) => updateReferralRow(i, 'name', e.target.value)} style={{ flex: 1 }} />
                            <input className="te-input" placeholder="Friend's email" type="email" value={f.email} disabled={busy}
                              onChange={(e) => updateReferralRow(i, 'email', e.target.value)} style={{ flex: 1 }} />
                            {referralFriends.length > 1 && (
                              <button type="button" className="te-setup-close" aria-label="Remove" disabled={busy}
                                onClick={() => removeReferralRow(i)}>×</button>
                            )}
                          </div>
                        ))}
                        <button type="button" className="te-btn ghost sm" onClick={addReferralRow} disabled={busy} style={{ marginTop: 4 }}>
                          + Add another friend
                        </button>
                        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                          <button className="te-btn cherry sm" onClick={submitReferralFriends} disabled={busy}>Submit</button>
                          <button className="te-btn ghost sm" onClick={() => setShowReferral(false)} disabled={busy}>Cancel</button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── aggregated timeline — the big feed pulling from every page ── */}
          <div className="te-feed">
            <div className="te-feed-head">
              <span className="h">
                <svg viewBox="0 0 24 24" fill="none"><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.5 2.5M16.5 16.5L19 19M19 5l-2.5 2.5M7.5 16.5L5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="12" r="3.4" stroke="currentColor" strokeWidth="2" /></svg>
                Your timeline · everything in one place
              </span>
            </div>
            <div className="te-feed-filter">
              {CATEGORY_LABELS.map((label) => (
                <span key={label} className="fchip"><span>{label}</span> <span className="ct">0</span></span>
              ))}
            </div>
            <TodayFeedV2
              fallbackCards={curriculum}
              onOpen={setSelectedCard}
              onWorkspace={setSelectedCard}
              onComplete={async (card) => {
                // Collect points straight from the timeline card. Throws on the
                // server watch/read/lock gate (422) so the card surfaces the reason.
                // Ambient blogs (ref `blog:<id>`) collect via the blog read gate.
                const blogId = card.id.startsWith('blog:') ? card.id.slice('blog:'.length) : null;
                const res = blogId
                  ? await runtimeApi.blogCollect(blogId)
                  : (await portalApi.post(`/api/portal/classroom/cards/${card.id}/complete`)).data;
                await loadAll();
                emitPointsEarned(res?.points_awarded ?? 0); // HUD burst + chime
                emitCardCollected(card.id);                 // drop it off the feed
              }}
            />
          </div>
        </div>

        {/* ── right sidebar ── */}
        <aside className="te-side">
          {/* Live community pulse — surfaces rooms people are in + live/next sessions */}
          <CommunityPulse />
          {/* Your day — meters fold into the command band when the redesign flag is on */}
          {!redesign && (
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
            <Link className="te-btn ghost sm" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} to="/portal/points">Break down my points</Link>
            <Link className="te-btn ghost sm" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} to="/portal/path">See your path</Link>
            <div className="te-chip guest" style={{ marginTop: 12 }}>Free preview account</div>
          </div>
          )}

          {/* Daily streak */}
          <div className="te-card te-scard te-streak accent-amber">
            <h3><svg viewBox="0 0 24 24" fill="none"><path d="M12 2c1 3-1 4.5-2.5 6.5C8 10.5 7 12 7 14a5 5 0 0 0 10 0c0-2-1-3.4-2-5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg> Daily streak</h3>
            <div className="te-streak-top">
              <span className="fl"><svg viewBox="0 0 24 24" fill="none"><path d="M12 2c1 3-1 4.5-2.5 6.5C8 10.5 7 12 7 14a5 5 0 0 0 10 0c0-2-1-3.4-2-5 .5 1 .5 2 .2 2.8C16.8 9.4 15 8 14.5 5.5 14 3.5 13 2.6 12 2z" fill="#E8920C" /><path d="M12 21a3 3 0 0 0 3-3c0-1.6-1.3-2.6-2-4-.7 1.4-2 2-2 4a1 1 0 0 0 1 3z" fill="#FB2832" /></svg></span>
              <div className="ct"><b>{streakCount}</b><span>day{streakCount === 1 ? '' : 's'} streak</span></div>
            </div>
            <div className="te-streak-week">
              {streakWeek.map((d) => (
                <div key={d.date} className={`sd${d.hit ? ' hit' : ''}${d.is_today ? ' today' : ''}`}>
                  <span className="dot"><svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg></span>
                  <span className="lbl">{d.label}</span>
                </div>
              ))}
            </div>
            <button className="te-btn leaf sm" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={doClaimStreak} disabled={claimedToday || busy}>
              {claimedToday ? 'Claimed today' : streak ? `Claim today · +${streak.next_points} pts` : 'Claim today'}
            </button>
          </div>

          {/* Next live class — when the student has an upcoming/live session
              (from live_sessions) show the live-session card; otherwise fall
              back to the first-class cohort countdown UNCHANGED. The Open House
              "Coming up" card below is unaffected in either case. */}
          {nextLiveSession ? (
            <NextLiveClassCard session={nextLiveSession} />
          ) : schedule?.first_class ? (
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
          ) : null}

          <div className="te-card te-scard">
            <h3>Coming up</h3>
            {oh ? (
              <>
                <div className="te-stat"><span className="lab">{oh.title}</span></div>
                <div className="te-muted">{fmtCentralDateTime(oh.starts_at)}</div>
                <button className="te-btn berry sm" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={doRsvp} disabled={busy || rsvped}>{rsvped ? "RSVP'd" : 'RSVP for the next event'}</button>
              </>
            ) : <div className="te-muted">No open house scheduled yet — check back soon.</div>}
          </div>
        </aside>
      </div>
      <CardDetailDrawer
        card={selectedCard}
        onClose={() => setSelectedCard(null)}
        onComplete={async (card) => {
          // Persist the completion (watch/read/lock gates are enforced server-side; a
          // rejection propagates so the drawer surfaces the reason). Ambient blogs
          // (ref `blog:<id>`) collect via the blog read gate.
          const blogId = card.id.startsWith('blog:') ? card.id.slice('blog:'.length) : null;
          const res = blogId
            ? await runtimeApi.blogCollect(blogId)
            : (await portalApi.post(`/api/portal/classroom/cards/${card.id}/complete`)).data;
          setSelectedCard(null);
          await loadAll();
          emitPointsEarned(res?.points_awarded ?? 0);   // HUD burst + chime
          emitCardCollected(card.id);                   // drop it off the feed
        }}
      />
    </PortalShell>
  );
};

export default TodayShell;
