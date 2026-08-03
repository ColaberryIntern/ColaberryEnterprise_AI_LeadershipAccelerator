import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SectionCard } from '../../shell';
import { useToast } from '../../../ui/ToastProvider';
import {
  inboxCaseApi,
  CaseDetail,
  InboxCaseItemRecord,
  InboxCaseQuestionRecord,
  InboxCaseActionRecord,
  InboxCaseEventRecord,
  ItemDisposition,
  describeCaseEvent,
  lastRunInfo,
  LastRunInfo,
} from '../../../../services/inboxCaseApi';

interface Props {
  caseId: string;
  onBack: () => void;
}

const DISPOSITION_OPTIONS: ItemDisposition[] = [
  'RESOLVED', 'WAITING', 'DELEGATED', 'NEEDS_ALI', 'SILENT_HOLD', 'NO_ACTION', 'PROTECTED', 'FAILED',
];

// Matches EmailPreviewCard.tsx's established relative-time convention
// for this feature area.
function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function ScorePill({ score }: { score: string | number }) {
  const pct = Math.round(Number(score) * 100);
  const tone = pct >= 85 ? 'success' : pct >= 65 ? 'warning' : 'secondary';
  return <span className={`badge bg-${tone}`}>{pct}%</span>;
}

function RiskBadge({ risk }: { risk: string }) {
  const tone = risk === 'HIGH' ? 'danger' : risk === 'MEDIUM' ? 'warning' : 'secondary';
  return <span className={`badge bg-${tone}`}>{risk}</span>;
}

function ActionStatusBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    PROPOSED: 'secondary', APPROVED: 'info', REJECTED: 'dark', EXECUTING: 'primary',
    SUCCEEDED: 'success', VERIFIED: 'success', FAILED: 'danger', SKIPPED: 'secondary', COMPENSATED: 'warning',
  };
  return <span className={`badge bg-${tone[status] || 'secondary'}`}>{status}</span>;
}

// There is no scheduled job for Assess/Plan/Execute — every step is a manual
// button click (confirmed: no cron references this system anywhere in
// schedulerService.ts) — so this is the ONLY visible record of "when did
// this actually last run," derived from the case's own event history rather
// than a decorative always-on dot.
const LIGHT_COLOR: Record<LastRunInfo['status'], string> = { never: '#adb5bd', success: '#28a745', failed: '#dc3545' };
function LastRunLight({ info, label }: { info: LastRunInfo; label: string }) {
  const text = info.status === 'never' ? 'Never run' : `${info.status === 'failed' ? 'Last attempt failed' : 'Last ran'} ${formatRelativeTime(info.at as string)}`;
  return (
    <span
      className="d-inline-flex align-items-center gap-1 small text-muted"
      title={info.at ? `${label}: ${new Date(info.at).toLocaleString()}` : `${label}: never run`}
    >
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: LIGHT_COLOR[info.status], display: 'inline-block', flexShrink: 0 }} aria-hidden="true" />
      {text}
    </span>
  );
}

export default function CaseWorkspacePanel({ caseId, onBack }: Props) {
  const { showToast } = useToast();
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [closureBlockers, setClosureBlockers] = useState<Array<{ condition: string; detail: string }> | null>(null);
  const [writeInAnswers, setWriteInAnswers] = useState<Record<string, string>>({});
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [events, setEvents] = useState<InboxCaseEventRecord[]>([]);
  const [overrideInstruction, setOverrideInstruction] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Moves keyboard/screen-reader focus to the case title when this panel
  // replaces the case list, so the content swap is announced rather than
  // leaving focus stranded on a "Back" button that no longer has the same
  // context (WCAG 2.4.3 / 4.1.3).
  useEffect(() => {
    if (!loading) headingRef.current?.focus();
  }, [loading, caseId]);

  const load = useCallback(async () => {
    try {
      const [result, auditResult] = await Promise.all([inboxCaseApi.get(caseId), inboxCaseApi.audit(caseId)]);
      setDetail(result);
      setEvents(auditResult.events);
      setClosureBlockers(null);
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to load case', 'error');
    } finally {
      setLoading(false);
    }
  }, [caseId, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  // `any` here: withBusy is generic over every mutation this panel makes
  // (case, item, question, action endpoints), each with a different
  // response shape — callers that need a typed result read it inside
  // their own successMsg function instead.
  const withBusy = async (
    key: string,
    fn: () => Promise<any>,
    successMsg?: string | ((result: any) => { message: string; tone?: 'success' | 'warning' })
  ) => {
    try {
      setBusy(key);
      const result = await fn();
      if (typeof successMsg === 'function') {
        const { message, tone } = successMsg(result);
        showToast(message, tone || 'success');
      } else if (successMsg) {
        showToast(successMsg, 'success');
      }
      await load();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Action failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  if (loading || !detail) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading case…</span>
        </div>
      </div>
    );
  }

  const { case: c, items, questions, actions } = detail;
  const openQuestions = questions.filter((q) => q.status === 'OPEN');
  const visibleItems = items.filter((i) => i.inclusion_status !== 'EXCLUDED');
  const excludedItems = items.filter((i) => i.inclusion_status === 'EXCLUDED');
  // Matches caseClosureService.ts's `undispositioned` filter exactly —
  // this count can never disagree with what actually blocks Close Case.
  const openItems = visibleItems.filter((i) => !i.disposition);
  const closedItemsCount = visibleItems.length - openItems.length;
  const emailsLeavingInbox = items.filter(
    (i) => (i.source_type === 'email') && actions.some((a) => a.item_id === i.id && ['EMAIL_ARCHIVE', 'EMAIL_LABEL'].includes(a.action_type))
  ).length;

  const assessmentLastRun = lastRunInfo(events, ['assessment_completed'], ['assessment_failed']);
  const planLastRun = lastRunInfo(events, ['plan_generated']);
  const executionLastRun = lastRunInfo(
    events,
    ['action_execution_succeeded', 'action_execution_reconciled_as_succeeded'],
    ['action_execution_failed', 'case_execution_failed']
  );

  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-3">
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onBack} aria-label="Back to case list">
          <i className="ri-arrow-left-line" aria-hidden="true" /> Back
        </button>
        <h2 className="mb-0 fs-5" ref={headingRef} tabIndex={-1}>{c.title}</h2>
        <span className="badge bg-primary">{c.state.replace(/_/g, ' ')}</span>
        {c.reopen_count > 0 && <span className="badge bg-warning text-dark">Reopened ×{c.reopen_count}</span>}
        {detail.ticket_id && (
          <a href={`/admin/tickets?open=${detail.ticket_id}`} className="btn btn-sm btn-outline-secondary ms-auto" target="_blank" rel="noreferrer">
            <i className="ri-ticket-2-line" aria-hidden="true" /> View Ticket
          </a>
        )}
      </div>

      <div className="row g-3">
        {/* Left: evidence / items */}
        <div className="col-lg-4">
          <SectionCard
            title="Evidence"
            subtitle={`${closedItemsCount} of ${visibleItems.length} closed · ${excludedItems.length} excluded`}
            icon="file-list-3-line"
          >
            <p className="small text-muted mb-2">
              Included items are already part of this case — nothing to do there. Candidates are the AI's best
              guesses and need your Include or Exclude call below.
            </p>
            <div className="d-flex flex-column gap-2" style={{ maxHeight: 520, overflowY: 'auto' }}>
              {items.map((item) => (
                <div key={item.id} className="border rounded p-2">
                  <div className="d-flex justify-content-between align-items-start gap-2">
                    <div className="small fw-semibold text-truncate" style={{ maxWidth: 180 }}>{item.title}</div>
                    <ScorePill score={item.match_score} />
                  </div>
                  <div className="small text-muted">{item.source_type} · {item.provider} · {formatRelativeTime(item.occurred_at)}</div>
                  {item.match_reasons?.length > 0 && (
                    <div className="small text-muted mt-1">
                      {item.match_reasons.map((r) => r.kind).join(', ')}
                    </div>
                  )}
                  {item.inclusion_status === 'CANDIDATE' && item.ai_recommendation && (
                    <div className="small mt-1">
                      <span className={`fw-semibold ${item.ai_recommendation === 'INCLUDE' ? 'text-success' : 'text-danger'}`}>
                        AI recommends: {item.ai_recommendation === 'INCLUDE' ? 'Include' : 'Exclude'}
                      </span>
                      {item.ai_recommendation_reason && <span className="text-muted"> — {item.ai_recommendation_reason}</span>}
                    </div>
                  )}
                  <div className="d-flex flex-wrap gap-1 mt-2 align-items-center">
                    <span className={`badge bg-${item.inclusion_status === 'INCLUDED' ? 'success' : item.inclusion_status === 'CANDIDATE' ? 'warning' : 'secondary'}`}>
                      {item.inclusion_status}
                    </span>
                    {item.disposition && <span className="badge bg-info text-dark">{item.disposition}</span>}
                    {item.source_url && (
                      <a
                        href={item.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="small d-inline-flex align-items-center gap-1"
                        aria-label={`Open source for ${item.title}`}
                      >
                        <i className="ri-external-link-line" aria-hidden="true" /> Open
                      </a>
                    )}
                  </div>
                  <div className="d-flex flex-wrap gap-1 mt-2">
                    {item.inclusion_status !== 'INCLUDED' && (
                      <button
                        type="button"
                        className="btn btn-outline-success btn-sm"
                        disabled={busy === `item-${item.id}`}
                        onClick={() => withBusy(`item-${item.id}`, () => inboxCaseApi.updateItem(c.id, item.id, { inclusion_status: 'INCLUDED' }))}
                      >
                        Include
                      </button>
                    )}
                    {item.inclusion_status !== 'EXCLUDED' && (
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        disabled={busy === `item-${item.id}`}
                        onClick={() => withBusy(`item-${item.id}`, () => inboxCaseApi.updateItem(c.id, item.id, { inclusion_status: 'EXCLUDED' }))}
                      >
                        Exclude
                      </button>
                    )}
                    <select
                      className="form-select form-select-sm"
                      style={{ width: 'auto' }}
                      aria-label={`Set disposition for ${item.title}`}
                      value={item.disposition || ''}
                      onChange={(e) =>
                        withBusy(`item-${item.id}`, () =>
                          inboxCaseApi.updateItem(c.id, item.id, {
                            disposition: (e.target.value || undefined) as ItemDisposition | undefined,
                            disposition_reason: item.disposition_reason || undefined,
                          })
                        )
                      }
                    >
                      <option value="">Set disposition…</option>
                      {DISPOSITION_OPTIONS.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  {item.inclusion_status !== 'EXCLUDED' && (
                    <div className="d-flex flex-wrap gap-1 mt-2">
                      <button
                        type="button"
                        className="btn btn-outline-primary btn-sm"
                        disabled={busy === `quick-resolve-${item.id}`}
                        onClick={() =>
                          withBusy(`quick-resolve-${item.id}`, () => inboxCaseApi.quickResolve(c.id, item.id, 'HANDLED'), (result) => ({
                            message: result.actionProposed
                              ? `Marked Handled — a ${result.actionProposed} is now proposed for your approval`
                              : 'Marked Handled — no external action needed for this item',
                          }))
                        }
                      >
                        Handled
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        disabled={busy === `quick-resolve-${item.id}`}
                        onClick={() =>
                          withBusy(`quick-resolve-${item.id}`, () => inboxCaseApi.quickResolve(c.id, item.id, 'IGNORE'), (result) => ({
                            message: result.actionProposed
                              ? `Marked Ignore — a ${result.actionProposed} is now proposed for your approval`
                              : 'Marked Ignore — no external action needed for this item',
                          }))
                        }
                      >
                        Ignore
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        {/* Center: summary + teach me */}
        <div className="col-lg-4">
          {c.summary && (
            <SectionCard title="Executive Summary" icon="file-text-line" className="mb-3">
              <p className="small mb-2">{c.summary}</p>
              {c.confidence !== null && <div className="small text-muted">Confidence: {c.confidence}%</div>}
            </SectionCard>
          )}

          {c.teaching_brief && (
            <SectionCard title="Teach Me" icon="lightbulb-line" className="mb-3">
              <dl className="small mb-0">
                <dt>🧭 What's happening</dt>
                <dd>{c.teaching_brief.what_is_happening}</dd>
                <dt>⚠️ Why it matters</dt>
                <dd>{c.teaching_brief.why_it_matters}</dd>
                <dt>🤔 What you're deciding</dt>
                <dd>{c.teaching_brief.what_ali_is_deciding}</dd>
                <dt>🔎 Confirmed vs. inferred</dt>
                <dd>{c.teaching_brief.confirmed_vs_inferred}</dd>
                <dt>⚖️ Risk of acting / delaying</dt>
                <dd>{c.teaching_brief.risk_of_acting} — {c.teaching_brief.risk_of_delaying}</dd>
                <dt>✅ Recommended decision</dt>
                <dd className="fw-semibold">{c.teaching_brief.recommended_decision}</dd>
                <dd className="text-muted">{c.teaching_brief.rationale}</dd>
              </dl>
            </SectionCard>
          )}

          {!c.assessment && c.state === 'ASSESSING' && (
            <SectionCard title="Assessment" icon="brain-line">
              <p className="small text-muted">No assessment yet.</p>
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={busy === 'assess'}
                  onClick={() => withBusy('assess', () => inboxCaseApi.assess(c.id), 'Assessment generated')}
                >
                  {busy === 'assess' ? 'Assessing…' : 'Run Assessment'}
                </button>
                <LastRunLight info={assessmentLastRun} label="Assessment" />
              </div>
            </SectionCard>
          )}

          {c.assessment && (
            <SectionCard
              title="Facts, Assumptions & Contradictions"
              icon="scales-3-line"
              actions={<LastRunLight info={assessmentLastRun} label="Assessment" />}
            >
              <div className="small mb-2">
                <strong>Confirmed facts</strong>
                <ul className="mb-2">{c.assessment.confirmed_facts.map((f, i) => <li key={i}>{f.statement}</li>)}</ul>
                <strong>Assumptions</strong>
                <ul className="mb-2">{c.assessment.assumptions.map((a, i) => <li key={i}>{a.statement} <span className="text-muted">({a.confidence}% confidence)</span></li>)}</ul>
                {c.assessment.contradictions.length > 0 && (
                  <>
                    <strong className="text-danger">Contradictions</strong>
                    <ul className="mb-0">{c.assessment.contradictions.map((x, i) => <li key={i}>{x.statement}</li>)}</ul>
                  </>
                )}
              </div>
            </SectionCard>
          )}
        </div>

        {/* Right: questions, actions, closure */}
        <div className="col-lg-4">
          {openQuestions.length > 0 && (
            <SectionCard title="Questions" subtitle={`${openQuestions.length} blocking`} icon="question-line" className="mb-3">
              <div className="d-flex flex-column gap-3">
                {openQuestions.map((q) => (
                  <QuestionCard
                    key={q.id}
                    question={q}
                    writeIn={writeInAnswers[q.id] || ''}
                    onWriteInChange={(v) => setWriteInAnswers((prev) => ({ ...prev, [q.id]: v }))}
                    busy={busy === `question-${q.id}`}
                    onAnswer={(body) => withBusy(`question-${q.id}`, () => inboxCaseApi.answerQuestion(c.id, q.id, body), 'Answer recorded')}
                  />
                ))}
              </div>
            </SectionCard>
          )}

          {c.state === 'READY_TO_PLAN' && (
            <SectionCard title="Plan" icon="road-map-line" className="mb-3">
              <p className="small text-muted">No actions proposed yet.</p>
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={busy === 'plan'}
                  onClick={() => withBusy('plan', () => inboxCaseApi.generatePlan(c.id), 'Action plan generated')}
                >
                  {busy === 'plan' ? 'Planning…' : 'Generate Action Plan'}
                </button>
                <LastRunLight info={planLastRun} label="Plan" />
              </div>
            </SectionCard>
          )}

          {actions.length > 0 && (
            <SectionCard
              title="Proposed Actions"
              subtitle={`${emailsLeavingInbox} email(s) will leave the inbox`}
              icon="flashlight-line"
              className="mb-3"
              actions={<LastRunLight info={planLastRun} label="Plan" />}
            >
              <p className="small text-muted mb-2">
                Actions marked "Needs your approval" must be approved one at a time for safety. Everything else can
                be approved together with "Approve all low-risk" below.
              </p>
              <div className="d-flex flex-column gap-2 mb-2" style={{ maxHeight: 320, overflowY: 'auto' }}>
                {actions
                  // A BASECAMP_COMPLETE_TODO that depends on a BASECAMP_COMMENT
                  // in this same list is rendered as that comment's "also
                  // close this" checkbox instead of a second full card.
                  .filter(
                    (a) =>
                      !(
                        a.action_type === 'BASECAMP_COMPLETE_TODO' &&
                        actions.some((other) => other.action_type === 'BASECAMP_COMMENT' && a.depends_on_action_ids.includes(other.id))
                      )
                  )
                  .map((a) => {
                    const linkedClose =
                      a.action_type === 'BASECAMP_COMMENT'
                        ? actions.find((other) => other.action_type === 'BASECAMP_COMPLETE_TODO' && other.depends_on_action_ids.includes(a.id)) || null
                        : null;
                    return (
                      <ActionCard
                        key={a.id}
                        action={a}
                        busy={busy === `action-${a.id}`}
                        reason={rejectReasons[a.id] || ''}
                        onReasonChange={(v) => setRejectReasons((prev) => ({ ...prev, [a.id]: v }))}
                        onApprove={() => withBusy(`action-${a.id}`, () => inboxCaseApi.approveAction(c.id, a.id), 'Approved')}
                        onReject={() => withBusy(`action-${a.id}`, () => inboxCaseApi.rejectAction(c.id, a.id, rejectReasons[a.id] || 'Not needed'), 'Rejected')}
                        linkedClose={linkedClose}
                        linkedCloseBusy={linkedClose ? busy === `action-${linkedClose.id}` : false}
                        onApproveLinkedClose={linkedClose ? () => withBusy(`action-${linkedClose.id}`, () => inboxCaseApi.approveAction(c.id, linkedClose.id), 'Close approved') : undefined}
                        onRejectLinkedClose={
                          linkedClose
                            ? () => withBusy(`action-${linkedClose.id}`, () => inboxCaseApi.rejectAction(c.id, linkedClose.id, 'Unchecked — comment only'), 'Will not close the item')
                            : undefined
                        }
                      />
                    );
                  })}
              </div>
              <div className="d-flex flex-wrap gap-2">
                {actions.some((a) => a.status === 'PROPOSED' && !a.requires_individual_approval && a.risk_level === 'LOW') && (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    disabled={busy === 'approve-low-risk'}
                    onClick={() => withBusy('approve-low-risk', () => inboxCaseApi.approveLowRisk(c.id), 'Low-risk actions approved')}
                  >
                    Approve all low-risk
                  </button>
                )}
                {actions.some((a) => a.status === 'APPROVED') && (
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={busy === 'execute'}
                    onClick={() =>
                      withBusy('execute', () => inboxCaseApi.execute(c.id), (result) =>
                        result.failed > 0
                          ? { message: `${result.succeeded} succeeded, ${result.failed} failed — see the error below`, tone: 'warning' }
                          : { message: 'Execution run complete' }
                      )
                    }
                  >
                    {busy === 'execute' ? 'Executing…' : 'Execute Approved Actions'}
                  </button>
                )}
                {actions.some((a) => a.status === 'SUCCEEDED') && (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    disabled={busy === 'verify'}
                    onClick={() =>
                      withBusy('verify', () => inboxCaseApi.verify(c.id), (result) =>
                        result.verificationFailed > 0
                          ? { message: `${result.verified} confirmed, ${result.verificationFailed} failed verification`, tone: 'warning' }
                          : { message: 'Verification complete' }
                      )
                    }
                  >
                    {busy === 'verify' ? 'Verifying…' : 'Verify'}
                  </button>
                )}
                {actions.some((a) => a.status === 'FAILED') && (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-warning"
                    disabled={busy === 'execute'}
                    onClick={() =>
                      withBusy('execute', () => inboxCaseApi.execute(c.id), (result) =>
                        result.failed > 0
                          ? {
                              message:
                                result.succeeded > 0
                                  ? `${result.succeeded} succeeded, still failing — see the error below`
                                  : 'Still failing — see the error below',
                              tone: 'warning',
                            }
                          : { message: `Retry succeeded — ${result.succeeded} action(s) completed` }
                      )
                    }
                  >
                    Retry Failed
                  </button>
                )}
              </div>
              {executionLastRun.status !== 'never' && (
                <div className="mt-2">
                  <LastRunLight info={executionLastRun} label="Execution" />
                </div>
              )}
              {actions.some((a) => a.status === 'PROPOSED') && (
                <div className="mt-3 pt-3 border-top">
                  <label htmlFor="override-instruction" className="form-label small fw-semibold mb-1">
                    Not quite right? Tell it what to do instead
                  </label>
                  <p className="small text-muted mb-2">
                    Your instruction replaces the proposed actions above — you can use this or the buttons above,
                    not both. Whatever it proposes still needs your individual approval.
                  </p>
                  <textarea
                    id="override-instruction"
                    className="form-control form-control-sm mb-2"
                    rows={2}
                    placeholder={'e.g. "Just update the bc ticket, don\'t send an email reply"'}
                    value={overrideInstruction}
                    onChange={(e) => setOverrideInstruction(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    disabled={busy === 'override' || !overrideInstruction.trim()}
                    onClick={() =>
                      withBusy(
                        'override',
                        () => inboxCaseApi.overrideActions(c.id, overrideInstruction.trim()),
                        (result) => {
                          // A schema/AI-call failure is NOT the same thing as "the AI
                          // correctly found nothing to change" — check this FIRST, or a
                          // real failure (confirmed live in production) silently reads as
                          // a false "no new action was needed" success.
                          if (result.failed) {
                            return { message: `Instruction could not be applied — ${result.failureReason || 'the AI response was invalid'}. Nothing changed; try rephrasing.`, tone: 'warning' };
                          }
                          setOverrideInstruction('');
                          const parts = [
                            result.rejected.length > 0 ? `${result.rejected.length} action(s) replaced` : null,
                            result.proposed ? 'a new action is now proposed for your approval' : 'no new action was needed',
                          ].filter(Boolean);
                          return { message: parts.join(', ') || 'Instruction applied' };
                        }
                      )
                    }
                  >
                    {busy === 'override' ? 'Applying…' : 'Apply Instruction'}
                  </button>
                </div>
              )}
            </SectionCard>
          )}

          <SectionCard title="Closure" icon="checkbox-circle-line">
            {!c.closed_at && (
              <p className="small text-muted mb-2">
                {openItems.length === 0
                  ? `All ${visibleItems.length} evidence item(s) have a disposition — nothing is blocking closure on that front.`
                  : `${openItems.length} of ${visibleItems.length} evidence item(s) still need a disposition before this case can close.`}
              </p>
            )}
            {c.closed_at ? (
              <div className="text-success small"><i className="ri-check-line" aria-hidden="true" /> Closed {new Date(c.closed_at).toLocaleString()}</div>
            ) : (
              <>
                <button
                  type="button"
                  data-testid="close-case-button"
                  className="btn btn-sm btn-success"
                  disabled={busy === 'close'}
                  onClick={async () => {
                    setBusy('close');
                    try {
                      await inboxCaseApi.close(c.id);
                      showToast('Case closed', 'success');
                      setClosureBlockers(null);
                      await load();
                    } catch (err: any) {
                      const blockers = err.response?.data?.blockers;
                      if (blockers) setClosureBlockers(blockers);
                      showToast(err.response?.data?.error === 'ClosureBlockedError' ? 'Case cannot close yet — see checklist below' : 'Close failed', 'error');
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {busy === 'close' ? 'Checking…' : 'Close Case'}
                </button>
                {closureBlockers && closureBlockers.length > 0 && (
                  <ul className="small text-danger mt-2 mb-0" data-testid="closure-blockers">
                    {closureBlockers.map((b, i) => <li key={i}>{b.detail}</li>)}
                  </ul>
                )}
              </>
            )}
            {['RESOLVED', 'WAITING', 'DELEGATED'].includes(c.state) && (
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary mt-2"
                disabled={busy === 'reopen'}
                onClick={() => {
                  const reason = window.prompt('Why are you reopening this case?');
                  if (reason) withBusy('reopen', () => inboxCaseApi.reopen(c.id, reason), 'Case reopened');
                }}
              >
                Reopen
              </button>
            )}
          </SectionCard>
        </div>
      </div>

      <div className="row g-3 mt-1">
        <div className="col-12">
          <SectionCard title="Activity" subtitle={`${events.length} event(s)`} icon="history-line">
            {events.length === 0 ? (
              <p className="small text-muted mb-0">No activity recorded yet.</p>
            ) : (
              <ul className="list-unstyled small mb-0" style={{ maxHeight: 240, overflowY: 'auto' }}>
                {[...events].reverse().map((e) => (
                  <li key={e.id} className="d-flex justify-content-between gap-2 border-bottom py-1">
                    <span>{describeCaseEvent(e, items, actions)}</span>
                    <span className="text-muted text-nowrap">{formatRelativeTime(e.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function QuestionCard({
  question, writeIn, onWriteInChange, busy, onAnswer,
}: {
  question: InboxCaseQuestionRecord;
  writeIn: string;
  onWriteInChange: (v: string) => void;
  busy: boolean;
  onAnswer: (body: { answer?: string; accept_recommended?: boolean }) => void;
}) {
  return (
    <div className="border rounded p-2">
      <div className="small fw-semibold">{question.question}</div>
      <div className="small text-muted mb-2">{question.why_required}</div>
      <div className="d-flex flex-wrap gap-1 mb-2">
        {question.choices.map((choice) => (
          <button
            key={choice.label}
            type="button"
            className="btn btn-outline-primary btn-sm"
            disabled={busy}
            title={choice.consequence}
            onClick={() => onAnswer({ answer: choice.label })}
          >
            {choice.label}
          </button>
        ))}
        {question.recommended_answer && (
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => onAnswer({ accept_recommended: true })}>
            Use recommended: {question.recommended_answer}
          </button>
        )}
      </div>
      <div className="input-group input-group-sm">
        <label className="visually-hidden" htmlFor={`writein-${question.id}`}>Write-in answer</label>
        <input
          id={`writein-${question.id}`}
          type="text"
          className="form-control"
          placeholder="Or write your own answer…"
          value={writeIn}
          onChange={(e) => onWriteInChange(e.target.value)}
        />
        <button type="button" className="btn btn-outline-secondary" disabled={busy || !writeIn.trim()} onClick={() => onAnswer({ answer: writeIn.trim() })}>
          Submit
        </button>
      </div>
    </div>
  );
}

function ActionCard({
  action, busy, reason, onReasonChange, onApprove, onReject,
  linkedClose, linkedCloseBusy, onApproveLinkedClose, onRejectLinkedClose,
}: {
  action: InboxCaseActionRecord;
  busy: boolean;
  reason: string;
  onReasonChange: (v: string) => void;
  onApprove: () => void;
  onReject: () => void;
  // A linked BASECAMP_COMPLETE_TODO this comment action carries, per the
  // AI's "close this after the update" recommendation — rendered as a
  // checkbox on this card instead of a second full ActionCard.
  linkedClose?: InboxCaseActionRecord | null;
  linkedCloseBusy?: boolean;
  onApproveLinkedClose?: () => void;
  onRejectLinkedClose?: () => void;
}) {
  return (
    <div className="border rounded p-2">
      <div className="d-flex justify-content-between align-items-start gap-2">
        <span className="badge bg-light text-dark border">{action.action_type}</span>
        <div className="d-flex gap-1">
          <RiskBadge risk={action.risk_level} />
          <ActionStatusBadge status={action.status} />
        </div>
      </div>
      <div className="small mt-1">{action.preview}</div>
      {action.error_message && <div className="small text-danger mt-1">{action.error_class}: {action.error_message}</div>}
      {action.status === 'PROPOSED' && (
        <div className="d-flex flex-wrap gap-1 mt-2 align-items-center">
          {/* Mirrors caseApprovalService.ts's approveLowRisk bulk-eligibility
              check exactly (risk_level !== 'LOW' || requires_individual_approval)
              so this label can never disagree with what that button actually does. */}
          {action.risk_level !== 'LOW' || action.requires_individual_approval ? (
            <span className="badge bg-warning text-dark">Needs your approval</span>
          ) : (
            <span className="badge bg-secondary">Can be bundled</span>
          )}
          <button type="button" className="btn btn-success btn-sm" disabled={busy} onClick={onApprove}>Approve</button>
          <input
            type="text"
            className="form-control form-control-sm"
            style={{ maxWidth: 160 }}
            placeholder="Reject reason"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            aria-label="Reason for rejecting this action"
          />
          <button type="button" className="btn btn-outline-danger btn-sm" disabled={busy} onClick={onReject}>Reject</button>
        </div>
      )}
      {linkedClose && (
        <div className="d-flex flex-wrap align-items-center gap-2 mt-2 pt-2 border-top">
          <div className="form-check mb-0">
            <input
              type="checkbox"
              className="form-check-input"
              id={`linked-close-${linkedClose.id}`}
              checked={linkedClose.status !== 'REJECTED'}
              disabled={linkedCloseBusy || linkedClose.status !== 'PROPOSED'}
              onChange={(e) => {
                if (!e.target.checked) onRejectLinkedClose?.();
              }}
            />
            <label className="form-check-label small" htmlFor={`linked-close-${linkedClose.id}`}>
              Also close this Basecamp item
            </label>
          </div>
          {linkedClose.status === 'PROPOSED' && (
            <button type="button" className="btn btn-outline-success btn-sm" disabled={linkedCloseBusy} onClick={onApproveLinkedClose}>
              Approve close
            </button>
          )}
          {linkedClose.status !== 'PROPOSED' && <ActionStatusBadge status={linkedClose.status} />}
        </div>
      )}
    </div>
  );
}
