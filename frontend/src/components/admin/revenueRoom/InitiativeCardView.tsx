import React from 'react';
import { Link } from 'react-router-dom';
import { STATUS, StatusChip } from '../commercialization/statusVocabulary';
import type { TileStatus } from '../commercialization/statusVocabulary';

/**
 * One card on the Revenue Room board, and the rule that a card shows a number only if a
 * number was measured.
 *
 * ── WHY THIS IS NOT IN `AdminRevenueRoomPage` ANY MORE ───────────────────────────────────
 *
 * It was, until R25 Phase 2. Giving the page a brand filter — which scopes the flow board
 * above and these cards below from one piece of state — carried that file to 609 lines, past
 * the repo's 500-line hard ceiling, and CLAUDE.md requires the split BEFORE the new code
 * rather than after it.
 *
 * The seam is the obvious one rather than a convenient one: everything here is about
 * rendering ONE card and knows nothing about fetching, filtering or page layout, and the page
 * is now fetch, filter state and composition. The render output is unchanged by the move.
 *
 * `InitiativeCardView` and `tileAsCard` are still re-exported from the page, because the
 * page is the module their tests and the structural `oneDoorIntoRevenue` guard address, and
 * a move is not a reason to break either.
 */
/**
 * `commercial_proof` is R13: the ten tiles that used to live on their own page at
 * /admin/commercialization. Ali, 11 Nov 2026: "I do not understand the difference between
 * the two. I only need one, and it goes to drill downs into how that revenue flows."
 *
 * They are a kind rather than a separate board because the two pages were already the same
 * page twice. Both read the same `statusVocabulary`, both enforce the same rule that a card
 * shows a number only if a number was measured, and both order by status. What differed was
 * the rows and the reader, which is a difference in content rather than in kind.
 */
export type InitiativeKind = 'hypothesis' | 'gov_pipeline' | 'membership' | 'commercial_proof';

export type HypothesisVerdict =
  | 'confirmed' | 'in_flight' | 'no_evidence' | 'past_deadline' | 'uncountable';

export interface InitiativeCard {
  key: string;
  label: string;
  kind: InitiativeKind;
  /**
   * Which brand's business this card reports on. R25 Phase 2.
   *
   * A slug the backend declares beside each card definition, never derived here. The five
   * revenue bets carry `'unassigned'` to match the flow board's `hypotheses` stream, which
   * Ali also left unassigned: the same bet appearing under a brand heading above the fold and
   * under "No brand yet" below it would be worse than either answer.
   */
  brandKey: string;
  status: TileStatus;
  value: string | null;
  sourceTable: string | null;
  provenance: string;
  /**
   * Required of a revenue initiative, because R1's rule is that no initiative is unowned.
   * Absent on a commercial-proof card: the Commercialization board never recorded owners,
   * and inventing one here would be a claim about a person rather than a gap in the data.
   * That gap is stated once on the page rather than ten times on the cards.
   */
  owner?: string;
  unlockedBy?: string;
  caveat?: string;
  verdict?: HypothesisVerdict;
  nextDeadline: string | null;
  nextDeadlineMeans: string | null;
  lastActivity: string | null;
  /**
   * Absent on a commercial-proof card. Those came from the Commercialization board, which
   * never had a drill-down, and a link that looked clickable and went nowhere would be
   * worse than no link — the same reasoning R1 used before R4 built the timeline.
   */
  drillDownKey?: string;
  /**
   * "Not this" — the table or metric a reader is most likely to mistake for this one.
   * Carried over from the Commercialization tiles, where it exists so a rejected source is
   * not rediscovered and quietly adopted by the next person who looks.
   */
  falseFriend?: string;
}

/**
 * The verdict vocabulary, in words rather than color alone for the same reason the status
 * chips are. `uncountable` is deliberately phrased as an admission rather than a neutral
 * label: a reader skimming five bets must not read it as "fine".
 */
const VERDICT: Record<HypothesisVerdict, { label: string; color: string }> = {
  confirmed: { label: 'Evidence exists', color: 'var(--status-success)' },
  in_flight: { label: 'In flight', color: 'var(--status-info)' },
  no_evidence: { label: 'Pipe is empty', color: 'var(--status-warning)' },
  past_deadline: { label: 'Past deadline', color: 'var(--status-danger)' },
  uncountable: { label: 'Cannot be measured yet', color: 'var(--text-muted)' },
};

const KIND_LABEL: Record<InitiativeKind, string> = {
  membership: 'Recurring revenue',
  gov_pipeline: 'Government pipeline',
  hypothesis: 'Revenue bet',
  commercial_proof: 'Business proof',
};

/** A date, or an explicit statement that nothing records one. Never a bare dash. */
function DeadlineLine({ card }: { card: InitiativeCard }) {
  if (!card.nextDeadline) {
    return (
      <span className="small" style={{ color: 'var(--text-muted)' }}>
        <i className="ri-calendar-line" aria-hidden="true" /> No deadline is recorded for this
        anywhere in the system.
      </span>
    );
  }
  return (
    <span className="small" style={{ color: 'var(--text-secondary)' }}>
      <i className="ri-calendar-line" aria-hidden="true" /> <strong>{card.nextDeadline}</strong>
      {card.nextDeadlineMeans ? ` — ${card.nextDeadlineMeans}` : ''}
    </span>
  );
}

/**
 * Exported so the "no number unless measured" rule can be tested against fixtures.
 * `renderToStaticMarkup` never runs effects, so the page's own loading shell cannot
 * exercise a populated card — the invariant has to be reachable directly or it is only
 * asserted by reading the source.
 */
export function InitiativeCardView({
  card, brandLabel = null,
}: {
  card: InitiativeCard;
  /**
   * The brand's own name, resolved from the `brands` table by the flow board and passed down.
   *
   * Null when the name could not be resolved, and then NOTHING is drawn rather than the raw
   * slug. "colaberry-enterprise" on a card is not a brand name, and printing it would invite
   * a reader to quote it as one.
   */
  brandLabel?: string | null;
}) {
  const s = STATUS[card.status];
  // The invariant, enforced at render rather than trusted: no number unless measured.
  const showNumber = s.showsNumber && card.value !== null;
  const verdict = card.verdict ? VERDICT[card.verdict] : null;

  return (
    <div
      className="h-100 p-3 rounded border d-flex flex-column gap-2"
      style={{ background: 'var(--surface-card)', borderColor: 'var(--border-subtle)' }}
      data-testid={`initiative-${card.key}`}
      data-status={card.status}
      data-has-number={showNumber ? 'yes' : 'no'}
    >
      <div className="d-flex justify-content-between align-items-start gap-2">
        <div className="d-flex flex-column">
          <span className="fw-semibold" style={{ color: 'var(--text-primary)' }}>
            {card.label}
          </span>
          <span className="small" style={{ color: 'var(--text-muted)' }}>
            {KIND_LABEL[card.kind]}
            {/*
              The brand reads beside the kind rather than as a coloured chip. The page already
              spends colour on status and verdict, which answer "can I trust this number" and
              "is this bet alive"; a third colour would compete with both and brand is not a
              health signal.
            */}
            {brandLabel && (
              <>
                {' · '}
                <span data-testid={`brand-of-${card.key}`}>{brandLabel}</span>
              </>
            )}
          </span>
        </div>
        <StatusChip status={card.status} />
      </div>

      {showNumber ? (
        <div
          className="fw-bold"
          style={{ fontSize: '1.75rem', lineHeight: 1.1, color: s.color }}
          data-testid={`value-${card.key}`}
        >
          {card.value}
        </div>
      ) : (
        <div className="small fst-italic" style={{ color: 'var(--text-muted)' }}>
          {/*
            An undefined rate gets its own sentence. "None can be measured" would be wrong
            here: the measurement ran and the denominator was empty, which is a different
            fact from an unrecorded metric and leads to a different decision.
          */}
          {card.status === 'undefined_rate'
            ? 'No closed deals either way, so there is no rate to report.'
            : 'No number is shown because none can be measured.'}
        </div>
      )}

      {verdict && (
        <span
          className="small fw-semibold"
          style={{ color: verdict.color }}
          data-testid={`verdict-${card.key}`}
        >
          {verdict.label}
        </span>
      )}

      <p className="small mb-0" style={{ color: 'var(--text-secondary)' }}>{card.provenance}</p>

      {card.caveat && (
        <p className="small mb-0 fw-medium" style={{ color: 'var(--status-warning)' }}>
          {card.caveat}
        </p>
      )}

      {card.falseFriend && (
        <p className="small mb-0" style={{ color: 'var(--text-muted)' }}>
          <strong>Not this:</strong> {card.falseFriend}
        </p>
      )}

      {/*
        A deadline is only a meaningful property of a revenue initiative. Printing "no
        deadline is recorded" on a business-proof card would imply one ought to exist and
        is missing, when in truth a metric like pipeline value simply has no deadline.
        Stating an absence is honest; implying a gap that is not there is not.
      */}
      {card.kind !== 'commercial_proof' && <DeadlineLine card={card} />}

      <div className="mt-auto pt-1 d-flex flex-column gap-1">
        {card.sourceTable && (
          <code className="small" style={{ color: 'var(--text-muted)' }}>{card.sourceTable}</code>
        )}
        {card.owner && (
          <span className="small" style={{ color: 'var(--text-muted)' }}>
            <i className="ri-user-line" aria-hidden="true" /> {card.owner}
          </span>
        )}
        {card.unlockedBy && (
          <span className="small" style={{ color: 'var(--text-muted)' }}>
            <i className="ri-key-2-line" aria-hidden="true" /> {card.unlockedBy}
          </span>
        )}
        {card.drillDownKey && (
          <Link
            to={`/admin/revenue-room/${card.drillDownKey}`}
            className="small text-decoration-none"
            data-testid={`drill-${card.key}`}
          >
            Open the full history <i className="ri-arrow-right-line" aria-hidden="true" />
          </Link>
        )}
      </div>
    </div>
  );
}

/** One tile of the former Commercialization board, as that endpoint still returns it. */
export interface CommercialTile {
  key: string;
  label: string;
  /** Declared by the backend beside the tile. See `InitiativeCard.brandKey`. */
  brandKey: string;
  status: TileStatus;
  value: string | null;
  sourceTable: string | null;
  provenance: string;
  falseFriend?: string;
  unlockedBy?: string;
  caveat?: string;
}

/**
 * A commercialization tile, as a card on this board. R13.
 *
 * Exported so the round trip is testable: everything the tile carried has to survive, and
 * the easiest way to break this merge is to drop `falseFriend` and quietly re-admit a
 * source someone already rejected.
 *
 * The key is namespaced. Tile keys and initiative keys are two vocabularies that have never
 * had to be unique against each other, and React would silently render only one of a
 * duplicate pair.
 */
export function tileAsCard(tile: CommercialTile): InitiativeCard {
  return {
    key: `proof_${tile.key}`,
    label: tile.label,
    kind: 'commercial_proof',
    // Carried over rather than re-decided. The easiest way to break this merge is to drop a
    // field here, and dropping the brand would make a tile match no brand and vanish from
    // every filtered view of the Revenue Room.
    brandKey: tile.brandKey,
    status: tile.status,
    value: tile.value,
    sourceTable: tile.sourceTable,
    provenance: tile.provenance,
    caveat: tile.caveat,
    falseFriend: tile.falseFriend,
    unlockedBy: tile.unlockedBy,
    // Not invented: the Commercialization board recorded none of these.
    nextDeadline: null,
    nextDeadlineMeans: null,
    lastActivity: null,
  };
}

