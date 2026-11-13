import { scrubField } from './scrubField';

/**
 * One journey decision, as one sentence (MR3).
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * MR3's success metric asks that `growth_journey_decisions` be *"readable as a sentence saying
 * who would be contacted, on what channel, and why"*. Today the only reader is
 * `growthJourneyDecideDryRun.ts`, which prints `JSON.stringify(...)` of a row carrying thirty-odd
 * fields including `candidates`, `suppressed`, `scores` and `eligibility`. That is the right
 * output for a machine and the wrong one for the decision Ali has to make.
 *
 * It is built now, with the table at **zero rows**, precisely because the alternative is
 * discovering on the day of the first run that the output is unreadable. The sentence is the
 * thing that makes a shadow run worth doing.
 *
 * ── A SHADOW DECISION IS CONDITIONAL, AND THE SENTENCE MUST SAY SO ─────────
 *
 * A decision is stamped `shadow` or `live` at write time and never re-stamped
 * (`executionModeStamp.ts:104`). A shadow row is a record of what the engine WOULD have done, so
 * rendering it in the past tense would read as a log of messages that went out. Every shadow
 * sentence is therefore conditional, and the word "would" is load-bearing rather than stylistic.
 *
 * ── PURE, AND NO ADDRESS EVER ──────────────────────────────────────────────
 *
 * No database import, no model value-import, no I/O: it takes a plain row and returns a string,
 * so it can be tested against fixtures and reused by any caller.
 *
 * `subject_ref` is the one field that can carry an address. The journey tree's rule is that no
 * output may contain an `@`, ever, scrubbed PER FIELD rather than over a serialised document, and
 * `scrubField` is the sanctioned tool: it replaces the whole value rather than masking a local
 * part, which is the mistake `redactForLogs` makes (its email pattern leaves the `@` intact).
 */

/** The fields a sentence needs. A subset of the model, so a fixture is cheap to write. */
export interface DecisionFacts {
  subject_ref: string;
  mode: string;
  selected_action?: string | null;
  selected_channel?: string | null;
  selected_path?: string | null;
  reason?: string | null;
  executed?: boolean | null;
  requires_human_review?: boolean | null;
}

/** Channel names as a person says them, not as the column stores them. */
const CHANNEL_WORDS: Readonly<Record<string, string>> = Object.freeze({
  email: 'by email',
  in_app: 'in the product',
  ali_outreach: 'by a message from Ali',
  sms: 'by text',
  voice: 'by phone',
});

function channelPhrase(channel: string | null | undefined): string {
  const c = String(channel ?? '').trim();
  if (!c) return 'on no channel yet chosen';
  return CHANNEL_WORDS[c] ?? `on the ${c} channel`;
}

function actionPhrase(action: string | null | undefined): string {
  const a = String(action ?? '').trim();
  // `hold` and `none` are real decisions and the commonest ones in a first shadow run. Rendering
  // them as "would be contacted" would invert the meaning of the row.
  if (!a || a === 'none' || a === 'hold' || a === 'no_action') return 'would NOT be contacted';
  return `would be sent ${a.replace(/_/g, ' ')}`;
}

function whyPhrase(reason: string | null | undefined): string {
  const r = String(reason ?? '').trim();
  // Never the empty string and never "undefined": `reason` is NOT NULL on the model, but a row
  // read through a partial select or a hand-built fixture can still arrive without it, and a
  // sentence ending in nothing is worse than one that admits the gap.
  if (!r) return 'no reason was recorded';
  // SCRUBBED, and this was a real defect rather than belt-and-braces. The first version scrubbed
  // only `subject_ref`, on the assumption that it is the one field that can carry an address.
  // But `reason` is a `TEXT` column holding engine-generated free text, so it is unbounded AND
  // it is the field most likely to quote something about a person. A 500-character reason ran
  // away unchecked until a test asked for one.
  return scrubField(r.replace(/_/g, ' '));
}

/**
 * Render one decision as one sentence.
 *
 * Shadow rows are conditional. A live row that has been executed is past tense, because by then
 * it is a record of something that happened; a live row that has not been executed is still
 * conditional, because the executor may yet refuse it.
 */
export function describeDecision(d: DecisionFacts): string {
  const who = scrubField(String(d.subject_ref ?? '').trim() || 'an unidentified subject');
  const channel = channelPhrase(d.selected_channel);
  const why = whyPhrase(d.reason);
  const review = d.requires_human_review ? ', and it is held for human review' : '';

  if (d.mode === 'live' && d.executed === true) {
    const a = String(d.selected_action ?? '').trim();
    const did = (!a || a === 'none' || a === 'hold' || a === 'no_action')
      ? 'was deliberately not contacted'
      : `was sent ${a.replace(/_/g, ' ')} ${channel}`;
    return `${who} ${did}, because ${why}${review}.`;
  }

  const tense = d.mode === 'live'
    ? 'is approved to be contacted'
    : 'would be contacted only if this were live';

  const action = actionPhrase(d.selected_action);
  if (action === 'would NOT be contacted') {
    return `${who} ${action}, because ${why}${review}.`;
  }
  return `${who} ${action} ${channel} - ${tense} - because ${why}${review}.`;
}

/**
 * A whole shadow run as lines, with a one-line header that states the mode once.
 *
 * The header exists because a reader scanning forty conditional sentences needs to be told once,
 * at the top, that none of this happened - rather than inferring it from the grammar of each
 * line.
 */
export function describeDecisions(rows: readonly DecisionFacts[]): string[] {
  if (rows.length === 0) return ['No decisions to read.'];
  const live = rows.filter((r) => r.mode === 'live').length;
  const header = live === 0
    ? `${rows.length} decision(s), all in shadow: nothing below was sent to anybody.`
    : `${rows.length} decision(s), ${live} of them live.`;
  return [header, ...rows.map((r) => `  - ${describeDecision(r)}`)];
}
