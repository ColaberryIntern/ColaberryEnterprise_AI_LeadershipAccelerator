/**
 * planDocumentInsights — the parts of `.colaberry/plan.json`'s `derived` block
 * that turn a plan into something a Command Center can draw, rather than list.
 *
 * ## Why these exist
 *
 * The first Command Center a real end-to-end run produced (ShiftFill, 2026-11-20)
 * was correct and thin: nine tabs of text cards. Ali's verdict was "a very
 * shallow Command Center". Two causes, and this module is the data half of the
 * fix (the prompt half lives in `commandCenterTabs.ts`):
 *
 *   1. The student's own words never reached the page. What they said today
 *      costs, what good would look like, who uses it and how comfortable those
 *      people are with tools: all of it lived in the intake truth, and nothing
 *      put it in the file the page reads. The Outcomes tab rendered an empty
 *      state for a student who had written "gaps filled within 30 minutes on 9
 *      mornings out of 10".
 *   2. Every richer view a reviewer asks for (who hands what to whom, what the
 *      system stores) had to be re-derived by each student's agent with its own
 *      guesswork, which is exactly what `derived` exists to prevent.
 *
 * ## Nothing here invents a value
 *
 * `understanding` is the student's statements, quoted, each labelled with how
 * confirmed it is. `handoffs` and `artifacts` are joins over names the plan's
 * own agents already carry. No inference, no defaults, no example data.
 *
 * ## Determinism
 *
 * This feeds a committed file whose content hash decides whether a sync commits
 * at all, so every list is sorted canonically and nothing reads a clock.
 *
 * PURE. No I/O.
 */
import type { PlanAgent } from './planContract';
import type { UnderstandingItem } from '../delivery/projectUnderstanding';
import { DIMENSION_HEADING, groupOf } from './intakeReview';
import { remainingAngles } from './projectDiscoveryCall';
import { UNANSWERED_COST } from './story000Truth';

/** How settled a statement is, in words a page can show beside it. */
export type UnderstandingStanding =
  | 'confirmed' | 'stated_not_confirmed' | 'from_build' | 'inferred' | 'question' | 'unknown';

export interface UnderstandingEntry {
  /** The truth dimension, e.g. `success_definition`. Stable; group on this. */
  dimension: string;
  /** The dimension as a person would read it. */
  heading: string;
  /** What the student said, verbatim. */
  statement: string;
  standing: UnderstandingStanding;
}

export interface ProjectUnderstandingDoc {
  entries: UnderstandingEntry[];
  /** Questions nobody has answered yet, each said as what it costs. */
  unanswered: string[];
}

const STANDING: Record<string, UnderstandingStanding> = {
  confirmed: 'confirmed',
  needsConfirmation: 'stated_not_confirmed',
  fromBuild: 'from_build',
  inferences: 'inferred',
  openQuestions: 'question',
  unknowns: 'unknown',
};

/** Same canonical order everywhere, so two renders of one truth are byte-identical. */
const cmp = (a: string, b: string): number => a.localeCompare(b);

/**
 * The student's own account of the project, for the page to quote.
 *
 * Absent truth gives an EMPTY document rather than a missing key, so a page can
 * always read `derived.understanding.entries` and render "no intake recorded"
 * instead of crashing on a project that predates the intake.
 */
export function understandingFor(items: readonly UnderstandingItem[] | null | undefined): ProjectUnderstandingDoc {
  const live = (items ?? []).filter((i) => typeof i.value === 'string' && i.value.trim());
  const entries = live
    .map((i) => ({
      dimension: i.dimension,
      heading: DIMENSION_HEADING[i.dimension] ?? i.dimension,
      statement: i.value.trim(),
      standing: STANDING[groupOf(i)] ?? 'stated_not_confirmed',
    }))
    .sort((a, b) => cmp(a.dimension, b.dimension) || cmp(a.statement, b.statement));
  // Only when there is SOME truth: with none at all, "every question is
  // unanswered" is noise, and the empty entries list already says it.
  const unanswered = live.length
    ? remainingAngles(live).map((angle) => UNANSWERED_COST[angle]).filter((s): s is string => Boolean(s)).sort(cmp)
    : [];
  return { entries, unanswered };
}

export interface AgentHandoff {
  from_agent: string;
  to_agent: string;
  /** The thing that passes between them, as the producing agent names it. */
  via: string;
}

/** Name equality for joining one agent's output to another's input. */
const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Who hands what to whom: an output of one agent that is, by name, an input of
 * another. This is the edge list for the agent workflow diagram.
 *
 * Exact names only (case and spacing aside). A fuzzy join would draw arrows
 * the plan never stated, and a diagram that looks more connected than the
 * system is the failure this file is meant to avoid.
 */
export function handoffsFor(agents: readonly PlanAgent[] | null | undefined): AgentHandoff[] {
  const list = agents ?? [];
  const out: AgentHandoff[] = [];
  for (const from of list) {
    for (const produced of from.outputs ?? []) {
      for (const to of list) {
        if (to === from) continue;
        if ((to.inputs ?? []).some((i) => norm(i) === norm(produced))) {
          out.push({ from_agent: from.name, to_agent: to.name, via: produced.trim() });
        }
      }
    }
  }
  const seen = new Set<string>();
  return out
    .filter((h) => {
      const k = `${h.from_agent}\u0000${h.to_agent}\u0000${norm(h.via)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => cmp(a.from_agent, b.from_agent) || cmp(a.to_agent, b.to_agent) || cmp(a.via, b.via));
}

export interface PlanArtifact {
  /** The thing, as the plan first names it. */
  name: string;
  produced_by: string[];
  read_by: string[];
}

/**
 * Every named thing the agents read or produce, with who does which.
 *
 * The starting point for the Data model tab: a thing produced by one agent and
 * read by another has to be stored somewhere. A thing nobody produces is an
 * external input (it arrives from a system); a thing nobody reads is an output
 * that leaves the system. Both are visible in the lists, so the page can say so.
 */
export function artifactsFor(agents: readonly PlanAgent[] | null | undefined): PlanArtifact[] {
  const by = new Map<string, PlanArtifact>();
  const touch = (raw: string): PlanArtifact => {
    const key = norm(raw);
    let a = by.get(key);
    if (!a) {
      a = { name: raw.trim(), produced_by: [], read_by: [] };
      by.set(key, a);
    }
    return a;
  };
  for (const agent of agents ?? []) {
    for (const o of agent.outputs ?? []) if (o.trim()) touch(o).produced_by.push(agent.name);
    for (const i of agent.inputs ?? []) if (i.trim()) touch(i).read_by.push(agent.name);
  }
  return [...by.values()]
    .map((a) => ({
      name: a.name,
      produced_by: [...new Set(a.produced_by)].sort(cmp),
      read_by: [...new Set(a.read_by)].sort(cmp),
    }))
    .sort((a, b) => cmp(norm(a.name), norm(b.name)));
}
