/**
 * bpEducationalQuestions — derive a curated set of educational chips
 * for a BP detail panel.
 *
 * Pure, deterministic, client-side. Reads the cap shape (usability,
 * maturity, dependencies) and returns 4–6 questions tuned to what THIS
 * cap is missing or doing well. Each question name-drops the BP so the
 * Cory deeplink has full context without needing prior chat state.
 *
 * Priority order (gap-diagnosis wins over generic):
 *   1. Layer-gap questions (backend / frontend / agent missing or partial)
 *   2. Maturity-gap question (path to next level)
 *   3. Dependency question (if the cap has any)
 *   4. Generic fallback chips ("what does this do", "smallest next change")
 *
 * Capped at MAX_CHIPS to keep the strip from becoming noise. The
 * "what does X do" + "smallest next change" generics always make the
 * list so even an L4 fully-built cap shows something useful.
 */
import type { BPLike } from './bpDomainClassifier';

export interface EducationalQuestion {
  /** Stable id — for React keys + analytics. */
  id: string;
  /** Operator-facing chip label (also the Cory prompt). */
  text: string;
  /** Small emoji glyph rendered before the chip text. */
  glyph: string;
  /**
   * Optional source-tag for analytics — distinguishes which trigger
   * fired this chip (gap-backend, maturity, generic, etc).
   */
  source: string;
}

const MAX_CHIPS = 6;

export function educationalQuestionsFor(bp: BPLike): EducationalQuestion[] {
  const out: EducationalQuestion[] = [];
  const name = bp.name || 'this capability';
  const usability = bp.usability || {};
  const matLevel = bp.maturity?.level ?? -1;
  const confirmedAgents = (bp as any)._confirmed_agent_count ?? 0;
  const isPage = !!bp.is_page_bp || bp.source === 'frontend_page';
  const depCount = (bp.frontend_calls_capability_ids || []).length;

  // ── 1. Layer-gap questions ────────────────────────────────────────────
  if (!isPage && usability.backend === 'missing') {
    out.push({
      id: 'gap-be-missing',
      glyph: '⚠️',
      source: 'gap',
      text: `Why is the backend layer missing for ${name}, and what would it take to add it?`,
    });
  } else if (usability.backend === 'partial') {
    out.push({
      id: 'gap-be-partial',
      glyph: '⚠️',
      source: 'gap',
      text: `What's incomplete about the backend for ${name}?`,
    });
  }

  if (!isPage && usability.frontend === 'missing') {
    out.push({
      id: 'gap-fe-missing',
      glyph: '🖥️',
      source: 'gap',
      text: `Should ${name} have its own UI page, or is it a pure backend cap?`,
    });
  } else if (usability.frontend === 'partial') {
    out.push({
      id: 'gap-fe-partial',
      glyph: '🖥️',
      source: 'gap',
      text: `What's incomplete about the frontend for ${name}?`,
    });
  }

  if (!isPage && confirmedAgents === 0 && usability.agent !== 'ready') {
    out.push({
      id: 'gap-agent-missing',
      glyph: '🤖',
      source: 'gap',
      text: `Which agent files would logically belong to ${name}?`,
    });
  }

  // ── 2. Maturity-gap question ──────────────────────────────────────────
  if (matLevel >= 0 && matLevel < 4) {
    const nextLevel = matLevel + 1;
    out.push({
      id: 'maturity-next',
      glyph: '📈',
      source: 'maturity',
      text: `What would it take for ${name} to reach L${nextLevel}?`,
    });
  } else if (matLevel === 4) {
    out.push({
      id: 'maturity-l4',
      glyph: '🌟',
      source: 'maturity',
      text: `${name} is at L4 — what would make it more autonomous over time?`,
    });
  }

  // ── 3. Dependency question (only if the cap has any) ───────────────────
  if (depCount > 0) {
    out.push({
      id: 'deps-uses',
      glyph: '🔗',
      source: 'deps',
      text: `Which other capabilities does ${name} call, and how do they fit together?`,
    });
  }

  // ── 4. Generic anchors — always present, always last ──────────────────
  const generics: EducationalQuestion[] = [
    {
      id: 'generic-what-is',
      glyph: '💬',
      source: 'generic',
      text: `What does ${name} actually do, in plain English?`,
    },
    {
      id: 'generic-next-move',
      glyph: '⏩',
      source: 'generic',
      text: `What's the smallest next change that would move ${name} forward?`,
    },
  ];

  // Always include "what is it" first; pad with "smallest next change"
  // only if we have room.
  out.unshift(generics[0]);
  if (out.length < MAX_CHIPS) out.push(generics[1]);

  return out.slice(0, MAX_CHIPS);
}
