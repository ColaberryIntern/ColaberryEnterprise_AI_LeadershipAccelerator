/**
 * composerSteps - which of the composer's five steps you are on, which are finished, and which
 * cannot be opened yet and why.
 *
 * WHY THIS EXISTS. All five steps used to render stacked on one page, so checking what you set
 * in step 1 while standing in step 4 meant scrolling the length of the document, and the page
 * opened on a form whose later sections did nothing until earlier ones were saved - without
 * saying so. The rail shows the shape of the job; this module decides what it says.
 *
 * PURE ON PURPOSE. These are the rules an operator argues with ("why can't I click Preview?"),
 * so they are decided here, from plain facts, and tested without mounting anything.
 *
 * A BLOCKED STEP ALWAYS HAS A REASON IN WORDS. A step you cannot open and are not told why is
 * the disabled-button-with-no-explanation failure that CLAUDE.md calls a support ticket.
 */

export type StepKey = 'setup' | 'channels' | 'preview' | 'confirm' | 'publishing';

export type StepState =
  /** Finished. You can go back to it. */
  | 'done'
  /** Where you are now. */
  | 'current'
  /** Open, not finished. */
  | 'available'
  /** Cannot be opened yet; `blockedReason` says what to do first. */
  | 'blocked';

export interface StepDefinition {
  key: StepKey;
  /** 1-5, shown in the rail. */
  number: number;
  label: string;
  /** One line under the step's heading. */
  hint: string;
}

export const STEPS: readonly StepDefinition[] = [
  { key: 'setup', number: 1, label: 'Setup', hint: 'Brand, campaign, landing page and the message itself.' },
  { key: 'channels', number: 2, label: 'Channels', hint: 'Pick the networks, attach media, write each version, add tracked links.' },
  { key: 'preview', number: 3, label: 'Preview', hint: 'What it will look like, per network, on desktop and on a phone.' },
  { key: 'confirm', number: 4, label: 'Confirm', hint: 'What goes out, where, and when - in Central time.' },
  { key: 'publishing', number: 5, label: 'Publishing', hint: 'The queue, handoff packages to post by hand, and receipts.' },
];

export const STEP_KEYS: readonly StepKey[] = STEPS.map((s) => s.key);

export function isStepKey(value: string | null | undefined): value is StepKey {
  return typeof value === 'string' && (STEP_KEYS as readonly string[]).includes(value);
}

/** Everything the rules read. Deliberately plain: no API types, so the rules stay testable. */
export interface StepFacts {
  /** The draft exists on the server. Nothing after step 1 works without it. */
  hasItem: boolean;
  /** Networks ticked in step 2. */
  selectedCount: number;
  /** Versions generated, one per network. */
  variantCount: number;
  /** Null when validation has never run for this revision. */
  validation: { ran: boolean; ok: boolean; blockerCount: number } | null;
  /** True once a human has approved this revision. */
  approved: boolean;
  /** Publishing jobs that exist for this item. */
  jobCount: number;
  /** The item's own status, for the states that only it can tell us. */
  itemStatus: string | null;
}

const LIVE_STATUSES = ['scheduled', 'publishing', 'published', 'partially_published'];

/**
 * Why a step cannot be opened yet, or null when it can. The wording is the instruction: what to
 * do, not what is wrong.
 */
export function blockedReason(step: StepKey, facts: StepFacts): string | null {
  if (step === 'setup') return null;
  if (!facts.hasItem) return 'Save the setup first - everything else hangs off the draft.';

  switch (step) {
    case 'channels':
      return null;
    case 'preview':
      return facts.variantCount > 0 ? null : 'Generate the versions in Channels first; there is nothing to preview yet.';
    case 'confirm':
      return facts.variantCount > 0 ? null : 'Generate the versions in Channels first.';
    case 'publishing':
      return facts.jobCount > 0 || LIVE_STATUSES.includes(facts.itemStatus ?? '')
        ? null
        : 'Nothing is queued yet. Schedule or publish from Confirm.';
    default:
      return null;
  }
}

/** Whether a step is finished - not whether it was visited. */
function isDone(step: StepKey, facts: StepFacts): boolean {
  switch (step) {
    case 'setup':
      return facts.hasItem;
    case 'channels':
      return facts.variantCount > 0;
    case 'preview':
      // Looking at a preview cannot be "finished"; running validation is the act that ends this
      // step, and it is what the next one depends on.
      return facts.validation?.ran === true && facts.validation.ok;
    case 'confirm':
      return facts.approved || LIVE_STATUSES.includes(facts.itemStatus ?? '');
    case 'publishing':
      return facts.itemStatus === 'published';
    default:
      return false;
  }
}

export function stepStates(facts: StepFacts, active: StepKey): Record<StepKey, StepState> {
  const out = {} as Record<StepKey, StepState>;
  for (const { key } of STEPS) {
    if (key === active) out[key] = 'current';
    else if (blockedReason(key, facts) !== null) out[key] = 'blocked';
    else if (isDone(key, facts)) out[key] = 'done';
    else out[key] = 'available';
  }
  return out;
}

/**
 * Where to send someone who has just opened the composer: the first step that is not finished
 * and not blocked. A finished draft opens on Publishing, a fresh one on Setup.
 */
export function firstOpenStep(facts: StepFacts): StepKey {
  for (const { key } of STEPS) {
    if (blockedReason(key, facts) === null && !isDone(key, facts)) return key;
  }
  return STEPS[STEPS.length - 1].key;
}

/** The next step you can actually open, for the "Next" button. Null on the last open one. */
export function nextOpenStep(active: StepKey, facts: StepFacts): StepKey | null {
  const from = STEP_KEYS.indexOf(active);
  for (let i = from + 1; i < STEP_KEYS.length; i += 1) {
    if (blockedReason(STEP_KEYS[i], facts) === null) return STEP_KEYS[i];
  }
  return null;
}

/** The previous step, for the "Back" button. Steps already passed are never blocked. */
export function previousStep(active: StepKey): StepKey | null {
  const from = STEP_KEYS.indexOf(active);
  return from > 0 ? STEP_KEYS[from - 1] : null;
}

export function stepDefinition(key: StepKey): StepDefinition {
  return STEPS.find((s) => s.key === key) ?? STEPS[0];
}
