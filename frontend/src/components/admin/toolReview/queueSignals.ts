/**
 * queueSignals — the arithmetic behind the decide console's overview. PURE.
 *
 * Ali, 17 Nov 2026: *"When the request comes in make sure I can see an overview and click on it to
 * get the highly formatted details... Conditional formatting, icons, emojis, visuals etc to help
 * me decide what the next step should be."*
 *
 * ## Why this is a module and not inline JSX
 *
 * Every number on that overview is an argument for a decision about what an agent may do to real
 * systems. A readiness meter that rounds the wrong way, or a risk chip that reads a null
 * `reversible` as "reversible", is a picture that argues for approving something nobody checked.
 * Pulled out here, each of those rules has a test with a name that says what it would have gotten
 * wrong.
 *
 * ## Nothing here decides anything
 *
 * `suggestedStep` returns a SUGGESTION and the sentence behind it. It is never submitted, never
 * preselected in the decision panel, and the five verbs stay exactly as `toolRequestDecisionContract`
 * defines them. The distinction matters: a console that preselected a verb would be collecting a
 * click rather than a decision, which is the thing the ten-block package exists to prevent.
 *
 * ## Conditional formatting means meaning
 *
 * Red is a real hazard (an irreversible production write, a request nobody can act on). Amber is
 * attention (waiting a while, a package with holes, a possible duplicate). Green is ready. Gray is
 * unknown, and unknown is NEVER drawn as the safe end: a null `reversible` is not a reversible
 * tool, and an unscanned row count is not an empty table.
 */

import type {
  ChangeRequest,
  PackageBlock,
  PackageReadiness,
  ToolDuplicateCheck,
  ToolRequestDetail,
} from '../../../services/agentDomainApi';

/**
 * The ten blocks a package must carry, by the names the API bounces them under.
 *
 * Written out rather than counted from the type, because a union type has no length at runtime.
 * `PACKAGE_BLOCKS` is typed as `PackageBlock[]`, so a block renamed in the API fails to compile
 * here rather than quietly changing a denominator — which is the only failure mode a hand-written
 * list of this kind actually has.
 */
export const PACKAGE_BLOCKS: ReadonlyArray<PackageBlock> = [
  'executive_summary', 'problem', 'key_findings', 'possible_solutions', 'recommendation',
  'possible_impact', 'risk_assessment', 'simulated_action', 'steps_that_follow', 'the_answer',
];

export type Tone = 'ready' | 'attention' | 'hazard' | 'unknown';

/** Bootstrap classes per tone, in one place so a tone cannot be drawn two ways. */
export const TONE_CLASS: Record<Tone, string> = {
  ready: 'bg-success',
  attention: 'bg-warning text-dark',
  hazard: 'bg-danger',
  unknown: 'bg-secondary',
};

export const TONE_ICON: Record<Tone, string> = {
  ready: 'checkbox-circle-line',
  attention: 'error-warning-line',
  hazard: 'alert-line',
  unknown: 'question-line',
};

export interface Readiness {
  /** 0..10, how many of the ten blocks are standing. */
  readonly blocks_standing: number;
  readonly blocks_total: number;
  /** 0..100, for the meter's width. Integer, so two requests never look different at the same value. */
  readonly percent: number;
  readonly tone: Tone;
  /** One sentence. The thing to read if you read nothing else on the row. */
  readonly headline: string;
  /** The blocks still outstanding, by their own names. */
  readonly outstanding: ReadonlyArray<PackageBlock>;
}

/**
 * How far a request is from being decidable, from the API's own readiness output.
 *
 * `has_package: false` is zero and its own sentence, NOT "ten blocks outstanding". Nobody has
 * written a package, which is a different problem with a different fix from a package with holes
 * in it, and the two get different next steps below.
 *
 * A package the API calls ready is 10 of 10 even if `bounced_blocks` is non-empty, because the API
 * owns that judgement and second-guessing it here would put two answers on one screen.
 */
export function readinessOf(r: PackageReadiness | undefined | null): Readiness {
  const total = PACKAGE_BLOCKS.length;
  if (!r || !r.has_package) {
    return {
      blocks_standing: 0,
      blocks_total: total,
      percent: 0,
      tone: 'hazard',
      headline: 'No decision package has been written, so there is nothing here to judge.',
      outstanding: PACKAGE_BLOCKS,
    };
  }
  if (r.ready_for_a_human) {
    return {
      blocks_standing: total,
      blocks_total: total,
      percent: 100,
      tone: 'ready',
      headline: 'All ten blocks are standing. This is in front of you.',
      outstanding: [],
    };
  }
  // Deduplicated: the API may bounce one block under two rules, and counting it twice would
  // show a package as thinner than it is.
  const outstanding = [...new Set(r.bounced_blocks ?? [])].filter((b) => PACKAGE_BLOCKS.includes(b));
  const standing = Math.max(0, total - outstanding.length);
  return {
    blocks_standing: standing,
    blocks_total: total,
    percent: Math.round((standing / total) * 100),
    tone: 'attention',
    headline: outstanding.length === 1
      ? `One block is outstanding: ${outstanding[0].replace(/_/g, ' ')}.`
      : `${outstanding.length} of the ten blocks are outstanding.`,
    outstanding,
  };
}

export type BlastRadius = 'read_only' | 'writes_reversible' | 'writes_irreversible' | 'unknown';

export interface Risk {
  readonly radius: BlastRadius;
  readonly tone: Tone;
  readonly label: string;
  /** Short facts for the strip: what it touches, where, how often. */
  readonly chips: ReadonlyArray<{ readonly label: string; readonly tone: Tone; readonly icon: string }>;
}

/**
 * What approving this would let the agent do.
 *
 * `reversible` is `boolean | null` on the API, and null means NOBODY SAID. A write whose
 * reversibility is unknown is drawn as `writes_irreversible`, not as reversible: the only safe
 * reading of silence on "can this be undone" is that it cannot, and the alternative is a green
 * chip above a request that deletes something.
 */
export function riskOf(detail: ToolRequestDetail | null | undefined): Risk {
  if (!detail) {
    return {
      radius: 'unknown',
      tone: 'unknown',
      label: 'No details stored',
      chips: [],
    };
  }

  const prod = detail.environment === 'production';
  const radius: BlastRadius = !detail.writes
    ? 'read_only'
    : detail.reversible === true ? 'writes_reversible' : 'writes_irreversible';

  const label = radius === 'read_only'
    ? 'Reads only'
    : radius === 'writes_reversible'
      ? 'Writes, undoable'
      : detail.reversible === null
        ? 'Writes, undo not stated'
        : 'Writes, cannot be undone';

  // A production write that cannot be undone is the one combination that is a hazard on its own.
  // A sandbox write of the same kind is attention, not alarm, and saying so is what keeps the red
  // meaningful on the rows that have it.
  const tone: Tone = radius === 'read_only'
    ? (prod ? 'attention' : 'ready')
    : radius === 'writes_reversible'
      ? 'attention'
      : (prod ? 'hazard' : 'attention');

  const chips: Array<{ label: string; tone: Tone; icon: string }> = [
    {
      label: prod ? 'production' : 'sandbox',
      tone: prod ? 'attention' : 'ready',
      icon: prod ? 'server-line' : 'test-tube-line',
    },
  ];
  if (detail.read_datasets?.length) {
    chips.push({
      label: `${detail.read_datasets.length} dataset${detail.read_datasets.length === 1 ? '' : 's'}`,
      tone: 'unknown',
      icon: 'table-line',
    });
  }
  if (detail.touches?.length) {
    chips.push({
      label: `touches ${detail.touches.length}`,
      tone: detail.touches.length > 2 ? 'attention' : 'unknown',
      icon: 'links-line',
    });
  }
  if (detail.run_frequency) {
    chips.push({ label: detail.run_frequency.replace(/_/g, ' '), tone: 'unknown', icon: 'repeat-line' });
  }
  return { radius, tone, label, chips };
}

/**
 * How long this has been waiting, in whole days, or null when it cannot be worked out.
 *
 * Null rather than 0 for an unparseable date, for the reason `AdminChangeRequestsPage.ageDays`
 * records: a missing date must not render as "today".
 */
export function ageDays(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}

export function ageTone(days: number | null): Tone {
  if (days === null) return 'unknown';
  if (days >= 5) return 'hazard';
  if (days >= 2) return 'attention';
  return 'ready';
}

/** The strongest duplicate candidate, if the check ran and found one. */
export function topDuplicate(check: ToolDuplicateCheck | null | undefined): {
  readonly tool_name: string; readonly score: number;
} | null {
  if (!check || check.catalog_absent) return null;
  const best = (check.candidates ?? [])[0];
  if (!best) return null;
  return { tool_name: best.tool_name, score: best.score };
}

export interface SuggestedStep {
  /** One of the five verbs, or `read` when the suggestion is to go and read it properly. */
  readonly verb: 'send_back' | 'assign_existing_tool' | 'read' | 'nothing';
  readonly label: string;
  /** Why, in a sentence that names the evidence rather than asserting a conclusion. */
  readonly because: string;
  readonly tone: Tone;
  readonly icon: string;
}

/**
 * What to do next with this request, and why.
 *
 * Ordered by what makes the other considerations moot. A request with no details cannot be judged
 * at all, so that comes before readiness; a package nobody has written cannot be read, so that
 * comes before the duplicate check; and a tool that already exists is worth knowing about before
 * anybody spends time on whether a new one is well specified.
 *
 * The last case is deliberately NOT "approve". Nothing here suggests approving anything: a
 * well-formed request with no duplicate is a request to go and read, which is what the ten blocks
 * are for. A console that said "looks good, approve" would be making the decision and calling it
 * a hint.
 */
export function suggestedStep(r: ChangeRequest, now: Date = new Date()): SuggestedStep {
  if (r.status !== 'submitted') {
    return {
      verb: 'read',
      label: 'Already settled',
      because: `This was ${r.status}${r.approved_by_identity ? ` by ${r.approved_by_identity}` : ''}. The record is below.`,
      tone: 'unknown',
      icon: 'archive-line',
    };
  }

  if (!r.tool_request) {
    return {
      verb: 'send_back',
      label: 'Send it back',
      because: 'It is filed as a tool request and carries no details, so there is nothing to judge.',
      tone: 'hazard',
      icon: 'arrow-go-back-line',
    };
  }

  const ready = readinessOf(r.readiness);
  if (ready.percent < 100) {
    const first = ready.outstanding[0];
    return {
      verb: 'send_back',
      label: 'Send it back, naming what is missing',
      because: ready.blocks_standing === 0
        ? 'Nobody has written the case for this yet, so there is nothing to read.'
        : `${ready.outstanding.length} block${ready.outstanding.length === 1 ? '' : 's'} are outstanding, starting with ${String(first).replace(/_/g, ' ')}. Approving it now would approve something nobody checked.`,
      tone: ready.blocks_standing === 0 ? 'hazard' : 'attention',
      icon: 'arrow-go-back-line',
    };
  }

  const dup = topDuplicate(r.duplicate_check);
  if (dup && dup.score >= (r.duplicate_check?.threshold ?? 0.5)) {
    return {
      verb: 'assign_existing_tool',
      label: 'Check whether an existing tool does this',
      because: `${dup.tool_name} matched above the threshold. If it is the same thing, assign it rather than building a second one.`,
      tone: 'attention',
      icon: 'git-merge-line',
    };
  }

  const risk = riskOf(r.tool_request);
  const days = ageDays(r.requested_at, now);
  if (risk.tone === 'hazard') {
    return {
      verb: 'read',
      label: 'Read it closely before deciding',
      because: `${risk.label}, in production. Read the risk blocks and the simulation, and write your instruction when you decide.`,
      tone: 'hazard',
      icon: 'eye-line',
    };
  }

  return {
    verb: 'read',
    label: 'Ready for you to read',
    because: `All ten blocks are standing and ${risk.label.toLowerCase()}.${days !== null && days >= 2 ? ` It has been waiting ${days} days.` : ''}`,
    tone: 'ready',
    icon: 'eye-line',
  };
}

export interface QueueSummary {
  readonly total: number;
  readonly waiting: number;
  /** Waiting AND all ten blocks standing: the ones a decision can actually be made on. */
  readonly decidable: number;
  /** Waiting but not decidable. The honest size of the "cannot act on this yet" pile. */
  readonly blocked: number;
  readonly settled: number;
  /** Waiting requests that would write to production and cannot be undone. */
  readonly hazardous: number;
  /** Waiting five days or more. */
  readonly stale: number;
  /** The oldest waiting request's age in days, or null when nothing is waiting. */
  readonly oldest_waiting_days: number | null;
  /** Waiting requests grouped by their suggested next step, for the overview's bar. */
  readonly by_step: ReadonlyArray<{
    readonly verb: SuggestedStep['verb'];
    readonly label: string;
    readonly count: number;
    readonly tone: Tone;
  }>;
}

/**
 * The overview's numbers.
 *
 * `decidable` and `blocked` are the pair that matters and the pair the old screen could not show.
 * A queue of four with one decidable is not a queue of four, and a number that does not separate
 * them tells Ali to sit down to four decisions he cannot make.
 */
export function queueSummary(rows: ReadonlyArray<ChangeRequest>, now: Date = new Date()): QueueSummary {
  const waiting = rows.filter((r) => r.status === 'submitted');
  const steps = new Map<SuggestedStep['verb'], { label: string; count: number; tone: Tone }>();

  let decidable = 0;
  let hazardous = 0;
  let stale = 0;
  let oldest: number | null = null;

  for (const r of waiting) {
    if (readinessOf(r.readiness).percent === 100) decidable += 1;
    if (riskOf(r.tool_request).tone === 'hazard') hazardous += 1;

    const days = ageDays(r.requested_at, now);
    if (days !== null) {
      if (days >= 5) stale += 1;
      if (oldest === null || days > oldest) oldest = days;
    }

    const step = suggestedStep(r, now);
    const held = steps.get(step.verb);
    if (held) held.count += 1;
    else steps.set(step.verb, { label: step.label, count: 1, tone: step.tone });
  }

  return {
    total: rows.length,
    waiting: waiting.length,
    decidable,
    blocked: waiting.length - decidable,
    settled: rows.length - waiting.length,
    hazardous,
    stale,
    oldest_waiting_days: oldest,
    by_step: [...steps.entries()]
      .map(([verb, v]) => ({ verb, label: v.label, count: v.count, tone: v.tone }))
      // Biggest bar first, then by verb so the order is stable between renders. A chart whose
      // bars reorder on reload is one people stop reading.
      .sort((a, b) => (b.count - a.count) || a.verb.localeCompare(b.verb)),
  };
}

/**
 * Oldest first, and waiting before settled.
 *
 * The API returns `requested_at DESC`, which puts the request most needing a decision at the
 * bottom. Settled rows sink rather than being dropped, because the record is worth reading and a
 * queue that hides it looks empty the moment somebody decides everything.
 */
export function decideOrder(a: ChangeRequest, b: ChangeRequest): number {
  const aw = a.status === 'submitted' ? 0 : 1;
  const bw = b.status === 'submitted' ? 0 : 1;
  if (aw !== bw) return aw - bw;
  const at = a.requested_at ? new Date(a.requested_at).getTime() : 0;
  const bt = b.requested_at ? new Date(b.requested_at).getTime() : 0;
  return at - bt;
}
