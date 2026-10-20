import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import api from '../../utils/api';
import { PageHeader, SectionCard, StatCard, StatusBadge } from '../../components/admin/shell';
// The SAME component the Lead detail page renders. Reused rather than rebuilt:
// it is 504 lines of stage analysis, velocity, stall detection and an engagement
// chart, and a second implementation would drift from it within a release.
import JourneyTimeline from '../../components/admin/JourneyTimeline';
import ActivityTimeline from '../../components/admin/ActivityTimeline';
import AddNoteForm from '../../components/admin/AddNoteForm';
import ScheduleAppointmentModal from '../../components/admin/ScheduleAppointmentModal';
// Extracted from AdminLeadDetailPage so both pages share ONE write path. This
// profile is meant to replace that page, and two implementations of a write
// drift — with the unwatched one still writing.
import LeadPipelineBar from '../../components/admin/lead/LeadPipelineBar';
import LeadStatusNotes from '../../components/admin/lead/LeadStatusNotes';
import LeadStrategyPrep from '../../components/admin/lead/LeadStrategyPrep';
// The programme panels an audit of every person-keyed table added on 2026-09-09.
// Each is its own module: the page was already 934 lines before they arrived.
import ClassActivityTab from '../../components/admin/person/ClassActivityTab';
import WorkTab from '../../components/admin/person/WorkTab';
import CommunicationsTab from '../../components/admin/person/CommunicationsTab';
import StrategyBriefPanel from '../../components/admin/person/StrategyBriefPanel';
import AccountTab from '../../components/admin/person/AccountTab';
import GrowthTab from '../../components/admin/person/GrowthTab';
import { Field, fmtDate, fmtDateTime } from '../../components/admin/person/primitives';
import type { Journey, Profile, TempEntry, TimelineEvent, VisitorData } from '../../adminOs/personTypes';
import { refForApi } from '../../adminOs/personLink';
import { DOMAIN_TONE, STAGE_LABEL, STAGE_TONE, TEMPERATURE_TONE } from '../../adminOs/personStages';
import { buildPersonTabs } from '../../adminOs/personTabs';
import type { TabKey } from '../../adminOs/personTabs';
import AcquisitionTab from '../../components/admin/person/AcquisitionTab';
import RawEventDrawer from '../../components/admin/person/RawEventDrawer';
import TimelineTab from '../../components/admin/person/TimelineTab';
import AppointmentsAutomationTab from '../../components/admin/person/AppointmentsAutomationTab';
import DataTrustTab from '../../components/admin/person/DataTrustTab';
import EnrolmentsTab from '../../components/admin/person/EnrolmentsTab';
import ExplorerScoreTab from '../../components/admin/person/ExplorerScoreTab';
import SalesReadinessTab from '../../components/admin/person/SalesReadinessTab';
import PaymentRecordTab from '../../components/admin/person/PaymentRecordTab';
import SiteActivityTab from '../../components/admin/person/SiteActivityTab';

/**
 * The canonical 360° person profile.
 *
 * ── LAYOUT ──────────────────────────────────────────────────────────────────
 *
 * Progressive disclosure, as the brief asks: a KPI row you can read at a glance,
 * then TABS per domain, then detail inside each. The first version stacked every
 * section vertically, so the page was a long scroll of half-empty cards and the
 * timeline — the thing actually worth reading — sat below three panels of single
 * facts.
 *
 * ── PERMISSIONS ─────────────────────────────────────────────────────────────
 *
 * A tab exists only if the API sent its panel. Nothing is hidden here: a panel
 * the caller may not see was never fetched and is not in the payload, so this
 * component cannot widen access. T212 added a panel and introduced NO new
 * permission path: `personProfileService.mayReadPanel` remains the only
 * authority, and `withheldPanels` is what lets this page say what it is not
 * showing instead of leaving a silent gap.
 *
 * ── WHAT THIS FILE IS, AFTER THE 2026-10-11 SPLIT ───────────────────────────
 *
 * A shell: fetch, tab state, header, nav, and one line per tab. It was 1,076
 * lines with a 998-line component, against CLAUDE.md's 500-line file and
 * 100-line function ceilings, and the rule is that the next change to an
 * oversize file splits it before adding new code. Eight panels moved to
 * `components/admin/person/` and the tab registry to `adminOs/personTabs`,
 * which also made the registry unit-testable without a DOM or a mocked client.
 *
 * STILL OVER THE FUNCTION CEILING, and said rather than implied: the component
 * is 392 lines (79-470), not under 100. What remains is irreducibly page-level — the
 * fetch effects, the deep-link effect, the header, and the tab switch that
 * cannot be split without inventing a routing abstraction for one page. The
 * FILE is under its ceiling; the FUNCTION is not, and the next change here
 * should take the header and the fetches out.
 */

export default function PersonProfilePage() {
  // A REF, not necessarily an email. Admin surfaces link with whatever they
  // hold — `lead:123` and `enrollment:<uuid>` are resolved by the API — so the
  // route segment is opaque here and `profile.email` is the resolved identity.
  const { ref: rawRef } = useParams<{ ref: string }>();
  const personRef = refForApi(rawRef);
  // ?tab= is a DEFAULT chosen by whoever linked here, not a lock. An unknown
  // tab, or one this caller may not see, falls through to the usual first tab.
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');

  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('timeline');
  // Website activity and temperature history come from the lead endpoints the
  // Lead page already uses, so the two surfaces cannot disagree. Fetched only
  // when this person HAS a lead, and failing soft: these endpoints are
  // requireSalesOrAdmin, so a scoped identity simply does not get the panels.
  const [visitor, setVisitor] = useState<VisitorData | null>(null);
  const [tempHistory, setTempHistory] = useState<TempEntry[] | null>(null);
  // The Journey card's OWN touchpoint figure. Counted differently from
  // anything in the profile payload -- it is the length of the journey event
  // set -- so the badge has to read the same number rather than approximate
  // it, or the tab says 2 while the card behind it says 15.
  const [journeyTouchpoints, setJourneyTouchpoints] = useState<number | null>(null);
  const [showAppointment, setShowAppointment] = useState(false);
  // Bumped after any write so the activity timeline reflects it immediately.
  const [activityKey, setActivityKey] = useState(0);
  // The brief's third disclosure level: summary, then domain sections, then the
  // raw record behind a single event.
  const [rawEvent, setRawEvent] = useState<TimelineEvent | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/api/admin/people/profile?ref=${encodeURIComponent(personRef)}`);
      setProfile(res.data);
    } catch (err) {
      setProfile(null);
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(
        status === 404 ? 'No such person, or not visible to your role.'
          : status === 403 ? 'Your role does not include access to person records.'
            : 'Could not load this profile.',
      );
    } finally {
      setLoading(false);
    }
  }, [personRef]);

  useEffect(() => { void load(); }, [load]);

  // Second pass: the lead-sourced panels. Deliberately separate from the profile
  // request — these are the Lead page's own endpoints, so reusing them keeps the
  // two surfaces identical, and a 403 here simply means this identity does not
  // get those panels rather than breaking the profile.
  const leadId = profile?.acquisition?.leadId ?? null;
  useEffect(() => {
    if (leadId === null) { setVisitor(null); setTempHistory(null); setJourneyTouchpoints(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/api/admin/leads/${leadId}`);
        if (!cancelled) setVisitor(res.data?.visitor ?? null);
      } catch { if (!cancelled) setVisitor(null); }
      try {
        const res = await api.get(`/api/admin/leads/${leadId}/temperature-history`);
        const rows = Array.isArray(res.data) ? res.data : res.data?.history;
        if (!cancelled) setTempHistory(Array.isArray(rows) ? rows : null);
      } catch { if (!cancelled) setTempHistory(null); }
      try {
        const res = await api.get(`/api/admin/leads/${leadId}/journey`);
        const n = res.data?.metrics?.total_touchpoints;
        if (!cancelled) setJourneyTouchpoints(typeof n === 'number' ? n : null);
      } catch { if (!cancelled) setJourneyTouchpoints(null); }
    })();
    return () => { cancelled = true; };
  }, [leadId]);

  // Only tabs whose panel the API actually sent. The registry itself is a
  // pure function in `adminOs/personTabs` -- see its docblock for why it is
  // not inline any more, and for why the two kinds of absence differ.
  const tabs = useMemo(
    () => buildPersonTabs(profile, tempHistory?.length ?? null, journeyTouchpoints),
    [profile, tempHistory, journeyTouchpoints],
  );

  // Applied ONCE per load. Without the ref the effect would re-apply ?tab= every
  // time `tab` changed, so clicking away from the requested tab would snap
  // straight back to it. A ref rather than an eslint-disable: every dependency
  // stays declared, and `react-hooks/exhaustive-deps` is not registered in this
  // project's config, so suppressing it is itself a build error.
  const deepLinkApplied = useRef(false);
  useEffect(() => {
    if (!tabs.length) return;
    if (!deepLinkApplied.current && requestedTab && tabs.some((t) => t.key === requestedTab)) {
      deepLinkApplied.current = true;
      setTab(requestedTab as TabKey);
      return;
    }
    if (!tabs.some((t) => t.key === tab)) setTab(tabs[0].key);
  }, [tabs, tab, requestedTab]);

  const acq = profile?.acquisition;

  return (
    <div className="container-fluid py-4">
      <PageHeader
        title={profile?.name || profile?.email || personRef}
        subtitle={
          profile && (profile.title || profile.company)
            ? [profile.title, profile.company].filter(Boolean).join(' · ')
            : profile?.email || personRef
        }
        icon="user-3-line"
        breadcrumb={[
          { label: 'Admin', to: '/admin/dashboard' },
          { label: 'People', to: '/admin/people' },
          { label: profile?.name || 'Profile' },
        ]}
        actions={
          <div className="d-flex align-items-center gap-2">
            {profile && (
              <StatusBadge
                label={STAGE_LABEL[profile.stage] ?? profile.stage}
                tone={STAGE_TONE[profile.stage] ?? 'neutral'}
                icon="user-follow-line"
              />
            )}
            {/* Absent for enrolled people by design — see intentSuppressedReason. */}
            {acq?.temperature && (
              <span className={`badge text-bg-${TEMPERATURE_TONE[acq.temperature] ?? 'secondary'}`}>
                {acq.temperature}
              </span>
            )}
            {profile && !profile.tracedToLead && (
              <span className="badge text-bg-warning">No acquisition record</span>
            )}
            {acq?.leadId && (
              <button type="button" className="btn btn-sm btn-outline-primary"
                onClick={() => setShowAppointment(true)}>
                Schedule appointment
              </button>
            )}
          </div>
        }
      >
        {/* The relationship at a glance, before any detail. */}
        {profile?.journey && (
          <div className="row g-3">
            <div className="col-6 col-md-4 col-xl-2">
              <StatCard
                label="Known for"
                value={profile.journey.daysKnown === null ? '—' : profile.journey.daysKnown}
                unit={profile.journey.daysKnown === null ? undefined : 'days'}
                icon="calendar-line" tone="info"
                hint={fmtDate(profile.journey.firstTouch) ? `since ${fmtDate(profile.journey.firstTouch)}` : undefined}
              />
            </div>
            {/* M24.2 - a dash, not a zero, when the count was never taken. These four come from
                the lead side, so a person with no lead record has no measurement here at all,
                and showing 0 claimed we had looked and found nothing. */}
            <div className="col-6 col-md-4 col-xl-2">
              <StatCard label="Page events" value={profile.journey.pageEvents ?? '—'} icon="cursor-line" tone="primary" />
            </div>
            <div className="col-6 col-md-4 col-xl-2">
              <StatCard label="Sessions" value={profile.journey.sessions ?? '—'} icon="global-line" tone="primary" />
            </div>
            <div className="col-6 col-md-4 col-xl-2">
              <StatCard label="Emails sent" value={profile.journey.emailsSent ?? '—'} icon="mail-send-line" tone="neutral" />
            </div>
            <div className="col-6 col-md-4 col-xl-2">
              <StatCard label="Campaigns" value={profile.journey.campaigns ?? '—'} icon="megaphone-line" tone="neutral" />
            </div>
            {/* No intent tile once someone has converted. A dash would still
                invite the question; the tile simply does not belong on an
                enrolled person's header. */}
            {!profile.intentSuppressedReason && (
              <div className="col-6 col-md-4 col-xl-2">
                <StatCard
                  label="Peak intent"
                  value={profile.journey.intentScore ?? '—'}
                  icon="fire-line"
                  tone={(profile.journey.intentScore ?? 0) >= 50 ? 'danger' : 'neutral'}
                />
              </div>
            )}
            {profile.intentSuppressedReason && (
              <div className="col-6 col-md-4 col-xl-2">
                {/* M24.3 - null when the caller's grants narrowed the id list, in which case
                    this is a fact about the viewer and not about the person. */}
                <StatCard label="Enrolments" value={profile.journey.enrollments ?? '—'}
                  icon="graduation-cap-line" tone="success" />
              </div>
            )}
            {/* What they DID, beside what they were sent. An acquisition-only
                header made a heavy learner look like a quiet lead.
                The tiles stay hidden for an absent count as well as a zero one: there is
                nothing to say about a learner we never looked up. */}
            {(profile.journey.cardsCompleted ?? 0) > 0 && (
              <div className="col-6 col-md-4 col-xl-2">
                <StatCard label="Cards completed" value={profile.journey.cardsCompleted ?? '—'}
                  icon="book-open-line" tone="success" />
              </div>
            )}
            {(profile.journey.sessionsAttended ?? 0) > 0 && (
              <div className="col-6 col-md-4 col-xl-2">
                <StatCard label="Classes attended" value={profile.journey.sessionsAttended ?? '—'}
                  icon="calendar-check-line" tone="success" />
              </div>
            )}
          </div>
        )}
      </PageHeader>

      {loading && !profile && (
        <div className="text-center py-5"><div className="spinner-border text-primary" /></div>
      )}
      {error && <div className="alert alert-danger">{error}</div>}

      {profile && (
        <>
          {profile.withheldPanels.length > 0 && (
            <div className="alert alert-secondary py-2 px-3 small mb-3">
              <i className="ri-lock-line me-1" />
              Your role does not include <strong>{profile.withheldPanels.join(', ')}</strong>.
              Those sections were not loaded.
            </div>
          )}

          {/* The lead page's pipeline bar — same component, one write path. */}
          {acq?.leadId && (
            <SectionCard className="mb-3">
              <LeadPipelineBar
                leadId={acq.leadId}
                stage={acq.pipelineStage}
                onChanged={() => setActivityKey((k) => k + 1)}
              />
            </SectionCard>
          )}

          <ul className="nav nav-tabs mb-4">
            {tabs.map((t) => (
              <li className="nav-item" key={t.key}>
                <button
                  type="button"
                  className={`nav-link ${tab === t.key ? 'active' : ''}`}
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                  {t.count !== undefined && <span className="badge text-bg-light ms-2">{t.count}</span>}
                </button>
              </li>
            ))}
          </ul>

          {/* ── Timeline ─────────────────────────────────────────────────── */}
          {tab === 'timeline' && profile.timeline && (
            <TimelineTab
              events={profile.timeline}
              domains={profile.timelineDomains ?? []}
              onSelect={setRawEvent}
            />
          )}

          {/* ── Journey ──────────────────────────────────────────────────── */}
          {tab === 'journey' && acq?.leadId && (
            <JourneyTimeline leadId={acq.leadId} />
          )}

          {/* ── Acquisition ──────────────────────────────────────────────── */}
          {tab === 'acquisition' && (
            <AcquisitionTab
              acq={acq}
              email={profile.email}
              company={profile.company}
              intentSuppressedReason={profile.intentSuppressedReason}
              visitor={visitor}
              tempHistory={tempHistory}
            />
          )}

          {/* ── Explorer score (T212) ────────────────────────────────────── */}
          {tab === 'explorer' && <ExplorerScoreTab panel={profile.explorerScore} />}
          {tab === 'readiness' && (
            <SalesReadinessTab
              score={profile.salesReadiness}
              freshness={profile.salesReadinessFreshness}
            />
          )}

          {/* ── Notes & activity ─────────────────────────────────────────── */}
          {tab === 'notes' && acq?.leadId && (
            <div className="row g-3">
              <div className="col-lg-5">
                <SectionCard title="Status & notes">
                  <LeadStatusNotes
                    leadId={acq.leadId}
                    initialStatus={acq.status}
                    initialNotes={acq.notes}
                    onSaved={() => setActivityKey((k) => k + 1)}
                  />
                </SectionCard>
                <div className="mt-3">
                  <SectionCard title="Add activity">
                    <AddNoteForm leadId={acq.leadId} onNoteAdded={() => setActivityKey((k) => k + 1)} />
                  </SectionCard>
                </div>
              </div>
              <div className="col-lg-7">
                <SectionCard title="Activity timeline">
                  <ActivityTimeline leadId={acq.leadId} refreshKey={activityKey} />
                </SectionCard>
              </div>
            </div>
          )}

          {/* ── Strategy prep ────────────────────────────────────────────── */}
          {tab === 'strategy' && (
            <>
              <StrategyBriefPanel personRef={personRef} stage={profile.stage} />
              {acq?.leadId && <LeadStrategyPrep leadId={acq.leadId} />}
            </>
          )}

          {tab === 'class' && (
            <ClassActivityTab classActivity={profile.classActivity} curriculum={profile.curriculum} />
          )}

          {tab === 'communications' && <CommunicationsTab communications={profile.communications} personRef={personRef} />}

          {tab === 'work' && <WorkTab work={profile.work} />}

          {tab === 'account' && (
            <AccountTab account={profile.account} billing={profile.billingDetail} />
          )}

          {tab === 'growth' && (
            <GrowthTab
              skills={profile.skills}
              mentor={profile.mentor}
              content={profile.content}
              community={profile.community}
              context={profile.profileContext}
            />
          )}

          {/* ── Appointments & automation ────────────────────────────────── */}
          {/* ── Appointments & automation ────────────────────────────────── */}
          {tab === 'engagement' && (
            <AppointmentsAutomationTab
              appointments={profile.appointments}
              automation={profile.automation}
            />
          )}

          {/* ── Programme ────────────────────────────────────────────────── */}
          {/* ── Programme ────────────────────────────────────────────────── */}
          {tab === 'learning' && profile.learning && (
            <EnrolmentsTab learning={profile.learning} />
          )}

          {/* ── Billing ──────────────────────────────────────────────────── */}
          {/* ── Billing ──────────────────────────────────────────────────── */}
          {tab === 'billing' && profile.billing && (
            <PaymentRecordTab billing={profile.billing} />
          )}

          {/* ── Site activity ────────────────────────────────────────────── */}
          {/* ── Site activity ────────────────────────────────────────────── */}
          {tab === 'activity' && <SiteActivityTab engagement={profile.engagement} />}
          {/* ── Data & trust ─────────────────────────────────────────────── */}
          {/* ── Data & trust ─────────────────────────────────────────────── */}
          {tab === 'trust' && profile.trust && (
            <DataTrustTab trust={profile.trust} history={profile.history} />
          )}

          {/* ── Raw event drawer ─────────────────────────────────────────── */}
          {rawEvent && (
            <RawEventDrawer
              event={rawEvent}
              personName={profile.name}
              personEmail={profile.email}
              communications={profile.communications}
              onClose={() => setRawEvent(null)}
              onOpenCommunications={() => { setTab('communications'); setRawEvent(null); }}
            />
          )}

          {acq?.leadId && (
            <ScheduleAppointmentModal
              leadId={acq.leadId}
              leadName={profile.name || profile.email}
              show={showAppointment}
              onClose={() => setShowAppointment(false)}
              onCreated={() => { setShowAppointment(false); setActivityKey((k) => k + 1); void load(); }}
            />
          )}
        </>
      )}
    </div>
  );
}
