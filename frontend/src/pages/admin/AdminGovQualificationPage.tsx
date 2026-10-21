import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { PageHeader, SectionCard, StatCard, StatusBadge, EmptyState } from '../../components/admin/shell';
import {
  getGovQualificationWorkspace, createGovQualification, recordGovQualificationDecision, approveGovQualification,
  requestGovApproval, sendBackGovApproval,
  authorizeGovBuild, getGovOpportunityCandidates, reviewGovQualificationDocuments, matchServicesToOpportunity,
  extractGovQualificationRequirements, getGovOpportunityDetail, attestSolicitationZip,
  assignGovBuildStory, unassignGovBuildStory,
  saveGovProposalResponse, reviewGovProposalResponse, addGovProposalFigure, removeGovProposalFigure, saveGovProposalDraft, resolveGovProposalGap, draftGovProposalWithAI, recordGovProposalAmendment,
  exportGovSubmission, downloadGovSubmissionPackage, recordGovSubmissionReceipt, acknowledgeGovSubmission, reopenGovSubmission, recordGovOutcome,
  type GovQualificationWorkspace, type QualRequirementEval, type GovCandidatesResult, type EstablishedRequirement, type ExtractedFileOutcome,
  type ServiceMatch, type ExtractedRequirementCandidate, type RequirementItem, type ReqItemCategory, type GovOpportunity, type GovDossier, type GovRelationship,
  type GovResponseSlot, type GovBuildPlan, type GovBuildStory, type GovAssignableBuilder,
  type GovResponseFigure, type GovResponseGap, type GovProposalAmendment, type GovSubmission, type GovSubmissionReadiness,
} from '../../services/factoryApi';
import { band, subtle, fmtValue, daysLeft, closeLabel } from './govOppFormat';
import { derivePotentialDisqualifiers } from './govGaps';
import { parseDeadline, countdownTo, deadlineTone, formatCountdown } from './govDeadline';
import { deriveNextStep } from './govNextStep';
import { BidDecisionDashboard } from './govWorkspace/BidDecisionDashboard';
import { ProposalSummaryPanel } from './govWorkspace/ProposalSummaryPanel';
import { ClarificationDraftPanel } from './govWorkspace/ClarificationDraftPanel';
import { BuildSpecPanel } from './govWorkspace/BuildSpecPanel';
import { GovBuildPlanAIPanel } from './govWorkspace/GovBuildPlanAIPanel';
import { GovMaterializePanel } from './govWorkspace/GovMaterializePanel';
import { ProposalSubmittalAudit, SubmittalBucketSection, groupSlotsByBucket } from './govWorkspace/proposalSubmittal';
import { SubmissionReadinessPanel } from './govWorkspace/SubmissionReadinessPanel';
import { AssignmentOverviewPanel } from './govWorkspace/AssignmentOverviewPanel';
import { WORKSPACE_STEPS, resolveStep, deriveStepState, type WorkspaceStep, type StepStateInput } from './govWorkspace/workspaceSteps';
import { StepBar } from './govWorkspace/StepBar';
import { StepFooter } from './govWorkspace/StepFooter';
import { PursuitBrief, type BriefSection } from './govWorkspace/PursuitBrief';
import { RightRail } from './govWorkspace/RightRail';
import { SolicitationItemsView, tracksForCategory, dueStageForCategory, type SolView } from './govWorkspace/SolicitationItemsView';
import { ManualRequirementForm } from './govWorkspace/ManualRequirementForm';
import { FitCapabilitiesPanel } from './govWorkspace/FitCapabilitiesPanel';
import { DecidePanel } from './govWorkspace/DecidePanel';
import { CountdownBand } from './govWorkspace/CountdownBand';
import { TeamAccessPanel } from './govWorkspace/TeamAccessPanel';
import { MvpScheduleBanner } from './govWorkspace/MvpScheduleBanner';
import { PreSubmissionGantt } from './govWorkspace/PreSubmissionGantt';

/** The discovery opportunity's display details fetched for the decoupled (ZIP) workspace. */
type OppDetail = { opportunity: GovOpportunity | null; source: 'live' | 'snapshot'; snapshotDate: string | null };

/** Per-candidate reviewer choices while confirming extracted requirements into established ones. */
interface CandidateRow { checked: boolean; applicability: string; dueStage: string; }

/** When an extraction yields ZERO candidates, explain WHY from the per-file outcomes so "add them by hand" is an
 *  informed choice, not a shrug. Returns null to let the generic copy stand. PURE. */
function noCandidatesReason(files: ExtractedFileOutcome[] | null): string | null {
  if (!files || files.length === 0) return null;
  const has = (s: ExtractedFileOutcome['status']): boolean => files.some((f) => f.status === s);
  const readable = files.filter((f) => f.status === 'extracted');
  if (files.every((f) => f.status === 'unreadable')) {
    return 'The upload did not open as a readable ZIP (it may be password-protected, an encrypted/ZIP64 archive, or not a ZIP at all). Re-export the solicitation ZIP from the source, or add the requirements by hand below.';
  }
  if (readable.length === 0 && has('image_only_pdf')) {
    return 'The PDF(s) in this ZIP have no selectable text — they look scanned / image-only, so nothing could be read. Add the requirements by hand below (or run the files through OCR first).';
  }
  if (readable.length === 0 && has('unsupported')) {
    return 'None of the files in this ZIP are a supported type (PDF, DOCX, XLSX, TXT), so nothing could be read. Add the requirements by hand below.';
  }
  if (readable.length > 0) {
    return 'The documents were read, but no requirement-style phrasing (shall / must / should / responsible for / describe …) was found. Add the requirements by hand below.';
  }
  return null;
}

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
  no_requirements_established: 'Confirm the detected requirements to establish them — on Solicitation, click "Establish selected" (nothing is established until you confirm)',
  no_zip_attested: 'Attest the solicitation ZIP as the evidence of record — upload it on the Solicitation step (one upload opens the qualification and attests it)',
  no_authoritative_source: 'Establish / review the authoritative solicitation',
  authoritative_package_unreviewed: 'Review the base solicitation or its amendment',
  document_coverage_unknown: 'Document coverage is unknown or inaccessible — re-check the uploaded package',
};

// The seven numbered pursuit STEPS (and the legacy ?tab= → step mapping) live in
// ./govWorkspace/workspaceSteps. The active step is URL-backed (?tab=<step>) so a reload restores it
// and the view is shareable; legacy tab values still resolve so old 7-tab links keep working.

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
 * OpportunityDossier — the "who & when" reference pulled from the attested ZIP: contacts (with mailto/tel),
 * NAICS codes, meeting/event lines, and key dates. Every item is DETECTED (regex over the literal ZIP text) and
 * labeled "verify" — it cites its source document and gates nothing. Honest empty-state when nothing was detected.
 */
function OpportunityDossier({ dossier }: { dossier: GovDossier }): React.ReactElement {
  const contacts = dossier.contacts ?? [];
  const naics = dossier.naics ?? [];
  // Prefer the system-tagged `codes` (naics|nigp); fall back to the legacy bare `naics` strings on older records.
  const codes = dossier.codes ?? naics.map((code) => ({ system: 'naics' as const, code, sourceDocument: '' }));
  const meetings = dossier.meetings ?? [];
  const keyDates = dossier.keyDates ?? [];
  const empty = contacts.length === 0 && codes.length === 0 && meetings.length === 0 && keyDates.length === 0;
  // A detected date line: the date, any literally-stated time, and (only if unambiguously stated) its timezone.
  // A stated time with no zone is flagged "verify tz" — never assume local; a missed-by-zone deadline loses the bid.
  const dateLine = (d: GovDossier['keyDates'][number]) => (
    <>
      {d.date && <strong className="me-1">{d.date}</strong>}
      {d.time && <span className="me-1">{d.time}{d.timezone ? ` ${d.timezone}` : ''}</span>}
      {d.time && !d.timezone && <span className="badge bg-warning-subtle text-warning-emphasis me-1" title="No time zone was stated — verify before relying on the hour">verify tz</span>}
      <span className="small">{d.text}</span>
      <div className="small text-secondary">· {d.sourceDocument}</div>
    </>
  );
  if (empty) {
    return (
      <div className="small text-secondary">
        <i className="ri-information-line me-1" aria-hidden="true" />
        Nothing detected in the ZIP — no contacts, meeting dates, or NAICS codes matched. Open the solicitation
        documents directly to find the point of contact and key dates.
      </div>
    );
  }
  return (
    <>
      <div className="row g-3">
        {(contacts.length > 0 || codes.length > 0) && (
          <div className="col-md-6">
            <h3 className="h6 text-secondary text-uppercase small mb-2"><i className="ri-user-3-line me-1" aria-hidden="true" />Who to contact</h3>
            {contacts.length === 0 && <div className="small text-secondary mb-2">No contact detected.</div>}
            <ul className="list-unstyled mb-2">
              {contacts.map((c, i) => (
                <li key={`${c.kind}-${c.value}-${i}`} className="mb-1">
                  <i className={`me-1 ${c.kind === 'email' ? 'ri-mail-line' : 'ri-phone-line'}`} aria-hidden="true" />
                  <a href={`${c.kind === 'email' ? 'mailto:' : 'tel:'}${c.value}`}>{c.value}</a>
                  <span className="small text-secondary ms-2">· {c.sourceDocument}</span>
                </li>
              ))}
            </ul>
            {contacts.length > 0 && (
              <div className="alert alert-warning py-2 px-2 small mb-2" role="note">
                <i className="ri-alert-line me-1" aria-hidden="true" />
                <strong>Single point of contact.</strong> Direct ALL questions about this solicitation only to the designated contact(s) above. Contacting other agency staff (ex-parte contact) can disqualify the bid — confirm the solicitation&apos;s communication rules before reaching out.
              </div>
            )}
            {codes.length > 0 && (
              <div className="d-flex flex-wrap align-items-center gap-1">
                <span className="small text-secondary me-1">Codes:</span>
                {codes.map((c, i) => (
                  <span key={`${c.system}-${c.code}-${i}`} className="badge bg-secondary-subtle text-secondary-emphasis" title={`${c.system.toUpperCase()} code${c.sourceDocument ? ` · ${c.sourceDocument}` : ''}`}>
                    <span className="text-uppercase">{c.system}</span> {c.code}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        {(meetings.length > 0 || keyDates.length > 0) && (
          <div className="col-md-6">
            <h3 className="h6 text-secondary text-uppercase small mb-2"><i className="ri-calendar-event-line me-1" aria-hidden="true" />Meetings &amp; key dates</h3>
            <ul className="list-unstyled mb-0">
              {meetings.map((m, i) => (
                <li key={`mtg-${i}`} className="mb-2">
                  <span className="badge bg-info-subtle text-info-emphasis me-1">Meeting</span>
                  {dateLine(m)}
                </li>
              ))}
              {keyDates.map((k, i) => (
                <li key={`kd-${i}`} className="mb-2">
                  <span className="badge bg-warning-subtle text-warning-emphasis me-1">Key date</span>
                  {dateLine(k)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="small text-secondary mt-3 pt-2 border-top">
        <i className="ri-alert-line me-1" aria-hidden="true" />
        Detected automatically from the ZIP text — <strong>verify</strong> against the solicitation before you rely on it.
        This is reference only and does not change any approval.
      </div>
    </>
  );
}

/** Props the assignment controls need: who can be assigned, whether assignment is possible, and how to mutate. */
interface BuildAssignProps {
  builders: GovAssignableBuilder[];
  canAssign: boolean;                 // a delivery project exists AND builders are enrolled
  busy: boolean;
  onAssign: (storyId: string, assigneeIdentityId: string) => void;
  onUnassign: (storyId: string) => void;
}

/** Label a builder by email, falling back to a short identity id — never a blank option. */
function builderLabel(b: GovAssignableBuilder): string {
  return b.email || `${b.identityId.slice(0, 8)}…`;
}

/**
 * GovBuildStoryRow — one Build-track story: its requirement citation, acceptance, an expandable student prompt, and
 * (P3-T2) the ASSIGNMENT control. Honest: a story is `unassigned` until an operator assigns it to an enrolled
 * builder; nothing here runs a build. Assignment is only offered once the pursuit is a delivery project with
 * builders — otherwise the row says why it can't be assigned yet rather than showing a dead control.
 */
function GovBuildStoryRow({ story, assign }: { story: GovBuildStory; assign?: BuildAssignProps }): React.ReactElement {
  const [showPrompt, setShowPrompt] = useState(false);
  const [pick, setPick] = useState('');
  const assigneeEmail = assign?.builders.find((b) => b.identityId === story.assigneeIdentityId)?.email ?? null;
  return (
    <li className="py-2 border-bottom">
      <div className="d-flex flex-wrap align-items-center gap-2">
        <span className="fw-semibold small">{story.id}</span>
        <StatusBadge label={story.status} tone={story.status === 'assigned' ? 'info' : 'neutral'} />
        <span className="small text-secondary">· from {story.requirementId}</span>
      </div>
      <div className="small">{story.statement}</div>
      {story.acceptance.length > 0 && (
        <ul className="small text-secondary mb-1 mt-1">{story.acceptance.map((a, i) => <li key={i}>{a}</li>)}</ul>
      )}
      {story.prompt && (
        <>
          <button type="button" className="btn btn-link btn-sm px-0" onClick={() => setShowPrompt((v) => !v)} aria-expanded={showPrompt}>
            <i className={`ri-${showPrompt ? 'arrow-down-s-line' : 'arrow-right-s-line'} me-1`} aria-hidden="true" />
            {showPrompt ? 'Hide' : 'Show'} the student build prompt
          </button>
          {showPrompt && <pre className="small bg-body-secondary rounded p-2 mb-0" style={{ whiteSpace: 'pre-wrap' }}>{story.prompt}</pre>}
        </>
      )}
      {assign && (
        <div className="d-flex flex-wrap align-items-center gap-2 mt-1">
          {story.status === 'assigned' ? (
            <>
              <span className="small"><i className="ri-user-follow-line me-1 text-info" aria-hidden="true" />Assigned to <strong>{assigneeEmail || 'a builder'}</strong></span>
              <button type="button" className="btn btn-outline-secondary btn-sm" disabled={assign.busy} onClick={() => assign.onUnassign(story.id)}>Unassign</button>
            </>
          ) : assign.canAssign ? (
            <>
              <select className="form-select form-select-sm" style={{ maxWidth: 260 }} value={pick} onChange={(e) => setPick(e.target.value)} aria-label={`Assign ${story.id} to a builder`}>
                <option value="">Assign to a builder…</option>
                {assign.builders.map((b) => <option key={b.identityId} value={b.identityId}>{builderLabel(b)}</option>)}
              </select>
              <button type="button" className="btn btn-outline-primary btn-sm" disabled={assign.busy || !pick} onClick={() => assign.onAssign(story.id, pick)}>Assign</button>
            </>
          ) : (
            <span className="small text-secondary"><i className="ri-information-line me-1" aria-hidden="true" />Assignable once the pursuit is approved into a project with enrolled builders.</span>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * GovBuildPlanPanel — the Build-track plan: releases → stories → prompts, projected from the solution_build
 * requirements, plus (P3-T2) per-story ASSIGNMENT and (P3-T4) a preserved-orphans section. Honest empty-state (an
 * all-admin requirement set has no build stories, by design). Assignment is server-gated: the control only offers
 * enrolled builders and the write is refused if the assignee can't build — this UI mirrors that, never replaces it.
 */
function GovBuildPlanPanel({ build, assign, aiBuild }: { build: GovBuildPlan | undefined; assign?: BuildAssignProps; aiBuild?: { storyCount: number; releaseCount: number } | null }): React.ReactElement {
  const releases = build?.releases ?? [];
  const stories = build?.stories ?? [];
  const orphans = build?.orphanedStories ?? [];
  if (stories.length === 0 && orphans.length === 0) {
    // ONE coherent message: this deterministic check only cites requirements that carry an explicit build signal,
    // so a service engagement legitimately has none here. It must NOT claim "no software to build" when the AI build
    // plan above already decomposes a real build-out — defer to that as the working plan.
    const hasAiBuild = !!(aiBuild && aiBuild.storyCount > 0);
    return (
      <div className="small text-secondary">
        <i className="ri-information-line me-1" aria-hidden="true" />
        {hasAiBuild ? (
          <>No requirement here carries an explicit build signal, so this traceability check cites no requirement-level build stories. The <strong>AI build plan above is the working build-out</strong> ({aiBuild!.storyCount} {aiBuild!.storyCount === 1 ? 'story' : 'stories'} across {aiBuild!.releaseCount} release{aiBuild!.releaseCount === 1 ? '' : 's'}, from the full spec + research); the requirements themselves are delivered through the proposal responses. Empty here is by design for a service engagement, not "nothing to build".</>
        ) : (
          <>No requirement here carries an explicit build signal, so there are no requirement-cited build stories yet. Generate the <strong>AI build plan above</strong> to see the working build-out for this opportunity, or establish a requirement that carries a build signal.</>
        )}
      </div>
    );
  }
  return (
    <>
      <div className="small text-secondary mb-2">
        {stories.length} build {stories.length === 1 ? 'story' : 'stories'} across {releases.length} release{releases.length === 1 ? '' : 's'},
        each traced to its requirement. Assign a story to an enrolled builder — execution stays a later, gated step (never automatic).
      </div>
      {releases.map((rel) => (
        <div key={rel.key} className="mb-3">
          <h3 className="h6 text-secondary text-uppercase small mb-2">{rel.name} <span className="fw-normal">({rel.storyIds.length})</span></h3>
          <ul className="list-unstyled mb-0">
            {rel.storyIds.map((sid) => {
              const s = stories.find((x) => x.id === sid);
              return s ? <GovBuildStoryRow key={sid} story={s} assign={assign} /> : null;
            })}
          </ul>
        </div>
      ))}
      {orphans.length > 0 && (
        <div className="mb-1 mt-3 pt-2 border-top">
          <h3 className="h6 text-warning-emphasis text-uppercase small mb-1"><i className="ri-alert-line me-1" aria-hidden="true" />Needs attention — preserved work ({orphans.length})</h3>
          <div className="small text-secondary mb-2">These stories carry an assignment or submitted evidence, but their requirement is no longer in the established set (a revision changed or removed it). The work is <strong>kept, not deleted</strong> — reconcile each against the current requirements.</div>
          <ul className="list-unstyled mb-0">
            {orphans.map((s) => <GovBuildStoryRow key={s.id} story={s} assign={assign} />)}
          </ul>
        </div>
      )}
    </>
  );
}

/**
 * GovTabPanel — one workspace tab's content. It stays MOUNTED when inactive and is hidden via display:none
 * (mirroring SectionCard's own collapse), so switching tabs never unmounts in-progress field state and a reload
 * restores instantly. Content remaining in the DOM is deliberate.
 */
function GovTabPanel({ active, children }: { active: boolean; children: React.ReactNode }): React.ReactElement {
  return <div role="tabpanel" style={active ? undefined : { display: 'none' }}>{children}</div>;
}

/** The lifecycle tone for a response slot's status. */
const RESPONSE_TONE: Record<string, 'neutral' | 'warning' | 'info' | 'success' | 'danger'> = {
  unanswered: 'neutral', draft: 'warning', reviewed: 'info', approved: 'success', revision_required: 'danger', filler: 'danger',
};

/** Handlers the Proposal tab wires so a slot can be authored + reviewed; absent on a read-only checklist. */
interface ResponseAuthoring {
  canAuthor: boolean;
  busy: boolean;
  onSave: (requirementId: string, content: string) => void;
  onReview: (requirementId: string, decision: 'reviewed' | 'approved' | 'revision_required') => void;
  onAddFigure: (requirementId: string, figure: GovResponseFigure) => void;
  onRemoveFigure: (requirementId: string, ref: string) => void;
  /** P5: resolve a Draft-with-AI gap (answered with a real answer, or filler which blocks export). */
  onResolveGap: (requirementId: string, gapId: string, resolution: 'answered' | 'filler', answer?: string) => void;
  /** P5: flag this response as needing input with a filler placeholder (blocks export until replaced). */
  onMarkFiller: (requirementId: string, content: string) => void;
  /** P5 Draft-with-AI: generate an advisory draft + typed gaps for this requirement. Persists as `draft`; resolves no gap. */
  onDraftAI: (requirementId: string, requirementText: string) => void;
}

/** One Draft-with-AI gap: the question, past-performance suggestions, and resolve as answered or (red) filler. */
function GapRow({ requirementId, gap, busy, onResolveGap }: { requirementId: string; gap: GovResponseGap; busy: boolean; onResolveGap: ResponseAuthoring['onResolveGap'] }): React.ReactElement {
  const [answer, setAnswer] = useState(gap.answer ?? '');
  const isFiller = gap.resolution === 'filler';
  return (
    <div className={`border rounded p-2 mb-1 ${isFiller ? 'border-danger bg-danger-subtle' : ''}`}>
      <div className="small fw-semibold">
        {gap.question}
        {gap.resolution === 'answered' && <span className="badge bg-success-subtle text-success-emphasis ms-1">answered</span>}
        {isFiller && <span className="badge bg-danger-subtle text-danger-emphasis ms-1">filler — blocks export</span>}
      </div>
      {gap.suggestions.length > 0 && (
        <div className="small text-secondary mb-1">From past performance: {gap.suggestions.map((s, i) => (
          <button key={i} type="button" className="btn btn-link btn-sm p-0 me-2" disabled={busy} onClick={() => setAnswer(s)}>{s}</button>
        ))}</div>
      )}
      <div className="input-group input-group-sm">
        <input type="text" className="form-control" value={answer} placeholder="Type the real answer…" disabled={busy} onChange={(e) => setAnswer(e.target.value)} aria-label={`Answer for ${gap.id}`} />
        <button type="button" className="btn btn-outline-success" disabled={busy || !answer.trim()} onClick={() => onResolveGap(requirementId, gap.id, 'answered', answer.trim())}>Save answer</button>
        <button type="button" className="btn btn-outline-danger" disabled={busy} onClick={() => onResolveGap(requirementId, gap.id, 'filler')}>Use a filler</button>
      </div>
    </div>
  );
}

/**
 * ResponseSlotRow — one response: its requirement citation, status, and (when authoring) an editor + the
 * lifecycle controls + commit-bound figures. The lifecycle ORDER is server-enforced; the UI only offers the legal
 * next step for the current status (and the server is the real gate, 409/422 on an illegal move).
 */
function ResponseSlotRow({ slot, authoring }: { slot: GovResponseSlot; authoring?: ResponseAuthoring }): React.ReactElement {
  const [content, setContent] = useState(slot.content ?? '');
  const [commit, setCommit] = useState('');
  const [figRef, setFigRef] = useState('');
  const [caption, setCaption] = useState('');
  const busy = authoring?.busy ?? false;
  const figures = slot.figures ?? [];
  return (
    <li className="py-2 border-bottom">
      <div className="d-flex flex-wrap align-items-center gap-2">
        <span className="fw-semibold small">{slot.requirementId}</span>
        <StatusBadge label={slot.status} tone={RESPONSE_TONE[slot.status] ?? 'neutral'} />
        {slot.sourceRef && <span className="small text-secondary" title="Cited source reference">· cites {slot.sourceRef}</span>}
      </div>
      <div className="small mb-1">{slot.statement}</div>

      {authoring?.canAuthor ? (
        <>
          <textarea className="form-control form-control-sm mb-1" rows={3} value={content} placeholder="Draft the response to this requirement…"
            onChange={(e) => setContent(e.target.value)} aria-label={`Response to ${slot.requirementId}`} />
          <div className="d-flex flex-wrap gap-2 align-items-center mb-1">
            <button type="button" className="btn btn-outline-primary btn-sm" disabled={busy} onClick={() => authoring.onSave(slot.requirementId, content)}>Save draft</button>
            {(slot.status === 'unanswered' || slot.status === 'draft' || slot.status === 'revision_required') && (
              <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy} title="Advisory: the AI drafts a grounded response and flags any fact it would have to invent as a gap. It never answers a gap for you."
                onClick={() => authoring.onDraftAI(slot.requirementId, slot.statement)}><i className="ri-sparkling-2-line me-1" aria-hidden="true" />Draft with AI</button>
            )}
            {slot.status === 'draft' && <button type="button" className="btn btn-outline-info btn-sm" disabled={busy} onClick={() => authoring.onReview(slot.requirementId, 'reviewed')}>Mark reviewed</button>}
            {slot.status === 'reviewed' && <button type="button" className="btn btn-success btn-sm" disabled={busy} onClick={() => authoring.onReview(slot.requirementId, 'approved')}>Approve</button>}
            {(slot.status === 'reviewed' || slot.status === 'approved' || slot.status === 'draft') && (
              <button type="button" className="btn btn-outline-danger btn-sm" disabled={busy} onClick={() => authoring.onReview(slot.requirementId, 'revision_required')}>Request revision</button>
            )}
            <button type="button" className="btn btn-outline-warning btn-sm" disabled={busy} title="Flag as needing input; a filler placeholder blocks export until replaced"
              onClick={() => authoring.onMarkFiller(slot.requirementId, content)}>Needs input (filler)</button>
          </div>
          {(slot.gaps ?? []).length > 0 && (
            <div className="mb-2">
              <div className="small fw-semibold text-uppercase text-secondary mb-1">Draft-with-AI gaps — answer or mark filler</div>
              {(slot.gaps ?? []).map((g) => <GapRow key={g.id} requirementId={slot.requirementId} gap={g} busy={busy} onResolveGap={authoring.onResolveGap} />)}
            </div>
          )}
          {figures.length > 0 && (
            <ul className="list-unstyled small mb-1">
              {figures.map((f) => (
                <li key={f.ref} className="d-flex flex-wrap align-items-center gap-2">
                  <i className="ri-image-line text-secondary" aria-hidden="true" />
                  <span className="text-truncate" style={{ maxWidth: 260 }}>{f.caption || f.ref}</span>
                  <span className="badge bg-light text-dark border" title="commit-bound">@{f.commit.slice(0, 7)}</span>
                  <button type="button" className="btn btn-link btn-sm text-danger p-0" disabled={busy} onClick={() => authoring.onRemoveFigure(slot.requirementId, f.ref)}>remove</button>
                </li>
              ))}
            </ul>
          )}
          <div className="d-flex flex-wrap gap-1 align-items-center">
            <input className="form-control form-control-sm" style={{ maxWidth: 120 }} value={commit} placeholder="commit sha" onChange={(e) => setCommit(e.target.value)} aria-label={`Figure commit for ${slot.requirementId}`} />
            <input className="form-control form-control-sm" style={{ maxWidth: 180 }} value={figRef} placeholder="repo path / screenshot" onChange={(e) => setFigRef(e.target.value)} aria-label={`Figure ref for ${slot.requirementId}`} />
            <input className="form-control form-control-sm" style={{ maxWidth: 160 }} value={caption} placeholder="caption" onChange={(e) => setCaption(e.target.value)} />
            <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy || !commit.trim() || !figRef.trim()}
              onClick={() => { authoring.onAddFigure(slot.requirementId, { commit: commit.trim(), ref: figRef.trim(), caption: caption.trim() }); setCommit(''); setFigRef(''); setCaption(''); }}>
              Add figure
            </button>
          </div>
        </>
      ) : (
        <>
          {slot.content && <div className="small bg-body-secondary rounded p-2" style={{ whiteSpace: 'pre-wrap' }}>{slot.content}</div>}
          {figures.length > 0 && <div className="small text-secondary mt-1">{figures.length} figure{figures.length === 1 ? '' : 's'} attached.</div>}
        </>
      )}
    </li>
  );
}

/**
 * ResponseSlotsChecklist — the proposal response checklist: one slot per established requirement the bid must
 * answer, each citing the requirement it addresses. With `authoring`, each slot can be drafted, reviewed, approved,
 * and given commit-bound figures (P4); without it, the checklist is read-only. Honest empty-state.
 */
function ResponseSlotsChecklist({ slots, authoring }: { slots: GovResponseSlot[]; authoring?: ResponseAuthoring }): React.ReactElement {
  const [showAll, setShowAll] = useState(false);
  if (!slots || slots.length === 0) {
    return (
      <div className="small text-secondary">
        <i className="ri-information-line me-1" aria-hidden="true" />
        No response slots yet — establish the applicable requirements first; each becomes a slot the proposal must answer.
      </div>
    );
  }
  const LIMIT = 8;
  const visible = showAll ? slots : slots.slice(0, LIMIT);
  const hiddenCount = slots.length - visible.length;
  return (
    <>
      <div className="small text-secondary mb-2">
        {slots.length} response slot{slots.length === 1 ? '' : 's'} — one per established requirement the proposal must answer.
        {authoring?.canAuthor ? ' Draft each, then take it through review → approval; a material amendment reopens an affected answer.' : ' Authoring opens once the pursuit is approved into a project.'}
      </div>
      <ul className="list-unstyled mb-0">
        {visible.map((s) => <ResponseSlotRow key={s.requirementId} slot={s} authoring={authoring} />)}
      </ul>
      {slots.length > LIMIT && (
        <button type="button" className="btn btn-link btn-sm px-0 mt-1" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
          {showAll ? 'Show fewer' : `Show all ${slots.length} (${hiddenCount} more)`}
        </button>
      )}
    </>
  );
}

/**
 * AmendmentInbox — the dates/messages/amendment inbox (P4). Lists recorded entries with their provenance, and (when
 * a project exists) lets an operator record a new amendment/message. An `amendment` whose affected requirements are
 * checked invalidates those responses' readiness server-side; a `message` records context only.
 */
function AmendmentInbox(
  { amendments, requirementIds, canRecord, busy, onRecord }:
  { amendments: GovProposalAmendment[]; requirementIds: string[]; canRecord: boolean; busy: boolean; onRecord: (body: { amendmentKey: string; kind: 'amendment' | 'message'; summary: string; affects: string[]; provenance: string | null }) => void },
): React.ReactElement {
  const [kind, setKind] = useState<'amendment' | 'message'>('amendment');
  const [amendmentKey, setAmendmentKey] = useState('');
  const [summary, setSummary] = useState('');
  const [provenance, setProvenance] = useState('');
  const [affects, setAffects] = useState<string[]>([]);
  const toggle = (id: string) => setAffects((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  return (
    <>
      {amendments.length === 0
        ? <div className="small text-secondary mb-2"><i className="ri-inbox-line me-1" aria-hidden="true" />No amendments or messages recorded yet.</div>
        : (
          <ul className="list-unstyled mb-3">
            {amendments.map((a) => (
              <li key={a.id} className="py-2 border-bottom">
                <div className="d-flex flex-wrap align-items-center gap-2">
                  <StatusBadge label={a.kind} tone={a.kind === 'amendment' ? 'warning' : 'info'} />
                  <span className="fw-semibold small">{a.amendmentKey}</span>
                  {a.kind === 'amendment' && a.invalidatedCount > 0 && <span className="badge bg-danger-subtle text-danger-emphasis">reopened {a.invalidatedCount} response{a.invalidatedCount === 1 ? '' : 's'}</span>}
                </div>
                <div className="small">{a.summary}</div>
                {a.affects.length > 0 && <div className="small text-secondary">affects: {a.affects.join(', ')}</div>}
                {a.provenance && <div className="small text-secondary">source: {a.provenance}</div>}
              </li>
            ))}
          </ul>
        )}
      {canRecord ? (
        <div className="border rounded p-2">
          <div className="d-flex flex-wrap gap-2 align-items-center mb-2">
            <select className="form-select form-select-sm" style={{ maxWidth: 140 }} value={kind} onChange={(e) => setKind(e.target.value as 'amendment' | 'message')} aria-label="Entry kind">
              <option value="amendment">Amendment</option>
              <option value="message">Message / Q&amp;A</option>
            </select>
            <input className="form-control form-control-sm" style={{ maxWidth: 200 }} value={amendmentKey} placeholder="key (e.g. Addendum 2)" onChange={(e) => setAmendmentKey(e.target.value)} aria-label="Entry key" />
            <input className="form-control form-control-sm" style={{ maxWidth: 240 }} value={provenance} placeholder="source (portal URL / ref)" onChange={(e) => setProvenance(e.target.value)} aria-label="Entry provenance" />
          </div>
          <textarea className="form-control form-control-sm mb-2" rows={2} value={summary} placeholder="What changed / what was asked?" onChange={(e) => setSummary(e.target.value)} aria-label="Entry summary" />
          {kind === 'amendment' && requirementIds.length > 0 && (
            <div className="small mb-2">
              <div className="text-secondary mb-1">Affects (checking a requirement reopens its reviewed/approved response):</div>
              <div className="d-flex flex-wrap gap-2">
                {requirementIds.map((id) => (
                  <label key={id} className="d-inline-flex align-items-center gap-1 small">
                    <input type="checkbox" checked={affects.includes(id)} onChange={() => toggle(id)} aria-label={`Affects ${id}`} />{id}
                  </label>
                ))}
              </div>
            </div>
          )}
          <button type="button" className="btn btn-outline-primary btn-sm" disabled={busy || !amendmentKey.trim() || !summary.trim()}
            onClick={() => { onRecord({ amendmentKey: amendmentKey.trim(), kind, summary: summary.trim(), affects: kind === 'amendment' ? affects : [], provenance: provenance.trim() || null }); setAmendmentKey(''); setSummary(''); setProvenance(''); setAffects([]); }}>
            Record entry
          </button>
        </div>
      ) : (
        <div className="small text-secondary"><i className="ri-information-line me-1" aria-hidden="true" />Recording opens once the pursuit is approved into a project.</div>
      )}
    </>
  );
}

const SUBMISSION_STATUS_TONE: Record<string, 'neutral' | 'warning' | 'info' | 'success'> = {
  preparing: 'neutral', needs_review: 'warning', ready: 'info', exported: 'info', externally_submitted: 'success', acknowledged: 'success',
};
const READINESS_REASON: Record<string, string> = {
  no_project: 'Approve the pursuit into a delivery project first.',
  no_response_slots: 'No response slots yet — establish requirements and author responses.',
  coverage_insufficient: 'The solicitation ZIP coverage is not sufficient yet.',
  requirements_blocking: 'Some requirements still block the bid (see the Proposal tab).',
};
const readinessReasonLabel = (r: string): string => (r.startsWith('responses_not_approved') ? `Some responses are not yet approved (${r.split(':')[1] || ''}).` : (READINESS_REASON[r] ?? r));

interface SubmissionActions {
  canAct: boolean; busy: boolean;
  onExport: () => void; onDownload: () => void;
  onReceipt: (externalRef: string) => void; onAcknowledge: (ackRef: string) => void; onReopen: () => void;
}

/**
 * SubmissionPanel — the Complete-Your-Submission surface (P5). Readiness is the gate: Export is offered only when
 * every response is approved + covered. EXPORTED ≠ SUBMITTED: the download + the receipt/acknowledgement are
 * distinct, manual steps; nothing here submits to any external portal. Mirrors the server, never replaces it.
 */
/**
 * SubmitStatusTiles (P7) — a compact, at-a-glance read of the Submit step: deadline, readiness, package, and the
 * external-submission confirmation. PRESENTATIONAL and advisory — it derives entirely from the submission +
 * readiness the page already holds and triggers nothing; the controls below (SubmissionPanel) remain the source
 * of truth, and the submission routes are unchanged.
 */
function SubmitStatusTiles({ submission, readiness, deadlineUtc, daysLeftN }: {
  submission: GovSubmission | null | undefined;
  readiness: GovSubmissionReadiness | undefined;
  deadlineUtc: string | null;
  daysLeftN: number | null;
}): React.ReactElement {
  const status = submission?.status ?? 'preparing';
  const ready = !!readiness?.ready;
  const blockingN = readiness?.blocking?.length ?? 0;
  const submitted = status === 'externally_submitted' || status === 'acknowledged';
  const exported = status === 'exported' || submitted;
  const dateStr = deadlineUtc && !Number.isNaN(Date.parse(deadlineUtc)) ? new Date(deadlineUtc).toISOString().slice(0, 10) : 'Not set';
  const tiles: { k: string; v: string; sub: string; tone: string; icon: string }[] = [
    { k: 'Deadline', v: dateStr, sub: daysLeftN != null ? `${daysLeftN} day${daysLeftN === 1 ? '' : 's'} left` : 'no date on file', tone: daysLeftN != null && daysLeftN <= 3 ? 'danger' : 'secondary', icon: 'ri-timer-flash-line' },
    { k: 'Readiness', v: ready ? 'Ready' : `${blockingN} blocking`, sub: ready ? 'all responses approved' : 'resolve before submit', tone: ready ? 'success' : 'warning', icon: ready ? 'ri-checkbox-circle-line' : 'ri-error-warning-line' },
    { k: 'Package', v: exported ? 'Exported' : 'Not exported', sub: exported ? 'download below' : 'export when ready', tone: exported ? 'info' : 'secondary', icon: 'ri-folder-zip-line' },
    { k: 'Submission', v: submitted ? (status === 'acknowledged' ? 'Acknowledged' : 'Recorded') : 'Not recorded', sub: submission?.externalRef ? `ref ${submission.externalRef}` : 'record after you submit', tone: submitted ? 'success' : 'secondary', icon: 'ri-send-plane-line' },
  ];
  return (
    <div className="row g-2 mb-3" data-testid="submit-status-tiles">
      {tiles.map((t) => (
        <div className="col-6 col-lg-3" key={t.k}>
          <div className={`card h-100 border-${t.tone}-subtle`}>
            <div className="card-body py-2 px-3">
              <div className="small text-secondary text-uppercase" style={{ fontSize: '0.7rem', letterSpacing: '0.04em' }}><i className={`${t.icon} me-1`} aria-hidden="true" />{t.k}</div>
              <div className={`fw-semibold text-${t.tone}-emphasis`}>{t.v}</div>
              <div className="small text-secondary">{t.sub}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SubmissionPanel({ submission, readiness, actions }: { submission: GovSubmission | null | undefined; readiness: GovSubmissionReadiness | undefined; actions: SubmissionActions }): React.ReactElement {
  const [externalRef, setExternalRef] = useState('');
  const [ackRef, setAckRef] = useState('');
  const status = submission?.status ?? 'preparing';
  const ready = !!readiness?.ready;
  const exportedOrLater = status === 'exported' || status === 'externally_submitted' || status === 'acknowledged';
  return (
    <>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
        <span className="small text-secondary">Submission status:</span>
        <StatusBadge label={status.replace(/_/g, ' ')} tone={SUBMISSION_STATUS_TONE[status] ?? 'neutral'} />
      </div>
      <div className={`alert ${ready ? 'alert-success' : 'alert-warning'} py-2 small`} role="status">
        {ready ? 'Ready: every response is approved and the package can be exported.' : (
          <>Not ready to export:
            <ul className="mb-0">{(readiness?.blocking ?? ['Not evaluated']).map((b) => <li key={b}>{readinessReasonLabel(b)}</li>)}</ul>
          </>
        )}
      </div>
      {actions.canAct ? (
        <div className="d-flex flex-wrap gap-2 align-items-center mb-2">
          <button type="button" className="btn btn-primary btn-sm" disabled={actions.busy || !ready} title={ready ? undefined : 'Approve every response first'} onClick={actions.onExport}>
            <i className="ri-archive-line me-1" aria-hidden="true" />Export package
          </button>
          {exportedOrLater && (
            <button type="button" className="btn btn-outline-primary btn-sm" disabled={actions.busy} onClick={actions.onDownload}>
              <i className="ri-download-2-line me-1" aria-hidden="true" />Download package (.zip)
            </button>
          )}
          {exportedOrLater && (
            <button type="button" className="btn btn-outline-secondary btn-sm" disabled={actions.busy} onClick={actions.onReopen}>Reopen</button>
          )}
        </div>
      ) : (
        <div className="small text-secondary mb-2"><i className="ri-information-line me-1" aria-hidden="true" />Submission opens once the pursuit is approved into a project.</div>
      )}

      {actions.canAct && exportedOrLater && status !== 'externally_submitted' && status !== 'acknowledged' && (
        <div className="border rounded p-2 mb-2">
          <label className="form-label small mb-1">Record external submission <span className="text-secondary">(after you submit on the buyer portal — this app never submits for you)</span></label>
          <div className="d-flex flex-wrap gap-2 align-items-center">
            <input className="form-control form-control-sm" style={{ maxWidth: 260 }} value={externalRef} placeholder="confirmation number / portal ref" onChange={(e) => setExternalRef(e.target.value)} aria-label="External submission ref" />
            <button type="button" className="btn btn-success btn-sm" disabled={actions.busy || !externalRef.trim()} onClick={() => actions.onReceipt(externalRef.trim())}>Record submission</button>
          </div>
        </div>
      )}
      {submission?.externalRef && (
        <div className="small mb-2"><i className="ri-check-line text-success me-1" aria-hidden="true" />Externally submitted: <strong>{submission.externalRef}</strong>{submission.externallySubmittedAt ? ` (${submission.externallySubmittedAt.slice(0, 10)})` : ''}</div>
      )}
      {actions.canAct && status === 'externally_submitted' && (
        <div className="border rounded p-2 mb-2">
          <label className="form-label small mb-1">Record agency acknowledgement</label>
          <div className="d-flex flex-wrap gap-2 align-items-center">
            <input className="form-control form-control-sm" style={{ maxWidth: 260 }} value={ackRef} placeholder="acknowledgement ref (optional)" onChange={(e) => setAckRef(e.target.value)} aria-label="Acknowledgement ref" />
            <button type="button" className="btn btn-outline-success btn-sm" disabled={actions.busy} onClick={() => actions.onAcknowledge(ackRef.trim())}>Record acknowledgement</button>
          </div>
        </div>
      )}
      {submission?.acknowledgedRef !== undefined && submission?.status === 'acknowledged' && (
        <div className="small mb-2"><i className="ri-mail-check-line text-success me-1" aria-hidden="true" />Acknowledged{submission.acknowledgedRef ? `: ${submission.acknowledgedRef}` : ''}.</div>
      )}
    </>
  );
}

const OUTCOME_TONE: Record<string, 'neutral' | 'success' | 'danger' | 'warning'> = {
  pending: 'neutral', won: 'success', lost: 'danger', withdrawn: 'warning', no_bid: 'warning', unknown: 'neutral',
};

/**
 * OutcomePanel — capture the win/loss outcome (P5). Recording `won` or `lost` generates PRIVATE reusable candidates
 * (a case-study candidate + a service-capability candidate) shown here; they are drafts, never published — a person
 * promotes them later. Recording an outcome never changes a past approval or fabricates a result.
 */
function OutcomePanel({ submission, canAct, busy, onRecord }: { submission: GovSubmission | null | undefined; canAct: boolean; busy: boolean; onRecord: (outcome: GovSubmission['outcome'], note: string) => void }): React.ReactElement {
  const [outcome, setOutcome] = useState<GovSubmission['outcome']>('won');
  const [note, setNote] = useState('');
  const cs = submission?.caseStudyCandidate;
  const sc = submission?.serviceCapabilityCandidate;
  return (
    <>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
        <span className="small text-secondary">Outcome:</span>
        <StatusBadge label={(submission?.outcome ?? 'pending').replace(/_/g, ' ')} tone={OUTCOME_TONE[submission?.outcome ?? 'pending'] ?? 'neutral'} />
      </div>
      {canAct ? (
        <div className="border rounded p-2 mb-3">
          <div className="d-flex flex-wrap gap-2 align-items-center mb-2">
            <select className="form-select form-select-sm" style={{ maxWidth: 160 }} value={outcome} onChange={(e) => setOutcome(e.target.value as GovSubmission['outcome'])} aria-label="Outcome">
              {['won', 'lost', 'withdrawn', 'no_bid', 'unknown'].map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
            </select>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => onRecord(outcome, note.trim())}>Record outcome</button>
          </div>
          <textarea className="form-control form-control-sm" rows={2} value={note} placeholder="Debrief note (optional)" onChange={(e) => setNote(e.target.value)} aria-label="Outcome note" />
          <div className="small text-secondary mt-1">won / lost also generate a private case-study + service-capability candidate for later review.</div>
        </div>
      ) : (
        <div className="small text-secondary mb-2"><i className="ri-information-line me-1" aria-hidden="true" />Outcome capture opens once the pursuit is approved into a project.</div>
      )}
      {cs && (
        <div className="card mb-2"><div className="card-body py-2">
          <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
            <h3 className="h6 mb-0">Case-study candidate</h3>
            <span className="badge bg-secondary-subtle text-secondary-emphasis">private — not published</span>
          </div>
          <div className="fw-semibold small">{cs.title}</div>
          <div className="small text-secondary">{cs.summary}</div>
        </div></div>
      )}
      {sc && (
        <div className="card"><div className="card-body py-2">
          <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
            <h3 className="h6 mb-0">Service-capability candidate</h3>
            <span className="badge bg-info-subtle text-info-emphasis">suggested</span>
          </div>
          <div className="fw-semibold small">{sc.name}</div>
          <div className="small text-secondary">{sc.rationale}</div>
        </div></div>
      )}
    </>
  );
}

/* GovJourneyStrip removed in the 2026-10 redesign — the numbered StepBar (govWorkspace/StepBar)
   is the pursuit journey now. */

/**
 * RelationshipPanel — "have we pursued this agency before?" Lists prior pursuits of the same agency with their
 * decision + date, or an honest empty-state. Matched by agency name only, so it is explicitly "verify"; it is
 * advisory and changes no decision. The current opportunity is excluded server-side and again here defensively.
 */
function RelationshipPanel({ relationship, currentKey }: { relationship: GovRelationship; currentKey: string }): React.ReactElement {
  const pursuits = (relationship.pursuits ?? []).filter((p) => p.canonicalOpportunityId !== currentKey);
  const agency = relationship.agency || 'this agency';
  if (pursuits.length === 0) {
    return (
      <div className="small text-secondary">
        <i className="ri-information-line me-1" aria-hidden="true" />
        No prior pursuits recorded for <strong>{agency}</strong> — this looks like the first opportunity we've worked with them.
      </div>
    );
  }
  const badge = (d: string) => {
    const t = d === 'approved_bid_pursuit' || d === 'rfi_response' ? 'success' : d === 'no_bid' ? 'secondary' : 'info';
    return <span className={`badge bg-${t}-subtle text-${t}-emphasis`}>{d.replace(/_/g, ' ')}</span>;
  };
  return (
    <>
      <div className="small mb-2">We have <strong>{pursuits.length}</strong> prior pursuit{pursuits.length === 1 ? '' : 's'} on record with <strong>{agency}</strong>:</div>
      <ul className="list-unstyled mb-2">
        {pursuits.map((p) => (
          <li key={p.canonicalOpportunityId} className="d-flex flex-wrap align-items-center gap-2 py-1 border-bottom">
            <span className="fw-semibold small flex-grow-1">{p.title ?? p.canonicalOpportunityId}</span>
            {badge(p.decision)}
            {p.date && <span className="small text-secondary">{new Date(p.date).toLocaleDateString()}</span>}
          </li>
        ))}
      </ul>
      <div className="small text-secondary"><i className="ri-alert-line me-1" aria-hidden="true" />Matched by agency name — verify these are the same agency. Reference only; it changes no decision.</div>
    </>
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
  const [params, setParams] = useSearchParams();
  // The active pursuit step is URL-backed (?tab=<step>) so a reload restores it and the view is
  // shareable; legacy tab values resolve to the new steps so old links keep working.
  const tabParam = params.get('tab') ?? '';
  const activeStep: WorkspaceStep = resolveStep(tabParam);
  const setStep = useCallback((key: WorkspaceStep) => {
    const next = new URLSearchParams(params);
    next.set('tab', key);
    setParams(next);
  }, [params, setParams]);
  // Active workspace key: a canonical OP id, OR a decoupled discovery-ZIP key (`gws:<uuid>`). The whole body is
  // key-agnostic; `isDecoupled` (below) drives the source:null re-gating.
  const canonical = params.get('canonical') ?? params.get('gws') ?? '';
  const fromParam = params.get('from') ?? '';
  const agencyParam = params.get('agency') ?? '';
  // Bidding entity comes from the URL (?biddingEntity=) or defaults to colaberry; it is not edited in-page since the
  // "Open, decide & approve" drawer that held the field was replaced by <DecidePanel/> (P4).
  const [biddingEntity] = useState(params.get('biddingEntity') ?? 'colaberry');
  const [ws, setWs] = useState<GovQualificationWorkspace | null>(null);
  // The just-created monitored project, surfaced as a persistent success strip on the Proposal step (where
  // create now navigates) so the "open the intern's project" link is not lost when we leave the Build tab.
  const [materialized, setMaterialized] = useState<{ projectId: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ActionError | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false); // synchronous guard so a same-tick double-click cannot fire two writes
  const [rationale, setRationale] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [svcMatches, setSvcMatches] = useState<ServiceMatch[] | null>(null);
  const [svcMatchLoading, setSvcMatchLoading] = useState(false);
  // The AI build plan's loaded counts (lifted from GovBuildPlanAIPanel) so the deterministic cross-check presents
  // ONE coherent build-out message instead of contradicting the plan with "no software to build".
  const [aiBuildSummary, setAiBuildSummary] = useState<{ storyCount: number; releaseCount: number } | null>(null);
  // Extract-from-ZIP → confirm → establish. Extraction is read-only (persists nothing); establishment is the write.
  const [extractFile, setExtractFile] = useState<File | null>(null);
  const [candidates, setCandidates] = useState<ExtractedRequirementCandidate[] | null>(null);
  const [items, setItems] = useState<RequirementItem[] | null>(null);
  const [candRows, setCandRows] = useState<Record<string, CandidateRow>>({});
  // Per-file extraction outcomes (the server's honesty rail) — drives a specific reason when 0 candidates come back.
  const [extractOutcomes, setExtractOutcomes] = useState<ExtractedFileOutcome[] | null>(null);
  const [solView, setSolView] = useState<SolView>('map');
  const [extractBusy, setExtractBusy] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  // Discovery details (why-surfaced + overview + Source link) for the decoupled (gws) workspace. Best-effort.
  const [oppDetail, setOppDetail] = useState<OppDetail | null>(null);

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
  // onSuccess (optional) fires ONLY after the write resolved and the server truth reloaded — never on a
  // thrown/blocked write (a 403 lands in catch), so a navigation passed here cannot fire on a failed approve.
  const run = useCallback(async (fn: () => Promise<any>, okNote: string, onSuccess?: () => void) => {
    if (inFlight.current) return;         // synchronous: blocks a same-tick double-click before any await
    inFlight.current = true; setBusy(true); setActionError(null); setNotice(null);
    try { await fn(); setNotice(okNote); await load(); onSuccess?.(); }
    catch (err: any) { setActionError(errToAction(err)); }
    finally { inFlight.current = false; setBusy(false); }
  }, [load]);

  // READ-ONLY: extract candidate requirements from the uploaded solicitation ZIP. Persists nothing — the reviewer
  // confirms which candidates become established (gate-bearing) requirements below.
  const extract = useCallback(async (): Promise<boolean> => {
    if (!extractFile || !canonical) return false;
    setExtractBusy(true); setExtractError(null);
    try {
      const r = await extractGovQualificationRequirements(canonical, extractFile);
      setCandidates(r.candidates);
      setExtractOutcomes(r.files ?? null);
      const its = r.items ?? null;
      setItems(its);
      // Default each candidate's due-stage from its item category when the taxonomy is present (scope -> delivery,
      // submit/rule -> submission, after_award -> award), so a confirmed scope item lands as a build-stage obligation.
      const catByCand = new Map<string, ReqItemCategory>();
      for (const it of its ?? []) catByCand.set(it.sourceFragments[0]?.reqId ?? it.id, it.category);
      const rows: Record<string, CandidateRow> = {};
      for (const c of r.candidates) {
        const cat = catByCand.get(c.id);
        rows[c.id] = { checked: true, applicability: 'always', dueStage: cat ? dueStageForCategory(cat) : 'submission' };
      }
      setCandRows(rows);
      return true;
    } catch (err: any) {
      setExtractError(err?.response?.data?.error ?? 'Could not extract requirements from the document.');
      setCandidates(null);
      setItems(null);
      setExtractOutcomes(null);
      return false;
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
    // Look up each candidate's item category (1:1) to carry category + tracks onto the established requirement,
    // so a confirmed `scope` item reliably becomes a build story and the rest are submission/award-stage.
    const catByCand = new Map<string, ReqItemCategory>();
    for (const it of items ?? []) catByCand.set(it.sourceFragments[0]?.reqId ?? it.id, it.category);
    const mapped: EstablishedRequirement[] = chosen.map((c) => {
      const cat = catByCand.get(c.id);
      return {
        id: c.id, text: c.text,
        ...(cat ? { category: cat, tracks: tracksForCategory(cat) } : {}),
        applicability: (candRows[c.id]?.applicability ?? 'always') as EstablishedRequirement['applicability'],
        dueStage: (candRows[c.id]?.dueStage ?? 'submission') as EstablishedRequirement['dueStage'],
        bindingStatus: 'binding_solicitation_requirement',
      };
    });
    const byId = new Map<string, EstablishedRequirement>();
    for (const e of record.requirements_json?.established ?? []) byId.set(e.id, e);
    for (const m of mapped) byId.set(m.id, m);
    const merged = Array.from(byId.values());
    void run(async () => {
      await recordGovQualificationDecision(canonical, { biddingEntity, expectedVersion: version, decision: 'needs_evidence', establishedRequirements: merged });
      setCandidates(null); setItems(null); setCandRows({}); setExtractOutcomes(null);
    }, `Established ${mapped.length} requirement(s) from the solicitation.`);
  };

  // Manual fallback for the Solicitation step: establish ONE hand-typed requirement when the extractor missed it
  // (or found nothing at all). Same merge-by-id + deliberate establish/decision write as `establishSelected`, so a
  // manual requirement is gate-bearing in exactly the same way a confirmed candidate is. Requires an open record.
  const establishManual = (req: EstablishedRequirement): void => {
    if (!record) return;
    const byId = new Map<string, EstablishedRequirement>();
    for (const e of record.requirements_json?.established ?? []) byId.set(e.id, e);
    byId.set(req.id, req);
    const merged = Array.from(byId.values());
    void run(
      () => recordGovQualificationDecision(canonical, { biddingEntity, expectedVersion: version, decision: 'needs_evidence', establishedRequirements: merged }),
      'Established 1 requirement you added by hand.',
    );
  };

  // ONE upload does it ALL on the decoupled path: extract the requirement candidates (read-only) AND attest the SAME
  // ZIP as the evidence of record (a server hash) — AUTO-OPENING the qualification first if it isn't open yet. No
  // separate "Open qualification" click is needed: upload opens it and attests in one step. If the qualification is
  // already open, it just attests (unless already attested). Extraction always stands.
  const uploadSolicitationZip = useCallback(async () => {
    const extracted = await extract();
    if (!extracted || !isDecoupled || !extractFile) return;
    if (!record) {
      await run(async () => {
        const created = await createGovQualification(canonical, { biddingEntity, from: fromParam || undefined, agency: agencyParam || undefined });
        await attestSolicitationZip(canonical, { biddingEntity, expectedVersion: created.qualification.version, mode: 'add', file: extractFile });
      }, 'Qualification opened, and the ZIP extracted and attested as the evidence of record. Confirm the detected requirements below.');
      return;
    }
    if (version && !(ws && ws.zipAttestation && ws.zipAttestation.sha256)) {
      await run(
        () => attestSolicitationZip(canonical, { biddingEntity, expectedVersion: version, mode: 'add', file: extractFile }),
        'Solicitation ZIP extracted and attested as the evidence of record.',
      );
    }
  }, [extract, isDecoupled, record, version, extractFile, ws, run, canonical, biddingEntity, fromParam, agencyParam]);

  const stepInput: StepStateInput | null = ws ? {
    zipAttested: !!(ws.zipAttestation && ws.zipAttestation.sha256),
    establishedCount: ws.evaluation ? ws.evaluation.evals.length : 0,
    decision: record ? record.decision : null,
    proposalContentReady: (ws.responseSlots?.length ?? 0) > 0 && (ws.responseSlots ?? []).every((s) => s.status === 'approved'),
    hasBuild: !!(ws.build && (ws.build.deliveryProjectId || (ws.build.buildStoryCount ?? 0) > 0)),
    submissionStatus: ws.submission ? ws.submission.status : null,
    outcome: ws.submission ? ws.submission.outcome : null,
  } : null;
  const stepModel = stepInput ? deriveStepState(activeStep, stepInput) : null;
  const frontier = stepModel ? stepModel.frontier : null;
  // Land on the frontier (first unfinished step) on a fresh load with no explicit ?tab=.
  useEffect(() => {
    if (ws && !tabParam && frontier && frontier !== activeStep) setStep(frontier);
  }, [ws, tabParam, frontier, activeStep, setStep]);

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

          {stepModel && (
            <StepBar
              steps={WORKSPACE_STEPS}
              onStep={setStep}
              statuses={stepModel.statuses}
              frontier={stepModel.frontier}
            />
          )}

          <div className="row g-4">
            <div className="col-12 col-lg-8">{/* ── LEFT: the active step's panel + the always-reachable qualification drawer ── */}

          <GovTabPanel active={activeStep === 'decide'}>

          {(() => {
            const ns = deriveNextStep({
              decision: record ? record.decision : null,
              establishedCount: ws.evaluation ? ws.evaluation.evals.length : 0,
              zipAttested: !!(ws.zipAttestation && ws.zipAttestation.sha256),
              canApprove: ws.canApprove,
              canApprovePursuit: ws.evaluation ? (ws.evaluation.canApprovePursuit ?? true) : true,
              changed: ws.changedSource || !!ws.syncChange,
            });
            const cls = ns.tone === 'success' ? 'alert-success' : ns.tone === 'warning' ? 'alert-warning' : 'alert-primary';
            return (
              <div className={`alert ${cls} d-flex align-items-start gap-2`} role="status">
                <i className="ri-guide-line mt-1 fs-5" aria-hidden="true" />
                <div><div className="fw-semibold">{ns.title}</div><div className="small mb-0">{ns.detail}</div></div>
              </div>
            );
          })()}

          {/* The pursuit journey is now the numbered StepBar at the top of the workspace. */}

          {(
          <div className="row g-3 mb-3">
            <div className="col-6 col-lg-3"><StatCard label="Source state" value={ws.sourceState} icon="git-commit-line" tone={ws.sourceState === 'available' ? 'success' : ws.sourceState === 'unavailable' || ws.sourceState === 'auth_failed' || ws.sourceState === 'malformed' ? 'danger' : 'warning'} hint={ws.snapshotRecorded ? `snapshot v${ws.sourceSnapshotVersion}` : 'snapshot unrecorded'} /></div>
            <div className="col-6 col-lg-3"><StatCard label="Needed before submit" value={ws.evaluation ? (ws.evaluation.openSubmissionRequirements ?? []).length : '—'} icon="checkbox-multiple-line" tone="neutral" hint="submission prerequisites — these don't block the pursuit" /></div>
            <div className="col-6 col-lg-3"><StatCard label="Current decision" value={record ? record.decision.replace(/_/g, ' ') : 'not opened'} icon="file-list-3-line" tone="neutral" hint={record ? `v${record.version}` : undefined} /></div>
            <div className="col-6 col-lg-3"><StatCard label="Approval allowed" value={ws.canApprove ? 'yes' : 'no'} icon={ws.canApprove ? 'shield-check-line' : 'shield-cross-line'} tone={ws.canApprove ? 'success' : 'warning'} /></div>
          </div>
          )}

          {/* P4: the bid-decision dashboard shows for BOTH decoupled (gws:) and coupled (op:gov:) workspaces. */}
          {ws.evaluation && ws.evaluation.evals.length > 0 && (() => {
            const matches = svcMatches ?? [];
            const capability: 'strong' | 'moderate' | 'none' = matches.some((m) => m.strength === 'strong') ? 'strong' : matches.some((m) => m.strength === 'moderate') ? 'moderate' : 'none';
            return (
              <BidDecisionDashboard canonical={canonical} signals={{
                established,
                serviceMatches: matches,
                capability,
                priorPursuitCount: ws.relationship?.priorCount ?? 0,
                daysLeft: daysLeft(oppDetail?.opportunity?.closeDate ?? null),
                estimatedValue: oppDetail?.opportunity?.estimatedValue ?? null,
                openSubmissionCount: (ws.evaluation.openSubmissionRequirements ?? []).length,
                establishedCount: ws.evaluation.evals.length,
                buyer: oppDetail?.opportunity?.agency ?? null,
                title: oppDetail?.opportunity?.title ?? null,
              }} />
            );
          })()}

          {isDecoupled && ws.relationship && (
            <SectionCard title="Have we pursued this agency before?" icon="history-line" collapsible defaultOpen={true}
              subtitle="Possible prior work with the same agency — advisory, verify. It feeds no gate.">
              <RelationshipPanel relationship={ws.relationship} currentKey={canonical} />
            </SectionCard>
          )}

          {/* P4: the first-class Decide card — record a call, write the brief, route it to a second admin, approve
              or send back. Replaces the old "Open, decide & approve" drawer. */}
          <DecidePanel
            record={record}
            canApprove={ws.canApprove}
            blockedReason={ws.canApprove ? null : (isDecoupled
              ? (ws.coverage && !ws.coverage.sufficient ? `Blocked: ${ws.coverage.reasons.map((r) => COVERAGE_REASON[r] ?? r).join('; ')}.` : 'Blocked: resolve the flagged requirements before approving.')
              : ws.changedSource ? 'Blocked: source changed since review.'
              : ws.sourceState !== 'available' ? `Blocked: source ${ws.sourceState}.`
              : 'Blocked: requirements/coverage not yet sufficient.')}
            canOpen={ws.sourceAvailable || isDecoupled}
            busy={busy}
            onOpen={() => run(() => createGovQualification(canonical, { biddingEntity, from: fromParam || undefined, agency: agencyParam || undefined }), 'Qualification opened.')}
            onApprove={(rat) => run(() => approveGovQualification(canonical, { biddingEntity, expectedVersion: version, decision: 'approved_bid_pursuit', rationale: rat || undefined }), 'Bid pursuit approved.', () => setStep('build'))}
            onQuickDecision={(d, rat) => run(() => recordGovQualificationDecision(canonical, { biddingEntity, expectedVersion: version, decision: d, rationale: rat || undefined }), d === 'no_bid' ? 'Recorded: no bid.' : 'Recorded: needs evidence.')}
            onRequest={(approverId, brief) => run(() => requestGovApproval(canonical, { biddingEntity, expectedVersion: version, approverIdentityId: approverId, decisionBrief: brief }), 'Approval requested.')}
            onSendBack={(n) => run(() => sendBackGovApproval(canonical, { biddingEntity, expectedVersion: version, note: n || undefined }), 'Sent back for revision.')}
          />

          {/* Deadline countdown now lives in the persistent right rail (see RightRail below). */}

          {stepModel && (
            <StepFooter
              ready={stepModel.approved}
              statusLine={stepModel.approved ? 'Approved — the build and submission steps are unlocked.' : 'Open the qualification, record your call, and approve (a second admin) below.'}
              nextLine={stepModel.approved ? 'Next: define the product and build the bid.' : 'Approval is the hinge — steps 5–7 unlock once a second admin approves.'}
              onBack={() => setStep('fit')}
              primary={stepModel.approved ? { label: 'Build the bid', onClick: () => setStep('build') } : { label: 'Approve below to continue', disabled: true, onClick: () => undefined }}
            />
          )}

          </GovTabPanel>{/* end Go/No-go (was Overview) */}

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

          <GovTabPanel active={activeStep === 'solicitation'}>

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
            <SectionCard title="Discovery details" icon="information-line" collapsible defaultOpen={true}
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
            <SectionCard title="Upload the solicitation ZIP" icon="file-search-line"
              subtitle="Upload the Bonfire ZIP once. It does two things in one step: lists the requirements it detects as CANDIDATES (confirm the real ones to establish them), and — once the qualification is open — attests the same ZIP as the evidence of record (the server stores only a hash of it, never the bytes). A candidate is not a requirement until you confirm it.">
              <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                <input type="file" className="form-control form-control-sm" style={{ maxWidth: 320 }} accept=".zip"
                  onChange={(e) => setExtractFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
                <button type="button" className="btn btn-outline-primary btn-sm" disabled={extractBusy || busy || !extractFile}
                  onClick={() => { void uploadSolicitationZip(); }}>
                  <i className="ri-search-eye-line me-1" aria-hidden="true" />{extractBusy ? 'Processing…' : 'Extract & attest'}
                </button>
              </div>
              {extractError && <div className="alert alert-danger py-2" role="alert">{extractError}</div>}
              {candidates !== null && candidates.length === 0 && (
                <>
                  <div className="alert alert-warning py-2 small mb-0" role="status">
                    <i className="ri-information-line me-1" aria-hidden="true" />
                    {noCandidatesReason(extractOutcomes) ?? 'No requirements detected in that ZIP. Establish at least one by hand below.'}
                  </div>
                  <ManualRequirementForm busy={busy} noRecord={!record} onEstablish={establishManual} />
                </>
              )}
              {candidates !== null && candidates.length > 0 && (
                <>
                  <SolicitationItemsView
                    items={items} candidates={candidates} candRows={candRows}
                    onToggle={(cid, checked) => setCandRows((prev) => ({ ...prev, [cid]: { ...(prev[cid] ?? { checked: true, applicability: 'always', dueStage: 'submission' }), checked } }))}
                    onSetField={(cid, field, value) => setCandRows((prev) => ({ ...prev, [cid]: { ...(prev[cid] ?? { checked: true, applicability: 'always', dueStage: 'submission' }), [field]: value } }))}
                    view={solView} onView={setSolView}
                  />
                  {record ? (
                    <button type="button" className="btn btn-primary btn-sm" disabled={busy || selectedCandidateCount === 0} onClick={establishSelected}>
                      <i className="ri-check-double-line me-1" aria-hidden="true" />Establish selected ({selectedCandidateCount})
                    </button>
                  ) : (
                    <div className="alert alert-info py-2 mb-0" role="status">
                      <i className="ri-information-line me-1" aria-hidden="true" />Open the qualification on the <strong>Decide</strong> step to confirm these into established requirements.
                    </div>
                  )}
                  <ManualRequirementForm busy={busy} noRecord={!record} onEstablish={establishManual} />
                </>
              )}
            </SectionCard>
          )}

          {isDecoupled && record && (
            <SectionCard title="Evidence of record (attested ZIP)" icon="file-shield-2-line"
              subtitle="Normally attested automatically when you upload above. Use this to check the status, re-attest a corrected ZIP, or revoke. The server stores only a hash, never the bytes; required (with established requirements) before a bid pursuit can be approved.">
              {ws.zipAttestation && ws.zipAttestation.sha256 ? (
                <div className="d-flex flex-wrap align-items-center gap-2">
                  <span className="badge bg-success-subtle text-success-emphasis"><i className="ri-checkbox-circle-line me-1" aria-hidden="true" />Attested</span>
                  <span className="small text-secondary">{ws.zipAttestation.filename ?? 'solicitation.zip'} · {ws.zipAttestation.sha256.slice(0, 12)}…</span>
                  <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy}
                    onClick={() => run(() => attestSolicitationZip(canonical, { biddingEntity, expectedVersion: version, mode: 'revoke' }), 'ZIP attestation revoked.')}>Revoke</button>
                </div>
              ) : (
                <div className="small text-secondary">
                  <i className="ri-information-line me-1" aria-hidden="true" />Not attested yet — it's recorded automatically when you <strong>Extract &amp; attest</strong> above (one upload does both). To attest a corrected ZIP, just run Extract &amp; attest again with the new file.
                </div>
              )}
            </SectionCard>
          )}

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

          {stepModel && (
            <StepFooter
              ready={!!(ws.zipAttestation && ws.zipAttestation.sha256) && (ws.evaluation?.evals.length ?? 0) > 0}
              statusLine={!!(ws.zipAttestation && ws.zipAttestation.sha256) && (ws.evaluation?.evals.length ?? 0) > 0 ? 'Ready: the ZIP is attested and requirements are established.' : 'Not yet: attest the ZIP and establish the cited requirements.'}
              nextLine="Next: assess whether we can deliver it, and what it would teach us."
              onBack={() => setStep('snapshot')}
              primary={{ label: 'Confirm the package — assess fit', disabled: !(!!(ws.zipAttestation && ws.zipAttestation.sha256) && (ws.evaluation?.evals.length ?? 0) > 0), onClick: () => setStep('fit') }}
              blockers={[
                ...(ws.zipAttestation && ws.zipAttestation.sha256 ? [] : ['Upload and attest the solicitation ZIP.']),
                ...((ws.evaluation?.evals.length ?? 0) > 0 ? [] : ['Establish at least one cited requirement.']),
              ]}
            />
          )}

          </GovTabPanel>{/* end Solicitation */}

          {/* The former Dates & Messages tab (dossier, key dates, amendments inbox) now lives in the
              persistent right rail (see RightRail below), visible on every step. */}

          <GovTabPanel active={activeStep === 'snapshot'}>

          {(ws.source || isDecoupled) && (
            <SectionCard title="What they want / what we&apos;d build (AI)" icon="sparkling-2-line"
              subtitle="An advisory read of the opportunity. Before any requirement is established it summarizes the opportunity's own synopsis; once requirements are established it reads from them. Authors nothing, changes no gate.">
              {oppDetail?.opportunity?.preliminarySummary && (
                <div className="small mb-2"><span className="text-secondary">From the opportunity listing: </span>{oppDetail.opportunity.preliminarySummary}</div>
              )}
              <ProposalSummaryPanel canonical={canonical}
                requirements={(established ?? []).map((r) => ({ id: r.id, text: r.text }))}
                synopsis={oppDetail?.opportunity?.preliminarySummary ?? null}
                title={oppDetail?.opportunity?.title ?? null} buyer={oppDetail?.opportunity?.agency ?? null} />
            </SectionCard>
          )}

          {(
            <SectionCard title="Snapshot facts" icon="dashboard-3-line"
              subtitle="The quick read — value, timing and the legacy scores — so you can pass in two minutes if it is clearly not for us.">
              <div className="row g-3">
                <div className="col-6 col-lg-3"><StatCard label="Estimated value" value={fmtValue(oppDetail?.opportunity?.estimatedValue ?? null)} icon="money-dollar-circle-line" tone="neutral" hint="unverified" /></div>
                <div className="col-6 col-lg-3"><StatCard label="Closes" value={closeLabel(oppDetail?.opportunity?.closeDate ?? ws.source?.deadline?.utc ?? null)} icon="calendar-event-line" tone="neutral" hint={daysLeft(oppDetail?.opportunity?.closeDate ?? ws.source?.deadline?.utc ?? null) !== null ? `${daysLeft(oppDetail?.opportunity?.closeDate ?? ws.source?.deadline?.utc ?? null)} days` : undefined} /></div>
                <div className="col-6 col-lg-3"><StatCard label="Legacy priority" value={oppDetail?.opportunity?.priorityScore ?? '—'} icon="bar-chart-box-line" tone="neutral" hint="advisory" /></div>
                <div className="col-6 col-lg-3"><StatCard label="Legacy fit" value={oppDetail?.opportunity?.fitScore ?? '—'} icon="scales-3-line" tone="neutral" hint="advisory" /></div>
              </div>
            </SectionCard>
          )}

          {stepModel && (
            <StepFooter
              ready
              statusLine="Read the short version. If it is clearly not for us, pass now."
              nextLine="Next: pull the solicitation ZIP and read the real requirements."
              secondary={record ? { label: 'Pass on this', onClick: () => run(() => recordGovQualificationDecision(canonical, { biddingEntity, expectedVersion: version, decision: 'no_bid', rationale: rationale || 'passed at snapshot' }), 'Recorded: no bid.') } : null}
              primary={{ label: 'Worth a look — get the solicitation', onClick: () => setStep('solicitation') }}
            />
          )}

          </GovTabPanel>{/* end Snapshot */}

          <GovTabPanel active={activeStep === 'fit'}>

          {ws.evaluation && (ws.source || isDecoupled) && (
            <SectionCard title="Requirements by due stage" icon="list-check-2" subtitle="Missing evidence, unknown applicability, and unevidenced dismissals block a bid pursuit.">
              {ws.evaluation.evals.length === 0 && <div className="text-secondary small">No requirements established yet. Opportunity Pulse supplies none — establish the applicable, cited requirements below before a pursuit can be approved.</div>}
              {STAGE_ORDER.filter((s) => (ws.evaluation!.byDueStage[s]?.length ?? 0) > 0).map((stage) => (
                <RequirementStageList key={stage} stage={stage} rows={ws.evaluation!.byDueStage[stage]} />
              ))}
              {ws.coverage && !ws.coverage.sufficient && (
                <div className="small text-warning-emphasis mt-2"><i className="ri-guide-line me-1" aria-hidden="true" /><strong>Before this pursuit can be approved, do this next:</strong> {ws.coverage.reasons.map((r) => COVERAGE_REASON[r] ?? r).join('; ')}.</div>
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
                    <p className="text-secondary small mb-0">{needs.length === 0
                      ? <>No suggestions yet — <strong>establish the requirements above first</strong>; the match works from them.</>
                      : <>No suggested services for these signals. This is <strong>advisory</strong> — a suggestion, <em>not</em> a verdict that we can't do this. The opportunity carries no NAICS to match on, so refine keywords in <strong>Our Services</strong> or use your own judgment.</>}</p>
                  )}
                </div>
              </div>
            </SectionCard>
          )}

          {/* Step 3 "Fit" (P3): AI capability assessment vs Our Services, write-back, and tickable eligibility. */}
          {(ws.source || isDecoupled) && (
            <FitCapabilitiesPanel
              canonicalOpportunityId={canonical}
              needs={needs}
              title={oppDetail?.opportunity?.title ?? ws.provenance?.title ?? null}
              buyer={ws.source?.publisher?.leadBuyer?.name ?? oppDetail?.opportunity?.agency ?? null}
              gaps={derivePotentialDisqualifiers(established, ws.evaluation, svcMatches ?? [])}
              biddingEntity={biddingEntity}
              version={version}
              canWrite={!!record}
              onSaved={() => { void load(); }}
            />
          )}

          {(ws.source || isDecoupled) && (
            <SectionCard title="Ask the buyer: clarification questions (AI)" icon="questionnaire-line" collapsible defaultOpen={false}
              subtitle="Advisory: finds the vague requirements (a line like 'connect to their system' with no system named) and drafts a sharp question for each, plus a ready-to-send email. Grounded only in the established requirements; this app sends nothing and changes no gate.">
              <ClarificationDraftPanel
                canonical={canonical}
                requirements={(established ?? []).map((r) => ({ id: r.id, text: r.text }))}
                title={oppDetail?.opportunity?.title ?? ws.provenance?.title ?? null}
                buyer={ws.source?.publisher?.leadBuyer?.name ?? oppDetail?.opportunity?.agency ?? null}
              />
            </SectionCard>
          )}

          {stepModel && (
            <StepFooter
              ready
              statusLine="Confirm the matches and eligibility, then decide."
              nextLine="Next: weigh win probability and value, and request approval."
              onBack={() => setStep('solicitation')}
              secondary={record ? { label: 'Disqualified — no bid', onClick: () => run(() => recordGovQualificationDecision(canonical, { biddingEntity, expectedVersion: version, decision: 'no_bid', rationale: rationale || 'disqualified at fit' }), 'Recorded: no bid.') } : null}
              primary={{ label: 'Fit is workable — decide', onClick: () => setStep('decide') }}
            />
          )}

          </GovTabPanel>{/* end Requirements */}

          {/* Manual document review moved up into the Solicitation step above (one panel per step). */}

          {/* P4: the old "Open, decide & approve" drawer was replaced by the first-class <DecidePanel/> rendered
              inside the Decide step above (open / decide / brief + request approval / approve / send back). The
              bidding-entity field + the establish-a-requirement form live on their own steps now. */}

          <GovTabPanel active={activeStep === 'build'}>
          {/* P5: the countdown band — are we going to make it? Deterministic on-time probability from the deadline,
              remaining build work, and items waiting on a human answer (see govCountdown). */}
          <CountdownBand
            deadline={oppDetail?.opportunity?.closeDate ?? ws.source?.deadline?.utc ?? null}
            remainingStoryCount={ws.build ? (ws.build.stories ?? []).length : null}
            humanBlockedCount={(ws.responseSlots ?? []).filter((s) => (s.gaps ?? []).some((g) => g.resolution === 'open' || g.resolution === 'filler')).length}
            submitTotal={(ws.responseSlots ?? []).length}
            submitDone={(ws.responseSlots ?? []).filter((s) => s.status === 'approved').length}
            fillerCount={(ws.responseSlots ?? []).filter((s) => s.status === 'filler' || (s.gaps ?? []).some((g) => g.resolution === 'filler')).length}
          />
          {/* P5 Team & access: assign is below (AssignmentOverviewPanel); this shares the proposal safely. */}
          <TeamAccessPanel
            canonicalOpportunityId={canonical}
            builders={ws.build?.assignableBuilders ?? []}
            canShare={!!ws.build?.deliveryProjectId}
            responseCount={(ws.responseSlots ?? []).length}
          />
          {/* P5 B: the pre-submission MVP schedule, back-planned from the submission deadline (distinct from the
              post-award build timeline further down). */}
          <SectionCard title="Spec &amp; MVP schedule (pre-submission)" icon="calendar-schedule-line"
            subtitle="Back-planned from the submission deadline: can we build a demo-able MVP before the bid is due? Deterministic and working-day aware. This is distinct from the post-award build timeline below.">
            <MvpScheduleBanner
              deadline={oppDetail?.opportunity?.closeDate ?? ws.source?.deadline?.utc ?? null}
              mvpStoryCount={ws.build ? (ws.build.stories ?? []).length : null}
            />
            <PreSubmissionGantt
              deadline={oppDetail?.opportunity?.closeDate ?? ws.source?.deadline?.utc ?? null}
              mvpStoryCount={ws.build ? (ws.build.stories ?? []).length : null}
            />
          </SectionCard>
          {/* ── Build tab: the AI build spec/research (advisory) + the solution-build track (forward) + the separate build authorization ─ */}
          {(
            <SectionCard title="Build spec & buyer-system research (AI)" icon="sparkling-2-line"
              subtitle="After approval: a lengthy spec of the capabilities we'd build, plus advisory research into the buyer's likely systems so a vague 'connect to their system' becomes a concrete integration target. Advisory only — it authors no story and changes no gate.">
              <BuildSpecPanel canonical={canonical}
                requirements={(established ?? []).map((r) => ({ id: r.id, text: r.text }))}
                title={oppDetail?.opportunity?.title ?? null} buyer={oppDetail?.opportunity?.agency ?? null}
                daysLeft={daysLeft(oppDetail?.opportunity?.closeDate ?? null)} />
            </SectionCard>
          )}
          {(
            <SectionCard title="Build plan — releases, stories & schedule (AI)" icon="flow-chart"
              subtitle="One build-out of the opportunity — the AI plan is the working build (releases and stories with narratives, acceptance criteria, dependencies and a projected post-award timeline); the deterministic requirement-coverage cross-check is folded in below. Advisory only: it authors no requirement-cited story and changes no gate.">
              <GovBuildPlanAIPanel canonical={canonical}
                requirements={(established ?? []).map((r) => ({ id: r.id, text: r.text }))}
                title={oppDetail?.opportunity?.title ?? null} buyer={oppDetail?.opportunity?.agency ?? null}
                deadline={oppDetail?.opportunity?.closeDate ?? ws.source?.deadline?.utc ?? null}
                onLoaded={setAiBuildSummary} />
              <details className="mt-3 pt-2 border-top">
                <summary className="small fw-semibold text-secondary" style={{ cursor: 'pointer' }}>
                  <i className="ri-list-check-2 me-1" aria-hidden="true" />Requirement coverage (deterministic cross-check)
                </summary>
                <div className="small text-secondary mt-1 mb-2">A secondary, deterministic check: every solution_build requirement projected into a cited story. The AI plan above is the working build; this confirms each requirement is covered. A pursuit approval is NOT a build authorization.</div>
                <GovBuildPlanPanel build={ws.build} aiBuild={aiBuildSummary} assign={{
                  builders: ws.build?.assignableBuilders ?? [],
                  canAssign: !!(ws.build?.deliveryProjectId && (ws.build?.assignableBuilders?.length ?? 0) > 0),
                  busy,
                  onAssign: (storyId, assigneeIdentityId) => run(() => assignGovBuildStory(canonical, storyId, assigneeIdentityId), 'Story assigned.'),
                  onUnassign: (storyId) => run(() => unassignGovBuildStory(canonical, storyId), 'Assignment removed.'),
                }} />
              </details>
            </SectionCard>
          )}
          {(
            <SectionCard title="Assignment at a glance" icon="user-shared-line"
              subtitle="Who can build this contract and how much is already assigned — advisory. The assign controls are in the Build plan card above (per story) and the Create card below (the intern); this summary changes nothing.">
              <AssignmentOverviewPanel
                deliveryProjectId={ws.build?.deliveryProjectId ?? null}
                builders={ws.build?.assignableBuilders ?? []}
                stories={ws.build?.stories ?? []}
              />
            </SectionCard>
          )}
          {(
            <SectionCard title="Create the monitored project" icon="rocket-2-line"
              subtitle="Once the plan looks right, assign the build to an intern — this creates a real project under their profile, monitored like the Command Center. It materializes the reviewed plan's releases and stories; it starts no build and changes no gate.">
              <GovMaterializePanel canonical={canonical}
                deliveryProjectId={ws.build?.deliveryProjectId ?? null}
                assignableBuilders={ws.build?.assignableBuilders ?? []}
                requirements={(established ?? []).map((r) => ({ id: r.id, text: r.text }))}
                title={oppDetail?.opportunity?.title ?? null} buyer={oppDetail?.opportunity?.agency ?? null}
                deadline={oppDetail?.opportunity?.closeDate ?? ws.source?.deadline?.utc ?? null}
                onCreated={(r) => {
                  setMaterialized({ projectId: r.projectId });
                  // One click: fold the (separate, audited) build authorization into create for an authorized
                  // actor, then take the operator to the Proposal step. Best-effort: if the server enforces
                  // separation of duties and refuses, the manual "Authorize a build" card remains the fallback.
                  void authorizeGovBuild(canonical, { deliveryProjectId: ws.build!.deliveryProjectId!, scope: 'solution_build', resourceLimit: 'standard', govQualificationId: record?.id }).catch(() => { /* separation of duties */ });
                  setStep('proposal');
                }} />
            </SectionCard>
          )}
          {(
          <SectionCard title="Authorize a build (separate)" icon="shield-keyhole-line" collapsible defaultOpen={false} subtitle="A pursuit approval is NOT a build authorization. Recording this does not run any build; the autonomous builder stays parked.">
            <button type="button" className="btn btn-outline-warning btn-sm" disabled={busy || !ws.build?.deliveryProjectId}
              onClick={() => run(() => authorizeGovBuild(canonical, { deliveryProjectId: ws.build!.deliveryProjectId!, scope: 'solution_build', resourceLimit: 'standard', govQualificationId: record?.id }), 'Build authorization recorded (no build started).')}>
              <i className="ri-shield-keyhole-line me-1" aria-hidden="true" />Authorize build
            </button>
            <p className="small text-secondary mt-2 mb-0">
              {ws.build?.deliveryProjectId
                ? "Authorizes the build for this pursuit's delivery project — no IDs to enter. The acting program admin authorizes (a super admin may authorize their own); this only logs who authorized it — it starts no build; the autonomous builder stays parked."
                : 'Approve the pursuit into a delivery project first — then this authorizes the build automatically (no IDs to enter).'}
            </p>
          </SectionCard>
          )}

          </GovTabPanel>{/* end Build */}

          {/* Proposal — its OWN step/page (step 6): Build above is the software product we would deliver; this is the
              bid RESPONSE we submit. Unlocked after approval, same as Build. */}
          <GovTabPanel active={activeStep === 'proposal'}>
          {materialized && (
            <div className="alert alert-success d-flex flex-wrap align-items-center gap-2 py-2 px-3 small" role="status">
              <i className="ri-check-double-line" aria-hidden="true" />
              <span>Monitored project created under the intern and the build is authorized. This page is the bid RESPONSE to write and submit, separate from the software build.</span>
              <a className="ms-auto fw-semibold text-decoration-none" href={`/admin/projects?interns=1&project=${materialized.projectId}`}>Open the intern's project board &rarr;</a>
            </div>
          )}
          {(
            <SectionCard title="What we submit" icon="draft-line"
              subtitle="The bid response, grouped into the submittal categories a government proposal is organized into (what you actually hand in) instead of one flat list. Draft each response, then take it through review → approval; a material amendment reopens an affected answer.">
              {(ws.responseSlots ?? []).length === 0 ? (
                <ResponseSlotsChecklist slots={[]} />
              ) : (
                <>
                  <ProposalSubmittalAudit slots={ws.responseSlots ?? []} />
                  {groupSlotsByBucket(ws.responseSlots ?? []).map(({ bucket, slots }) => (
                    <SubmittalBucketSection key={bucket.key} bucket={bucket} slots={slots}>
                      <ResponseSlotsChecklist slots={slots} authoring={{
                        canAuthor: !!ws.build?.deliveryProjectId,
                        busy,
                        onSave: (rid, content) => run(() => saveGovProposalResponse(canonical, rid, content), 'Response saved.'),
                        onReview: (rid, decision) => run(() => reviewGovProposalResponse(canonical, rid, decision), 'Response updated.'),
                        onAddFigure: (rid, fig) => run(() => addGovProposalFigure(canonical, rid, fig), 'Figure attached.'),
                        onRemoveFigure: (rid, ref) => run(() => removeGovProposalFigure(canonical, rid, ref), 'Figure removed.'),
                        onResolveGap: (rid, gapId, resolution, answer) => run(() => resolveGovProposalGap(canonical, rid, gapId, resolution, answer), resolution === 'filler' ? 'Marked filler (blocks export).' : 'Gap answered.'),
                        onMarkFiller: (rid, content) => run(() => saveGovProposalDraft(canonical, rid, content, [{ id: 'needs-input', question: 'This response needs input before it can ship.', suggestions: [], resolution: 'filler' }]), 'Flagged: needs input (filler).'),
                        onDraftAI: (rid, requirementText) => run(() => draftGovProposalWithAI(canonical, rid, requirementText, oppDetail?.opportunity?.title ?? null, oppDetail?.opportunity?.agency ?? null), 'AI draft generated — review it and answer any gaps.'),
                      }} />
                    </SubmittalBucketSection>
                  ))}
                </>
              )}
            </SectionCard>
          )}

          </GovTabPanel>{/* end Proposal */}

          <GovTabPanel active={activeStep === 'submit'}>
          {/* P7: at-a-glance submit tiles (deadline / readiness / package / confirmation) — advisory, derived. */}
          <SubmitStatusTiles
            submission={ws.submission}
            readiness={ws.submissionReadiness}
            deadlineUtc={ws.source?.deadline?.utc ?? oppDetail?.opportunity?.closeDate ?? null}
            daysLeftN={daysLeft(ws.source?.deadline?.utc ?? oppDetail?.opportunity?.closeDate ?? null)}
          />
          {/* ── What gets submitted (advisory summary: legible bid, changes nothing) ─ */}
          <SectionCard title="What gets submitted" icon="file-list-3-line"
            subtitle="A read-only summary of the bid — what it must answer, how far along it is, and the deadline with a day-before ship target. It changes nothing; the release controls are below.">
            <SubmissionReadinessPanel
              readiness={ws.submissionReadiness}
              slots={ws.responseSlots ?? []}
              requirements={(established ?? []).map((r) => ({ id: r.id, text: r.text, dueStage: r.dueStage }))}
              deadlineUtc={ws.source?.deadline?.utc ?? oppDetail?.opportunity?.closeDate ?? null}
              daysLeft={daysLeft(ws.source?.deadline?.utc ?? oppDetail?.opportunity?.closeDate ?? null)}
            />
          </SectionCard>

          {/* ── Complete Your Submission (forward: readiness mirror + the response checklist) ─ */}
          {(
            <SectionCard title="Complete your submission" icon="send-plane-line"
              subtitle="Assemble, finalize, and export the bid package — then record the external submission yourself. Nothing here submits to any buyer portal.">
              <SubmissionPanel
                submission={ws.submission}
                readiness={ws.submissionReadiness}
                actions={{
                  canAct: !!ws.build?.deliveryProjectId,
                  busy,
                  onExport: () => run(() => exportGovSubmission(canonical), 'Package exported.'),
                  onDownload: () => { void downloadGovSubmissionPackage(canonical).catch((err) => setActionError(errToAction(err))); },
                  onReceipt: (ref) => run(() => recordGovSubmissionReceipt(canonical, ref), 'External submission recorded.'),
                  onAcknowledge: (ref) => run(() => acknowledgeGovSubmission(canonical, ref), 'Acknowledgement recorded.'),
                  onReopen: () => run(() => reopenGovSubmission(canonical), 'Submission reopened.'),
                }}
              />
              <div className="mt-3 pt-2 border-top">
                <ResponseSlotsChecklist slots={ws.responseSlots ?? []} />
              </div>
            </SectionCard>
          )}

          </GovTabPanel>{/* end Complete Your Submission */}

          <GovTabPanel active={activeStep === 'outcome'}>
          {/* ── Outcome & Case Study (forward) ─ */}
          {(
            <SectionCard title="Outcome &amp; case study" icon="trophy-line"
              subtitle="Capture the win/loss outcome. won or lost generates a PRIVATE case-study + service-capability candidate for later review — never published, never fabricated.">
              <OutcomePanel
                submission={ws.submission}
                canAct={!!ws.build?.deliveryProjectId}
                busy={busy}
                onRecord={(outcome, note) => run(() => recordGovOutcome(canonical, outcome, note || null), 'Outcome recorded.')}
              />
            </SectionCard>
          )}
          </GovTabPanel>{/* end Outcome & Case Study */}

            </div>{/* end LEFT column */}
            <aside className="col-12 col-lg-4">{/* ── RIGHT: pursuit brief + persistent rail (deadline, dates+buyer, messages, team) ── */}
              {stepModel && (
                <PursuitBrief sections={WORKSPACE_STEPS.filter((s) => s.n <= 6).map((s): BriefSection => {
                  const st = stepModel.statuses[s.key];
                  const state: BriefSection['state'] = st === 'current' ? 'adding' : st === 'done' ? 'known' : 'future';
                  const facts: string[] = [];
                  if (state !== 'future') {
                    if (s.key === 'snapshot') {
                      if (oppDetail?.opportunity?.title) facts.push(oppDetail.opportunity.title);
                      const dl = daysLeft(oppDetail?.opportunity?.closeDate ?? ws.source?.deadline?.utc ?? null);
                      if (dl !== null) facts.push(`${dl} days to close`);
                    } else if (s.key === 'solicitation') {
                      facts.push(`${ws.evaluation?.evals.length ?? 0} requirements established`);
                      if (ws.zipAttestation && ws.zipAttestation.sha256) facts.push('ZIP attested');
                    } else if (s.key === 'fit') {
                      const caps = record?.requirements_json?.capabilities?.decisions ?? [];
                      if (caps.length > 0) {
                        facts.push(`${caps.length} capabilit${caps.length === 1 ? 'y' : 'ies'} assessed`);
                        const have = caps.filter((c) => c.assessment === 'have').length;
                        const partial = caps.filter((c) => c.assessment === 'partial').length;
                        const neu = caps.filter((c) => c.assessment === 'new').length;
                        facts.push(`${have} we have · ${partial} partial · ${neu} new`);
                      }
                    } else if (s.key === 'decide' && record) {
                      facts.push(`Decision: ${record.decision.replace(/_/g, ' ')}`);
                    } else if (s.key === 'build' && ws.build?.deliveryProjectId) {
                      facts.push('Monitored project created');
                    }
                  }
                  return { n: s.n, label: s.label, state, facts };
                })} />
              )}
              <RightRail
                deadline={
                  <DeadlineCard
                    value={isDecoupled ? (oppDetail?.opportunity?.closeDate ?? null) : (ws.source?.deadline.utc ?? null)}
                    confidence={isDecoupled ? null : (ws.source?.deadline.utcConfidence ?? null)}
                    originalText={isDecoupled ? null : (ws.source?.deadline.originalText ?? null)}
                    loading={isDecoupled && oppDetail === null}
                    decoupled={isDecoupled}
                  />
                }
                dates={
                  isDecoupled && record && ws.dossier ? (
                    <SectionCard title="Opportunity dossier — who &amp; when" icon="contacts-book-line" collapsible defaultOpen={true}
                      subtitle="Detected from the solicitation ZIP — verify against the source documents. Reference only; it gates nothing.">
                      <OpportunityDossier dossier={ws.dossier} />
                    </SectionCard>
                  ) : (
                    <SectionCard title="Key dates &amp; buyer" icon="calendar-event-line">
                      {ws.source ? (
                        <dl className="row mb-0 small">
                          <dt className="col-5">Buyer</dt><dd className="col-7">{ws.source.publisher.leadBuyer.name}</dd>
                          <dt className="col-5">Deadline</dt><dd className="col-7">{ws.source.deadline.originalText ?? 'unstated'}</dd>
                        </dl>
                      ) : (
                        <div className="small text-secondary">
                          <i className="ri-information-line me-1" aria-hidden="true" />
                          Key dates, the buyer, and the submission deadline appear here once the solicitation ZIP is attested on <strong>Solicitation</strong>. A stated time with no time zone is marked “verify tz”, never assumed local.
                        </div>
                      )}
                    </SectionCard>
                  )
                }
                messages={
                  // Messages & amendments is a PROPOSAL concern (an amendment reopens affected proposal
                  // responses), so keep it OFF the Build step: Build is the software product, kept separate.
                  activeStep === 'build' ? null : (
                  <SectionCard title="Messages &amp; amendments" icon="chat-3-line"
                    subtitle="Record amendments and portal messages with their source. A recorded amendment reopens the responses for the requirements it affects — readiness is never silently kept across a change.">
                    <AmendmentInbox
                      amendments={ws.amendments ?? []}
                      requirementIds={(ws.responseSlots ?? []).map((s) => s.requirementId)}
                      canRecord={!!ws.build?.deliveryProjectId}
                      busy={busy}
                      onRecord={(body) => run(() => recordGovProposalAmendment(canonical, body), 'Inbox entry recorded.')}
                    />
                  </SectionCard>
                  )
                }
                team={{
                  biddingEntity,
                  builders: ws.build?.assignableBuilders ?? [],
                  deliveryProjectId: ws.build?.deliveryProjectId ?? null,
                }}
              />
            </aside>
          </div>{/* end two-column row */}
        </>
      )}
    </div>
  );
}
