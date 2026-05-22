/**
 * bpStepWalkthrough — derive richer Next-step content for a BP detail.
 *
 * Replaces the legacy 3-button row ("Generate backend / UI / agent prompt")
 * with cards that explain WHAT each step does and WHY it matters for THIS
 * specific cap. Step keys match BPDetailV2's IMPROVEMENT_TARGETS so the
 * existing handleGenerate(key) wiring keeps working — this util only
 * produces the prose around each step.
 *
 * Step selection (2026-05-22 refined to stop suggesting work that's done):
 *   - Page-kind caps skip the agent step (agents don't belong on UI pages).
 *   - Pure-page caps swap "Generate UI prompt" → "Generate upgrade prompt".
 *   - **Layer SUPPRESSED entirely** when it's `ready`/`present` AND there
 *     are zero unmatched requirements for the cap. Operator stops seeing
 *     "Generate the backend prompt" for a backend that's already done with
 *     no follow-on requirements pending.
 *   - **Agent step** keeps its existing suppression rule (confirmedAgents
 *     ≥ 3 AND matLevel ≥ 4), which is stricter than the layer-present
 *     rule and reflects the "real agent layer is hard" reality.
 *
 * Button label is state-aware (2026-05-22):
 *   - missing → "Generate X prompt" (the legacy label — building from scratch)
 *   - partial → "Extend X prompt"   (cap exists, prompt extends it)
 *   - present → step suppressed (see above)
 *
 * The `key` field still always matches the legacy IMPROVEMENT_TARGETS
 * enum so the backend `/api/portal/project/business-processes/:id/prompt`
 * endpoint can keep dispatching identically.
 */
import type { BPLike } from './bpDomainClassifier';

export type WalkthroughStepKey =
  | 'backend_improvement'
  | 'frontend_exposure'
  | 'agent_enhancement';

export interface WalkthroughStep {
  key: WalkthroughStepKey;
  title: string;
  whatItDoes: string;
  whyItMatters: string;
  /** Button label — varies by layer state AND page kind. */
  ctaLabel: string;
  /** Cory prefill question if the operator clicks "Ask Cory about this step". */
  askPrefill: string;
}

/** A layer is "done" when present AND no follow-on requirements await it. */
function isLayerDone(state: string | undefined, unmatched: number): boolean {
  if (unmatched > 0) return false;
  return state === 'ready' || state === 'present';
}

export function walkthroughStepsFor(bp: BPLike): WalkthroughStep[] {
  const name = bp.name || 'this capability';
  const usability = bp.usability || {};
  const isPage = !!bp.is_page_bp || bp.source === 'frontend_page';
  const confirmedAgents = (bp as any)._confirmed_agent_count ?? 0;
  const matLevel = bp.maturity?.level ?? 0;
  const matched = bp.matched_requirements ?? 0;
  const total = bp.total_requirements ?? 0;
  const unmatched = Math.max(0, total - matched);

  const steps: WalkthroughStep[] = [];

  // ── 1. Backend step ─────────────────────────────────────────────────────
  // Skip for page-kind caps (a page doesn't author its own service file).
  // Skip when backend is done and there's nothing more to wire.
  if (!isPage && !isLayerDone(usability.backend, unmatched)) {
    const partial = usability.backend === 'partial';
    let why: string;
    let what: string;
    let cta: string;
    if (partial) {
      // Backend EXISTS and is being EXTENDED — copy and label both say
      // "extend" so the operator stops reading conflicting signals.
      why = `The backend is partial — extending it covers the ${unmatched > 0 ? `${unmatched} unmatched requirement${unmatched === 1 ? '' : 's'}` : 'remaining gaps'} so the layer counts as complete.`;
      what = `Drafts a Claude Code prompt that extends the existing backend service for ${name}${unmatched > 0 ? `, scoped to the ${unmatched} unmatched requirement${unmatched === 1 ? '' : 's'}` : ''}.`;
      cta = 'Extend backend prompt';
    } else {
      // Backend is missing — build from scratch.
      why = `The backend layer is marked missing — it's the foundation the frontend and agent layers will hook into. Doing this step first unblocks the other two.`;
      what = `Drafts a Claude Code prompt that builds the backend service for ${name}${unmatched > 0 ? `, scoped to the ${unmatched} unmatched requirement${unmatched === 1 ? '' : 's'}` : ''}.`;
      cta = 'Generate backend prompt';
    }
    steps.push({
      key: 'backend_improvement',
      title: partial ? 'Extend the backend' : 'Generate the backend prompt',
      whatItDoes: what,
      whyItMatters: why,
      ctaLabel: cta,
      askPrefill: `Walk me through what the "${cta}" step does for ${name}, and what I should check in the drafted prompt before running it.`,
    });
  }

  // ── 2. Frontend / page step ────────────────────────────────────────────
  // Pure-page caps always render this step (the page itself is the layer
  // being iterated on — there's no "frontend done, suppress" state for a
  // page; the page is always improvable). Non-page caps skip when frontend
  // is done with no follow-on requirements pending.
  if (isPage || !isLayerDone(usability.frontend, unmatched)) {
    let what: string;
    let why: string;
    let cta: string;
    let title: string;
    if (isPage) {
      // Pure page BP — the "frontend prompt" actually upgrades the page.
      what = `Drafts a Claude Code prompt that redesigns or upgrades the existing ${name} page.`;
      why = `${name} is a page BP — this step is how you push the UI forward (visual hierarchy, missing controls, accessibility).`;
      cta = 'Generate upgrade prompt';
      title = 'Generate the page upgrade prompt';
    } else if (usability.frontend === 'missing') {
      what = `Drafts a Claude Code prompt that creates a React page wiring to the ${name} backend service.`;
      why = `Frontend is marked missing — without a page, this cap has no operator-facing surface. Adding one turns the service into a navigable feature.`;
      cta = 'Generate UI prompt';
      title = 'Generate the UI prompt';
    } else {
      // Partial — completing the surface.
      what = `Drafts a Claude Code prompt that extends the frontend surface for ${name} — wiring components, adding missing controls.`;
      why = `Frontend is partial. Completing it unlocks the L3 maturity gate (which requires backend + frontend present).`;
      cta = 'Extend UI prompt';
      title = 'Extend the UI';
    }
    steps.push({
      key: 'frontend_exposure',
      title,
      whatItDoes: what,
      whyItMatters: why,
      ctaLabel: cta,
      askPrefill: isPage
        ? `Walk me through what to expect from the "${cta}" step for the ${name} page, and what I should check in the drafted prompt.`
        : `Walk me through what the "${cta}" step does for ${name}, and what I should check before running it.`,
    });
  }

  // ── 3. Agent step ───────────────────────────────────────────────────────
  // Skip for page-kind caps. Skip when fully attributed AND at L4 (the
  // existing strict rule). Note: this DOES NOT use isLayerDone() — the
  // agent layer has stricter "real coverage" semantics (≥3 confirmed
  // agents + L4 maturity) than the requirement-matching heuristic.
  if (!isPage && !(confirmedAgents >= 3 && matLevel >= 4)) {
    let why: string;
    let cta: string;
    let title: string;
    if (confirmedAgents === 0) {
      // No agents yet — build from scratch.
      why = `Zero confirmed agents attributed today. Adding one moves ${name} toward L4 (which requires backend + frontend + agent layers + ≥85% coverage).`;
      cta = 'Generate agent prompt';
      title = 'Generate the agent prompt';
    } else if (matLevel < 4) {
      // Has some agents but maturity is below L4 — extending.
      why = `${confirmedAgents} confirmed agent${confirmedAgents === 1 ? '' : 's'} attributed — adding more decisioning logic pushes the cap closer to L4.`;
      cta = 'Extend agent prompt';
      title = 'Extend the agent layer';
    } else {
      // At L4 but fewer than 3 agents — extending.
      why = `Adds new autonomous logic to ${name}. Use when the cap needs to make additional decisions or react to new event types.`;
      cta = 'Extend agent prompt';
      title = 'Extend the agent layer';
    }
    const verb = cta.startsWith('Extend') ? 'extends' : 'adds';
    steps.push({
      key: 'agent_enhancement',
      title,
      whatItDoes: `Drafts a Claude Code prompt that ${verb} the autonomous-agent layer for ${name}.`,
      whyItMatters: why,
      ctaLabel: cta,
      askPrefill: `Walk me through what the "${cta}" step does for ${name}, and how to decide whether this cap actually needs an agent layer.`,
    });
  }

  return steps;
}
