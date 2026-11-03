import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';
import { PageHeader, SectionCard } from '../../components/admin/shell';
import {
  ORDER,
  STATUS,
  StatusChip,
} from '../../components/admin/commercialization/statusVocabulary';
import type { TileStatus } from '../../components/admin/commercialization/statusVocabulary';
import type { TrustSignal } from '../../components/admin/shell';

/**
 * The Revenue Room (/admin/revenue-room) — R1, read-only.
 *
 * WHO THIS IS FOR. Ram, so that he can see every source of revenue Colaberry has or is
 * chasing without asking Ali a hundred questions. That requirement is the reason the
 * page is built the way it is: a reader who does not already know which parts are real
 * must be able to tell from the page itself.
 *
 * SO THE SAME RULE AS THE COMMERCIALIZATION BOARD APPLIES, and the same vocabulary
 * carries it: A CARD SHOWS A NUMBER ONLY IF A NUMBER WAS MEASURED. The five states come
 * from the shared `statusVocabulary` module rather than a private copy, so the two
 * boards cannot teach a reader two different meanings for "proxy".
 *
 * WHY HEALTH AND MEASURABILITY ARE TWO CHIPS, NOT ONE. A revenue bet has two independent
 * properties: whether the funnel can count it, and whether it is still alive. "Measured
 * zero" and "the pipe is empty, kill it in November" are different facts, and a single
 * chip would silently pick one. The status chip answers "can I trust this number?"; the
 * verdict chip answers "is this bet alive?".
 *
 * WHAT IS DELIBERATELY NOT HERE YET. The drill-down. Every card carries its
 * `drillDownKey` and is rendered as a link so the shell is navigable, but R4 builds the
 * timeline and documents behind it. A card that looked clickable and went nowhere would
 * be worse than one that says where it is going.
 */

export type InitiativeKind = 'hypothesis' | 'gov_pipeline' | 'membership';

export type HypothesisVerdict =
  | 'confirmed' | 'in_flight' | 'no_evidence' | 'past_deadline' | 'uncountable';

export interface InitiativeCard {
  key: string;
  label: string;
  kind: InitiativeKind;
  status: TileStatus;
  value: string | null;
  sourceTable: string | null;
  provenance: string;
  owner: string;
  unlockedBy?: string;
  caveat?: string;
  verdict?: HypothesisVerdict;
  nextDeadline: string | null;
  nextDeadlineMeans: string | null;
  lastActivity: string | null;
  drillDownKey: string;
}

interface Board {
  asOf: string;
  cards: InitiativeCard[];
  summary: Partial<Record<TileStatus, number>>;
  caveats: string[];
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
export function InitiativeCardView({ card }: { card: InitiativeCard }) {
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
          No number is shown because none can be measured.
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

      <DeadlineLine card={card} />

      <div className="mt-auto pt-1 d-flex flex-column gap-1">
        {card.sourceTable && (
          <code className="small" style={{ color: 'var(--text-muted)' }}>{card.sourceTable}</code>
        )}
        <span className="small" style={{ color: 'var(--text-muted)' }}>
          <i className="ri-user-line" aria-hidden="true" /> {card.owner}
        </span>
        {card.unlockedBy && (
          <span className="small" style={{ color: 'var(--text-muted)' }}>
            <i className="ri-key-2-line" aria-hidden="true" /> {card.unlockedBy}
          </span>
        )}
        <Link
          to={`/admin/revenue-room/${card.drillDownKey}`}
          className="small text-decoration-none"
          data-testid={`drill-${card.key}`}
        >
          Open the full history <i className="ri-arrow-right-line" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

export default function AdminRevenueRoomPage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.get('/api/admin/commercialization/revenue-room')
      .then((res) => {
        if (!alive) return;
        setBoard(res.data?.data ?? null);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e?.response?.data?.error || 'Could not load the Revenue Room.');
        setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  const trust: TrustSignal = {
    level: 'live',
    source: 'production Postgres',
    updatedAt: board?.asOf ?? null,
    summary: 'Every card states where its number came from, or why it has none. '
      + 'Scheduled reads, so this is current rather than streaming.',
    href: '/admin/trust',
  };

  const counts = board?.summary ?? {};
  const measured = counts.live ?? 0;
  const total = board?.cards.length ?? 0;

  return (
    <div data-testid="revenue-room">
      <PageHeader
        title="The Revenue Room"
        subtitle="Every source of revenue we have or are chasing, and how much of each we can actually prove"
        icon="money-dollar-circle-line"
        breadcrumb={[{ label: 'Admin', to: '/admin' }, { label: 'Revenue Room' }]}
        trust={trust}
      />

      {loading && <p className="text-muted">Loading the Revenue Room…</p>}

      {error && (
        <div className="alert alert-danger" role="alert" data-testid="room-error">{error}</div>
      )}

      {board && (
        <>
          <SectionCard title="How to read this page">
            <p className="mb-2">
              <strong>{measured} of {total} cards carry a measured number.</strong> The rest
              show the reason they are empty. That gap is the finding rather than a defect
              in the page: a card that rendered an unrecorded figure as <code>0</code> would
              invite a decision based on a number nobody measured.
            </p>
            <div className="d-flex flex-wrap gap-2" data-testid="status-summary">
              {ORDER.filter((s) => (counts[s] ?? 0) > 0).map((s) => (
                <span key={s} className="d-inline-flex align-items-center gap-2">
                  <StatusChip status={s} />
                  <span className="small text-muted">{counts[s]}</span>
                </span>
              ))}
            </div>
            <p className="small text-muted mb-0 mt-3">
              Two chips appear on a revenue bet, because it has two independent properties:
              the status chip says whether the number can be trusted, and the verdict says
              whether the bet is still alive. A bet can be measured and dying at once.
            </p>
          </SectionCard>

          {board.caveats.length > 0 && (
            <SectionCard title="What this page could not see">
              <ul className="mb-0 small" data-testid="room-caveats">
                {board.caveats.map((c) => <li key={c}>{c}</li>)}
              </ul>
            </SectionCard>
          )}

          <div className="row g-3 mt-1">
            {ORDER.flatMap((s) => board.cards.filter((c) => c.status === s)).map((c) => (
              <div className="col-12 col-md-6 col-xl-4" key={c.key}>
                <InitiativeCardView card={c} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
