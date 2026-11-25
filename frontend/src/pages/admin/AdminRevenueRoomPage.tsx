import React, { useEffect, useState } from 'react';
import api from '../../utils/api';
import RevenueFlowDashboard from '../../components/admin/revenueFlow/RevenueFlowDashboard';
import type { BrandGroup } from '../../components/admin/revenueFlow/flowBoardTypes';
import { PageHeader, SectionCard } from '../../components/admin/shell';
// C8.6 — hypothesis health. It came across with the Commercialization tiles in R13.
import HypothesisHealthPanel from '../../components/admin/commercialization/HypothesisHealthPanel';
import ChannelTruthPanel from '../../components/admin/revenueRoom/ChannelTruthPanel';
import { InitiativeCardView, tileAsCard } from '../../components/admin/revenueRoom/InitiativeCardView';
import type {
  CommercialTile, InitiativeCard,
} from '../../components/admin/revenueRoom/InitiativeCardView';
import {
  ORDER,
  StatusChip,
} from '../../components/admin/commercialization/statusVocabulary';
import type { TileStatus } from '../../components/admin/commercialization/statusVocabulary';
import type { TrustSignal } from '../../components/admin/shell';

/**
 * Re-exported, so the card view and its types are still reachable from the page module.
 *
 * R25 Phase 2 moved them into their own file when this one crossed the 500-line ceiling.
 * `AdminRevenueRoomPage.test.tsx` addresses them here and the structural `oneDoorIntoRevenue`
 * guard reads this file for them, and a move is not a reason to break either.
 */
export { InitiativeCardView, tileAsCard } from '../../components/admin/revenueRoom/InitiativeCardView';
export type {
  CommercialTile, HypothesisVerdict, InitiativeCard, InitiativeKind,
} from '../../components/admin/revenueRoom/InitiativeCardView';

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


interface Board {
  asOf: string;
  cards: InitiativeCard[];
  summary: Partial<Record<TileStatus, number>>;
  caveats: string[];
}


export default function AdminRevenueRoomPage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [tiles, setTiles] = useState<CommercialTile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tileError, setTileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * The brand the WHOLE tab is scoped to, '' for all brands. R25 Phase 2.
   *
   * Ali, 2026-11-24: "Everything in the revenue tab should be broken down by brand."
   *
   * It lives here, above both halves of the page, because the flow board and these cards are
   * fetched by different components from different endpoints. Held lower down, the page could
   * sit with the dashboard scoped to Refactored.ai while seventeen Colaberry Enterprise cards
   * carried on rendering underneath it, and nothing on screen would admit it.
   */
  const [brandFilter, setBrandFilter] = useState('');
  /** Raised by the flow board, which is the only component that reads the `brands` table. */
  const [brands, setBrands] = useState<BrandGroup[]>([]);

  useEffect(() => {
    let alive = true;
    // Two reads, settled independently and deliberately. Before R13 these were two pages,
    // so one being down took only itself out. Chaining them now would mean a failure in
    // either board blanked the other, which would be a regression dressed up as a merge.
    Promise.allSettled([
      api.get('/api/admin/commercialization/revenue-room'),
      api.get('/api/admin/commercialization/board'),
    ]).then(([room, proof]) => {
      if (!alive) return;
      if (room.status === 'fulfilled') {
        setBoard(room.value.data?.data ?? null);
      } else {
        const e = room.reason as { response?: { data?: { error?: string } } };
        setError(e?.response?.data?.error || 'Could not load the Revenue Room.');
      }
      if (proof.status === 'fulfilled') {
        setTiles(proof.value.data?.data?.tiles ?? []);
      } else {
        setTileError('The business-proof cards could not be loaded, so they are missing '
          + 'from this board rather than showing as zero.');
      }
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

  // One board now, so the cards are one list. The server's `summary` counts only the
  // Revenue Room's own rows, so the totals are recounted here over everything rendered
  // rather than reported from a figure that no longer describes the page.
  const allCards: InitiativeCard[] = [
    ...(board?.cards ?? []),
    ...(tiles ?? []).map(tileAsCard),
  ];

  /** A brand's own name, or null when it could not be resolved. Never the raw slug. */
  const brandLabelFor = (key: string): string | null =>
    brands.find((b) => b.key === key)?.label ?? null;

  // R25 Phase 2. The brand filter scopes these cards exactly as it scopes the board above.
  const visibleCards = brandFilter
    ? allCards.filter((c) => c.brandKey === brandFilter)
    : allCards;
  const hiddenByBrand = allCards.length - visibleCards.length;

  /**
   * Counted over the cards actually ON SCREEN, not over every card fetched.
   *
   * This matters more than it looks. The headline sentence reads "N of M cards carry a
   * measured number", and that claim is about what the reader can see. Counting all seventeen
   * while showing three would put a sentence about the whole business above a view of one
   * brand, which is the same class of error as leaving the top tiles unfiltered.
   */
  const counts = visibleCards.reduce<Partial<Record<TileStatus, number>>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});
  const measured = counts.live ?? 0;
  const total = visibleCards.length;
  const proofCount = visibleCards.filter((c) => c.kind === 'commercial_proof').length;
  const anything = board !== null || (tiles !== null && tiles.length > 0);

  /**
   * Which single-brand panels survive the filter.
   *
   * Declared rather than inferred: each of the two panels below reports on one brand's
   * business and nothing else, so each has to name which. The alternative — leaving them
   * always visible — would put one brand's data under another brand's heading, which is the
   * exact failure the top tiles were fixed for.
   */
  const SINGLE_BRAND_PANELS = [
    { id: 'channelTruth', title: 'Which channels produced paying members', brandKey: 'colaberry-training' },
    { id: 'hypothesisHealth', title: 'Revenue bet health', brandKey: 'unassigned' },
  ] as const;

  const panelInScope = (key: string) => !brandFilter || brandFilter === key;
  const panelsInScope = {
    channelTruth: panelInScope('colaberry-training'),
    hypothesisHealth: panelInScope('unassigned'),
  };
  const hiddenPanels = SINGLE_BRAND_PANELS
    .filter((p) => !panelInScope(p.brandKey))
    .map((p) => ({ title: p.title, brandName: brandLabelFor(p.brandKey) ?? 'another brand' }));

  return (
    <div data-testid="revenue-room">
      <PageHeader
        title="The Revenue Room"
        subtitle="Every source of revenue we have or are chasing, what the business can prove about itself, and how much of each we can actually measure"
        icon="money-dollar-circle-line"
        breadcrumb={[{ label: 'Admin', to: '/admin' }, { label: 'Revenue Room' }]}
        trust={trust}
      />

      {loading && <p className="text-muted">Loading the Revenue Room…</p>}

      {error && (
        <div className="alert alert-danger" role="alert" data-testid="room-error">{error}</div>
      )}

      {/* R16 - the dashboard Ali asked for, at the TOP of this page. It fetches its own
          board, so a failure there costs this section and not the cards below. */}
      <RevenueFlowDashboard
        brandFilter={brandFilter}
        onPickBrand={setBrandFilter}
        onBrandsLoaded={setBrands}
      />

      {tileError && (
        <div className="alert alert-warning" role="alert" data-testid="proof-error">{tileError}</div>
      )}

      {anything && (
        <>
          <SectionCard title="How to read this page">
            {/*
              Named BEFORE the count, because the count that follows is a claim about what is
              on screen and a reader who meets the number first will read it as a claim about
              the whole business.
            */}
            {brandFilter !== '' && (
              <p className="mb-2" data-testid="card-scope">
                Showing <strong>{brandLabelFor(brandFilter) ?? 'one brand'}</strong> only.
                Every count on this page describes that brand alone.
              </p>
            )}
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
            {proofCount > 0 && (
              <p className="small text-muted mb-0 mt-2" data-testid="proof-note">
                <strong>{proofCount} of these are business-proof cards</strong>, which until
                today were a separate Commercialization page. They answer whether there is a
                business at all rather than where a particular pound came from, they have no
                drill-down because that board never had one, and <strong>none of them records
                an owner</strong> — which is a gap worth closing rather than one worth hiding.
              </p>
            )}
          </SectionCard>

          {board && board.caveats.length > 0 && (
            <SectionCard title="What this page could not see">
              <ul className="mb-0 small" data-testid="room-caveats">
                {board.caveats.map((c) => <li key={c}>{c}</li>)}
              </ul>
            </SectionCard>
          )}

          {/*
            Ordered by STATUS, not by brand, even while a brand filter is active. The status
            order is the page's own finding — measured first, unmeasurable last — and nesting
            brand headings inside it would impose a second grouping on a seventeen-card grid
            and bury the one that answers "can I trust this number". The brand filter narrows
            which cards appear; it does not re-sort them.
          */}
          <div className="row g-3 mt-1">
            {ORDER.flatMap((s) => visibleCards.filter((c) => c.status === s)).map((c) => (
              <div className="col-12 col-md-6 col-xl-4" key={c.key}>
                <InitiativeCardView card={c} brandLabel={brandLabelFor(c.brandKey)} />
              </div>
            ))}
          </div>

          {/*
            A filter that removed cards says how many and offers the way back. Silence here
            would let a reader scroll a short page and conclude the business has three
            initiatives.
          */}
          {hiddenByBrand > 0 && (
            <p className="small text-muted mt-3 mb-0" data-testid="cards-hidden-by-brand">
              <strong>
                {hiddenByBrand === 1
                  ? '1 more card belongs to another brand'
                  : `${hiddenByBrand} more cards belong to other brands`}
              </strong>
              {' and is not shown while '}
              {brandLabelFor(brandFilter) ?? 'this brand'}
              {' is selected. '}
              <button
                type="button"
                className="btn btn-link btn-sm p-0 align-baseline"
                onClick={() => setBrandFilter('')}
                data-testid="clear-brand-filter"
              >
                Show every brand
              </button>
            </p>
          )}

          {/*
            Nothing under this brand, said in words. An empty grid would read as a page that
            failed to load, and a zero count would read as a brand measured at nothing.
          */}
          {brandFilter !== '' && visibleCards.length === 0 && (
            <p className="small mt-3 mb-0" data-testid="no-cards-for-brand">
              No initiative or business-proof card is filed under
              {` ${brandLabelFor(brandFilter) ?? 'this brand'}`}. That is not a measurement of
              zero: these cards were written before the brand breakdown existed, and none of
              them has been assigned to this brand yet.
            </p>
          )}

          {/* ── THE TWO PANELS BELOW EACH DESCRIBE EXACTLY ONE BRAND ────────────────────
              R25 Phase 2. Neither is a cross-brand view, so neither may stay on screen while
              a different brand is selected:

                - Channel truth answers which channels produced the members who PAY. Those
                  members are the training business, so it is Colaberry Training's panel.
                - Hypothesis health grades the five revenue bets, which are unassigned for the
                  same reason the flow board's `hypotheses` stream is.

              Left unscoped, filtering to Refactored.ai would leave Colaberry Training's
              channel breakdown sitting under a Refactored.ai heading — the same error as
              leaving the top tiles unfiltered, further down the page where it is harder to
              catch. A hidden panel is named rather than silently dropped. */}
          {panelsInScope.channelTruth && <ChannelTruthPanel />}
          {panelsInScope.hypothesisHealth && <HypothesisHealthPanel />}

          {hiddenPanels.length > 0 && (
            <p className="small text-muted mt-3 mb-0" data-testid="panels-hidden-by-brand">
              {hiddenPanels.length === 1
                ? `Also hidden while this brand is selected: ${hiddenPanels[0].title}, which `
                  + `reports on ${hiddenPanels[0].brandName}.`
                : `Also hidden while this brand is selected: ${hiddenPanels.map((p) => p.title).join(' and ')}. `
                  + 'Each reports on a different brand than the one selected.'}
            </p>
          )}
        </>
      )}
    </div>
  );
}
