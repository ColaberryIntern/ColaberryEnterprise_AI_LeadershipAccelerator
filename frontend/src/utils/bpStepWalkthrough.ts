/**
 * bpStepWalkthrough — derive richer Next-step content for a BP detail.
 *
 * Replaces the legacy 3-button row ("Generate backend / UI / agent prompt")
 * with cards that explain WHAT each step does and WHY it matters for THIS
 * specific cap. Step keys match BPDetailV2's IMPROVEMENT_TARGETS so the
 * existing handleGenerate(key) wiring keeps working — this util only
 * produces the prose around each step.
 *
 * Step selection:
 *   - Page-kind caps skip the agent step (agents don't belong on UI pages)
 *   - Pure-page caps swap "Generate UI prompt" → "Generate upgrade prompt"
 *     (matches IMPROVEMENT_TARGETS.pageLabel)
 *   - "Why it matters" copy is computed from cap state — never hardcoded
 *     sentences. Reads gaps, layer presence, maturity, confirmed agents.
 *   - "askPrefill" carries a step-specific Cory deeplink question so the
 *     "Ask Cory about this step" link drops the operator into context.
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
  /** Button label — varies for page kind. */
  ctaLabel: string;
  /** Cory prefill question if the operator clicks "Ask Cory about this step". */
  askPrefill: string;
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
  if (!isPage) {
    let why: string;
    if (usability.backend === 'missing') {
      why = `The backend layer is marked missing — it's the foundation the frontend and agent layers will hook into. Doing this step first unblocks the other two.`;
    } else if (usability.backend === 'partial') {
      why = `The backend is partial — extending it covers the ${unmatched > 0 ? `${unmatched} unmatched requirement${unmatched === 1 ? '' : 's'}` : 'remaining gaps'} so the layer counts as complete.`;
    } else {
      why = `Backend is already attributed for ${name}. Re-running this drafts a prompt that EXTENDS the existing service — useful when adding new requirements.`;
    }
    steps.push({
      key: 'backend_improvement',
      title: 'Generate the backend prompt',
      whatItDoes: `Drafts a Claude Code prompt that builds (or extends) the backend service for ${name}${unmatched > 0 ? `, scoped to the ${unmatched} unmatched requirement${unmatched === 1 ? '' : 's'}` : ''}.`,
      whyItMatters: why,
      ctaLabel: 'Generate backend prompt',
      askPrefill: `Walk me through what the "Generate backend prompt" step does for ${name}, and what I should check in the drafted prompt before running it.`,
    });
  }

  // ── 2. Frontend / page step ────────────────────────────────────────────
  {
    let what: string;
    let why: string;
    let cta: string;
    if (isPage) {
      // Pure page BP — the "frontend prompt" actually upgrades the existing page.
      what = `Drafts a Claude Code prompt that redesigns or upgrades the existing ${name} page.`;
      why = `${name} is a page BP — this step is how you push the UI forward (visual hierarchy, missing controls, accessibility).`;
      cta = 'Generate upgrade prompt';
    } else if (usability.frontend === 'missing') {
      what = `Drafts a Claude Code prompt that creates a React page wiring to the ${name} backend service.`;
      why = `Frontend is marked missing — without a page, this cap has no operator-facing surface. Adding one turns the service into a navigable feature.`;
      cta = 'Generate UI prompt';
    } else if (usability.frontend === 'partial') {
      what = `Drafts a Claude Code prompt that completes the frontend surface for ${name} — wiring components, adding missing controls.`;
      why = `Frontend is partial. Completing it unlocks the L3 maturity gate (which requires backend + frontend present).`;
      cta = 'Generate UI prompt';
    } else {
      what = `Drafts a Claude Code prompt that adds or improves the frontend surface for ${name}.`;
      why = `Frontend is already present. Re-running this drafts an extension prompt — useful when adding new operator-facing flows.`;
      cta = 'Generate UI prompt';
    }
    steps.push({
      key: 'frontend_exposure',
      title: isPage ? 'Generate the page upgrade prompt' : 'Generate the UI prompt',
      whatItDoes: what,
      whyItMatters: why,
      ctaLabel: cta,
      askPrefill: isPage
        ? `Walk me through what to expect from the "Generate upgrade prompt" step for the ${name} page, and what I should check in the drafted prompt.`
        : `Walk me through what the "Generate UI prompt" step does for ${name}, and what I should check before running it.`,
    });
  }

  // ── 3. Agent step ───────────────────────────────────────────────────────
  // Skip for page-kind caps. Skip when fully attributed AND at L4.
  if (!isPage && !(confirmedAgents >= 3 && matLevel >= 4)) {
    let why: string;
    if (confirmedAgents === 0) {
      why = `Zero confirmed agents attributed today. Adding one moves ${name} toward L4 (which requires backend + frontend + agent layers + ≥85% coverage).`;
    } else if (matLevel < 4) {
      why = `${confirmedAgents} confirmed agent${confirmedAgents === 1 ? '' : 's'} attributed — adding more decisioning logic pushes the cap closer to L4.`;
    } else {
      why = `Adds new autonomous logic to ${name}. Use when the cap needs to make additional decisions or react to new event types.`;
    }
    steps.push({
      key: 'agent_enhancement',
      title: 'Generate the agent prompt',
      whatItDoes: `Drafts a Claude Code prompt that adds (or extends) the autonomous-agent layer for ${name}.`,
      whyItMatters: why,
      ctaLabel: 'Generate agent prompt',
      askPrefill: `Walk me through what the "Generate agent prompt" step does for ${name}, and how to decide whether this cap actually needs an agent layer.`,
    });
  }

  return steps;
}
