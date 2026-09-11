import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
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
import AccountTab from '../../components/admin/person/AccountTab';
import GrowthTab from '../../components/admin/person/GrowthTab';
import { Field, Unknown, fmtDate, fmtDateTime } from '../../components/admin/person/primitives';
import type { Journey, Profile, TempEntry, TimelineEvent, VisitorData } from '../../adminOs/personTypes';
import { refForApi } from '../../adminOs/personLink';

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
 * component cannot widen access.
 */


const STAGE_LABEL: Record<string, string> = {
  anonymous_visitor: 'Anonymous visitor', identified_visitor: 'Identified visitor',
  lead: 'Lead', applicant: 'Applicant', enrolled_student: 'Enrolled',
  active_learner: 'Active learner', graduate: 'Graduate', lapsed: 'Lapsed',
  returning_customer: 'Returning customer',
};

const STAGE_TONE: Record<string, 'info' | 'warning' | 'success' | 'neutral'> = {
  anonymous_visitor: 'neutral', identified_visitor: 'neutral', lead: 'info',
  applicant: 'warning', enrolled_student: 'success', active_learner: 'success',
  // Lapsed is the state the business exists to prevent, so it reads as a
  // warning rather than a neutral end-state.
  graduate: 'success', lapsed: 'warning', returning_customer: 'success',
};

const TEMPERATURE_TONE: Record<string, string> = { hot: 'danger', warm: 'warning', cold: 'secondary' };

const DOMAIN_TONE: Record<string, string> = {
  acquisition: 'info', sales: 'primary', communication: 'secondary',
  commerce: 'success', learning: 'warning', community: 'dark',
};

type TabKey = 'timeline' | 'journey' | 'acquisition' | 'notes' | 'strategy'
  | 'communications' | 'class' | 'work' | 'account' | 'growth'
  | 'engagement' | 'learning' | 'billing' | 'activity' | 'trust';

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
  const [domainFilter, setDomainFilter] = useState('all');
  // Website activity and temperature history come from the lead endpoints the
  // Lead page already uses, so the two surfaces cannot disagree. Fetched only
  // when this person HAS a lead, and failing soft: these endpoints are
  // requireSalesOrAdmin, so a scoped identity simply does not get the panels.
  const [visitor, setVisitor] = useState<VisitorData | null>(null);
  const [tempHistory, setTempHistory] = useState<TempEntry[] | null>(null);
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
    if (leadId === null) { setVisitor(null); setTempHistory(null); return; }
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
    })();
    return () => { cancelled = true; };
  }, [leadId]);

  // Only tabs whose panel the API actually sent.
  const tabs = useMemo(() => {
    if (!profile) return [] as Array<{ key: TabKey; label: string; count?: number }>;
    const t: Array<{ key: TabKey; label: string; count?: number }> = [];
    if (profile.timeline !== undefined) t.push({ key: 'timeline', label: 'Timeline', count: profile.timeline.length });
    if (profile.acquisition !== undefined) {
      // How much of the acquisition record is actually filled in. A lead
      // captured from a one-field form and one from a full brief request are
      // different objects, and the count says which this is.
      const acq = profile.acquisition;
      const filled = acq
        ? Object.entries(acq).filter(([k, v]) =>
            k !== 'leadScoreMax' && v !== null && v !== undefined && v !== '').length
        : undefined;
      t.push({ key: 'acquisition', label: 'Acquisition', count: filled });
    }
    // Journey needs a lead: the analysis is built from lead touchpoints.
    // The count is TOUCHPOINTS, the same figure the campaign modal shows.
    if (profile.acquisition?.leadId) {
      const j = profile.journey;
      const touchpoints = j
        ? j.sessions + j.pageEvents + j.emailsSent + j.campaigns
        : undefined;
      t.push({ key: 'journey', label: 'Journey', count: touchpoints });
    }
    // The Lead page's Activity tab, moved across whole.
    if (profile.acquisition?.leadId) {
      t.push({ key: 'notes', label: 'Notes & activity', count: tempHistory?.length ?? undefined });
    }
    if (profile.acquisition?.leadId) t.push({ key: 'strategy', label: 'Strategy prep' });
    // Every communication, threaded by campaign.
    if (profile.communications) {
      t.push({
        key: 'communications',
        label: 'Communications',
        count: profile.communications.totalMessages,
      });
    }
    if (profile.appointments !== undefined || profile.automation !== undefined) {
      t.push({
        key: 'engagement',
        label: 'Appointments & automation',
        count: (profile.appointments?.length ?? 0) + (profile.automation?.length ?? 0),
      });
    }
    if (profile.learning !== undefined) t.push({ key: 'learning', label: 'Enrolments', count: profile.learning.length });
    // The programme surfaces, added 2026-09-09. Each appears only when the API
    // sent its panel, so a caller without the programme sections never sees the
    // tab — the same rule every other tab here follows.
    if (profile.classActivity || profile.curriculum) {
      t.push({
        key: 'class',
        label: 'Class & curriculum',
        count: (profile.curriculum?.total ?? 0)
          + (profile.classActivity?.attendanceTotal ?? 0) || undefined,
      });
    }
    if (profile.work) {
      t.push({
        key: 'work',
        label: 'Projects & portfolio',
        count: profile.work.projects.length + profile.work.caseStudies.length
          + profile.work.capstones.length,
      });
    }
    if (profile.account || profile.billingDetail) {
      t.push({
        key: 'account',
        label: 'Account & subscription',
        count: profile.billingDetail?.subscriptions.length ?? undefined,
      });
    }
    if (profile.skills || profile.mentor || profile.content || profile.community || profile.profileContext) {
      t.push({
        key: 'growth',
        label: 'Skills & context',
        count: (profile.skills?.skillEvidence ?? 0)
          + (profile.mentor?.mentorTurns ?? 0)
          + (profile.content?.podcasts ?? 0) + (profile.content?.blogPosts ?? 0)
          + (profile.content?.videos ?? 0) || undefined,
      });
    }
    if (profile.billing !== undefined) t.push({ key: 'billing', label: 'Payment record', count: profile.billing.length });
    if (profile.engagement !== undefined) {
      t.push({ key: 'activity', label: 'Site activity', count: profile.engagement?.sessions ?? undefined });
    }
    // Last, because it is about the data rather than the person — but present
    // for everyone, because "how much of this should I believe" always applies.
    if (profile.trust) t.push({ key: 'trust', label: 'Data & trust', count: profile.trust.gaps.length });
    return t;
  }, [profile, tempHistory]);

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
            <div className="col-6 col-md-4 col-xl-2">
              <StatCard label="Page events" value={profile.journey.pageEvents} icon="cursor-line" tone="primary" />
            </div>
            <div className="col-6 col-md-4 col-xl-2">
              <StatCard label="Sessions" value={profile.journey.sessions} icon="global-line" tone="primary" />
            </div>
            <div className="col-6 col-md-4 col-xl-2">
              <StatCard label="Emails sent" value={profile.journey.emailsSent} icon="mail-send-line" tone="neutral" />
            </div>
            <div className="col-6 col-md-4 col-xl-2">
              <StatCard label="Campaigns" value={profile.journey.campaigns} icon="megaphone-line" tone="neutral" />
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
                <StatCard label="Enrolments" value={profile.journey.enrollments}
                  icon="graduation-cap-line" tone="success" />
              </div>
            )}
            {/* What they DID, beside what they were sent. An acquisition-only
                header made a heavy learner look like a quiet lead. */}
            {profile.journey.cardsCompleted > 0 && (
              <div className="col-6 col-md-4 col-xl-2">
                <StatCard label="Cards completed" value={profile.journey.cardsCompleted}
                  icon="book-open-line" tone="success" />
              </div>
            )}
            {profile.journey.sessionsAttended > 0 && (
              <div className="col-6 col-md-4 col-xl-2">
                <StatCard label="Classes attended" value={profile.journey.sessionsAttended}
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
            <SectionCard title="Activity timeline" padded={false}>
              <div className="d-flex flex-wrap gap-1 p-3 border-bottom">
                {['all', ...(profile.timelineDomains ?? [])].map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`btn btn-sm ${domainFilter === d ? 'btn-dark' : 'btn-outline-secondary'}`}
                    onClick={() => setDomainFilter(d)}
                    aria-pressed={domainFilter === d}
                  >
                    {d === 'all' ? 'All' : d}
                  </button>
                ))}
              </div>

              {profile.timeline.length === 0 ? (
                <p className="text-muted small p-4 mb-0 text-center">
                  No recorded activity in the areas you can see.
                </p>
              ) : (
                <div className="table-responsive" style={{ maxHeight: '32rem', overflowY: 'auto' }}>
                  <table className="table table-sm table-hover mb-0 align-middle">
                    <thead className="table-light" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                      <tr>
                        <th style={{ width: '13rem' }}>When</th>
                        <th style={{ width: '8rem' }}>Domain</th>
                        <th>Event</th>
                        <th style={{ width: '11rem' }} className="text-end">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profile.timeline
                        .filter((e) => domainFilter === 'all' || e.domain === domainFilter)
                        .map((e, i) => (
                          <tr
                            key={`${e.source}-${e.occurredAt}-${i}`}
                            style={{ cursor: 'pointer' }}
                            onClick={() => setRawEvent(e)}
                            title="Open the underlying record"
                          >
                            <td className="text-muted small text-nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {fmtDateTime(e.occurredAt)}
                            </td>
                            <td>
                              <span className={`badge text-bg-${DOMAIN_TONE[e.domain] ?? 'light'}`}>{e.domain}</span>
                            </td>
                            <td>
                              <span className="fw-medium">{e.type}</span>
                              {/* A collapsed fan-out. The reader sees one line and how
                                  many times it happened, never the same line repeated. */}
                              {e.occurrences > 1 && (
                                <span className="badge bg-secondary-subtle text-secondary-emphasis ms-2"
                                  title={`${e.occurrences} identical events in the same second`}>
                                  ×{e.occurrences}
                                </span>
                              )}
                              {e.summary && <div className="text-muted small">{e.summary}</div>}
                            </td>
                            {/* Source-labelled, so any row traces back to its table. */}
                            <td className="text-muted small text-end text-nowrap">{e.source}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          )}

          {/* ── Journey ──────────────────────────────────────────────────── */}
          {tab === 'journey' && acq?.leadId && (
            <JourneyTimeline leadId={acq.leadId} />
          )}

          {/* ── Acquisition ──────────────────────────────────────────────── */}
          {tab === 'acquisition' && (acq ? (
            <div className="row g-3">
              <div className="col-lg-6">
                <SectionCard title="Contact">
                  <div className="row">
                    <Field label="Email" value={profile.email} />
                    <Field label="Phone" value={acq.phone} />
                    <Field label="Role" value={acq.role} />
                    <Field label="Company" value={profile.company} />
                    <Field label="Company size" value={acq.companySize} />
                    <Field label="Industry" value={acq.industry} />
                    <Field
                      label="LinkedIn"
                      value={acq.linkedinUrl
                        ? <a href={acq.linkedinUrl} target="_blank" rel="noreferrer">Profile</a>
                        : null}
                    />
                    <Field label="Evaluating in 90 days" value={
                      acq.evaluating90Days === null ? null : (acq.evaluating90Days ? 'Yes' : 'No')} />
                    <Field label="Lead created" value={fmtDate(acq.createdAt)} />
                    <Field
                      label="Consent to contact"
                      value={acq.consentContact === null ? null : (
                        <span className={`badge text-bg-${acq.consentContact ? 'success' : 'danger'}`}>
                          {acq.consentContact ? 'Given' : 'Not given'}
                        </span>
                      )}
                    />
                  </div>
                </SectionCard>
              </div>

              <div className="col-lg-6">
                <SectionCard title="Qualification">
                  {/* Said out loud. A missing score with no explanation reads as
                      a data gap; this is a deliberate omission. */}
                  {profile.intentSuppressedReason && (
                    <div className="alert alert-light border py-2 px-3 small mb-3">
                      <i className="ri-information-line me-1" />
                      {profile.intentSuppressedReason}
                    </div>
                  )}
                  <div className="row">
                    <Field label="Pipeline stage" value={acq.pipelineStage} />
                    <Field label="Status" value={acq.status} />
                    <Field label="Lead score" value={acq.leadScore === null ? null
                      : `${acq.leadScore} of ${acq.leadScoreMax}`} />
                    <Field
                      label="Temperature"
                      value={acq.temperature ? (
                        <span className={`badge text-bg-${TEMPERATURE_TONE[acq.temperature] ?? 'secondary'}`}>
                          {acq.temperature}
                        </span>
                      ) : null}
                    />
                    <Field label="Temperature set" value={fmtDate(acq.temperatureUpdatedAt)} />
                    <Field label="Qualification" value={acq.qualificationLevel} />
                    <Field label="Interest level" value={acq.interestLevel} />
                    <Field label="Maturity score" value={acq.maturityScore} />
                    <Field label="Owner" value={acq.assignedAdmin} />
                    <Field label="Last contacted" value={fmtDate(acq.lastContactedAt)} />
                  </div>
                </SectionCard>
              </div>

              <div className="col-lg-6">
                <SectionCard title="How they found us">
                  <div className="row">
                    <Field label="Source" value={acq.source} />
                    <Field label="Form" value={acq.formType} />
                    <Field label="UTM source" value={acq.utmSource} />
                    <Field label="UTM campaign" value={acq.utmCampaign} />
                    <Field label="Interest area" value={acq.interestArea} />
                    <Field label="First seen" value={fmtDate(acq.firstSeen)} />
                    <Field label="Landing page" wide value={acq.pageUrl} />
                  </div>
                </SectionCard>
              </div>

              {/* Website activity, from the same endpoint the Lead page reads. */}
              {visitor && (
                <div className="col-12">
                  <SectionCard
                    title="Website activity"
                    actions={visitor.intent_score !== undefined && !profile.intentSuppressedReason ? (
                      <span className="badge text-bg-danger">
                        Intent {visitor.intent_score}/100{visitor.intent_level ? ` (${visitor.intent_level})` : ''}
                      </span>
                    ) : undefined}
                  >
                    <div className="row">
                      <Field label="Total sessions" value={visitor.total_sessions ?? null} />
                      <Field label="Total pageviews" value={visitor.total_pageviews ?? null} />
                      <Field label="First seen" value={fmtDateTime(visitor.first_seen_at)} />
                      <Field label="Last seen" value={fmtDateTime(visitor.last_seen_at)} />
                      <Field label="Device" value={visitor.device_type} />
                    </div>

                    {Array.isArray(visitor.behavioral_signals) && visitor.behavioral_signals.length > 0 && (
                      <>
                        <div className="text-muted small fw-medium mb-2">Behavioural signals</div>
                        <div className="d-flex flex-wrap gap-1 mb-3">
                          {visitor.behavioral_signals.map((sig, i) => (
                            <span key={i} className="badge text-bg-light">
                              {typeof sig === 'string' ? sig : (sig.signal_type ?? 'signal')}
                            </span>
                          ))}
                        </div>
                      </>
                    )}

                    {Array.isArray(visitor.sessions) && visitor.sessions.length > 0 && (
                      <div className="table-responsive">
                        <table className="table table-sm mb-0 align-middle">
                          <thead className="table-light">
                            <tr><th>Date</th><th>Duration</th><th>Pages</th><th>Entry</th><th>Exit</th></tr>
                          </thead>
                          <tbody>
                            {visitor.sessions.map((sess, i) => (
                              <tr key={i}>
                                <td className="text-nowrap small">{fmtDateTime(sess.started_at) || <Unknown />}</td>
                                <td className="small">{sess.duration_seconds
                                  ? `${Math.round(sess.duration_seconds / 60)}m` : <Unknown />}</td>
                                <td className="small">{sess.pageview_count ?? <Unknown />}</td>
                                <td className="small text-truncate" style={{ maxWidth: 220 }}>
                                  {sess.entry_page || <Unknown />}</td>
                                <td className="small text-truncate" style={{ maxWidth: 220 }}>
                                  {sess.exit_page || <Unknown />}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {visitor.id && (
                      <Link className="small" to={`/admin/visitors/${visitor.id}`}>View full visitor profile →</Link>
                    )}
                  </SectionCard>
                </div>
              )}

              {/* Temperature history — hidden for enrolled people, same rule as
                  the score itself: it is a record of conversion likelihood. */}
              {tempHistory && tempHistory.length > 0 && !profile.intentSuppressedReason && (
                <div className="col-lg-6">
                  <SectionCard title="Temperature history" padded={false}>
                    <div className="table-responsive" style={{ maxHeight: '18rem', overflowY: 'auto' }}>
                      <table className="table table-sm mb-0 align-middle">
                        <tbody>
                          {tempHistory.map((h, i) => (
                            <tr key={i}>
                              <td>
                                <span className={`badge text-bg-${TEMPERATURE_TONE[h.from_temperature ?? ''] ?? 'light'}`}>
                                  {h.from_temperature ?? '—'}
                                </span>
                                <span className="mx-2 text-muted">→</span>
                                <span className={`badge text-bg-${TEMPERATURE_TONE[h.to_temperature ?? ''] ?? 'light'}`}>
                                  {h.to_temperature ?? '—'}
                                </span>
                                {h.lead_score !== undefined && h.lead_score !== null && (
                                  <div className="text-muted small mt-1">Score: {h.lead_score}</div>
                                )}
                              </td>
                              <td className="text-end text-muted small">{h.changed_by || ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </SectionCard>
                </div>
              )}

              <div className="col-lg-6">
                <SectionCard title="What they told us">
                  <div className="row">
                    <Field label="Message" wide value={acq.message} />
                    <Field label="Notes" wide value={acq.notes} />
                  </div>
                </SectionCard>
              </div>
            </div>
          ) : (
            <SectionCard title="How they found us">
              <p className="text-muted small mb-0">
                No lead record for this person, so nothing is recorded about how they arrived.
                They enrolled without ever being captured as a lead.
              </p>
            </SectionCard>
          ))}

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
          {tab === 'strategy' && acq?.leadId && <LeadStrategyPrep leadId={acq.leadId} />}

          {tab === 'class' && (
            <ClassActivityTab classActivity={profile.classActivity} curriculum={profile.curriculum} />
          )}

          {tab === 'communications' && <CommunicationsTab communications={profile.communications} />}

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
          {tab === 'engagement' && (
            <div className="row g-3">
              <div className="col-lg-6">
                <SectionCard title="Appointments" padded={false}>
                  {(profile.appointments?.length ?? 0) === 0 ? (
                    <p className="text-muted small p-4 mb-0 text-center">Nothing booked.</p>
                  ) : (
                    <div className="table-responsive">
                      <table className="table table-sm mb-0 align-middle">
                        <thead className="table-light">
                          <tr><th>When</th><th>What</th><th>Status</th></tr>
                        </thead>
                        <tbody>
                          {profile.appointments!.map((a, i) => (
                            <tr key={`${a.kind}-${i}`}>
                              <td className="text-nowrap small">{fmtDateTime(a.scheduledAt) || <Unknown />}</td>
                              <td>
                                <div className="fw-medium">{a.title || a.kind}</div>
                                {a.notes && <div className="text-muted small">{a.notes}</div>}
                                {a.meetLink && (
                                  <a className="small" href={a.meetLink} target="_blank" rel="noreferrer">Meet link</a>
                                )}
                              </td>
                              <td><span className="badge text-bg-light">{a.status || 'unknown'}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </SectionCard>
              </div>
              <div className="col-lg-6">
                <SectionCard title="Automation history" padded={false}>
                  {(profile.automation?.length ?? 0) === 0 ? (
                    <p className="text-muted small p-4 mb-0 text-center">No automation events yet.</p>
                  ) : (
                    <div className="table-responsive" style={{ maxHeight: '24rem', overflowY: 'auto' }}>
                      <table className="table table-sm mb-0 align-middle">
                        <thead className="table-light" style={{ position: 'sticky', top: 0 }}>
                          <tr><th>When</th><th>Type</th><th>Status</th></tr>
                        </thead>
                        <tbody>
                          {profile.automation!.map((a, i) => (
                            <tr key={`${a.type}-${i}`}>
                              <td className="text-nowrap small text-muted">{fmtDateTime(a.createdAt)}</td>
                              <td>
                                <div className="fw-medium">{a.type}</div>
                                {a.detail && <div className="text-muted small">{a.detail}</div>}
                              </td>
                              <td><span className="badge text-bg-light">{a.status || '—'}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </SectionCard>
              </div>
            </div>
          )}

          {/* ── Programme ────────────────────────────────────────────────── */}
          {tab === 'learning' && profile.learning && (
            <SectionCard title="Programme" padded={false}>
              {profile.learning.length === 0 ? (
                <p className="text-muted small p-4 mb-0 text-center">No enrolments visible to you.</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-sm mb-0 align-middle">
                    <thead className="table-light">
                      <tr><th>Status</th><th>Tier</th><th>Type</th><th>Enrolled</th><th>Cohort</th></tr>
                    </thead>
                    <tbody>
                      {profile.learning.map((e) => (
                        <tr key={e.enrollmentId}>
                          <td>
                            <span className={`badge text-bg-${e.status === 'active' ? 'success' : 'secondary'}`}>
                              {e.status || 'unknown'}
                            </span>
                          </td>
                          <td>{e.tier || <Unknown />}</td>
                          <td>{e.enrollmentType || <Unknown />}</td>
                          <td>{fmtDate(e.enrolledAt) || <Unknown />}</td>
                          <td className="text-muted small">
                            {e.cohortId
                              ? <Link to={`/admin/cohorts/${e.cohortId}`}>{e.cohortId.slice(0, 8)}…</Link>
                              : <Unknown />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          )}

          {/* ── Billing ──────────────────────────────────────────────────── */}
          {tab === 'billing' && profile.billing && (
            <SectionCard title="Billing" padded={false}>
              {profile.billing.length === 0 ? (
                <p className="text-muted small p-4 mb-0 text-center">No enrolment records, so nothing to bill.</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-sm mb-0 align-middle">
                    <thead className="table-light">
                      <tr><th>Payment status</th><th>Method</th><th className="text-end">Amount paid</th></tr>
                    </thead>
                    <tbody>
                      {profile.billing.map((b) => (
                        <tr key={b.enrollmentId}>
                          <td>{b.paymentStatus || <Unknown />}</td>
                          <td>{b.paymentMethod || <Unknown />}</td>
                          {/* Not $0. An unrecorded amount and a zero payment differ. */}
                          <td className="text-end" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {b.amountPaid === null || b.amountPaid === undefined
                              ? <Unknown />
                              : `$${Number(b.amountPaid).toLocaleString()}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          )}

          {/* ── Site activity ────────────────────────────────────────────── */}
          {tab === 'activity' && (
            <SectionCard title="Site activity">
              {profile.engagement ? (
                <div className="row">
                  <Field label="Sessions" value={profile.engagement.sessions || null} />
                  <Field label="First visit" value={fmtDate(profile.engagement.firstSeen)} />
                  <Field label="Last visit" value={fmtDate(profile.engagement.lastSeen)} />
                  <Field label="Properties" value={profile.engagement.sites.join(', ')} />
                </div>
              ) : (
                <p className="text-muted small mb-0">No site activity linked to this person.</p>
              )}
            </SectionCard>
          )}
          {/* ── Data & trust ─────────────────────────────────────────────── */}
          {tab === 'trust' && profile.trust && (
            <div className="row g-3">
              <div className="col-lg-6">
                <SectionCard title="Identity">
                  <div className="row">
                    <Field label="Matched by" value={
                      profile.trust.matchMethod === 'exact_email'
                        ? 'Exact email'
                        : <span className="text-muted">Single source only</span>} />
                    <Field label="Lead records" value={profile.trust.leadIds.length || null} />
                    <Field label="Enrolment records" value={profile.trust.enrollmentIds.length || null} />
                    <Field label="Traced to acquisition" value={
                      profile.trust.tracedToLead
                        ? <span className="badge text-bg-success">Yes</span>
                        : <span className="badge text-bg-warning">No</span>} />
                    <Field label="Consent recorded" value={
                      profile.trust.consentRecorded === null
                        ? null
                        : <span className={`badge text-bg-${profile.trust.consentRecorded ? 'success' : 'danger'}`}>
                            {profile.trust.consentRecorded ? 'Yes' : 'No'}
                          </span>} />
                    <Field label="Freshest activity" value={fmtDateTime(profile.trust.lastActivity)} />
                  </div>
                </SectionCard>
              </div>

              <div className="col-lg-6">
                <SectionCard title="What we cannot tell you">
                  {profile.trust.gaps.length === 0 ? (
                    <p className="text-muted small mb-0">No known gaps for this person.</p>
                  ) : (
                    <ul className="list-unstyled mb-0">
                      {profile.trust.gaps.map((g) => (
                        <li key={g.field} className="mb-3">
                          <div className="fw-semibold small">{g.field}</div>
                          {/* Stated, not blank. A blank reads as zero. */}
                          <div className="text-muted small">{g.reason}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </SectionCard>
              </div>
            </div>
          )}

          {/* ── Raw event drawer ─────────────────────────────────────────── */}
          {rawEvent && (
            <>
              <div className="modal d-block" tabIndex={-1} role="dialog"
                style={{ background: 'rgba(0,0,0,.4)' }} onClick={() => setRawEvent(null)}>
                <div className="modal-dialog modal-dialog-centered modal-lg" role="document"
                  onClick={(e) => e.stopPropagation()}>
                  <div className="modal-content">
                    <div className="modal-header">
                      <div>
                        <h5 className="modal-title mb-0">{rawEvent.type}</h5>
                        <div className="text-muted small">
                          <span className={`badge bg-${DOMAIN_TONE[rawEvent.domain] || 'secondary'}-subtle text-${DOMAIN_TONE[rawEvent.domain] || 'secondary'}-emphasis me-2`}>
                            {rawEvent.domain}
                          </span>
                          {fmtDateTime(rawEvent.occurredAt)}
                        </div>
                      </div>
                      <button type="button" className="btn-close" aria-label="Close"
                        onClick={() => setRawEvent(null)} />
                    </div>
                    <div className="modal-body">
                      <div className="row">
                        <Field label="When" value={fmtDateTime(rawEvent.occurredAt)} />
                        <Field label="Domain" value={rawEvent.domain} />
                        <Field label="Source table" value={<code>{rawEvent.source}</code>} />
                        <Field label="Event type" value={<code>{rawEvent.type}</code>} />
                        {/* A collapsed fan-out says how many it stands for, so the
                            reader is never left wondering what the row hides. */}
                        <Field
                          label="Identical events collapsed"
                          value={rawEvent.occurrences > 1
                            ? `${rawEvent.occurrences} in the same second`
                            : 'None — this is a single event'} />
                        <Field label="Person" value={profile.name || profile.email} />
                        <Field label="Detail" wide value={rawEvent.summary} />
                      </div>

                      {/* A communication event has a whole thread behind it, and
                          the reader almost always wants to read the message
                          rather than admire its metadata. */}
                      {rawEvent.domain === 'communication' && profile.communications && (
                        <div className="alert alert-light border d-flex justify-content-between align-items-center gap-2">
                          <span className="small">
                            This is a communication. The full message, its campaign and any reply
                            are on the Communications tab.
                          </span>
                          <button type="button" className="btn btn-sm btn-outline-primary flex-shrink-0"
                            onClick={() => { setTab('communications'); setRawEvent(null); }}>
                            Open thread
                          </button>
                        </div>
                      )}

                      {/* Naming the table is the point: any figure on this page
                          can be traced to the rows behind it. */}
                      <p className="text-muted small mb-0">
                        This event came from <code>{rawEvent.source}</code>. Every row in the
                        timeline is labelled with the table it was read from, so any number here
                        can be checked against the data.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </>
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
