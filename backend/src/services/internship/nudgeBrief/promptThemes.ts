/**
 * promptThemes - PURE. Three things a message can be for, and which prompt carries each.
 *
 * Ali, 2026-11-11: "We are giving you the 3 best prompts to run to either get us more artifacts,
 * figure out what's wrong or how to move fwd. We can take all the information we have, but focus
 * that power on picking which prompt + message to send them... everything becomes more about
 * picking one of the 3."
 *
 * ## Why this is a better shape than writing prose
 *
 * "Write a good message" cannot be checked. "Pick one of three, and say which fact decided it" can
 * be checked completely: the choice is in a known set, and the reason either names a fact that is
 * in the sidecar or it does not. The message then inherits its coherence from the prompt it is
 * carrying, rather than having to invent a point of its own.
 *
 * It also fixes the thing the sameness measurement kept pointing at. Two interns got near
 * identical messages because the message was assembled from their TIER, and a tier is a label we
 * put on them. A prompt is something they will actually run, so two interns only get the same
 * message when they genuinely need the same thing done.
 *
 * ## The library was lopsided, measured 2026-11-11
 *
 * Of the eight prompts `chooseAsks` can produce, six are evidence, one is diagnosis
 * (`blocker_brief`, and only when `isStuck`), and one is advance (`project_proposal`, and only for
 * someone with no project at all). So for the most common case in the roster - an intern who has a
 * project and has gone quiet - all three slots collapsed to "send us an artifact", which is the
 * one thing a stalled person is least able to do. The missing prompts are added in artifacts.ts;
 * this module is the part that knows what each one is FOR.
 */
import type { SidecarAsk, SidecarIntern } from '../portfolioReport/sidecar/types';

export type PromptTheme = 'evidence' | 'diagnose' | 'advance';

export const THEME_LABEL: Record<PromptTheme, string> = {
  evidence: 'Get us more artifacts',
  diagnose: 'Figure out what is wrong',
  advance: 'Move forward',
};

/**
 * The theme is READ off the ask, never re-derived here.
 *
 * It is declared in `artifacts.ts` beside the prompt it describes, carried through the sidecar
 * untouched, and consumed here. A lookup table in this file would be a second place that decides
 * what a prompt is for, and the two would eventually disagree about a prompt somebody added to
 * only one of them.
 */
export const themeOf = (ask: SidecarAsk): PromptTheme => ask.theme;

export interface PromptCandidate {
  readonly theme: PromptTheme;
  readonly ask: SidecarAsk;
}

/**
 * The best candidate in each theme, in the order `chooseAsks` already ranked them.
 *
 * At most one per theme on purpose: the point of the exercise is a choice between three things, and
 * offering seven is the problem this is meant to replace.
 */
export function candidatesByTheme(asks: ReadonlyArray<SidecarAsk>): PromptCandidate[] {
  const seen = new Set<PromptTheme>();
  const out: PromptCandidate[] = [];
  for (const ask of asks) {
    const theme = themeOf(ask);
    if (seen.has(theme)) continue;
    seen.add(theme);
    out.push({ theme, ask });
  }
  return out;
}

/**
 * The theme to pick when nothing smarter is available, decided hardest truth first.
 *
 * Deliberately the same ordering `chooseFocus` uses, because a person who is blocked needs
 * unblocking before they need to be asked for a document, and someone with nothing built cannot
 * produce evidence of building. This is also the fallback whenever a model's choice is refused, so
 * it must be defensible on its own rather than being a placeholder.
 */
export function defaultTheme(i: SidecarIntern): PromptTheme {
  if (i.triage.tier === 'blocked_waiting_on_ali') return 'diagnose';
  if (!i.project) return 'advance';
  const nothingBuilt = (i.stories_verified ?? 0) === 0 && (i.counts?.commits ?? 0) === 0;
  if (nothingBuilt) return 'advance';
  if ((i.open_questions?.length ?? 0) > 0) return 'diagnose';
  if ((i.days_since_build_work ?? 0) >= 4) return 'diagnose';
  return 'evidence';
}

export interface PromptChoice {
  readonly theme: PromptTheme;
  readonly themeLabel: string;
  readonly ask: SidecarAsk;
  /** The fact that decided it, in one sentence a person can check against the sidecar. */
  readonly reason: string;
  readonly chosenBy: 'rule' | 'model';
  /** The other themes that had a candidate, so a reader can see what was NOT picked. */
  readonly alternatives: ReadonlyArray<{ theme: PromptTheme; key: string; name: string }>;
}

/** Why the rule picked what it picked, naming the fact rather than the tier. */
function ruleReason(i: SidecarIntern, theme: PromptTheme): string {
  if (theme === 'diagnose') {
    if (i.triage.tier === 'blocked_waiting_on_ali') return 'They are waiting on an answer from us.';
    if ((i.open_questions?.length ?? 0) > 0) return `They have ${i.open_questions.length} message${i.open_questions.length === 1 ? '' : 's'} we have not answered.`;
    const d = i.days_since_build_work ?? 0;
    return `No commit or verified story in ${d} days, so the first thing to find out is why.`;
  }
  if (theme === 'advance') {
    if (!i.project) return 'They have no project yet, so nothing else can start.';
    return 'Nothing has been built yet, so the next step is deciding what to build first.';
  }
  return 'They are building steadily, so the gap is evidence we can open and judge.';
}

/**
 * The deterministic choice: one prompt, with the fact that chose it.
 *
 * Falls back through the themes rather than returning nothing, because a message with no ask in it
 * is the "cheerful countdown" this subsystem already learned not to send. Returns null only when
 * the intern has no prompts at all, which is a real state and is reported rather than papered over.
 */
export function choosePrompt(i: SidecarIntern): PromptChoice | null {
  const candidates = candidatesByTheme(i.asks ?? []);
  if (!candidates.length) return null;

  const wanted = defaultTheme(i);
  const order: PromptTheme[] = [wanted, ...(['diagnose', 'advance', 'evidence'] as PromptTheme[]).filter((t) => t !== wanted)];
  const pick = order.map((t) => candidates.find((c) => c.theme === t)).find(Boolean) as PromptCandidate;

  return {
    theme: pick.theme,
    themeLabel: THEME_LABEL[pick.theme],
    ask: pick.ask,
    reason: pick.theme === wanted
      ? ruleReason(i, pick.theme)
      : `${ruleReason(i, wanted)} There is no ${THEME_LABEL[wanted].toLowerCase()} prompt for them, so this is the nearest thing that moves it.`,
    chosenBy: 'rule',
    alternatives: candidates.filter((c) => c.ask.key !== pick.ask.key).map((c) => ({ theme: c.theme, key: c.ask.key, name: c.ask.name })),
  };
}

/**
 * Accept a model's choice only if it names one of the prompts actually offered.
 *
 * The whole safety of handing this decision to a model is that the answer space is three known
 * keys. A key outside the set is not a worse choice, it is a different kind of event - the model
 * inventing work nobody wrote a prompt for - so it is refused rather than coerced.
 */
export function applyModelChoice(
  base: PromptChoice,
  candidates: ReadonlyArray<PromptCandidate>,
  raw: { key?: unknown; reason?: unknown } | null,
): { choice: PromptChoice } | { reason: string } {
  const key = String(raw?.key ?? '').trim();
  if (!key) return { reason: 'no key' };
  const hit = candidates.find((c) => c.ask.key === key);
  if (!hit) return { reason: `key not offered: ${key}` };
  const why = String(raw?.reason ?? '').replace(/\s+/g, ' ').trim();
  if (why.length < 12) return { reason: 'reason too short to check' };
  if (why.length > 320) return { reason: 'reason too long' };
  return {
    choice: {
      ...base,
      theme: hit.theme,
      themeLabel: THEME_LABEL[hit.theme],
      ask: hit.ask,
      reason: why,
      chosenBy: 'model',
      alternatives: candidates.filter((c) => c.ask.key !== hit.ask.key).map((c) => ({ theme: c.theme, key: c.ask.key, name: c.ask.name })),
    },
  };
}
