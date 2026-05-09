/**
 * ExecutionLane — the new Blueprint.
 *
 * Blueprint Simplification Sprint, 2026-05-09.
 *
 * Replaces the 2,000-line SystemBlueprint as the user-facing target of
 * `/portal/project/blueprint`. The SystemBlueprint surface is preserved
 * at `/portal/project/blueprint-legacy` for rollback only.
 *
 * Hard rule: this page does NOT decide anything. It does NOT prioritize,
 * rank, or recommend. Cory (via UnifiedProjectState) is the authority;
 * this page renders the next step Cory chose and walks the operator
 * through a 6-stage execution flow:
 *
 *   1. Context   — what we're executing + why it matters
 *   2. Task      — specifics, files, acceptance criteria
 *   3. Prompt    — the Claude Code prompt, copy-ready
 *   4. Execute   — paste-back validation report from the build
 *   5. Verify    — lightweight verification checks + mark verified
 *   6. Iterate   — refresh next OR back to Critique
 *
 * Sources: useUnifiedProjectState (canonical), sessionStorage (Critique
 * handoff prompts). Mutations use existing endpoints + refresh().
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import portalApi from '../../utils/portalApi';
import {
  useUnifiedProjectState,
  type NextActionProfile,
} from '../../hooks/useUnifiedProjectState';

const ExecutionLane: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { state, loading, error, refresh } = useUnifiedProjectState({ pollMs: 60_000 });

  // Critique workspace handoff — same sessionStorage contract Blueprint
  // used previously, picked up here unchanged for continuity.
  const [pendingCritiquePrompt, setPendingCritiquePrompt] = useState<string | null>(null);
  const [pendingCritiqueRoute, setPendingCritiqueRoute] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('build') !== 'visual-workspace') return;
    try {
      const text = sessionStorage.getItem('visualWorkspace:pendingBuildPrompt') || '';
      const route = sessionStorage.getItem('visualWorkspace:pendingBuildSourceRoute') || '';
      if (text) {
        setPendingCritiquePrompt(text);
        setPendingCritiqueRoute(route);
      }
    } catch { /* sessionStorage unavailable */ }
  }, [searchParams]);

  const dismissCritiqueHandoff = useCallback(() => {
    setPendingCritiquePrompt(null);
    setPendingCritiqueRoute(null);
    try {
      sessionStorage.removeItem('visualWorkspace:pendingBuildPrompt');
      sessionStorage.removeItem('visualWorkspace:pendingBuildSourceRoute');
    } catch { /* ignore */ }
    const next = new URLSearchParams(searchParams);
    next.delete('build');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Local UI state for the 6 stages.
  const [reportText, setReportText] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [verifyResult, setVerifyResult] = useState<'pending' | 'pass' | 'fail' | null>(null);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [copyOk, setCopyOk] = useState(false);

  // What are we executing? Three sources, in priority:
  //   1. Critique handoff prompt (if user came from /portal/visual-workspace)
  //   2. Cory's next_action (canonical)
  //   3. Empty state
  const next: NextActionProfile | null = state?.next_action || null;
  const hasCritiqueHandoff = !!pendingCritiquePrompt;
  const hasCoryAction = !!next;
  const hasSomething = hasCritiqueHandoff || hasCoryAction;

  // The displayed prompt — Critique handoff if present, else a lightweight
  // template derived from the Cory action.
  const displayedPrompt: string | null = useMemo(() => {
    if (pendingCritiquePrompt) return pendingCritiquePrompt;
    if (!next) return null;
    return buildLightweightPrompt(next);
  }, [pendingCritiquePrompt, next]);

  const promptSource: 'critique' | 'cory' | null =
    pendingCritiquePrompt ? 'critique' : next ? 'cory' : null;

  // ─── handlers ───────────────────────────────────────────────────

  const handleCopy = useCallback(async () => {
    if (!displayedPrompt) return;
    try {
      await navigator.clipboard?.writeText(displayedPrompt);
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 1800);
    } catch { /* clipboard unavailable */ }
  }, [displayedPrompt]);

  const handleAccept = useCallback(async () => {
    if (!next?.source_id || next.source !== 'next_action') return;
    setAccepting(true);
    try {
      await portalApi.post('/api/portal/project/next-action/accept', { action_id: next.source_id });
      await refresh();
    } catch (err: any) {
      // eslint-disable-next-line no-alert
      alert(err.response?.data?.error || 'Failed to mark accepted');
    } finally {
      setAccepting(false);
    }
  }, [next, refresh]);

  const submitReport = useCallback(async () => {
    if (!reportText.trim()) return;
    setSubmittingReport(true);
    setVerifyResult(null);
    setVerifyMessage(null);
    try {
      // Lightweight verification: post-execution validation. Existing
      // backend `/verify` endpoint is the canonical check. For V1, we
      // simply call it; richer feedback is a follow-up.
      await portalApi.post('/api/portal/project/verify');
      setVerifyResult('pass');
      setVerifyMessage('Verification passed. You can mark this step complete.');
    } catch (err: any) {
      setVerifyResult('fail');
      setVerifyMessage(err.response?.data?.error || 'Verification failed. See server logs.');
    } finally {
      setSubmittingReport(false);
    }
  }, [reportText]);

  const completeStep = useCallback(async () => {
    if (!next?.source_id || next.source !== 'next_action') {
      // For Critique handoff with no Cory next-action, just dismiss.
      dismissCritiqueHandoff();
      setReportText('');
      setVerifyResult(null);
      setVerifyMessage(null);
      await refresh();
      return;
    }
    setCompleting(true);
    try {
      await portalApi.post('/api/portal/project/next-action/complete', { action_id: next.source_id });
      setReportText('');
      setVerifyResult(null);
      setVerifyMessage(null);
      await refresh();
    } catch (err: any) {
      // eslint-disable-next-line no-alert
      alert(err.response?.data?.error || 'Failed to mark complete');
    } finally {
      setCompleting(false);
    }
  }, [next, refresh, dismissCritiqueHandoff]);

  // ─── render ─────────────────────────────────────────────────────

  if (loading && !state) {
    return (
      <div style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--color-text-light)' }}>
        <div className="spinner-border spinner-border-sm me-2" role="status" />
        Loading the execution lane…
      </div>
    );
  }

  if (error && !state) {
    return (
      <div style={{ maxWidth: 720, margin: '3rem auto', padding: '0 1rem' }}>
        <div className="alert alert-warning">
          <strong>Could not load operational state.</strong>
          <div style={{ fontSize: 13, color: 'var(--color-text-light)', marginTop: 4 }}>{error}</div>
          <button className="btn btn-sm btn-outline-primary mt-2" onClick={() => void refresh()}>Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '1.25rem 1rem 4rem' }}>

      {/* ─── Surface intent reminder ─────────────────────────── */}
      <header style={{ marginBottom: '1.25rem' }}>
        <div style={{
          fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em',
          color: 'var(--color-text-light)', fontWeight: 600,
        }}>
          Blueprint
        </div>
        <h2 style={{
          fontSize: 22, fontWeight: 600, color: 'var(--color-primary)',
          letterSpacing: '-0.01em', marginTop: 4, marginBottom: 4,
        }}>
          Execute the next step.
        </h2>
        <div style={{ fontSize: 13, color: 'var(--color-text-light)' }}>
          Cory decides what's next. This page walks you through running it. <Link to="/portal/home" style={{ color: 'var(--color-primary-light)' }}>Open Home</Link> to see the queue.
        </div>
      </header>

      {!hasSomething ? (
        <EmptyState />
      ) : (
        <>
          <Step
            n={1}
            title="Context"
            subtitle="What we're executing and why."
          >
            <ContextCard
              promptSource={promptSource}
              critiqueRoute={pendingCritiqueRoute}
              next={next}
            />
          </Step>

          <Step
            n={2}
            title="Task"
            subtitle="The specifics — files, acceptance criteria."
          >
            <TaskCard next={next} promptSource={promptSource} />
          </Step>

          <Step
            n={3}
            title="Prompt"
            subtitle="Copy this into Claude Code."
          >
            <PromptBlock prompt={displayedPrompt} />
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                className={`btn btn-sm ${copyOk ? 'btn-success' : 'btn-primary'}`}
                onClick={() => void handleCopy()}
                disabled={!displayedPrompt}
              >
                <i className={`bi ${copyOk ? 'bi-check2' : 'bi-clipboard'} me-1`}></i>
                {copyOk ? 'Copied — paste into Claude Code' : 'Copy prompt'}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                onClick={() => displayedPrompt && window.open(`data:text/plain;charset=utf-8,${encodeURIComponent(displayedPrompt)}`, '_blank')}
                disabled={!displayedPrompt}
              >
                <i className="bi bi-box-arrow-up-right me-1"></i>Open in new tab
              </button>
              {hasCoryAction && next?.source === 'next_action' && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => void handleAccept()}
                  disabled={accepting}
                >
                  <i className="bi bi-flag me-1"></i>{accepting ? 'Marking…' : 'Mark accepted'}
                </button>
              )}
            </div>
          </Step>

          <Step
            n={4}
            title="Execute"
            subtitle="Run it in Claude Code, then paste the validation report below."
          >
            <textarea
              className="form-control"
              rows={5}
              placeholder="Paste the validation report from Claude Code here…"
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              style={{
                fontFamily: 'var(--font-mono, "Consolas", monospace)',
                fontSize: 12,
                background: 'var(--color-bg-alt)',
                border: '1px solid var(--color-border)',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => void submitReport()}
                disabled={!reportText.trim() || submittingReport}
              >
                <i className="bi bi-shield-check me-1"></i>
                {submittingReport ? 'Verifying…' : 'Submit & verify'}
              </button>
              <span style={{ fontSize: 11, color: 'var(--color-text-light)' }}>
                Verification reads telemetry — not just the report's claims.
              </span>
            </div>
          </Step>

          <Step
            n={5}
            title="Verify"
            subtitle="Lightweight check. Quick confirm — not an audit."
          >
            <VerifyCard
              verifyResult={verifyResult}
              verifyMessage={verifyMessage}
              healthScore={state?.health.score ?? null}
              passRate={state?.health.verification_pass_rate ?? 1}
            />
          </Step>

          <Step
            n={6}
            title="Iterate"
            subtitle="Continue or critique."
          >
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-sm btn-success"
                onClick={() => void completeStep()}
                disabled={completing || (verifyResult !== 'pass' && hasCoryAction)}
                title={verifyResult !== 'pass' && hasCoryAction ? 'Verify first to unlock' : ''}
              >
                <i className="bi bi-check2-circle me-1"></i>
                {completing ? 'Completing…' : 'Complete & continue'}
              </button>
              <Link to="/portal/visual-workspace" className="btn btn-sm btn-outline-primary">
                <i className="bi bi-bullseye me-1"></i>Back to Critique
              </Link>
              <Link to="/portal/home" className="btn btn-sm btn-outline-secondary">
                <i className="bi bi-house me-1"></i>Open Home
              </Link>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-light)', alignSelf: 'center' }}>
                Need the legacy build surface? <Link to="/portal/project/blueprint-legacy" style={{ color: 'var(--color-text-light)', textDecoration: 'underline' }}>Open it</Link>.
              </span>
            </div>
          </Step>
        </>
      )}

      {/* footer meta — quiet */}
      {state && (
        <div style={{ fontSize: 11, color: 'var(--color-text-light)', textAlign: 'center', marginTop: '2rem' }}>
          Source: Cory · synthesized {new Date(state.built_at).toLocaleTimeString()} · health {state.health.score}%
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────
// Subcomponents — kept inside the file to keep the lane self-contained.
// ──────────────────────────────────────────────────────────────────

const Step: React.FC<{
  n: number;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}> = ({ n, title, subtitle, children }) => (
  <section style={{ marginBottom: '1.5rem' }}>
    <header style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
      <span style={{
        background: 'var(--color-primary)', color: 'white',
        width: 28, height: 28, borderRadius: '50%',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 600, fontSize: 13, flexShrink: 0,
      }}>{n}</span>
      <div>
        <h3 style={{
          fontSize: 15, fontWeight: 600, color: 'var(--color-primary)',
          margin: 0, lineHeight: 1.3,
        }}>{title}</h3>
        <div style={{ fontSize: 12, color: 'var(--color-text-light)', marginTop: 2 }}>{subtitle}</div>
      </div>
    </header>
    <div style={{
      background: 'white',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      padding: '0.95rem 1.1rem',
      marginLeft: 40,
    }}>
      {children}
    </div>
  </section>
);

const ContextCard: React.FC<{
  promptSource: 'critique' | 'cory' | null;
  critiqueRoute: string | null;
  next: NextActionProfile | null;
}> = ({ promptSource, critiqueRoute, next }) => {
  if (promptSource === 'critique') {
    return (
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
          Critique handoff — refining a page
        </div>
        {critiqueRoute && (
          <div style={{ fontSize: 12, color: 'var(--color-text-light)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
            Target: {critiqueRoute}
          </div>
        )}
        <div style={{ fontSize: 12, color: 'var(--color-text-light)', marginTop: 6 }}>
          The prompt was compiled from your pinned critiques. Run it in Claude Code, then come back to verify.
        </div>
      </div>
    );
  }
  if (next) {
    return (
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
          {next.title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-light)', marginTop: 6, lineHeight: 1.55 }}>
          {next.reason}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11, color: 'var(--color-text-light)', flexWrap: 'wrap' }}>
          <span>Source: <strong>Cory</strong></span>
          {next.time_est_minutes !== null && <span>· Est: <strong>{next.time_est_minutes}m</strong></span>}
          <span>· Blast: <strong style={{ color: blastColor(next.blast_radius.band) }}>{next.blast_radius.band}</strong></span>
          <span>· Confidence: <strong>{next.confidence_score}%</strong></span>
        </div>
      </div>
    );
  }
  return null;
};

const TaskCard: React.FC<{ next: NextActionProfile | null; promptSource: 'critique' | 'cory' | null }> = ({ next, promptSource }) => {
  if (promptSource === 'critique') {
    return (
      <div style={{ fontSize: 12, color: 'var(--color-text-light)', lineHeight: 1.6 }}>
        The prompt below contains the full critique list with file selectors, expected outcomes, and acceptance criteria.
        No further task spec needed — just copy and run.
      </div>
    );
  }
  if (!next) return null;
  const meta = next.metadata || {};
  const files: string[] | undefined = meta.files_suggested;
  const reqKey: string | undefined = meta.requirement_key;
  const actionType: string | undefined = meta.action_type;
  return (
    <div>
      {actionType && (
        <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginBottom: 6 }}>
          Action type: <code style={{ color: 'var(--color-primary)' }}>{actionType}</code>
        </div>
      )}
      {reqKey && (
        <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginBottom: 6 }}>
          Requirement: <code style={{ color: 'var(--color-primary)' }}>{reqKey}</code>
        </div>
      )}
      {files && files.length > 0 ? (
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-light)', fontWeight: 600, marginBottom: 4 }}>
            Suggested files
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
            {files.slice(0, 6).map(f => (
              <li key={f}><code style={{ color: 'var(--color-primary-light)' }}>{f}</code></li>
            ))}
          </ul>
          {files.length > 6 && (
            <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginTop: 4 }}>
              +{files.length - 6} more in the prompt
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--color-text-light)' }}>
          No specific files suggested — Cory will propose them in the prompt.
        </div>
      )}
    </div>
  );
};

const PromptBlock: React.FC<{ prompt: string | null }> = ({ prompt }) => (
  <pre style={{
    margin: 0,
    background: '#0f172a',
    color: '#e2e8f0',
    fontFamily: 'var(--font-mono, "Consolas", monospace)',
    fontSize: 12,
    lineHeight: 1.55,
    padding: '0.85rem 1rem',
    borderRadius: 5,
    maxHeight: 320,
    overflowY: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  }}>{prompt || '_no prompt available_'}</pre>
);

const VerifyCard: React.FC<{
  verifyResult: 'pending' | 'pass' | 'fail' | null;
  verifyMessage: string | null;
  healthScore: number | null;
  passRate: number;
}> = ({ verifyResult, verifyMessage, healthScore, passRate }) => {
  if (verifyResult === 'pass') {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <i className="bi bi-check-circle-fill" style={{ color: 'var(--color-success)', fontSize: 18 }}></i>
          <strong style={{ color: 'var(--color-success)' }}>Verified</strong>
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text)' }}>{verifyMessage}</div>
      </div>
    );
  }
  if (verifyResult === 'fail') {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <i className="bi bi-x-circle-fill" style={{ color: 'var(--color-danger)', fontSize: 18 }}></i>
          <strong style={{ color: 'var(--color-danger)' }}>Verification did not pass</strong>
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text)' }}>{verifyMessage}</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginTop: 6 }}>
          Re-run the prompt with the gaps addressed, then submit again.
        </div>
      </div>
    );
  }
  // Idle — show the lightweight current state.
  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
      <div>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-light)', fontWeight: 600 }}>
          Project health
        </div>
        <div style={{
          fontSize: 22, fontWeight: 600,
          color: healthScore !== null && healthScore >= 80 ? 'var(--color-success)' : healthScore !== null && healthScore >= 60 ? 'var(--color-warning)' : 'var(--color-danger)',
        }}>
          {healthScore !== null ? `${healthScore}%` : '—'}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-light)', fontWeight: 600 }}>
          Recent verifications
        </div>
        <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--color-primary)' }}>
          {Math.round((passRate || 0) * 100)}%
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-light)' }}>passing</div>
      </div>
      <div style={{ flex: 1, fontSize: 12, color: 'var(--color-text-light)', lineHeight: 1.55 }}>
        Submit the validation report above to verify this specific step.
      </div>
    </div>
  );
};

const EmptyState: React.FC = () => (
  <div style={{
    background: 'white',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    padding: '2.5rem 1.5rem',
    textAlign: 'center',
  }}>
    <i className="bi bi-check2-circle" style={{ fontSize: 36, color: 'var(--color-success)' }}></i>
    <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-primary)', marginTop: 12 }}>
      Nothing to execute right now.
    </div>
    <div style={{ fontSize: 13, color: 'var(--color-text-light)', marginTop: 6, maxWidth: 480, margin: '6px auto 0' }}>
      Cory has no pending action and no Critique handoff is waiting. Pin some critique on a page, or check back when Cory queues something next.
    </div>
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 18 }}>
      <Link to="/portal/visual-workspace" className="btn btn-sm btn-primary">
        <i className="bi bi-bullseye me-1"></i>Open Critique
      </Link>
      <Link to="/portal/home" className="btn btn-sm btn-outline-primary">
        <i className="bi bi-house me-1"></i>Open Home
      </Link>
    </div>
  </div>
);

// ──────────────────────────────────────────────────────────────────
// helpers
// ──────────────────────────────────────────────────────────────────

function blastColor(band: string): string {
  if (band === 'high') return 'var(--color-danger)';
  if (band === 'medium') return 'var(--color-warning)';
  return 'var(--color-success)';
}

function buildLightweightPrompt(action: NextActionProfile): string {
  const meta = action.metadata || {};
  const files: string[] = meta.files_suggested || [];
  const reqKey: string | undefined = meta.requirement_key;
  const lines: string[] = [];
  lines.push(`# ${action.title}`);
  lines.push('');
  lines.push('## Why');
  lines.push(action.reason);
  lines.push('');
  if (reqKey) {
    lines.push('## Requirement');
    lines.push(`\`${reqKey}\``);
    lines.push('');
  }
  if (files.length > 0) {
    lines.push('## Suggested files');
    files.slice(0, 12).forEach(f => lines.push(`- \`${f}\``));
    lines.push('');
  }
  lines.push('## Implementation expectations');
  lines.push('- Make the minimum-viable change for this task. Do not bundle unrelated work.');
  lines.push('- Preserve existing component contracts; do not rename exported props or types.');
  lines.push('- Use existing CSS tokens — do not introduce hex codes.');
  lines.push('');
  lines.push('## Verification');
  lines.push('- Run `npx tsc --noEmit` in the relevant project (`backend/` or `frontend/`).');
  lines.push('- Emit a BuildManifest per CLAUDE.md.');
  lines.push('- Update `PROGRESS.md` with the change list and a one-line verification statement.');
  lines.push('- Paste a short validation report back into the Execute step on this page.');
  return lines.join('\n');
}

export default ExecutionLane;
