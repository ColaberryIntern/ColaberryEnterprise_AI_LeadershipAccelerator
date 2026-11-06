import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './TodayShell.css';
import {
  fetchPoints, fetchOnboardingProfile, rsvpOpenHouse, ingestBackground, fetchStreak, claimDailyStreak,
  levelFor, PointsSummary, OnboardingSchedule, OnboardingProfileView, StreakView,
} from '../../../services/onboardingApi';
import { loadSchedule, resetScheduleCache } from '../scheduleCache';
import PortalShell from './PortalShell';
import { usePortalFlags } from '../../../hooks/usePortalFlags';
import {
  readParticipant, countdown, firstClassTargetMs,
  fmtCentralDateTime, projectWorkspacePath,
} from './shellUtils';
import portalApi from '../../../utils/portalApi';
import { trackLeadOnce } from '../../../services/metaPixel';
import { emitPointsEarned, onPointsEarned, emitCardCollected } from '../../../services/pointsFx';
import { uploadResume, fileToBase64 } from '../../../services/portalSettingsApi';
import { runtimeApi } from '../runtime/runtimeApi';
import { TimelineFeedCard } from '../../../components/timeline/TimelineCard';
import { ambientMediaOf } from '../../../components/timeline/ambientMedia';
import TodayEventsRail from './TodayEventsRail';
import TodayRail from './TodayRail';
import TodayCommandBand from './TodayCommandBand';
import TodayTimeline from './TodayTimeline';
import TodayFeedPlacement from './TodayFeedPlacement';
import TodayPlan from './TodayPlan';
import { useTodayPlanGate } from './useTodayPlanGate';
import type { Category } from './todayCategoryFilter';
import SkillDetailDrawer from './SkillDetailDrawer';
import CardDetailDrawer from '../../../components/timeline/CardDetailDrawer';
import { useExplorerHomeBase } from './ExplorerHomeBase';
import { promotable } from '../../../components/campus/events/eventsModel';
import { useCampusView } from '../../../components/campus/useCampusView';
import { fetchInternshipStatus, InternshipStatus } from '../../../services/internshipApi';
import { useNextLiveSession } from './useNextLiveSession';
import '../../../components/timeline/timeline.css';
import SkillMeter from '../SkillMeter';
import SetupModal from './SetupModal';
import { useReferralForm } from './useReferralForm';
import { fetchSkillProfile, LearnerSkillProfile } from '../../../services/capeApi';
import { useTodayNextStep } from './useTodayNextStep';
import TodayNextStepCondensed from './TodayNextStepCondensed';
import ExplorerPreviewBanner from './ExplorerPreviewBanner';
import { recordBannerOpen } from './todayFeedApi';
import { needsFirstWin, needsFirstLesson, findFirstLessonCard, FIRST_LESSON_PARAM } from './explorerFirstWin';

const TodayShell: React.FC = () => {
  // False until the first loadAll() settles. Gates every derived number in the
  // command band so a cold load shows placeholders rather than confident zeros.
  const [hydrated, setHydrated] = useState(false);
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
  // AI Internship card. Null until the status call settles, and null forever if
  // the flag is off or the call fails — the rail simply has one fewer card,
  // which is the correct degraded state for an optional opportunity surface.
  const [internship, setInternship] = useState<InternshipStatus | null>(null);
  const [internshipToken, setInternshipToken] = useState(0);
  useEffect(() => {
    let alive = true;
    fetchInternshipStatus()
      .then((s) => { if (alive) setInternship(s); })
      .catch(() => { if (alive) setInternship(null); });
    return () => { alive = false; };
  }, [internshipToken]);
  const [curriculum, setCurriculum] = useState<TimelineFeedCard[]>([]);
  // Section-bucket order for the whole curriculum feed (pre_class -> learn ->
  // ... -> advance) — needed to find the "active next step" the same way
  // Classroom itself orders a week's cards (see findActiveNextCard).
  const [curriculumBuckets, setCurriculumBuckets] = useState<string[]>([]);
  const [selectedCard, setSelectedCard] = useState<TimelineFeedCard | null>(null);
  const navigate = useNavigate();

  // "Open" a card. Almost always that means the drawer — but a project task is
  // not a card, it is a task in the student's project, and its real home is the
  // project workspace (build context, repo state, AI mentor). The drawer could
  // only ever show its title and a broken "Enter workspace" button. Routed
  // rather than location.assign so the shell, auth and scroll position survive.
  // This decision lives here, not in TimelineCard, because the tile is rendered
  // by containers with no Router and must stay presentational.
  const openCard = useCallback((card: TimelineFeedCard) => {
    const workspace = projectWorkspacePath(card);
    // Backing out returns to Today (Ali, 2026-10-26), as the drawer's Enter workspace already does
    if (workspace) { navigate(workspace, { state: { from: '/portal/today' } }); return; }
    setSelectedCard(card);
  }, [navigate]);
  // CAPE Phase 0-1 profile (drives SkillMeter + Readiness); Phase 5 filter-chip counts + skill-drawer selection.
  const [capeProfile, setCapeProfile] = useState<LearnerSkillProfile | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<Category | 'all'>('all');
  const [categoryCounts, setCategoryCounts] = useState<Record<Category, number>>({ my_path: 0, ai_pulse: 0, classroom: 0, projects: 0, community: 0, review: 0 });
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const selectedSkill = capeProfile?.skills.find((s) => s.skill_id === selectedSkillId);

  const me = useMemo(readParticipant, []);

  /**
   * Report this person to Meta as a Lead, ONCE, ever.
   *
   * Sohail asked for fbq('track','Lead') on this page. Fired literally it would run every
   * time a student opens their dashboard - and this is the page they open daily, so one
   * signup would report as dozens of leads. Cost-per-lead would look superb and be
   * meaningless, and the optimiser would learn to buy people who open portals rather than
   * people who enrol. `trackLeadOnce` keys on the person and remembers.
   *
   * Fails silent by design: an ad pixel must never be able to break a student's dashboard.
   */
  useEffect(() => { void trackLeadOnce(me.email); }, [me.email]);
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
    // Every value below is derived from state that starts null, and the render
    // treats null as ZERO rather than UNKNOWN — so before this resolves the
    // command band confidently claims "0 points", "Apprentice", "1/3 setup" and
    // "you're all caught up", then flips to the truth a few seconds later.
    // `hydrated` lets those spots render a skeleton instead of a wrong number.
    // Set after ALL settle (never in a per-promise branch) so the band changes
    // once, rather than twitching as each request lands.
    setHydrated(true);
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
  // business accounts are never shown an Open House (Ali, 2026-10-26; eventsModel.promotable)
  const { audience: campusAudience } = useCampusView();
  const oh = promotable(campusAudience, schedule?.next_open_house);
  const ohCd = countdown(oh ? new Date(oh.starts_at).getTime() : null, now);
  const fcCd = countdown(firstClassTargetMs(schedule?.first_class ?? null), now);
  const hasBackground = !!(profile && (profile.has_resume || profile.linkedin_url));
  const hasReferral = !!profile?.has_referral;
  const rsvped = !!schedule?.my_rsvp;
  // Redesign flag (default ON while loading). firstName from the real profile —
  // never the raw email prefix.
  const redesign = flags?.today_redesign ?? true;
  // C54 (v13 T6): an Explorer on the campus gets the home-base kicker and the pass + tour cards in the rail
  const explorerHome = useExplorerHomeBase();
  // C91: an Explorer with no first win yet gets one job, their first lesson; the enroll ask waits until after it
  const firstWinPending = needsFirstWin(schedule);
  const firstLesson = useMemo(() => (firstWinPending ? findFirstLessonCard(curriculum, curriculumBuckets) : null), [firstWinPending, curriculum, curriculumBuckets]);
  // C107: after an explicit first win the banner offers the next card; banner opens are recorded like feed opens
  const firstWinDone = !!schedule?.is_explorer && schedule.first_win === true;
  const nextLesson = useMemo(() => (firstWinDone ? findFirstLessonCard(curriculum, curriculumBuckets) : null), [firstWinDone, curriculum, curriculumBuckets]);
  const openFromBanner = useCallback((card: TimelineFeedCard) => { recordBannerOpen(card.id); openCard(card); }, [openCard]);
  // The campus gate's "Start your first lesson" and the sign-in landing land here with ?first=1: open that lesson once, as soon as it
  // is known. C115: for any learner with no lesson done (needsFirstLesson), not only an Explorer; the banner above stays Explorer-only.
  const firstLessonPending = needsFirstLesson(schedule);
  const lessonToOpen = useMemo(() => (firstLessonPending ? findFirstLessonCard(curriculum, curriculumBuckets) : null), [firstLessonPending, curriculum, curriculumBuckets]);
  const firstOpened = React.useRef(false);
  useEffect(() => {
    if (firstOpened.current || !hydrated || !lessonToOpen) return;
    if (new URLSearchParams(window.location.search).get(FIRST_LESSON_PARAM) !== '1') return;
    firstOpened.current = true;
    openCard(lessonToOpen);
  }, [hydrated, lessonToOpen, openCard]);
  const firstName = profile?.profile?.full_name?.trim().split(/\s+/)[0] || '';

  // The real registration lives on Eventbrite; RSVP here records it + awards
  // points, then sends the student to Eventbrite to secure their seat.
  //
  // The destination is THIS event's own `registration_url` (CCPP
  // `EventBrite_Events.URL`), never a constant. It used to open a hardcoded link
  // to the Jul 16 2026 Open House, so the card correctly named the upcoming
  // event and then sent everyone to a completed one. Every upcoming event in
  // CCPP carries its own URL, so there is nothing to fall back to — and sending
  // someone to the wrong event is worse than sending them nowhere.
  const doRsvp = async () => {
    if (!oh || busy) return;
    // Captured before the awaits: `oh` can be replaced by loadAll() below, and
    // this must be the event the student actually clicked on.
    const registrationUrl = oh.registration_url;
    setBusy(true);
    try {
      const r = await rsvpOpenHouse(oh.id);
      await loadAll();
      emitPointsEarned(r.awarded ? (r.points ?? 0) : 0);
      flash(r.awarded ? `RSVP confirmed — +${r.points} points` : 'You are already RSVP\'d');
    } catch { flash('Could not RSVP right now'); } finally { setBusy(false); }
    // Still opened when the points call failed — securing the Eventbrite seat is
    // the part that actually matters to the student.
    if (registrationUrl) window.open(registrationUrl, '_blank', 'noopener');
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
    { key: 'account', title: 'Create your account', done: true, meta: 'Welcome to Colaberry', pts: 0, action: null as null | (() => void) },
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
    nextSetupStep,
    planFlagOn: !!flags?.cape_today_plan,
    refreshToken: points,
    firstLesson,
  });
  const scrollToAnchor = (id: string) => () => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Shared collect handler for TodayFeedV2 + TodayPlan (CAPE Phase 5) — one
  // implementation so the two surfaces never drift. Throws on the server
  // watch/read/lock gate (422); ambient blogs (`blog:<id>`) use the read gate.
  // ONE collect path for every kind of Today item. The tile and the drawer both
  // land here; what differs is only which gate the server applies:
  //   blog:<id>                → the 2-minute read gate
  //   podcast:/testimonial:<id> → the 75% listen/watch gate (ambient media)
  //   everything else          → the card's own completion gate
  // Server-side rejections (422) propagate so the caller can surface the reason.
  const collectCard = useCallback(async (card: TimelineFeedCard): Promise<{ points_awarded?: number } | null> => {
    const blogId = card.id.startsWith('blog:') ? card.id.slice('blog:'.length) : null;
    const media = ambientMediaOf(card);
    if (blogId) return runtimeApi.blogCollect(blogId);
    if (media) return runtimeApi.mediaCollect(media.kind, media.id);
    return (await portalApi.post(`/api/portal/classroom/cards/${card.id}/complete`)).data;
  }, []);

  const handleCardComplete = useCallback(async (card: TimelineFeedCard) => {
    const res = await collectCard(card);
    resetScheduleCache(); // C91: a completion can be the first win; re-read the schedule so the enroll ask returns without a reload
    await loadAll();
    emitPointsEarned(res?.points_awarded ?? 0); // HUD burst + chime
    emitCardCollected(card.id);                 // drop it off the feed
  }, [collectCard, loadAll]);

  return (
    <PortalShell
      todayBadge={hydrated ? setupRemaining : 0}
      condensedSlot={<TodayNextStepCondensed nextStep={nextStep} onScrollTo={scrollToAnchor} onOpenCard={openCard} />}
    >
      {(condensed) => (
        <>
      {toast && <div className="te-toast">{toast}</div>}

      <div className={`te-condense-body${condensed ? ' is-condensed' : ''}`}>
      <TodayCommandBand
        redesign={redesign} explorerHome={explorerHome} isExplorer={!!schedule?.is_explorer} hydrated={hydrated}
        firstName={firstName} email={me.email} nextStep={nextStep} total={total} onOpenCard={openCard}
        onScrollTo={scrollToAnchor} lvl={lvl} setupRemaining={setupRemaining} setupPct={setupPct} setupDone={setupDone}
        setupTotal={steps.length} readiness={readiness} streak={streak} streakCount={streakCount}
        claimedToday={claimedToday} busy={busy} doClaimStreak={doClaimStreak}
      />
      </div>

      {schedule?.is_explorer && (
        <ExplorerPreviewBanner firstWinPending={firstWinPending} firstLesson={firstLesson} nextLesson={nextLesson} onStartLesson={openFromBanner}
          onSeeTimeline={scrollToAnchor('te-timeline-anchor')}
          fcCd={fcCd} ohCd={ohCd} ohTitle={oh?.title ?? null} showRsvp={!!oh} rsvped={rsvped} busy={busy} onRsvp={doRsvp} />
      )}

      <div className="te-grid">
        <div>
          {/* C110: before a first win the starter feed goes first, under the banner (TodayFeedPlacement.tsx) */}
          <TodayFeedPlacement starterFirst={firstWinPending} timeline={(
            <TodayTimeline
              capeTodayPlan={!!flags?.cape_today_plan} categoryFilter={categoryFilter} categoryCounts={categoryCounts}
              onFilterChange={setCategoryFilter} onCounts={setCategoryCounts} planRefs={planRefs} curriculum={curriculum}
              onOpen={openCard} onComplete={handleCardComplete}
            />
          )}>
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
          {hydrated && setupRemaining > 0 && (
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
                onOpen={openCard}
                onWorkspace={openCard}
                onComplete={handleCardComplete}
              />
            </div>
          )}

          {/* Upcoming public events, above the timeline — the Classroom's own
              events rail, next 7 (Ali, 2026-09-11). Self-rendering: shows
              nothing when there are no events or CCPP is unreachable. */}
          <TodayEventsRail />
          </TodayFeedPlacement>
        </div>

        <TodayRail
          redesign={redesign} lvl={lvl} total={total} setupDone={setupDone} setupTotal={steps.length} setupPct={setupPct}
          readiness={readiness} explorerHome={explorerHome} streak={streak} streakCount={streakCount} streakWeek={streakWeek}
          claimedToday={claimedToday} busy={busy} doClaimStreak={doClaimStreak} internship={internship}
          onInternshipChanged={() => setInternshipToken((n) => n + 1)} nextLiveSession={nextLiveSession}
          firstClass={schedule?.first_class} fcCd={fcCd} oh={oh} rsvped={rsvped} doRsvp={doRsvp}
        />
      </div>
      <CardDetailDrawer
        card={selectedCard}
        onClose={() => setSelectedCard(null)}
        onComplete={async (card) => {
          // Same dispatch as the tile (collectCard); the drawer additionally closes.
          // A server rejection propagates so the drawer surfaces the reason.
          const res = await collectCard(card);
          setSelectedCard(null);
          resetScheduleCache(); // C91: the first lesson finishes here; re-read first_win
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
