import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import './TodayShell.css';
import {
  fetchPoints, fetchOnboardingProfile, rsvpOpenHouse, ingestBackground, fetchStreak, claimDailyStreak,
  levelFor, PointsSummary, OnboardingSchedule, OnboardingProfileView, StreakView,
} from '../../../services/onboardingApi';
import { loadSchedule } from '../scheduleCache';
import PortalShell from './PortalShell';
import OpenOnPhone from './OpenOnPhone';
import CondensedHeaderCard, { CondensedTone } from './CondensedHeaderCard';
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
import TodayPlan from './TodayPlan';
import { useTodayPlanGate } from './useTodayPlanGate';
import type { Category } from './todayCategoryFilter';
import TimelineFilterChips from './TimelineFilterChips';
import SkillDetailDrawer from './SkillDetailDrawer';
import CardDetailDrawer from '../../../components/timeline/CardDetailDrawer';
import CommunityPulse from './CommunityPulse';
import NextLiveClassCard from './NextLiveClassCard';
import { useNextLiveSession } from './useNextLiveSession';
import '../../../components/timeline/timeline.css';
import SkillMeter from '../SkillMeter';
import SetupModal from './SetupModal';
import { useReferralForm } from './useReferralForm';
import { fetchSkillProfile, LearnerSkillProfile } from '../../../services/capeApi';
import { useTodayNextStep } from './useTodayNextStep';
import TodayNextStepBanner from './TodayNextStepBanner';

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
  const [uploadName, setUploadName] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [streak, setStreak] = useState<StreakView | null>(null);
  const [curriculum, setCurriculum] = useState<TimelineFeedCard[]>([]);
  // Section-bucket order for the whole curriculum feed (pre_class -> learn ->
  // ... -> advance) — needed to find the "active next step" the same way
  // Classroom itself orders a week's cards (see findActiveNextCard).
  const [curriculumBuckets, setCurriculumBuckets] = useState<string[]>([]);
  const [selectedCard, setSelectedCard] = useState<TimelineFeedCard | null>(null);
  // CAPE Phase 0-1 profile (drives SkillMeter + Readiness); Phase 5 filter-chip counts + skill-drawer selection.
  const [capeProfile, setCapeProfile] = useState<LearnerSkillProfile | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<Category | 'all'>('all');
  const [categoryCounts, setCategoryCounts] = useState<Record<Category, number>>({ my_path: 0, ai_pulse: 0, classroom: 0, projects: 0, community: 0, review: 0 });
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const selectedSkill = capeProfile?.skills.find((s) => s.skill_id === selectedSkillId);

  const me = useMemo(readParticipant, []);
  const { flags } = usePortalFlags();
  // CAPE Phase 5 — Today-Plan/Explore-feed mount gate; see useTodayPlanGate.ts.
  const { planRefs, setPlanRefs } = useTodayPlanGate(flags);
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
    const [p, s, pr, cl, st, cp] = await Promise.allSettled([
      fetchPoints(), loadSchedule(), fetchOnboardingProfile(), portalApi.get('/api/portal/classroom'), fetchStreak(), fetchSkillProfile(),
    ]);
    if (p.status === 'fulfilled') setPoints(p.value);
    if (s.status === 'fulfilled') setSchedule(s.value);
    if (pr.status === 'fulfilled') setProfile(pr.value);
    if (cl.status === 'fulfilled') {
      setCurriculum(((cl.value.data?.cards as TimelineFeedCard[]) || []).sort((a, b) => (a.week ?? 0) - (b.week ?? 0) || a.order - b.order));
      setCurriculumBuckets((cl.value.data?.buckets as string[]) || []);
    }
    if (st.status === 'fulfilled') setStreak(st.value);
    if (cp.status === 'fulfilled') setCapeProfile(cp.value);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  // Refetch the Today feed + status whenever points are earned (e.g. a quick-check
  // completed in the drawer) so the sidebar stays live without a navigation.
  useEffect(() => onPointsEarned(() => { void loadAll(); }), [loadAll]);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const flash = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(''), 2600); };

  const total = points?.total ?? 0;
  const lvl = levelFor(total);
  // Architect Readiness — backend-owned (CAPE Phase 0-1), replaces the previous
  // hardcoded 0/100 literal. Rounds the same overall_proficiency SkillMeter renders,
  // so the ring and the radar can never disagree (design doc §2, §11, §17 AC 10).
  const readiness = capeProfile ? Math.round(capeProfile.overall_proficiency) : 0;
  // Banding for the condensed-header readiness chip — same thresholds a
  // student would read as "on track" / "building" / "just starting".
  const readinessTone: CondensedTone = readiness >= 70 ? 'leaf' : readiness >= 40 ? 'amber' : 'cherry';
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

  const {
    showReferral, setShowReferral, referralFriends, referralSubmitted,
    addReferralRow, updateReferralRow, removeReferralRow, submitReferralFriends, resetReferralForm,
  } = useReferralForm({ busy, setBusy, points, setPoints, loadAll, flash });

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
  // The single "what should I do right now" answer the Command Center leads
  // with — see useTodayNextStep.ts for the enrolled-vs-explorer branching.
  const nextSetupStep = steps.find((s) => !s.done) ?? null;
  const nextStep = useTodayNextStep({
    isExplorer: !!schedule?.is_explorer,
    curriculum,
    buckets: curriculumBuckets,
    setupRemaining,
    nextSetupStepTitle: nextSetupStep?.title ?? null,
    planFlagOn: !!flags?.cape_today_plan,
    refreshToken: points,
  });
  const scrollToAnchor = (id: string) => () => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Shared collect handler for TodayFeedV2 + TodayPlan (CAPE Phase 5) — one
  // implementation so the two surfaces never drift. Throws on the server
  // watch/read/lock gate (422); ambient blogs (`blog:<id>`) use the read gate.
  const handleCardComplete = useCallback(async (card: TimelineFeedCard) => {
    const blogId = card.id.startsWith('blog:') ? card.id.slice('blog:'.length) : null;
    const res = blogId
      ? await runtimeApi.blogCollect(blogId)
      : (await portalApi.post(`/api/portal/classroom/cards/${card.id}/complete`)).data;
    await loadAll();
    emitPointsEarned(res?.points_awarded ?? 0); // HUD burst + chime
    emitCardCollected(card.id);                 // drop it off the feed
  }, [loadAll]);

  return (
    <PortalShell
      todayBadge={setupRemaining}
      condensedSlot={(
        <CondensedHeaderCard
          icon={<svg viewBox="0 0 24 24" fill="none"><path d="M12 2l2.8 6.6 7.2.6-5.5 4.7 1.7 7L12 17.8 5.8 21.5l1.7-7L2 9.8l7.2-.6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>}
          tone="leaf"
          visual={<div className="te-ring mini" style={{ '--p': lvl.pct, '--c': 'var(--leaf)' } as React.CSSProperties}><div className="v"><b>{total}</b></div></div>}
          label="Next tier"
          title={lvl.next ? lvl.next.name : 'Max level'}
          sub={lvl.next ? `${lvl.next.min - total} pts to go` : 'Top tier reached'}
          stats={[{
            icon: <span className="ic"><svg viewBox="0 0 24 24" fill="none"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg></span>,
            value: `${readiness}`,
            tone: readinessTone,
            title: `Architect readiness — ${readiness}/100`,
          }]}
          action={<OpenOnPhone />}
        />
      )}
    >
      {(condensed) => (
        <>
      {toast && <div className="te-toast">{toast}</div>}

      <div className={`te-condense-body${condensed ? ' is-condensed' : ''}`}>
      {redesign ? (
        /* command band — greeting + primary next step + the three meters in one row */
        <div className="te-band">
          <div>
            <div className="crumb">◆ {schedule?.is_explorer ? 'Free AI Preview' : 'Command Center'}</div>
            <h2>{firstName ? `Welcome back, ${firstName} 👋` : 'Welcome back 👋'}</h2>
            <TodayNextStepBanner
              nextStep={nextStep}
              total={total}
              hasBackground={hasBackground}
              onOpenUpload={openUpload}
              onScrollTo={scrollToAnchor}
            />
          </div>
          <div className="te-cluster">
            <div className="te-ringwrap lf">
              <div className="te-ring" style={{ '--p': lvl.pct, '--c': 'var(--leaf)' } as React.CSSProperties}><div className="v"><b>{total}</b><span>pts</span></div></div>
              <div className="cap">{lvl.name}</div>
            </div>
            {setupRemaining > 0 && (
              <div className="te-ringwrap">
                <div className="te-ring" style={{ '--p': setupPct, '--c': 'var(--berry)' } as React.CSSProperties}><div className="v"><b>{setupDone}/{steps.length}</b><span>setup</span></div></div>
                <div className="cap">Setup</div>
              </div>
            )}
            <div className="te-ringwrap">
              <div className="te-ring" style={{ '--p': Math.max(2, readiness), '--c': 'var(--cherry)' } as React.CSSProperties}><div className="v"><b>{readiness}</b><span>/100</span></div></div>
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
      </div>

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
            <Link className="te-btn cherry" to="/portal/settings?tab=subscription">Enroll to unlock →</Link>
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
          <SkillMeter profile={capeProfile} onSkillClick={flags?.cape_today_plan ? setSelectedSkillId : undefined} />

          {showSetupModal && (
            <SetupModal
              onClose={() => setShowSetupModal(false)}
              steps={steps}
              busy={busy}
              showUpload={showUpload}
              setShowUpload={setShowUpload}
              uploadName={uploadName}
              fileRef={fileRef}
              onFilePicked={onFilePicked}
              showReferral={showReferral}
              setShowReferral={setShowReferral}
              referralFriends={referralFriends}
              referralSubmitted={referralSubmitted}
              addReferralRow={addReferralRow}
              updateReferralRow={updateReferralRow}
              removeReferralRow={removeReferralRow}
              submitReferralFriends={submitReferralFriends}
              resetReferralForm={resetReferralForm}
            />
          )}

          {/* CAPE Phase 5 finite Today Plan — flag-gated, see useTodayPlanGate.ts.
              id is the "Jump to Today's Plan" scroll target from the command
              band's `nextStep.kind === 'plan'` CTA above. */}
          {flags?.cape_today_plan && (
            <div id="te-today-plan-anchor">
              <TodayPlan
                onRefs={setPlanRefs}
                onOpen={setSelectedCard}
                onWorkspace={setSelectedCard}
                onComplete={handleCardComplete}
              />
            </div>
          )}

          {/* ── aggregated timeline — the big feed pulling from every page ──
              id is the "See your timeline" scroll target above. */}
          <div className="te-feed" id="te-timeline-anchor">
            <div className="te-feed-head">
              <span className="h">
                <svg viewBox="0 0 24 24" fill="none"><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.5 2.5M16.5 16.5L19 19M19 5l-2.5 2.5M7.5 16.5L5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="12" r="3.4" stroke="currentColor" strokeWidth="2" /></svg>
                Your timeline · everything in one place
              </span>
            </div>
            <TimelineFilterChips
              enabled={!!flags?.cape_today_plan}
              filter={categoryFilter}
              counts={categoryCounts}
              onChange={setCategoryFilter}
            />
            {/* Gated on planRefs !== null — closes the mount-order race. */}
            {planRefs !== null && (
              <TodayFeedV2
                fallbackCards={curriculum}
                onOpen={setSelectedCard}
                onWorkspace={setSelectedCard}
                onComplete={handleCardComplete}
                excludeRefs={planRefs}
                filter={flags?.cape_today_plan ? categoryFilter : undefined}
                onCounts={flags?.cape_today_plan ? setCategoryCounts : undefined}
              />
            )}
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
            <div className="te-stat"><span className="lab">Architect Readiness</span><span className="num">{readiness}/100</span></div>
            <div className="te-ribbon" style={{ marginBottom: 4 }}><i style={{ width: `${Math.max(2, readiness)}%`, background: 'var(--cherry)' }} /></div>
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
      <SkillDetailDrawer
        skillId={selectedSkillId}
        skillName={selectedSkill?.name ?? null}
        placement={selectedSkill?.placement ?? 0}
        verified={selectedSkill?.proficiency ?? 0}
        onClose={() => setSelectedSkillId(null)}
      />
        </>
      )}
    </PortalShell>
  );
};

export default TodayShell;
