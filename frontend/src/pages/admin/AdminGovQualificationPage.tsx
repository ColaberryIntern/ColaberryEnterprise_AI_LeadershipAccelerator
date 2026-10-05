import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { PageHeader, SectionCard, StatCard, StatusBadge, EmptyState } from '../../components/admin/shell';
import {
  getGovQualificationWorkspace, createGovQualification, recordGovQualificationDecision, approveGovQualification,
  authorizeGovBuild, getGovOpportunityCandidates, reviewGovQualificationDocuments, matchServicesToOpportunity,
  extractGovQualificationRequirements, getGovOpportunityDetail, attestSolicitationZip,
  type GovQualificationWorkspace, type QualRequirementEval, type GovCandidatesResult, type EstablishedRequirement,
  type ServiceMatch, type ExtractedRequirementCandidate, type GovOpportunity,
} from '../../services/factoryApi';
import { band, subtle, fmtValue, daysLeft, closeLabel } from './govOppFormat';
import { derivePotentialDisqualifiers } from './govGaps';
import { parseDeadline, countdownTo, deadlineTone, formatCountdown } from './govDeadline';

/** The discovery opportunity's display details fetched for the decoupled (ZIP) workspace. */
type OppDetail = { opportunity: GovOpportunity | null; source: 'live' | 'snapshot'; snapshotDate: string | null };

/** Per-candidate reviewer choices while confirming extracted requirements into established ones. */
interface CandidateRow { checked: boolean; applicability: string; dueStage: string; }

const AUTHORITATIVE_ROLES = ['solicitation', 'final_pws_sow', 'amendment'];

/**
 * AdminGovQualificationPage — the Phase-2 qualification WORKSPACE + journey.
 *
 * The journey, all reusing the existing server routes (every guard is server-side; the UI mirrors, never replaces):
 *   discovery candidate → open qualification → record evidence + decision → pursuit approval → SEPARATE build auth.
 *
 * Honesty rails the UI must keep:
 *  - The source is SERVER-AUTHORITATIVE; the page renders `sourceState` and only offers Approve when the server
 *    says `canApprove`. It never offers a usable approval when the source is unavailable/degraded/unrecorded.
 *  - Canonical ids come ONLY from the trusted v2 candidate list; when that is unavailable the picker shows the GAP
 *    and offers no start — a canonical id is never derived from a title.
 *  - Every write surfaces its recoverable state: 403 (self-approval), 409 (stale/changed-source → review changes,
 *    not a blind retry), 422 (blocking / insufficient evidence, with reasons), 503 (source unavailable).
 *  - A build authorization is recorded SEPARATELY and never runs a build (the autonomous builder stays parked).
 * Design: Bootstrap 5 + admin-shell + RemixIcon; no hardcoded hex.
 */

const STAGE_ORDER = ['submission', 'award', 'delivery', 'unknown'];
const STAGE_LABEL: Record<string, string> = { submission: 'Due at submission', award: 'Due at award', delivery: 'Due at delivery', unknown: 'Stage unknown' };
const BLOCK_REASON: Record<string, string> = {
  applicability_unknown: 'Applicability unknown — must be resolved before a bid pursuit',
  not_applicable_unevidenced: 'Marked not applicable with no supporting evidence',
  submission_prerequisite_no_evidence: 'Binding submission requirement with no evidence on file',
};
const COVERAGE_REASON: Record<string, string> = {
  no_requirements_established: 'No applicable requirements have been established yet (an empty list is not "no requirements")',
  no_zip_attested: 'The solicitation ZIP has not been attested yet — attest it below before a pursuit can be approved',
  no_authoritative_source: 'The authoritative solicitation was not established/reviewed',
  authoritative_package_unreviewed: 'An amendment or the base solicitation has not been reviewed',
  document_coverage_unknown: 'Document coverage is unknown or inaccessible',
};

interface ActionError { status: number; message: string; reasons?: string[]; changedSource?: boolean; }

function errToAction(err: any): ActionError {
  const status = err?.response?.status ?? 0;
  const body = err?.response?.data ?? {};
  const reasons: string[] = body.reasons || (Array.isArray(body.blocking) ? body.blocking : undefined);
  return { status, message: body.error ?? 'Request failed.', reasons, changedSource: !!body.changedSource };
}

function RequirementRow({ r }: { r: QualRequirementEval }): React.ReactElement {
  return (
    <li className="d-flex align-items-start gap-2 py-2 border-bottom">
      <i className={`ri-${r.blocking ? 'error-warning-line text-danger' : 'checkbox-circle-line text-success'} mt-1`} aria-hidden="true" />
      <div className="flex-grow-1">
        <div className="d-flex flex-wrap align-items-center gap-2">
          <span className="fw-semibold">{r.id}</span>
          <StatusBadge label={r.applicability} tone={r.applicability === 'unknown' ? 'warning' : 'neutral'} />
          {r.blocking && <StatusBadge label="blocking" tone="danger" />}
        </div>
        {r.blocking && r.reason && <div className="small text-danger mt-1">{BLOCK_REASON[r.reason] ?? r.reason}</div>}
      </div>
    </li>
  );
}

/** One due-stage group of requirement rows, capped to a few with a "Show all" toggle so a long
 *  solicitation (dozens of binding requirements) doesn't force a long scroll. Nothing is dropped —
 *  the hidden rows are one click away, and the count is always shown next to the stage. */
function RequirementStageList({ stage, rows }: { stage: string; rows: QualRequirementEval[] }): React.ReactElement {
  const LIMIT = 6;
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(0, LIMIT);
  const hiddenCount = rows.length - visible.length;
  return (
    <div className="mb-3">
      <h3 className="h6 text-secondary text-uppercase small mb-2">
        {STAGE_LABEL[stage]} <span className="fw-normal">({rows.length})</span>
      </h3>
      <ul className="list-unstyled mb-0">{visible.map((r) => <RequirementRow key={r.id + r.dueStage} r={r} />)}</ul>
      {rows.length > LIMIT && (
        <button type="button" className="btn btn-link btn-sm px-0 mt-1" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
          {showAll ? 'Show fewer' : `Show all ${rows.length} (${hiddenCount} more)`}
        </button>
      )}
    </div>
  );
}

/**
 * DeadlineCard — a prominent live countdown to the submission deadline, plus the key date.
 * Honest about precision: the discovery feed carries a date-only close date (so the countdown is
 * day-granular, and the exact cutoff time is flagged as pending the daily Bonfire sync); the canonical
 * source may carry a real UTC datetime (so it can show hours and its parse confidence). Updates each minute.
 */
function DeadlineCard({ value, confidence, originalText, loading, decoupled }: {
  value: string | null; confidence?: string | null; originalText?: string | null; loading?: boolean; decoupled?: boolean;
}): React.ReactElement {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const parsed = parseDeadline(value);
  const c = parsed ? countdownTo(parsed.ms, nowMs) : null;
  const tone = c ? deadlineTone(c) : 'secondary';
  const absolute = parsed
    ? (parsed.hasTime
        ? new Date(parsed.ms).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
        : new Date(parsed.ms).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }))
    : null;
  return (
    <SectionCard title="Submission deadline" icon="timer-flash-line">
      {loading ? (
        <div className="text-secondary small">Loading deadline…</div>
      ) : !parsed || !c ? (
        <div className="text-secondary small">
          {originalText
            ? <>Stated deadline: <span className="fw-semibold">“{originalText}”</span> — not parsed to an exact date/time, so no countdown yet.</>
            : <>No submission deadline captured yet — it appears here once the solicitation details are available{decoupled ? ', and the exact cutoff time arrives with the daily Bonfire sync (not yet enabled)' : ''}.</>}
        </div>
      ) : (
        <div className="d-flex flex-wrap align-items-center gap-3">
          <div className={`h2 mb-0 fw-bold text-${tone}-emphasis`}>
            <i className={`ri-${c.past ? 'alarm-warning-line' : 'timer-flash-line'} me-2`} aria-hidden="true" />{formatCountdown(c, parsed.hasTime)}
          </div>
          <div className="small">
            <div>
              <span className="text-secondary">Closes:</span> <span className="fw-semibold">{absolute}</span>
              {confidence && <> <StatusBadge label={`confidence: ${confidence}`} tone={confidence === 'high' ? 'success' : 'warning'} /></>}
            </div>
            {originalText && <div className="text-secondary">As stated: “{originalText}”</div>}
            <div className="text-secondary">
              {parsed.hasTime
                ? 'Verify the exact time zone on the portal before relying on the hour.'
                : 'Date only (unverified) — the exact cutoff time arrives with the daily Bonfire sync.'}
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

/** The no-canonical landing: a trusted candidate picker, or the gap when v2 is unavailable. */
function CandidatePicker(): React.ReactElement {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  // When the user arrives from a discovery-row "Qualify" click we carry the clicked proposal's title/agency (display
  // only — the canonical id is still chosen from the trusted list, never derived from the title).
  const fromTitle = sp.get('from');
  const fromAgency = sp.get('agency');
  const [result, setResult] = useState<GovCandidatesResult | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    getGovOpportunityCandidates().then((r) => { if (live) setResult(r); }).catch(() => { if (live) setResult({ available: false, reason: 'source_failed', candidates: [], sourceLive: false }); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);
  if (loading) return <SectionCard><div className="text-secondary">Loading candidates…</div></SectionCard>;
  if (!result || !result.available) {
    return (
      <SectionCard title="Start a qualification" icon="search-line">
        <div className="alert alert-warning mb-0" role="status">
          <i className="ri-links-line me-1" aria-hidden="true" />
          The trusted canonical mapping is not available{result?.reason === 'not_configured' ? ' (Opportunity Pulse v2 is not configured)' : ' (the source could not be reached)'}.
          A qualification cannot be started until a canonical opportunity id is available from the producer — the id is <strong>never</strong> derived from a title.
        </div>
      </SectionCard>
    );
  }
  // Is the clicked discovery proposal actually present in the trusted qualification feed? Normalized title compare,
  // DISPLAY ONLY — it decides which honest message to show, never derives a canonical id. Today the discovery and
  // qualification feeds are disjoint sets, so this is normally false; it flips true once OP aligns the feeds.
  const norm = (s: string | null | undefined): string => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const fromNorm = norm(fromTitle);
  const inFeed = !!fromNorm && result.candidates.some((c) => {
    const t = norm(c.title);
    return !!t && (t === fromNorm || t.includes(fromNorm) || fromNorm.includes(t));
  });
  return (
    <SectionCard
      title={!fromTitle ? 'Start a qualification — pick a candidate' : inFeed ? 'Pick the matching solicitation' : "This proposal isn't in the qualification feed yet"}
      icon="search-line"
      subtitle="The qualification workspace needs the verified solicitation id, which lives in this trusted list (Opportunity Pulse v2).">
      {fromTitle && inFeed && (
        <div className="alert alert-info d-flex align-items-start gap-2" role="status">
          <i className="ri-links-line mt-1" aria-hidden="true" />
          <div>
            You're qualifying <strong>{fromTitle}</strong>{fromAgency ? ` (${fromAgency})` : ''}. The discovery list and the
            qualification catalog use different ids, so pick the matching solicitation below to begin — one click straight
            through is coming once the two lists are linked.
          </div>
        </div>
      )}
      {fromTitle && !inFeed && (
        <div className="alert alert-warning d-flex align-items-start gap-2" role="status">
          <i className="ri-error-warning-line mt-1" aria-hidden="true" />
          <div>
            You're qualifying <strong>{fromTitle}</strong>{fromAgency ? ` (${fromAgency})` : ''}, but it isn't in the
            qualification feed yet — that feed currently lists a different set of opportunities than discovery. It's been
            flagged for the source team to add. In the meantime you can open any solicitation below to try the workspace.
          </div>
        </div>
      )}
      {result.candidates.length === 0 && <div className="text-secondary">No candidates returned.</div>}
      <ul className="list-unstyled mb-0">
        {result.candidates.map((c) => (
          <li key={c.canonicalOpportunityId} className="d-flex justify-content-between align-items-center gap-2 py-2 border-bottom">
            <div>
              <div className="fw-semibold">{c.title ?? c.canonicalOpportunityId}</div>
              <div className="small text-secondary">{c.agency ?? ''}{c.noticeType ? ` · ${c.noticeType}` : ''}</div>
            </div>
            <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => navigate(`/admin/gov-qualification?canonical=${encodeURIComponent(c.canonicalOpportunityId)}`)}>
              <i className="ri-arrow-right-line me-1" aria-hidden="true" />Open
            </button>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

export default function AdminGovQualificationPage(): React.ReactElement {
  const [params] = useSearchParams();
  // Active workspace key: a canonical OP id, OR a decoupled discovery-ZIP key (`gws:<uuid>`). The whole body is
  // key-agnostic; `isDecoupled` (below) drives the source:null re-gating.
  const canonical = params.get('canonical') ?? params.get('gws') ?? '';
  const fromParam = params.get('from') ?? '';
  const agencyParam = params.get('agency') ?? '';
  const [biddingEntity, setBiddingEntity] = useState(params.get('biddingEntity') ?? 'colaberry');
  const [ws, setWs] = useState<GovQualificationWorkspace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ActionError | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false); // synchronous guard so a same-tick double-click cannot fire two writes
  const [rationale, setRationale] = useState('');
  const [reqDraft, setReqDraft] = useState({ id: '', text: '', applicability: 'always', dueStage: 'submission', bindingStatus: 'binding_solicitation_requirement', docId: '' });
  const [build, setBuild] = useState({ deliveryProjectId: '', scope: '', resourceLimit: '' });
  const [docFile, setDocFile] = useState<File | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [svcMatches, setSvcMatches] = useState<ServiceMatch[] | null>(null);
  const [svcMatchLoading, setSvcMatchLoading] = useState(false);
  // Extract-from-ZIP → confirm → establish. Extraction is read-only (persists nothing); establishment is the write.
  const [extractFile, setExtractFile] = useState<File | null>(null);
  const [candidates, setCandidates] = useState<ExtractedRequirementCandidate[] | null>(null);
  const [candRows, setCandRows] = useState<Record<string, CandidateRow>>({});
  const [extractBusy, setExtractBusy] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  // Discovery details (why-surfaced + overview + Source link) for the decoupled (gws) workspace. Best-effort.
  const [oppDetail, setOppDetail] = useState<OppDetail | null>(null);
  const [attestFile, setAttestFile] = useState<File | null>(null); // the solicitation ZIP to attest as evidence (decoupled path)

  const load = useCallback(async () => {
    if (!canonical) return;
    setLoading(true); setError(null);
    try {
      setWs(await getGovQualificationWorkspace(canonical, biddingEntity || undefined));
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not load the qualification workspace.');
    } finally {
      setLoading(false);
    }
  }, [canonical, biddingEntity]);

  useEffect(() => { void load(); }, [load]);

  // Advisory service suggestions for this opportunity (deterministic matcher). Best-effort; feeds no gate. Runs for
  // the canonical path (source present) AND the decoupled ZIP path (source:null), matching on the established
  // requirements and the provenance/clicked title.
  useEffect(() => {
    if (!ws) { setSvcMatches(null); return; }
    const decoupled = ws.sourceState === 'zip_workspace';
    if (!ws.source && !decoupled) { setSvcMatches(null); return; }
    const src = ws.source;
    const established = ws.qualification?.requirements_json?.established ?? [];
    const needsList = src ? (established.length ? established : src.requirements) : established;
    const title = src
      ? `${src.publisher.leadBuyer.name} — ${src.notice.noticeType.value} ${src.notice.procurementType.value}`
      : (ws.provenance?.title || fromParam || 'opportunity');
    let active = true;
    setSvcMatchLoading(true);
    matchServicesToOpportunity({ title, requirements: needsList.map((r: { text: string }) => r.text) })
      .then((r) => { if (active) setSvcMatches(r.matches); })
      .catch(() => { if (active) setSvcMatches([]); })
      .finally(() => { if (active) setSvcMatchLoading(false); });
    return () => { active = false; };
  }, [ws, fromParam]);

  // Decoupled (ZIP) workspace: fetch the clicked discovery row's details by its uuid (the gws key), so the page
  // shows the Details-popup info + the Source link without going back. Best-effort; a 404 degrades to an honest note.
  useEffect(() => {
    if (!canonical.startsWith('gws:')) { setOppDetail(null); return; }
    const uuid = canonical.slice(4);
    let active = true;
    getGovOpportunityDetail(uuid)
      .then((r) => { if (active) setOppDetail(r); })
      .catch(() => { if (active) setOppDetail({ opportunity: null, source: 'snapshot', snapshotDate: null }); });
    return () => { active = false; };
  }, [canonical]);

  // Every write runs one at a time (in-flight guard → no duplicate qualification/decision from repeated clicks),
  // reloads the server truth, and maps its error to a recoverable state.
  const run = useCallback(async (fn: () => Promise<any>, okNote: string) => {
    if (inFlight.current) return;         // synchronous: blocks a same-tick double-click before any await
    inFlight.current = true; setBusy(true); setActionError(null); setNotice(null);
    try { await fn(); setNotice(okNote); await load(); }
    catch (err: any) { setActionError(errToAction(err)); }
    finally { inFlight.current = false; setBusy(false); }
  }, [load]);

  // READ-ONLY: extract candidate requirements from the uploaded solicitation ZIP. Persists nothing — the reviewer
  // confirms which candidates become established (gate-bearing) requirements below.
  const extract = useCallback(async () => {
    if (!extractFile || !canonical) return;
    setExtractBusy(true); setExtractError(null);
    try {
      const r = await extractGovQualificationRequirements(canonical, extractFile);
      setCandidates(r.candidates);
      const rows: Record<string, CandidateRow> = {};
      for (const c of r.candidates) rows[c.id] = { checked: true, applicability: 'always', dueStage: 'submission' };
      setCandRows(rows);
    } catch (err: any) {
      setExtractError(err?.response?.data?.error ?? 'Could not extract requirements from the document.');
      setCandidates(null);
    } finally {
      setExtractBusy(false);
    }
  }, [extractFile, canonical]);

  const header = (
    <PageHeader
      title="Qualification Workspace"
      subtitle="Review the government opportunity's source evidence before a bid pursuit is approved."
      icon="government-line"
      breadcrumb={[{ label: 'Gov Opportunities', to: '/admin/gov-opportunities' }, { label: 'Qualification' }]}
    />
  );

  if (!canonical) {
    return <div className="admin-page">{header}<CandidatePicker /></div>;
  }

  const record = ws?.qualification ?? null;
  const version = record?.version ?? 0;
  // Decoupled (discovery-ZIP) workspace: source is null, the uploaded ZIP is the evidence source. Drives the
  // re-gating so the capture UI (Extract/establish/matcher/requirements) renders even though ws.source is null.
  const isDecoupled = ws?.sourceState === 'zip_workspace';
  // The "what they want" needs: the reviewer-established requirements when any exist, else (canonical only) the
  // source's own requirements. On the decoupled path there is no source, so it is purely the established set.
  const established = ws?.qualification?.requirements_json?.established ?? [];
  const needs: Array<{ id: string; text: string }> = ws?.source ? (established.length ? established : ws.source.requirements) : (isDecoupled ? established : []);

  const selectedCandidateCount = candidates ? candidates.filter((c) => candRows[c.id]?.checked).length : 0;
  // Confirm the checked candidates into established requirements: map with the per-row applicability/due-stage,
  // MERGE with any already-established (de-dup by id; a confirmed candidate overrides the same id), then call the
  // existing deliberate establish/decision write. Requires an opened record (same gate as the one-at-a-time form).
  const establishSelected = (): void => {
    if (!candidates || !record) return;
    const chosen = candidates.filter((c) => candRows[c.id]?.checked);
    if (chosen.length === 0) return;
    const mapped: EstablishedRequirement[] = chosen.map((c) => ({
      id: c.id, text: c.text,
      applicability: (candRows[c.id]?.applicability ?? 'always') as EstablishedRequirement['applicability'],
      dueStage: (candRows[c.id]?.dueStage ?? 'submission') as EstablishedRequirement['dueStage'],
      bindingStatus: 'binding_solicitation_requirement',
    }));
    const byId = new Map<string, EstablishedRequirement>();
    for (const e of record.requirements_json?.established ?? []) byId.set(e.id, e);
    for (const m of mapped) byId.set(m.id, m);
    const merged = Array.from(byId.values());
    void run(async () => {
      await recordGovQualificationDecision(canonical, { biddingEntity, expectedVersion: version, decision: 'needs_evidence', establishedRequirements: merged });
      setCandidates(null); setCandRows({});
    }, `Established ${mapped.length} requirement(s) from the solicitation.`);
  };

  return (
    <div className="admin-page">
      {header}

      {loading && <SectionCard><div className="text-secondary">Loading source evidence…</div></SectionCard>}
      {error && <SectionCard><div className="text-danger" role="alert">{error}</div></SectionCard>}

      {ws && (
        <>
          {!ws.sourceLive && !isDecoupled && (
            <div className="alert alert-warning d-flex align-items-center gap-2" role="status">
              <i className="ri-flask-line" aria-hidden="true" />
              <span>Source is a <strong>labeled sample</strong>, not live Opportunity Pulse data (v2 is not wired). Approvals stay blocked while the source cannot be confirmed live.</span>
            </div>
          )}
          {isDecoupled && (
            <div className="alert alert-info d-flex align-items-start gap-2" role="status">
              <i className="ri-folder-zip-line mt-1" aria-hidden="true" />
              <span>ZIP workspace{fromParam ? <> for <strong>{fromParam}</strong>{agencyParam ? ` (${agencyParam})` : ''}</> : ''}. Upload the solicitation ZIP to pull in the requirements, establish the real ones, attest the ZIP as evidence, then you can approve the bid pursuit.</span>
            </div>
          )}

          <div className="row g-3 mb-3">
            <div className="col-6 col-lg-3"><StatCard label="Source state" value={ws.sourceState} icon="git-commit-line" tone={ws.sourceState === 'available' ? 'success' : ws.sourceState === 'unavailable' || ws.sourceState === 'auth_failed' || ws.sourceState === 'malformed' ? 'danger' : 'warning'} hint={ws.snapshotRecorded ? `snapshot v${ws.sourceSnapshotVersion}` : 'snapshot unrecorded'} /></div>
            <div className="col-6 col-lg-3"><StatCard label="Blocking requirements" value={ws.evaluation ? ws.evaluation.blocking.length : '—'} icon="error-warning-line" tone={ws.evaluation && ws.evaluation.blocking.length > 0 ? 'danger' : 'success'} /></div>
            <div className="col-6 col-lg-3"><StatCard label="Current decision" value={record ? record.decision.replace(/_/g, ' ') : 'not opened'} icon="file-list-3-line" tone="neutral" hint={record ? `v${record.version}` : undefined} /></div>
            <div className="col-6 col-lg-3"><StatCard label="Approval allowed" value={ws.canApprove ? 'yes' : 'no'} icon={ws.canApprove ? 'shield-check-line' : 'shield-cross-line'} tone={ws.canApprove ? 'success' : 'warning'} /></div>
          </div>

          <DeadlineCard
            value={isDecoupled ? (oppDetail?.opportunity?.closeDate ?? null) : (ws.source?.deadline.utc ?? null)}
            confidence={isDecoupled ? null : (ws.source?.deadline.utcConfidence ?? null)}
            originalText={isDecoupled ? null : (ws.source?.deadline.originalText ?? null)}
            loading={isDecoupled && oppDetail === null}
            decoupled={isDecoupled}
          />

          {ws.changedSource && (
            <div className="alert alert-danger d-flex align-items-center justify-content-between gap-2" role="alert">
              <span><i className="ri-alert-line me-1" aria-hidden="true" />The source changed since this qualification was last reviewed. A renewed review is required before it can be approved.</span>
              <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => { void load(); }}>Review changes</button>
            </div>
          )}
          {ws.syncChange && (
            <div className="alert alert-warning d-flex align-items-start gap-2" role="status">
              <i className="ri-refresh-line mt-1" aria-hidden="true" />
              <span>Daily tracking flagged a change: <strong>{ws.syncChange.detail}</strong>. Review it — if the solicitation changed, re-download the ZIP from Bonfire and re-attest.</span>
            </div>
          )}
          {ws.lastSyncedAt && !ws.syncChange && (
            <div className="small text-secondary mb-2"><i className="ri-refresh-line me-1" aria-hidden="true" />Daily tracking: last checked {new Date(ws.lastSyncedAt).toLocaleString()} — no change detected.</div>
          )}
          {(ws.sourceState === 'degraded' || ws.sourceState === 'snapshot_unrecorded') && (
            <div className="alert alert-warning" role="status"><i className="ri-alert-line me-1" aria-hidden="true" />{ws.sourceStateLabel} — approval is blocked until the source is current. Research and draft decisions are still allowed.</div>
          )}
          {(ws.sourceState === 'unavailable' || ws.sourceState === 'auth_failed' || ws.sourceState === 'malformed') && (
            <div className="alert alert-danger" role="alert"><i className="ri-close-circle-line me-1" aria-hidden="true" />Source evidence is unavailable ({ws.sourceStateLabel}); approval is not offered.</div>
          )}

          {notice && <div className="alert alert-success py-2" role="status">{notice}</div>}
          {actionError && (
            <div className="alert alert-danger" role="alert">
              <div className="fw-semibold">{actionError.status ? `Blocked (${actionError.status})` : 'Request failed'}: {actionError.message}</div>
              {actionError.reasons && actionError.reasons.length > 0 && (
                <ul className="mb-0 mt-1 small">{actionError.reasons.map((r) => <li key={r}>{COVERAGE_REASON[r] ?? BLOCK_REASON[r.split(':').pop() as string] ?? r}</li>)}</ul>
              )}
              {actionError.changedSource && <div className="small mt-1">Review the changed source before retrying — this is not a retriable conflict.</div>}
            </div>
          )}

          {ws.source && (
            <SectionCard title="Source facts" icon="government-line" collapsible defaultOpen={false} subtitle="Server-fetched by canonical id — not editable here.">
              <dl className="row mb-0">
                <dt className="col-sm-3">Buyer</dt><dd className="col-sm-9">{ws.source.publisher.leadBuyer.name} <span className="text-secondary">({ws.source.publisher.leadBuyer.jurisdiction})</span></dd>
                <dt className="col-sm-3">Notice</dt><dd className="col-sm-9">{ws.source.notice.noticeType.value} · {ws.source.notice.procurementType.value}</dd>
                <dt className="col-sm-3">Deadline</dt><dd className="col-sm-9">{ws.source.deadline.originalText ?? 'unstated'} <StatusBadge label={`confidence: ${ws.source.deadline.utcConfidence}`} tone={ws.source.deadline.utcConfidence === 'high' ? 'success' : 'warning'} /></dd>
                <dt className="col-sm-3">Documents</dt><dd className="col-sm-9">{ws.source.documents.coverage} · {ws.source.documents.counts.parsed}/{ws.source.documents.counts.listed} parsed{ws.source.documents.counts.inaccessible > 0 ? `, ${ws.source.documents.counts.inaccessible} inaccessible` : ''}</dd>
              </dl>
            </SectionCard>
          )}

          {isDecoupled && (
            <SectionCard title="Discovery details" icon="information-line" collapsible defaultOpen={false}
              subtitle="Why this opportunity surfaced + the source posting. Legacy scores are advisory (not a verified fit); the overview is preliminary and unverified.">
              {oppDetail === null ? (
                <div className="text-secondary small">Loading discovery details…</div>
              ) : oppDetail.opportunity ? (
                <>
                  <div className="row g-3 mb-2">
                    <div className="col-6 col-lg-3"><div className="small text-secondary text-uppercase">Priority (legacy)</div><span className={`badge ${subtle(band(oppDetail.opportunity.priorityScore).tone)}`}>{oppDetail.opportunity.priorityScore ?? '—'} {band(oppDetail.opportunity.priorityScore).label}</span></div>
                    <div className="col-6 col-lg-3"><div className="small text-secondary text-uppercase">Fit (legacy)</div><span className={`badge ${subtle(band(oppDetail.opportunity.fitScore).tone)}`}>{oppDetail.opportunity.fitScore ?? '—'} {band(oppDetail.opportunity.fitScore).label}</span></div>
                    <div className="col-6 col-lg-3"><div className="small text-secondary text-uppercase">Est. value</div><div className="fw-semibold">{fmtValue(oppDetail.opportunity.estimatedValue)} <span className="small text-secondary">unverified</span></div></div>
                    <div className="col-6 col-lg-3"><div className="small text-secondary text-uppercase">Closes</div><div>{closeLabel(oppDetail.opportunity.closeDate)}{daysLeft(oppDetail.opportunity.closeDate) !== null ? ` · ${daysLeft(oppDetail.opportunity.closeDate)} days` : ''} <span className="small text-secondary">(verify tz on portal)</span></div></div>
                  </div>
                  {oppDetail.opportunity.sourceUrl && (
                    <a className="btn btn-outline-secondary btn-sm mb-2" href={oppDetail.opportunity.sourceUrl} target="_blank" rel="noopener noreferrer">
                      <i className="ri-external-link-line me-1" aria-hidden="true" />Open source posting (download the ZIP here)
                    </a>
                  )}
                  {oppDetail.opportunity.preliminarySummary ? (
                    <>
                      <div className="alert alert-warning py-2 small mb-2" role="status"><i className="ri-draft-line me-1" aria-hidden="true" />Preliminary, unverified — not confirmed requirements. Qualify from the uploaded ZIP below.</div>
                      <p className="small mb-0">{oppDetail.opportunity.preliminarySummary}</p>
                    </>
                  ) : (
                    <p className="small text-secondary mb-0">No preliminary overview available.</p>
                  )}
                </>
              ) : (
                <div className="text-secondary small">
                  <i className="ri-information-line me-1" aria-hidden="true" />This opportunity is no longer in the live discovery feed. Open the source posting from Gov Opportunities, or just work from the uploaded ZIP below.
                </div>
              )}
            </SectionCard>
          )}

          {(ws.source || isDecoupled) && (
            <SectionCard title="Extract requirements from the solicitation ZIP" icon="file-search-line"
              subtitle="Upload the solicitation package (the Bonfire ZIP). The extractor lists the requirements it detects as CANDIDATES — confirm the real ones to establish them. It reads the file in memory and stores nothing; a candidate is not a requirement until you confirm it.">
              <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                <input type="file" className="form-control form-control-sm" style={{ maxWidth: 320 }} accept=".zip"
                  onChange={(e) => setExtractFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
                <button type="button" className="btn btn-outline-primary btn-sm" disabled={extractBusy || !extractFile}
                  onClick={() => { void extract(); }}>
                  <i className="ri-search-eye-line me-1" aria-hidden="true" />{extractBusy ? 'Extracting…' : 'Extract requirements'}
                </button>
              </div>
              {extractError && <div className="alert alert-danger py-2" role="alert">{extractError}</div>}
              {candidates !== null && candidates.length === 0 && (
                <div className="text-secondary small"><i className="ri-information-line me-1" aria-hidden="true" />No requirements detected in that ZIP — establish them manually below.</div>
              )}
              {candidates !== null && candidates.length > 0 && (
                <>
                  <div className="small text-secondary mb-2">{candidates.length} candidate requirement(s) detected <span className="badge bg-info-subtle text-info-emphasis ms-1">suggested — confirm</span></div>
                  <ul className="list-unstyled mb-3">
                    {candidates.map((c, idx) => {
                      const row = candRows[c.id] ?? { checked: true, applicability: 'always', dueStage: 'submission' };
                      return (
                        <li key={c.id + idx} className="py-2 border-bottom">
                          <div className="d-flex align-items-start gap-2">
                            <input type="checkbox" className="form-check-input mt-1" checked={row.checked}
                              aria-label={`Confirm ${c.id}`}
                              onChange={(e) => setCandRows({ ...candRows, [c.id]: { ...row, checked: e.target.checked } })} />
                            <div className="flex-grow-1">
                              <div className="fw-semibold small">{c.id}</div>
                              <div className="small">{c.text}</div>
                              {(c.sourceDocument || c.section || c.kind) && (
                                <div className="small text-secondary">{c.sourceDocument ?? ''}{c.section ? ` · §${c.section}` : ''}{c.kind ? ` · ${c.kind}` : ''}</div>
                              )}
                              <div className="d-flex flex-wrap gap-2 mt-1">
                                <select className="form-select form-select-sm" style={{ maxWidth: 150 }} value={row.applicability} aria-label={`Applicability for ${c.id}`}
                                  onChange={(e) => setCandRows({ ...candRows, [c.id]: { ...row, applicability: e.target.value } })}>
                                  <option value="always">always</option><option value="conditional">conditional</option><option value="not_applicable">not_applicable</option><option value="unknown">unknown</option>
                                </select>
                                <select className="form-select form-select-sm" style={{ maxWidth: 140 }} value={row.dueStage} aria-label={`Due stage for ${c.id}`}
                                  onChange={(e) => setCandRows({ ...candRows, [c.id]: { ...row, dueStage: e.target.value } })}>
                                  <option value="submission">submission</option><option value="award">award</option><option value="delivery">delivery</option><option value="unknown">unknown</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {record ? (
                    <button type="button" className="btn btn-primary btn-sm" disabled={busy || selectedCandidateCount === 0} onClick={establishSelected}>
                      <i className="ri-check-double-line me-1" aria-hidden="true" />Establish selected ({selectedCandidateCount})
                    </button>
                  ) : (
                    <div className="alert alert-info py-2 mb-0" role="status">
                      <i className="ri-information-line me-1" aria-hidden="true" />Open the qualification (in <strong>Qualification actions</strong> below) to confirm these into established requirements.
                    </div>
                  )}
                </>
              )}
            </SectionCard>
          )}

          {isDecoupled && record && (
            <SectionCard title="Attest the solicitation ZIP (evidence of record)" icon="file-shield-2-line"
              subtitle="Record the uploaded solicitation ZIP as the evidence of record (the server stores only a hash, never the bytes). Required, with established requirements, before a bid pursuit can be approved.">
              {ws.zipAttestation && ws.zipAttestation.sha256 ? (
                <div className="d-flex flex-wrap align-items-center gap-2">
                  <span className="badge bg-success-subtle text-success-emphasis"><i className="ri-checkbox-circle-line me-1" aria-hidden="true" />Attested</span>
                  <span className="small text-secondary">{ws.zipAttestation.filename ?? 'solicitation.zip'} · {ws.zipAttestation.sha256.slice(0, 12)}…</span>
                  <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy}
                    onClick={() => run(() => attestSolicitationZip(canonical, { biddingEntity, expectedVersion: version, mode: 'revoke' }), 'ZIP attestation revoked.')}>Revoke</button>
                </div>
              ) : (
                <div className="d-flex flex-wrap align-items-center gap-2">
                  <input type="file" className="form-control form-control-sm" style={{ maxWidth: 320 }} accept=".zip"
                    onChange={(e) => setAttestFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
                  <button type="button" className="btn btn-outline-primary btn-sm" disabled={busy || !attestFile}
                    onClick={() => run(() => attestSolicitationZip(canonical, { biddingEntity, expectedVersion: version, mode: 'add', file: attestFile }), 'Solicitation ZIP attested as evidence.')}>
                    <i className="ri-upload-2-line me-1" aria-hidden="true" />Attest ZIP
                  </button>
                </div>
              )}
            </SectionCard>
          )}

          {ws.evaluation && (ws.source || isDecoupled) && (
            <SectionCard title="Requirements by due stage" icon="list-check-2" subtitle="Missing evidence, unknown applicability, and unevidenced dismissals block a bid pursuit.">
              {ws.evaluation.evals.length === 0 && <div className="text-secondary small">No requirements established yet. Opportunity Pulse supplies none — establish the applicable, cited requirements below before a pursuit can be approved.</div>}
              {STAGE_ORDER.filter((s) => (ws.evaluation!.byDueStage[s]?.length ?? 0) > 0).map((stage) => (
                <RequirementStageList key={stage} stage={stage} rows={ws.evaluation!.byDueStage[stage]} />
              ))}
              {ws.coverage && !ws.coverage.sufficient && (
                <div className="small text-warning-emphasis mt-2"><i className="ri-information-line me-1" aria-hidden="true" />Coverage not yet sufficient for approval: {ws.coverage.reasons.map((r) => COVERAGE_REASON[r] ?? r).join('; ')}.</div>
              )}
              {(ws.evaluation.openSubmissionRequirements?.length ?? 0) > 0 && (
                <div className="small text-secondary mt-2"><i className="ri-information-line me-1" aria-hidden="true" />{ws.evaluation.openSubmissionRequirements!.length} submission requirement{ws.evaluation.openSubmissionRequirements!.length === 1 ? '' : 's'} still need evidence. These do <strong>not</strong> block approving the <strong>pursuit</strong> (research) — they must be evidenced before a bid is <strong>submitted</strong>.</div>
              )}
            </SectionCard>
          )}

          {(ws.source || isDecoupled) && (
            <SectionCard title="What they want vs what we offer" icon="scales-3-line" collapsible defaultOpen={false}
              subtitle="Advisory suggestion from Our Services — a starting point to confirm, not a verified fit. Feeds no gate.">
              <div className="row g-3">
                <div className="col-md-6">
                  <h3 className="h6 text-secondary text-uppercase small mb-2">What they want</h3>
                  {needs.length === 0 ? (
                    <p className="text-secondary small mb-0">No requirements established yet — matching on the preliminary signals (buyer, notice type). Establish cited requirements above for a sharper match.</p>
                  ) : (
                    <ul className="small mb-0">{needs.slice(0, 12).map((r) => <li key={r.id}>{r.text}</li>)}</ul>
                  )}
                </div>
                <div className="col-md-6">
                  <h3 className="h6 text-secondary text-uppercase small mb-2">What we offer <span className="badge bg-info-subtle text-info-emphasis ms-1">suggested — confirm</span></h3>
                  {svcMatchLoading ? (
                    <p className="text-secondary small mb-0">Matching against Our Services…</p>
                  ) : svcMatches && svcMatches.length > 0 ? (
                    <ul className="list-unstyled mb-0">{svcMatches.map((m) => (
                      <li key={m.id} className="py-1 border-bottom">
                        <div className="d-flex align-items-center gap-2">
                          <span className="fw-semibold">{m.name}</span>
                          {m.category && <span className="badge bg-secondary-subtle text-secondary-emphasis">{m.category}</span>}
                          <span className={`badge ${m.strength === 'strong' ? 'bg-success-subtle text-success-emphasis' : m.strength === 'moderate' ? 'bg-warning-subtle text-warning-emphasis' : 'bg-secondary-subtle text-secondary-emphasis'}`}>{m.strength}</span>
                        </div>
                        <div className="small text-secondary">{m.reason}</div>
                      </li>
                    ))}</ul>
                  ) : (
                    <p className="text-secondary small mb-0">No suggested services — add or refine keywords in <strong>Our Services</strong>.</p>
                  )}
                </div>
              </div>
            </SectionCard>
          )}

          {/* ── Gaps / potential disqualifiers (advisory; surfaces, never decides) ─ */}
          {isDecoupled && (() => {
            const gaps = derivePotentialDisqualifiers(established, ws.evaluation, svcMatches ?? []);
            return (
              <SectionCard title="Gaps / potential disqualifiers" icon="error-warning-line" collapsible defaultOpen={false}
                subtitle="Eligibility & qualification gates that could disqualify a bid — a focused risk view, not a copy of the full checklist above. Verify or resolve before bidding.">
                <div className="alert alert-warning py-2 small" role="status">
                  <i className="ri-alert-line me-1" aria-hidden="true" />Advisory only — not a verified pass/fail. Deeper eligibility verification (SAM/registration/set-asides/clearances) is a later step.
                </div>
                {gaps.empty === 'no_requirements' ? (
                  <p className="text-secondary small mb-0">No requirements established yet — establish the cited requirements above to surface potential disqualifiers. An empty list is not evidence of "no requirements".</p>
                ) : gaps.empty === 'none_flagged' ? (
                  <p className="text-secondary small mb-0">No potential disqualifiers detected from the established requirements. This is advisory; verify eligibility before bidding.</p>
                ) : (
                  <ul className="list-unstyled mb-0">{gaps.items.map((g) => (
                    <li key={g.kind + g.id} className="py-2 border-bottom">
                      <div className="d-flex align-items-center gap-2">
                        <span className={`badge ${g.kind === 'blocking' ? 'bg-danger-subtle text-danger-emphasis' : 'bg-warning-subtle text-warning-emphasis'}`}>{g.kind === 'blocking' ? 'blocking' : 'verify / resolve'}</span>
                        <span className="fw-semibold small">{g.id}</span>
                      </div>
                      <div className="small">{g.text}</div>
                      <div className="small text-secondary">{g.reason} · {g.basis}</div>
                    </li>
                  ))}</ul>
                )}
              </SectionCard>
            );
          })()}

          {/* ── Manual document review (the Bonfire ZIP is downloaded by hand) ─── */}
          {ws.source && record && (() => {
            const items = (ws.source.documents.items ?? []).filter((it) => AUTHORITATIVE_ROLES.includes(it.role));
            const reviewedIds = new Set((record.requirements_json?.reviewedDocuments ?? []).map((d) => d.docId));
            const stateOf = (it: { docId: string; retrieval: { status: string } }) =>
              it.retrieval.status === 'downloaded' ? 'downloaded' : reviewedIds.has(it.docId) ? 'manual' : 'not reviewed';
            const notDownloaded = items.filter((it) => it.retrieval.status !== 'downloaded');
            const toCover = notDownloaded.map((it) => it.docId);
            if (items.length === 0) return null;
            return (
              <SectionCard title="Manual document review" icon="folder-download-line" collapsible defaultOpen={false}
                subtitle="Bonfire gates the ZIP behind a portal login — download it by hand, then upload it here to attest the authoritative package was reviewed. The server records a hash of the file; it never stores the bytes.">
                <ul className="list-unstyled mb-3">
                  {items.map((it) => {
                    const st = stateOf(it);
                    return (
                      <li key={it.docId} className="d-flex align-items-center justify-content-between gap-2 py-2 border-bottom">
                        <div className="d-flex align-items-center gap-2">
                          <i className={`ri-${st === 'not reviewed' ? 'error-warning-line text-danger' : 'checkbox-circle-line text-success'}`} aria-hidden="true" />
                          <span className="fw-semibold">{it.filename}</span>
                          <StatusBadge label={it.role} tone="neutral" />
                          <StatusBadge label={st} tone={st === 'downloaded' ? 'success' : st === 'manual' ? 'info' : 'danger'} />
                        </div>
                        {st === 'manual' && (
                          <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy}
                            onClick={() => run(() => reviewGovQualificationDocuments(canonical, { biddingEntity, expectedVersion: version, mode: 'revoke', coveredDocIds: [it.docId] }), 'Attestation revoked.')}>
                            Revoke
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {notDownloaded.length > 0 ? (
                  <div className="d-flex flex-wrap align-items-center gap-2">
                    <input type="file" className="form-control form-control-sm" style={{ maxWidth: 320 }} accept=".zip"
                      onChange={(e) => setDocFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
                    <button type="button" className="btn btn-outline-primary btn-sm" disabled={busy || !docFile}
                      onClick={() => run(() => reviewGovQualificationDocuments(canonical, { biddingEntity, expectedVersion: version, mode: 'add', coveredDocIds: toCover, file: docFile }), 'Document review recorded — coverage updated.')}>
                      <i className="ri-upload-2-line me-1" aria-hidden="true" />Upload ZIP &amp; attest {notDownloaded.length} doc(s)
                    </button>
                    <span className="small text-secondary">Attests the {notDownloaded.length} listed-but-undownloaded authoritative doc(s); only OP-listed authoritative docs can be attested.</span>
                  </div>
                ) : (
                  <div className="small text-success"><i className="ri-checkbox-circle-line me-1" aria-hidden="true" />All authoritative documents are reviewed.</div>
                )}
              </SectionCard>
            );
          })()}

          {/* ── Actions ─────────────────────────────────────────────────────── */}
          <SectionCard title="Qualification actions" icon="quill-pen-line">
            <div className="mb-3 d-flex flex-wrap align-items-end gap-2">
              <label className="form-label small mb-0">Bidding entity
                <input className="form-control form-control-sm" value={biddingEntity} onChange={(e) => setBiddingEntity(e.target.value)} />
              </label>
              {!record && (
                <button type="button" className="btn btn-primary btn-sm" disabled={busy || (!ws.sourceAvailable && !isDecoupled)}
                  onClick={() => run(() => createGovQualification(canonical, { biddingEntity, from: fromParam || undefined, agency: agencyParam || undefined }), 'Qualification opened.')}>
                  <i className="ri-add-line me-1" aria-hidden="true" />Open qualification
                </button>
              )}
            </div>

            {record && (
              <>
                <div className="mb-3">
                  <label className="form-label small">Rationale (optional)</label>
                  <textarea className="form-control form-control-sm" rows={2} value={rationale} onChange={(e) => setRationale(e.target.value)} />
                </div>

                <div className="d-flex flex-wrap gap-2 mb-3">
                  <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy}
                    onClick={() => run(() => recordGovQualificationDecision(canonical, { biddingEntity, expectedVersion: version, decision: 'needs_evidence', rationale: rationale || undefined }), 'Recorded: needs evidence.')}>Needs evidence</button>
                  <button type="button" className="btn btn-outline-danger btn-sm" disabled={busy}
                    onClick={() => run(() => recordGovQualificationDecision(canonical, { biddingEntity, expectedVersion: version, decision: 'no_bid', rationale: rationale || undefined }), 'Recorded: no bid.')}>No bid</button>
                </div>

                <div className="border rounded p-2 mb-3">
                  <div className="small fw-semibold mb-2">Establish a cited requirement</div>
                  <div className="d-flex flex-wrap gap-2 mb-2">
                    <input className="form-control form-control-sm" style={{ maxWidth: 90 }} placeholder="id" value={reqDraft.id} onChange={(e) => setReqDraft({ ...reqDraft, id: e.target.value })} />
                    <input className="form-control form-control-sm" style={{ maxWidth: 220 }} placeholder="text" value={reqDraft.text} onChange={(e) => setReqDraft({ ...reqDraft, text: e.target.value })} />
                    <select className="form-select form-select-sm" style={{ maxWidth: 140 }} value={reqDraft.applicability} onChange={(e) => setReqDraft({ ...reqDraft, applicability: e.target.value })}>
                      <option value="always">always</option><option value="conditional">conditional</option><option value="not_applicable">not_applicable</option><option value="unknown">unknown</option>
                    </select>
                    <select className="form-select form-select-sm" style={{ maxWidth: 130 }} value={reqDraft.dueStage} onChange={(e) => setReqDraft({ ...reqDraft, dueStage: e.target.value })}>
                      <option value="submission">submission</option><option value="award">award</option><option value="delivery">delivery</option><option value="unknown">unknown</option>
                    </select>
                    <input className="form-control form-control-sm" style={{ maxWidth: 100 }} placeholder="evidence docId" value={reqDraft.docId} onChange={(e) => setReqDraft({ ...reqDraft, docId: e.target.value })} />
                  </div>
                  <button type="button" className="btn btn-outline-primary btn-sm" disabled={busy || !reqDraft.id || !reqDraft.text}
                    onClick={() => {
                      const er: EstablishedRequirement = {
                        id: reqDraft.id, text: reqDraft.text, applicability: reqDraft.applicability as any,
                        dueStage: reqDraft.dueStage as any, bindingStatus: reqDraft.bindingStatus,
                        evidenceRef: reqDraft.docId ? { docId: reqDraft.docId } : null,
                      };
                      const existing = record.requirements_json?.established ?? [];
                      return run(() => recordGovQualificationDecision(canonical, { biddingEntity, expectedVersion: version, decision: 'needs_evidence', establishedRequirements: [...existing, er] }), 'Requirement established.');
                    }}>Add established requirement</button>
                </div>

                <div className="d-flex flex-wrap align-items-center gap-3">
                  <button type="button" className="btn btn-success" disabled={busy || !ws.canApprove}
                    title={ws.canApprove ? undefined : 'Approval is blocked until the source is current and every requirement is established, evidenced, and cleared.'}
                    onClick={() => run(() => approveGovQualification(canonical, { biddingEntity, expectedVersion: version, decision: 'approved_bid_pursuit', rationale: rationale || undefined }), 'Bid pursuit approved.')}>
                    <i className="ri-shield-check-line me-1" aria-hidden="true" />Approve bid pursuit
                  </button>
                  {!ws.canApprove && <span className="small text-secondary">{isDecoupled ? (ws.coverage && !ws.coverage.sufficient ? `Blocked: ${ws.coverage.reasons.map((r) => COVERAGE_REASON[r] ?? r).join('; ')}.` : 'Blocked: resolve the flagged requirements before approving.') : ws.changedSource ? 'Blocked: source changed since review.' : ws.sourceState !== 'available' ? `Blocked: source ${ws.sourceState}.` : 'Blocked: requirements/coverage not yet sufficient.'}</span>}
                </div>
              </>
            )}
          </SectionCard>

          {/* ── SEPARATE build authorization ────────────────────────────────── */}
          <SectionCard title="Authorize a build (separate)" icon="tools-line" collapsible defaultOpen={false} subtitle="A pursuit approval is NOT a build authorization. Recording this does not run any build; the autonomous builder stays parked.">
            <div className="d-flex flex-wrap gap-2 align-items-end">
              <input className="form-control form-control-sm" style={{ maxWidth: 260 }} placeholder="delivery project id (uuid)" value={build.deliveryProjectId} onChange={(e) => setBuild({ ...build, deliveryProjectId: e.target.value })} />
              <input className="form-control form-control-sm" style={{ maxWidth: 180 }} placeholder="scope" value={build.scope} onChange={(e) => setBuild({ ...build, scope: e.target.value })} />
              <input className="form-control form-control-sm" style={{ maxWidth: 180 }} placeholder="resource limit" value={build.resourceLimit} onChange={(e) => setBuild({ ...build, resourceLimit: e.target.value })} />
              <button type="button" className="btn btn-outline-warning btn-sm" disabled={busy || !build.deliveryProjectId || !build.scope || !build.resourceLimit}
                onClick={() => run(() => authorizeGovBuild(canonical, { deliveryProjectId: build.deliveryProjectId, scope: build.scope, resourceLimit: build.resourceLimit, govQualificationId: record?.id }), 'Build authorization recorded (no build started).')}>
                <i className="ri-shield-keyhole-line me-1" aria-hidden="true" />Authorize build
              </button>
            </div>
            <p className="small text-secondary mt-2 mb-0">The approver is your identity (a reviewer cannot approve their own pursuit; both are enforced server-side).</p>
          </SectionCard>
        </>
      )}
    </div>
  );
}
