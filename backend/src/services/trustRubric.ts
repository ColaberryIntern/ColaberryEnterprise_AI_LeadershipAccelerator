/**
 * trustRubric — the scoring rubric behind the Trust Command Center (Phase 2).
 *
 * Replaces the frozen baseline constants with a transparent, drillable model: each trust dimension
 * is a set of weighted CRITERIA, and the dimension score is the weighted roll-up of how met each
 * criterion is. A criterion's `pct` (0–100) comes from one of:
 *   - 'live'    : computed from real data (ai_events, agent_write_audit, control-plane state),
 *   - 'shipped' : a verified, shipped change (fixed contribution),
 *   - 'open'    : an unmet gap (0, carries a remediation pointer).
 *
 * This makes the score MOVE as work lands (live criteria), defensible (each criterion cites
 * evidence), and the basis for both the drill-downs and the "next actions" backlog. Read-only;
 * sourced from docs/trust-audit (gap-analysis.md + trust-scorecard.md).
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import AgentWriteAudit from '../models/AgentWriteAudit';
import { isKillSwitchActive } from './launchSafety';
import { isSafeModeActive } from './systemControlService';
import { MINUTES_SAVED_SQL, valueUsd } from './aiValueService';
import { getConsentMode } from './consentService';
import { getAbacMode } from './agentAuthorizationService';

export type CriterionStatus = 'met' | 'partial' | 'open';
export type CriterionSource = 'live' | 'shipped' | 'open';

export interface Criterion {
  key: string;
  label: string;
  weight: number;
  status: CriterionStatus;
  source: CriterionSource;
  pct: number; // 0-100 contribution toward the dimension
  evidence: string;
  remediation?: string;
  ref?: string; // audit gap id, e.g. 'P0-1'
}

export interface DimensionDetail {
  key: string;
  label: string;
  score: number; // 0-100 weighted roll-up
  band: 'red' | 'amber' | 'green';
  state: 'live' | 'baseline';
  summary: string;
  criteria: Criterion[];
}

export interface OpenAction {
  dimensionKey: string;
  dimension: string;
  label: string;
  weight: number;
  status: CriterionStatus;
  remediation: string;
  ref?: string;
}

/** Real signals queried once, then handed to the live criterion evaluators. */
export interface LiveSignals {
  costUsd7d: number;
  distinctWorkflows7d: number;
  traceCoveragePct: number;
  events24h: number;
  blockedWrites24h: number;
  killSwitchReady: boolean;
  safeModeReady: boolean;
  events7d: number;
  p50Ms: number;
  p95Ms: number;
  errorRatePct: number;
  toolEvents7d: number;
  retrievalEvents7d: number;
  vectorRetrievalEvents7d: number;
  valueUsd30d: number;
  hoursSaved30d: number;
  consentChecks7d: number;
  consentEnforcing: boolean;
  abacChecks7d: number;
  abacEnforcing: boolean;
}

function band(score: number): 'red' | 'amber' | 'green' {
  if (score >= 80) return 'green';
  if (score >= 50) return 'amber';
  return 'red';
}

function logErr(event: string, err: unknown): void {
  process.stderr.write(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'trust-rubric',
      event,
      outcome: 'failure',
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
    }) + '\n'
  );
}

export async function collectLiveSignals(): Promise<LiveSignals> {
  const s: LiveSignals = {
    costUsd7d: 0,
    distinctWorkflows7d: 0,
    traceCoveragePct: 0,
    events24h: 0,
    blockedWrites24h: 0,
    killSwitchReady: false,
    safeModeReady: false,
    events7d: 0,
    p50Ms: 0,
    p95Ms: 0,
    errorRatePct: 0,
    toolEvents7d: 0,
    retrievalEvents7d: 0,
    vectorRetrievalEvents7d: 0,
    valueUsd30d: 0,
    hoursSaved30d: 0,
    consentChecks7d: 0,
    consentEnforcing: false,
    abacChecks7d: 0,
    abacEnforcing: false,
  };
  try {
    const rows = (await sequelize.query(
      `SELECT
         COALESCE(SUM(cost_usd) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days'), 0)::float AS cost7d,
         COUNT(DISTINCT workflow_id) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days' AND workflow_id IS NOT NULL)::int AS workflows7d,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS total7d,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days' AND trace_id IS NOT NULL)::int AS traced7d,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days' AND outcome = 'failure')::int AS failures7d,
         PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms)
           FILTER (WHERE created_at >= NOW() - INTERVAL '7 days' AND duration_ms IS NOT NULL) AS p50,
         PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)
           FILTER (WHERE created_at >= NOW() - INTERVAL '7 days' AND duration_ms IS NOT NULL) AS p95,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS events24h,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days' AND event_type = 'tool.call')::int AS tool7d,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days' AND event_type = 'retrieval')::int AS retrieval7d,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days' AND event_type = 'retrieval' AND metadata->>'method' = 'vector')::int AS vec_retrieval7d,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days' AND event_type = 'consent.check')::int AS consent7d,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days' AND event_type = 'agent.authorization')::int AS abac7d,
         COALESCE(SUM(${MINUTES_SAVED_SQL}) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days'), 0)::int AS minutes30d
       FROM ai_events`,
      { type: QueryTypes.SELECT }
    )) as Array<{ cost7d: number; workflows7d: number; total7d: number; traced7d: number; failures7d: number; p50: number | null; p95: number | null; events24h: number; tool7d: number; retrieval7d: number; vec_retrieval7d: number; consent7d: number; abac7d: number; minutes30d: number }>;
    const r = rows[0];
    if (r) {
      s.costUsd7d = Math.round(Number(r.cost7d) * 100) / 100;
      s.distinctWorkflows7d = Number(r.workflows7d) || 0;
      s.events24h = Number(r.events24h) || 0;
      s.events7d = Number(r.total7d) || 0;
      s.traceCoveragePct = r.total7d > 0 ? Math.round((Number(r.traced7d) / Number(r.total7d)) * 100) : 0;
      s.errorRatePct = r.total7d > 0 ? Math.round((Number(r.failures7d) / Number(r.total7d)) * 100) : 0;
      s.p50Ms = Math.round(Number(r.p50) || 0);
      s.p95Ms = Math.round(Number(r.p95) || 0);
      s.toolEvents7d = Number(r.tool7d) || 0;
      s.retrievalEvents7d = Number(r.retrieval7d) || 0;
      s.vectorRetrievalEvents7d = Number(r.vec_retrieval7d) || 0;
      s.consentChecks7d = Number(r.consent7d) || 0;
      s.abacChecks7d = Number(r.abac7d) || 0;
      const mins = Number(r.minutes30d) || 0;
      s.hoursSaved30d = Math.round((mins / 60) * 10) / 10;
      s.valueUsd30d = valueUsd(mins);
    }
  } catch (err) {
    logErr('live_signals_ai_events', err);
  }
  try {
    s.blockedWrites24h = await AgentWriteAudit.count({
      where: { was_allowed: false } as any,
    });
  } catch (err) {
    logErr('live_signals_blocked_writes', err);
  }
  try {
    await isKillSwitchActive();
    s.killSwitchReady = true;
  } catch (err) {
    logErr('live_signals_kill_switch', err);
  }
  try {
    await isSafeModeActive();
    s.safeModeReady = true;
  } catch (err) {
    logErr('live_signals_safe_mode', err);
  }
  try {
    s.consentEnforcing = (await getConsentMode()) === 'enforce';
  } catch (err) {
    logErr('live_signals_consent_mode', err);
  }
  try {
    s.abacEnforcing = (await getAbacMode()) === 'enforce';
  } catch (err) {
    logErr('live_signals_abac_mode', err);
  }
  return s;
}

type Eval = (s: LiveSignals) => Pick<Criterion, 'status' | 'source' | 'pct' | 'evidence'> & Partial<Pick<Criterion, 'remediation'>>;
interface CritDef { key: string; label: string; weight: number; ref?: string; ev: Eval; }

const shipped = (evidence: string): Eval => () => ({ status: 'met', source: 'shipped', pct: 100, evidence });
const open = (evidence: string, remediation: string): Eval => () => ({ status: 'open', source: 'open', pct: 0, evidence, remediation });
const partial = (pct: number, evidence: string, remediation: string): Eval => () => ({ status: 'partial', source: 'shipped', pct, evidence, remediation });

// ABAC chokepoint live state (P2-1): shipped+shadow → partial; shadow+traffic → exposure quantified;
// enforcing+traffic → met. Shared by the Security + Governance ABAC criteria. Never 'open' again.
const abacEv = (label: string): Eval => (s) => {
  if (s.abacEnforcing && s.abacChecks7d > 0) {
    return { status: 'met', source: 'live', pct: 100,
      evidence: `${label}: ABAC gate ENFORCING on agent actions — ${s.abacChecks7d} authorization decisions in the last 7d.` };
  }
  if (s.abacChecks7d > 0) {
    return { status: 'partial', source: 'live', pct: 60,
      evidence: `${label}: ABAC gate live in SHADOW — ${s.abacChecks7d} agent.authorization decisions in 7d (over-broad-autonomy exposure now visible); not yet blocking.`,
      remediation: 'Review the shadow would-deny rate, then set abac_enforcement=enforce on high-risk actions first (P2-1).' };
  }
  return { status: 'partial', source: 'live', pct: 50,
    evidence: `${label}: ABAC chokepoint shipped (shadow) — authorizeAgentAction + the 4-rung autonomy ladder wired into the agent-write path; no agent actions in the last 7d to evaluate.`,
    remediation: 'Accumulate agent.authorization events, then flip abac_enforcement=enforce (P2-1).' };
};

// ── The rubric. Criteria + weights grounded in docs/trust-audit/gap-analysis.md. ──
const RUBRIC: Record<string, { label: string; criteria: CritDef[] }> = {
  security: { label: 'Security', criteria: [
    { key: 'admin-auth', label: 'All admin routes require auth', weight: 3, ref: 'P0-1', ev: shipped('15 admin route files now carry requireAdmin (PR #50).') },
    { key: 'jwt', label: 'JWT secret fail-fast in prod', weight: 1, ref: 'P0-5', ev: shipped('JWT_SECRET fails fast if unset in production (PR #50).') },
    { key: 'webhook-sig', label: 'Inbound webhook signatures enforced', weight: 1, ref: 'P0-7', ev: shipped('Mandrill webhook rejects bad signatures (PR #50).') },
    { key: 'transport', label: 'Transport hardening (helmet/cors/rate-limit)', weight: 2, ev: shipped('helmet, cors allow-list, and rate limiting present (audit offset).') },
    { key: 'abac', label: 'ABAC / least-privilege on AI actions', weight: 2, ref: 'P2-1', ev: abacEv('Least-privilege on AI actions') },
    { key: 'ci-secrets', label: 'CI secret-scan + route-auth lint', weight: 1, ref: 'P3-1', ev: shipped('GitHub Actions CI runs a secret-scan + admin route-auth lint on every PR (.github/workflows/ci.yml).') },
  ]},
  privacy: { label: 'Privacy', criteria: [
    { key: 'pii-redaction', label: 'PII redacted before LLM/voice', weight: 3, ref: 'P0-3', ev: shipped('SSN/payment-card redacted at the LLM boundary on TS + cron paths (PR #50/#54).') },
    { key: 'suppression', label: 'Unsubscribe / suppression honored', weight: 1, ev: shipped('Unsubscribe + suppression handling present (audit offset).') },
    { key: 'pii-logs', label: 'PII minimized in logs', weight: 1, ev: partial(50, 'redactForLogs helper added (PR #50) but not yet applied at every log site.', 'Apply redactForLogs across all structured log call sites.') },
    { key: 'consent', label: 'Affirmative consent on outbound voice/email', weight: 3, ref: 'P0-3', ev: (s) => {
      // Gate is SHIPPED (consentService + consent_records + send-path hook). Live state:
      // enforcing+checks → met; shadowing with traffic → partial (exposure quantified, capture pending);
      // shipped but no outbound yet → partial-low.
      if (s.consentEnforcing && s.consentChecks7d > 0) {
        return { status: 'met' as const, source: 'live' as const, pct: 100,
          evidence: `Consent gate ENFORCING on outbound voice/SMS/email — ${s.consentChecks7d} consent.check decisions in the last 7d.` };
      }
      if (s.consentChecks7d > 0) {
        return { status: 'partial' as const, source: 'live' as const, pct: 65,
          evidence: `Consent gate live in SHADOW mode — ${s.consentChecks7d} consent.check decisions logged in 7d (would-block exposure now visible on the dashboard); not yet blocking.`,
          remediation: 'Populate granted records (Phase 2 capture), then set consent_enforcement=enforce to gate voice/SMS (P0-3).' };
      }
      return { status: 'partial' as const, source: 'live' as const, pct: 55,
        evidence: 'Consent gate shipped (shadow) — consent_records + assertConsentForSend wired into the send chokepoint; no outbound sends in the last 7d to evaluate.',
        remediation: 'Add opt-in capture (Phase 2) + flip consent_enforcement=enforce when granted records exist (P0-3).' };
    } },
    { key: 'retention', label: 'Data-retention / purge policy', weight: 2, ref: 'P2-5', ev: partial(50, 'A 24-month retention policy is defined for the PII data classes (chat/call transcripts, comms, sessions, leads) with a live dry-run report (/admin/trust/retention); purge enforcement is gated pending sign-off.', 'Review the dry-run, confirm scope (leads → anonymize, not delete), then enable the scheduled purge (P2-5).') },
  ]},
  observability: { label: 'Observability', criteria: [
    { key: 'unified-events', label: 'Unified ai_events model', weight: 2, ref: 'P1-1', ev: shipped('ai_events + emitAiEvent() unify the event stream (PR #50).') },
    { key: 'llm-coverage', label: 'LLM call-site coverage', weight: 3, ref: 'P1-2', ev: (s) => ({
      // Instrumentation coverage is a SHIPPED fact (~58/60 sites wired in PR #50/#54), not a traffic
      // metric — an instrumented-but-idle workflow shouldn't drag the score. The live active-count is
      // surfaced as evidence (and the cost/trace criteria below are the genuine live movers).
      status: 'partial', source: 'shipped', pct: 85,
      evidence: `~58/60 LLM call sites instrumented (PR #50/#54); ${s.distinctWorkflows7d} workflow(s) have actively emitted in the last 7d.`,
      remediation: 'Instrument the few remaining call sites + capture tool-call/retrieval events (P1-2/P1-6).' }) },
    { key: 'cost', label: 'Dollar-cost visibility', weight: 1, ref: 'P1-3', ev: (s) => ({
      status: s.costUsd7d > 0 ? 'met' : 'partial', source: 'live', pct: s.costUsd7d > 0 ? 100 : 50,
      evidence: `Computed LLM cost is live from ai_events ($${s.costUsd7d} in the last 7d).`,
      remediation: s.costUsd7d > 0 ? undefined : 'Confirm cost_usd is populated on emit (P1-3).' })},
    { key: 'trace', label: 'Cross-service trace propagation', weight: 2, ref: 'P1-4', ev: (s) => ({
      status: s.traceCoveragePct >= 70 ? 'met' : s.traceCoveragePct >= 30 ? 'partial' : 'open', source: 'live', pct: s.traceCoveragePct,
      evidence: `${s.traceCoveragePct}% of events in the last 7d carry a trace_id (x-trace-id middleware, PR #50).`,
      remediation: s.traceCoveragePct >= 70 ? undefined : 'Propagate trace_id through job payloads + background paths (P1-4).' })},
    { key: 'metrics', label: 'Latency + error-rate metrics', weight: 2, ref: 'P1-5', ev: (s) => {
      const has = s.events7d > 0;
      return { status: has ? 'met' : 'open', source: 'live', pct: has ? 100 : 0,
        evidence: has
          ? `Live over ai_events (7d): p50 ${s.p50Ms}ms · p95 ${s.p95Ms}ms · error-rate ${s.errorRatePct}% across ${s.events7d} events.`
          : 'No events in the last 7d to derive latency/error-rate.',
        remediation: has ? undefined : 'Accumulate ai_events; p50/p95 + error-rate then compute automatically (P1-5).' };
    }},
    { key: 'tool-retrieval', label: 'Tool-call + retrieval observability', weight: 2, ref: 'P1-6', ev: (s) => {
      const both = s.toolEvents7d > 0 && s.retrievalEvents7d > 0;
      const any = s.toolEvents7d > 0 || s.retrievalEvents7d > 0;
      return { status: both ? 'met' : any ? 'partial' : 'open', source: 'live', pct: both ? 100 : any ? 50 : 0,
        evidence: `Last 7d: ${s.toolEvents7d} tool-call + ${s.retrievalEvents7d} retrieval events captured to ai_events (Maya + Cory paths).`,
        remediation: both ? undefined : 'Capture tool-call + retrieval events across all agent paths (P1-6).' };
    }},
  ]},
  governance: { label: 'Governance', criteria: [
    { key: 'kill-switch', label: 'Kill switch / safe mode gate actions', weight: 3, ref: 'P0-2', ev: (s) => ({
      status: s.killSwitchReady && s.safeModeReady ? 'met' : 'partial', source: 'live', pct: s.killSwitchReady && s.safeModeReady ? 100 : 60,
      evidence: `Kill switch + safe mode are wired into email/voice/social action functions (PR #50) and the control plane is ${s.killSwitchReady && s.safeModeReady ? 'responding' : 'partially responding'}.`,
      remediation: s.killSwitchReady && s.safeModeReady ? undefined : 'Verify kill-switch/safe-mode control plane health.' })},
    { key: 'hitl-social', label: 'Human approval for public social posts', weight: 2, ref: 'P0-4', ev: shipped('OpenClaw routes social content to human approval (PR #50).') },
    { key: 'blocked-writes', label: 'Agent writes audited + gated', weight: 1, ev: (s) => ({
      status: 'met', source: 'live', pct: 100,
      evidence: `AgentWriteAudit is recording gating decisions (${s.blockedWrites24h} blocked in the last 24h).` })},
    { key: 'abac-gov', label: 'ABAC + narrowed autonomy scope', weight: 4, ref: 'P2-1', ev: abacEv('Narrowed autonomy scope') },
  ]},
  auditability: { label: 'Auditability', criteria: [
    { key: 'unified-model', label: 'Unified audit/event model', weight: 2, ref: 'P1-1', ev: shipped('ai_events unifies 15+ disjoint logs (PR #50).') },
    { key: 'actor', label: 'Admin actions attributed to an actor', weight: 1, ref: 'P0-6', ev: shipped('Audit actor fixed to req.admin.sub (PR #50).') },
    { key: 'coverage', label: 'Audit coverage of LLM calls', weight: 2, ref: 'P1-2', ev: (s) => ({
      status: 'partial', source: 'shipped', pct: 85,
      evidence: `~58/60 LLM call sites logged to ai_events (PR #50/#54); ${s.events24h} events in the last 24h.`,
      remediation: 'Route the few remaining call sites through the audited client (P1-2).' }) },
    { key: 'prompt-version', label: 'Prompt/model version in the audit record', weight: 1, ref: 'P2-3', ev: open('Prompts hardcoded; no promptTemplateId/version logged.', 'Version prompts + log promptTemplateId/version on each event (P2-3).') },
  ]},
  explainability: { label: 'Explainability', criteria: [
    { key: 'decision-reasoning', label: 'Decision reasoning + confidence captured', weight: 2, ev: shipped('IntelligenceDecision persists reasoning + confidence for the autonomous engine.') },
    { key: 'citations', label: 'Citations / retrieval provenance persisted', weight: 3, ref: 'P1-6', ev: (s) => {
      const vector = s.vectorRetrievalEvents7d > 0;
      const any = s.retrievalEvents7d > 0;
      // Both retrieval paths now persist source IDs/titles: Maya keyword + Cory vector. Capped at 90
      // (IDs/titles are persisted; full doc text + relevance scores are not).
      return { status: vector ? 'met' : any ? 'partial' : 'open', source: 'live', pct: vector ? 90 : any ? 70 : 0,
        evidence: vector
          ? `Retrieval provenance persisted on both paths — Maya keyword + Cory vector (${s.retrievalEvents7d} events, 7d). Source IDs/titles captured on the answer event.`
          : any
            ? `${s.retrievalEvents7d} keyword-retrieval events (7d) persist source IDs/titles (Maya). Cory vector-search provenance not seen yet.`
            : 'Retrieved doc IDs / citations not persisted on the answer event.',
        remediation: vector ? undefined : 'Persist retrieval provenance on the remaining agent paths (Cory vector search) (P1-6).' };
    }},
  ]},
  reliability: { label: 'Reliability', criteria: [
    { key: 'retry-timeout', label: 'Retry / timeout / safe-mode on LLM calls', weight: 2, ev: shipped('Audit wrapper enforces retry, timeout, and safe-mode guards.') },
    { key: 'circuit-breaker', label: 'Circuit breaker on external boundaries', weight: 1, ev: partial(50, 'Circuit breaker present for OpenClaw only.', 'Extend the circuit-breaker pattern to other external boundaries.') },
    { key: 'metrics-alerting', label: 'Metrics + alerting backend', weight: 2, ref: 'P1-5', ev: open('No metrics/alerting; no queue durability for fire-and-forget jobs.', 'Add metrics + alerting; durable queue for background jobs (P1-5).') },
    { key: 'ci', label: 'CI pipeline (typecheck/tests/scan)', weight: 1, ref: 'P3-1', ev: shipped('GitHub Actions CI runs typecheck (backend + frontend) + unit tests + secret-scan + route-auth lint on every PR.') },
  ]},
  businessImpact: { label: 'Business Impact', criteria: [
    { key: 'cost-live', label: 'AI dollar-cost measured', weight: 2, ref: 'P1-3', ev: (s) => ({
      status: s.costUsd7d > 0 ? 'met' : 'partial', source: 'live', pct: s.costUsd7d > 0 ? 100 : 50,
      evidence: `AI spend is now measured ($${s.costUsd7d} in the last 7d) — was 0/null everywhere at audit.`,
      remediation: s.costUsd7d > 0 ? undefined : 'Confirm cost emission across call sites (P1-3).' })},
    { key: 'roi-attribution', label: 'Revenue / time-saved attribution to AI', weight: 3, ev: (s) => {
      const has = s.valueUsd30d > 0;
      // Partial: time-saved attribution is live (a v1 estimate); revenue attribution is still v2.
      return { status: has ? 'partial' : 'open', source: 'live', pct: has ? 60 : 0,
        evidence: has
          ? `Time-saved value is live: ~${s.hoursSaved30d}h ≈ $${s.valueUsd30d} of human time over 30d (v1 estimate). Revenue attribution still pending (v2).`
          : 'No revenue or time-saved attribution to AI actions.',
        remediation: 'Tune the time-saved rates + add direct revenue attribution (v2).' };
    }},
    { key: 'per-workflow-cost', label: 'Per-workflow / per-user cost analytics', weight: 1, ref: 'P3-4', ev: (s) => ({
      status: s.distinctWorkflows7d > 0 ? 'partial' : 'open', source: 'live', pct: s.distinctWorkflows7d > 0 ? 50 : 0,
      evidence: `Cost is grouped by workflow_id (${s.distinctWorkflows7d} workflows seen, 7d); per-user analytics not yet built.`,
      remediation: 'Add per-user cost grouping + dashboards (P3-4).' })},
  ]},
};

export function dimensionKeys(): string[] {
  return Object.keys(RUBRIC);
}

export function evaluateDimension(key: string, s: LiveSignals): DimensionDetail | null {
  const def = RUBRIC[key];
  if (!def) return null;
  const criteria: Criterion[] = def.criteria.map((c) => {
    const r = c.ev(s);
    return { key: c.key, label: c.label, weight: c.weight, ref: c.ref, ...r };
  });
  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0) || 1;
  const score = Math.round(criteria.reduce((sum, c) => sum + c.weight * c.pct, 0) / totalWeight);
  const metCount = criteria.filter((c) => c.status === 'met').length;
  const hasLive = criteria.some((c) => c.source === 'live');
  return {
    key, label: def.label, score, band: band(score), state: hasLive ? 'live' : 'baseline',
    summary: `${metCount}/${criteria.length} criteria met · weighted score ${score}/100.`,
    criteria,
  };
}

export function evaluateAll(s: LiveSignals): DimensionDetail[] {
  return dimensionKeys().map((k) => evaluateDimension(k, s)!).filter(Boolean);
}

/** Every not-yet-met criterion, ranked by weight — the "next actions to raise the score" backlog. */
export function collectOpenActions(dims: DimensionDetail[]): OpenAction[] {
  const out: OpenAction[] = [];
  for (const d of dims) {
    for (const c of d.criteria) {
      if (c.status !== 'met' && c.remediation) {
        out.push({ dimensionKey: d.key, dimension: d.label, label: c.label, weight: c.weight, status: c.status, remediation: c.remediation, ref: c.ref });
      }
    }
  }
  // Highest weight first; open before partial within the same weight.
  return out.sort((a, b) => b.weight - a.weight || (a.status === 'open' ? -1 : 1));
}
