/**
 * R16 — the one registry of every classification a revenue event can have.
 *
 * Ali's ask: "Every classification has a color so we can see anything that is happening
 * that is tied to the revenue, we can see directly."
 *
 * ── WHY THE COLOUR IS NOT IN THIS FILE ───────────────────────────────────────────────────
 *
 * Each classification declares a `tone`, not a hex. The frontend maps the five tones onto
 * the design system's own status tokens (`--status-success`, `--status-info`,
 * `--status-warning`, `--status-danger`, `--text-muted`), which is the arrangement
 * `commercializationTiles.ts` and `statusVocabulary.tsx` already use: backend owns the
 * meaning, frontend owns the paint. Putting hex codes here would fork the palette, and the
 * first symptom is the same status rendering as two different colours on two screens in the
 * same meeting.
 *
 * It also keeps this file testable without a browser, which is the point of the split.
 *
 * ── COLOUR IS NEVER THE ONLY CARRIER ─────────────────────────────────────────────────────
 *
 * Every classification therefore ships a `glyph` and a `label` as well as a tone. A reader
 * with colour-vision deficiency, a greyscale print, and a screenshot pasted into a chat all
 * have to survive this, and a dashboard whose meaning lives purely in hue fails all three.
 * The tones are deliberately the RESERVED status palette rather than a categorical series,
 * because these values are states, not arbitrary categories — and a reserved palette must
 * never be reused to mean "series 4".
 *
 * ── WHY `direction` EXISTS SEPARATELY FROM `tone` ────────────────────────────────────────
 *
 * They answer different questions and collapsing them loses one. `tone` is how worried a
 * reader should be. `direction` is which way money moved. A refund is `danger` and `out`; a
 * cancellation is `danger` and `none`, because churn stops future money rather than
 * returning past money. A dashboard that treats those as the same thing double-counts the
 * loss, which is the kind of error that survives review because it looks conservative.
 *
 * ── WHY `never_paid` IS ITS OWN CLASSIFICATION AND NOT A FLAVOUR OF PENDING ──────────────
 *
 * Measured against production on 2026-11-12: of 274 subscription rows, 96 pending monthly,
 * 36 pending annual and 42 failed rows carry NO `paysimple_payment_id`. Only 32 rows are
 * billable. The plan says one thing and the bank says another, and the gap is 132 rows.
 *
 * That is the single most load-bearing fact on the whole dashboard, so it gets its own
 * colour rather than being folded into a status pill nobody clicks. `project_ram_revenue_plan`
 * and the "most stated MRR cannot be billed" finding are both about exactly this gap; a
 * surface that averages it away recreates the problem it was built to expose.
 */

/** The five tones. Mapped to the design system's reserved status tokens by the frontend. */
export type FlowTone = 'good' | 'info' | 'warn' | 'danger' | 'muted';

/** Which way money moved, independent of how worried a reader should be. */
export type FlowDirection = 'in' | 'out' | 'none';

/** Which stream an event belongs to. The dashboard's top-level grouping. */
export type FlowStreamKey = 'membership' | 'gov_pipeline' | 'hypotheses';

export interface ClassificationDefinition {
  key: string;
  label: string;
  stream: FlowStreamKey;
  tone: FlowTone;
  /** Carried so meaning survives greyscale, CVD and a pasted screenshot. */
  glyph: string;
  direction: FlowDirection;
  /**
   * Whether an event of this kind can carry a dollar figure at all. A `false` here is a
   * promise the dashboard keeps: `bid_flagged` must never print a number, because on
   * 2026-11-12 nothing in `gov_qualifications` held one.
   */
  carriesValue: boolean;
  /** One sentence a reader can act on: what this classification actually means. */
  means: string;
}

/**
 * Membership classifications.
 *
 * Every one of these resolves to a column on `subscriptions` that was confirmed to exist on
 * 2026-11-12 — `started_at`, `canceled_at`, `current_period_end`, `created_at`, `status`,
 * `paysimple_payment_id`, `amount_cents` — or to the `refunds` table. Nothing here is
 * aspirational, which is the rule `revenueInitiatives.ts` set for the cards and this file
 * inherits for the events.
 *
 * NOTE ON WHAT IS DELIBERATELY ABSENT: there is no `payment_received` classification.
 * Production has no `payments`, `invoices` or `transactions` table — only subscription rows
 * with an amount and lifecycle dates. So this vocabulary describes SUBSCRIPTION STATE
 * CHANGES and says so, rather than implying a cash ledger that does not exist.
 */
const MEMBERSHIP: readonly ClassificationDefinition[] = [
  {
    key: 'member_started',
    label: 'Member started paying',
    stream: 'membership',
    tone: 'good',
    glyph: '▲',
    direction: 'in',
    carriesValue: true,
    means: 'A subscription with a PaySimple payment id began. This is money starting.',
  },
  {
    key: 'member_renewed',
    label: 'Renewal due',
    stream: 'membership',
    tone: 'info',
    glyph: '↻',
    direction: 'in',
    carriesValue: true,
    means:
      'The NEXT billing boundary on an active subscription, from current_period_end. '
      + 'Forward-looking only: past renewals cannot be reconstructed, because that column '
      + 'holds one date and no payment ledger exists to hold the rest.',
  },
  {
    key: 'member_canceled',
    label: 'Member canceled',
    stream: 'membership',
    tone: 'danger',
    glyph: '▼',
    direction: 'none',
    carriesValue: true,
    means:
      'A subscription was canceled. The direction is "none", not "out": churn stops future '
      + 'money rather than returning money already taken.',
  },
  {
    key: 'payment_failed',
    label: 'Payment failed',
    stream: 'membership',
    tone: 'warn',
    glyph: '!',
    direction: 'none',
    carriesValue: true,
    means:
      'The subscription sits at status "failed": the plan exists, the charge did not land. '
      + 'A funnel state only, never a timeline event, because no column records WHEN it '
      + 'failed and dating it from updated_at would be a guess wearing a timestamp.',
  },
  {
    key: 'never_paid',
    label: 'Signed up, never paid',
    stream: 'membership',
    tone: 'warn',
    glyph: '○',
    direction: 'none',
    carriesValue: true,
    means:
      'A subscription row carrying NO paysimple_payment_id. On 2026-11-12 this was 132 of '
      + '274 rows. The amount is shown as what it WOULD have been, never as revenue.',
  },
  {
    key: 'comped',
    label: 'Comped (no revenue)',
    stream: 'membership',
    tone: 'muted',
    glyph: '◇',
    direction: 'none',
    carriesValue: false,
    means:
      'A comp plan at zero cents. 27 rows were active comps on 2026-11-12. Visible so the '
      + 'member count and the revenue figure can never be mistaken for each other.',
  },
  {
    key: 'refunded',
    label: 'Refunded',
    stream: 'membership',
    tone: 'danger',
    glyph: '⤺',
    direction: 'out',
    carriesValue: true,
    means: 'Money returned, from the refunds table. The only classification here that is truly "out".',
  },
];

/**
 * Government pipeline classifications.
 *
 * These follow the submission lifecycle that `models/GovSubmission.ts` already declares —
 * preparing, needs_review, ready, exported, externally_submitted, acknowledged — plus the
 * outcome vocabulary pending | won | lost | withdrawn | no_bid | unknown. Reused rather than
 * reinvented, so the dashboard and the proposal subsystem cannot disagree about what state a
 * bid is in.
 *
 * `bid_exported` and `bid_submitted` stay separate because that model's header is emphatic
 * about it: "EXPORTED is not SUBMITTED". Marking a package exported is something an agent
 * can do; marking it submitted is a manual operator act. Collapsing the two would let the
 * dashboard claim a submission nobody made.
 */
const GOV: readonly ClassificationDefinition[] = [
  {
    key: 'bid_flagged',
    label: 'Flagged for pursuit',
    stream: 'gov_pipeline',
    tone: 'info',
    glyph: '◔',
    direction: 'none',
    carriesValue: false,
    means:
      'A qualification reached decision=approved_bid_pursuit. A FLAG, not a confirmed '
      + 'pursuit, and it carries no value because gov_qualifications holds none.',
  },
  {
    key: 'bid_priced',
    label: 'Priced by a human',
    stream: 'gov_pipeline',
    tone: 'good',
    glyph: '$',
    direction: 'none',
    carriesValue: true,
    means:
      'Somebody recorded a proposal value with a stated basis and put their name to it. '
      + 'This is the human confirmation the government card has wanted since R1.',
  },
  {
    key: 'bid_repriced',
    label: 'Value revised',
    stream: 'gov_pipeline',
    tone: 'info',
    glyph: '≠',
    direction: 'none',
    carriesValue: true,
    means:
      'An earlier price was superseded. Kept as its own event because the first estimate '
      + 'against the final one is often the most informative line on the page.',
  },
  {
    key: 'proposal_document',
    label: 'Proposal document produced',
    stream: 'gov_pipeline',
    tone: 'info',
    glyph: '▤',
    direction: 'none',
    carriesValue: false,
    means:
      'A document was drafted for this bid. 42 of these existed across 5 projects on '
      + '2026-11-12, and they are the only dated evidence of real work on the pipeline.',
  },
  {
    key: 'bid_exported',
    label: 'Package exported',
    stream: 'gov_pipeline',
    tone: 'info',
    glyph: '⇪',
    direction: 'none',
    carriesValue: false,
    means:
      'The proposal package was assembled and exported. This is NOT a submission, and the '
      + 'distinction is a declared honesty rail in models/GovSubmission.ts.',
  },
  {
    key: 'bid_submitted',
    label: 'Submitted to the agency',
    stream: 'gov_pipeline',
    tone: 'good',
    glyph: '➤',
    direction: 'none',
    carriesValue: true,
    means:
      'An operator manually recorded an external submission receipt. gov_submission held '
      + 'zero rows on 2026-11-12, so nothing has ever reached this state.',
  },
  {
    key: 'bid_acknowledged',
    label: 'Receipt acknowledged',
    stream: 'gov_pipeline',
    tone: 'good',
    glyph: '✓',
    direction: 'none',
    carriesValue: true,
    means: 'The agency confirmed receipt. The last state before an outcome.',
  },
  {
    key: 'bid_won',
    label: 'Won',
    stream: 'gov_pipeline',
    tone: 'good',
    glyph: '★',
    direction: 'in',
    carriesValue: true,
    means:
      'gov_submission.outcome = won. The value is the priced proposal value, so an unpriced '
      + 'win reports as a win with no number rather than as a guess.',
  },
  {
    key: 'bid_lost',
    label: 'Lost',
    stream: 'gov_pipeline',
    tone: 'danger',
    glyph: '✕',
    direction: 'none',
    carriesValue: true,
    means: 'gov_submission.outcome = lost. Counted in the win rate denominator, never in winnings.',
  },
  {
    key: 'bid_no_bid',
    label: 'Decided not to bid',
    stream: 'gov_pipeline',
    tone: 'muted',
    glyph: '—',
    direction: 'none',
    carriesValue: false,
    means:
      'Declined deliberately. 14 qualifications sat at decision=no_bid on 2026-11-12, and a '
      + 'deliberate pass is not a loss.',
  },
  {
    key: 'bid_withdrawn',
    label: 'Withdrawn',
    stream: 'gov_pipeline',
    tone: 'muted',
    glyph: '⊘',
    direction: 'none',
    carriesValue: false,
    means: 'Pulled after entering the pipeline. Excluded from the win rate on both sides.',
  },
  {
    key: 'bid_suspect',
    label: 'Row needs cleaning',
    stream: 'gov_pipeline',
    tone: 'warn',
    glyph: '⚑',
    direction: 'none',
    carriesValue: false,
    means:
      'The row itself is unusable: a test row, a duplicate title, or no delivery project. '
      + 'All three were really present in the flagged set on 2026-11-12.',
  },
];

/**
 * Hypothesis classifications.
 *
 * The five revenue bets are on the dashboard so a reader can see that they are NOT revenue
 * yet. Their events are evidence and deadlines, never dollars, which is why both entries
 * below set `carriesValue: false`. R1 made the same call for the cards: "a hypothesis is a
 * bet about the future, and 'zero pilots so far' is a fact about the funnel, not a
 * measurement of the bet."
 */
const HYPOTHESES: readonly ClassificationDefinition[] = [
  {
    key: 'hypothesis_evidence',
    label: 'Evidence toward a bet',
    stream: 'hypotheses',
    tone: 'info',
    glyph: '◦',
    direction: 'none',
    carriesValue: false,
    means: 'Something happened that counts toward a revenue hypothesis surviving.',
  },
  {
    key: 'hypothesis_deadline',
    label: 'Bet judged on this date',
    stream: 'hypotheses',
    tone: 'warn',
    glyph: '◷',
    direction: 'none',
    carriesValue: false,
    means: 'A tripwire or target date from the C0.1 register. The bet is assessed, not paid.',
  },
];

export const CLASSIFICATIONS: readonly ClassificationDefinition[] = [
  ...MEMBERSHIP, ...GOV, ...HYPOTHESES,
];

export type ClassificationKey = string;

const BY_KEY: ReadonlyMap<string, ClassificationDefinition> = new Map(
  CLASSIFICATIONS.map((c) => [c.key, c]),
);

/**
 * The definition for a key, or a throw.
 *
 * Deliberately NOT a silent fallback to a grey "unknown" chip. A classification that no
 * longer exists is a bug in the producer, and rendering it as grey hides the bug while
 * showing the reader an event with no meaning — the quiet-failure shape this ladder keeps
 * finding.
 */
export function classificationFor(key: string): ClassificationDefinition {
  const def = BY_KEY.get(key);
  if (!def) {
    throw new Error(
      `no revenue classification is called "${key}". `
      + `Known: ${CLASSIFICATIONS.map((c) => c.key).join(', ')}`,
    );
  }
  return def;
}

/** Every classification in one stream, in declaration order. */
export function classificationsFor(stream: FlowStreamKey): ClassificationDefinition[] {
  return CLASSIFICATIONS.filter((c) => c.stream === stream);
}

/**
 * Acceptance criterion: no two classifications share a key.
 *
 * Asserted rather than assumed because the failure is silent — a duplicate key means the
 * Map silently keeps the last one, and an event starts rendering as the wrong thing with
 * the wrong colour and no error anywhere.
 */
export function assertClassificationKeysAreUnique(): number {
  const seen = new Set<string>();
  for (const c of CLASSIFICATIONS) {
    if (seen.has(c.key)) throw new Error(`duplicate revenue classification key "${c.key}"`);
    seen.add(c.key);
  }
  return seen.size;
}

/**
 * Acceptance criterion: every classification is legible without colour.
 *
 * A glyph, a label and a usable `means` sentence are what make the dashboard survive a
 * greyscale print and a colourblind reader. The `means` floor is set where a sentence stops
 * being a restatement of the label and starts telling a reader something.
 */
export function assertEveryClassificationIsLegibleWithoutColour(): void {
  for (const c of CLASSIFICATIONS) {
    if (!c.glyph.trim()) throw new Error(`classification ${c.key} has no glyph`);
    if (!c.label.trim()) throw new Error(`classification ${c.key} has no label`);
    if (!c.means || c.means.trim().length < 30) {
      throw new Error(`classification ${c.key} has no usable "means" sentence`);
    }
  }
}

/**
 * Acceptance criterion: a classification that cannot carry a number never ships one.
 *
 * This is the registry half of the promise `assertNoCardShowsAnUnmeasuredValue` makes for
 * the cards. The producer half is enforced in `revenueFlowService`, against this flag, so
 * the two cannot drift: `bid_flagged` says it carries no value here, and an event claiming
 * otherwise is rejected there rather than rendered.
 */
export function assertValueCarryingIsDeclaredHonestly(): void {
  const mustNotCarry = ['bid_flagged', 'proposal_document', 'comped', 'bid_no_bid'];
  for (const key of mustNotCarry) {
    const def = classificationFor(key);
    if (def.carriesValue) {
      throw new Error(
        `classification ${key} is marked as carrying a value, but production holds no `
        + 'number for it. A dashboard that prints one would be inventing it.',
      );
    }
  }
}
