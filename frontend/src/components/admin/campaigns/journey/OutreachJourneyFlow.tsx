/**
 * Outreach Journey Flow — the campaign-intelligence visualisation.
 *
 * Replaces the force-directed Campaign Intelligence Graph. The force graph answered
 * "what connects to what"; the question this screen is actually asked is "where did
 * these leads come from, where did they stop, and what converted" — a question
 * about volume along a path, which is what a Sankey answers by construction.
 *
 * ORCHESTRATION ONLY. This file owns fetching and state. Every number it displays
 * is computed by the pure modules beside it, and every pixel is drawn by the
 * presentational components beside it. That separation is what makes the KPI strip,
 * the diagram, the table and the insight rail provably consistent: they are four
 * renderings of one view model, not four independent readings of the data.
 *
 * PRESERVED FROM THE GRAPH IT REPLACES: the time-window filter, node drill-down
 * with its detail panel, progressive cohort slicing, edge drill-down to real lead
 * records, and the validation/warning payload. Added: brand filtering, a KPI strip,
 * a derived insight rail, and a table that is the diagram's equal.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getCampaignGraph,
  getCampaignGraphSlice,
  type CampaignGraphData,
  type SliceContext,
} from '../../../../services/intelligenceApi';
import CampaignNodeDetailsPanel from '../../intelligence/CampaignNodeDetailsPanel';
import { SectionCard } from '../../shell';
import {
  buildPathRows,
  buildSankeyView,
  type JourneyView,
  STAGE_ORDER,
} from './campaignSankeyAdapter';
import JourneyControls, { ALL_BRANDS } from './JourneyControls';
import JourneyEdgeUsersPanel from './JourneyEdgeUsersPanel';
import JourneyInsightRail from './JourneyInsightRail';
import JourneyKpiStrip from './JourneyKpiStrip';
import JourneyPathTable from './JourneyPathTable';
import JourneySankeyChart, { type JourneySelection } from './JourneySankeyChart';
import { stageColor, useIsDark, usePrefersReducedMotion } from './journeyPalette';
import { buildKpis, deriveInsights } from './journeyMetrics';

interface Props {
  /** Chart height in px. The page gives this component a fixed viewport slot. */
  height?: number;
}

export default function OutreachJourneyFlow({ height = 520 }: Props): React.ReactElement {
  const [data, setData] = useState<CampaignGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [timeWindow, setTimeWindow] = useState('all');
  const [brandId, setBrandId] = useState<string>(ALL_BRANDS);
  const [journeyView, setJourneyView] = useState<JourneyView>('campaign');
  const [display, setDisplay] = useState<'flow' | 'table'>('flow');
  const [selection, setSelection] = useState<JourneySelection | null>(null);

  // Cohort slicing, carried over from the graph this replaces.
  const [sliceData, setSliceData] = useState<CampaignGraphData | null>(null);
  const [sliceContext, setSliceContext] = useState<SliceContext | null>(null);
  const [sliceStack, setSliceStack] = useState<string[]>([]);
  const [sliceLoading, setSliceLoading] = useState(false);
  const [sliceError, setSliceError] = useState('');

  const isDark = useIsDark();
  const reducedMotion = usePrefersReducedMotion();

  /**
   * Guards against a slow first request overwriting a faster second one. Changing
   * the brand twice quickly would otherwise leave the chart showing the first
   * brand while the selector reads the second.
   */
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError('');
    try {
      const res = await getCampaignGraph(
        timeWindow,
        false,
        brandId === ALL_BRANDS ? undefined : brandId,
      );
      if (seq !== requestSeq.current) return;
      setData(res.data);
    } catch (err: any) {
      if (seq !== requestSeq.current) return;
      setError(
        err?.response?.data?.error ||
          'Could not load the outreach journey. This is a failed request, not an empty funnel.',
      );
      setData(null);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [timeWindow, brandId]);

  useEffect(() => {
    load();
  }, [load]);

  // A new filter invalidates any cohort drill-down taken under the old one.
  useEffect(() => {
    setSliceData(null);
    setSliceContext(null);
    setSliceStack([]);
    setSliceError('');
    setSelection(null);
  }, [timeWindow, brandId]);

  /** The payload every surface reads. A slice, when one is active, otherwise the graph. */
  const active = sliceData ?? data;

  const view = useMemo(
    () => buildSankeyView(active, { journeyView, maxCampaigns: 8 }),
    [active, journeyView],
  );
  const rows = useMemo(() => buildPathRows(view), [view]);
  const kpis = useMemo(() => buildKpis(active), [active]);
  const insights = useMemo(() => deriveInsights(active, view), [active, view]);

  // Options always come from the unfiltered response, so choosing a brand never
  // removes the other brands from the selector.
  const brands = data?.brands ?? [];

  const selectedNode = useMemo(() => {
    if (selection?.kind !== 'node' || !selection.nodeId) return null;
    return active?.nodes.find((n) => n.id === selection.nodeId) ?? null;
  }, [selection, active]);

  const selectedLink = useMemo(() => {
    if (selection?.kind !== 'link') return null;
    return view.links.find((l) => l.fromId === selection.from && l.toId === selection.to) ?? null;
  }, [selection, view]);

  const handleSlice = useCallback(
    async (nodeId: string) => {
      const stack = [...sliceStack, nodeId];
      setSliceLoading(true);
      setSliceError('');
      try {
        const res = await getCampaignGraphSlice(stack);
        setSliceData(res.data);
        setSliceContext(res.data.sliceContext);
        setSliceStack(stack);
      } catch (err: any) {
        setSliceError(
          err?.response?.data?.error || 'No leads match that combination, so there is nothing to slice.',
        );
      } finally {
        setSliceLoading(false);
      }
    },
    [sliceStack],
  );

  const resetAll = useCallback(() => {
    setTimeWindow('all');
    setBrandId(ALL_BRANDS);
    setJourneyView('campaign');
    setSelection(null);
    setSliceData(null);
    setSliceContext(null);
    setSliceStack([]);
    setSliceError('');
  }, []);

  const filtersActive =
    timeWindow !== 'all' ||
    brandId !== ALL_BRANDS ||
    journeyView !== 'campaign' ||
    selection !== null ||
    sliceStack.length > 0;

  // Escape closes the open drill-down, which is the shortcut a keyboard user
  // reaches for first and the reason selection is dismissible without a mouse.
  useEffect(() => {
    if (!selection) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelection(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection]);

  const brandLabel =
    brandId === ALL_BRANDS
      ? null
      : brands.find((b) => b.brand_id === brandId)?.brand_name ?? brandId;

  const hasChart = view.nodes.length > 0 && view.links.length > 0;

  return (
    <SectionCard
      title="Outreach Journey Flow"
      icon="flow-chart"
      actions={
        <JourneyControls
          timeWindow={timeWindow}
          onTimeWindow={setTimeWindow}
          brandId={brandId}
          brands={brands}
          onBrand={setBrandId}
          journeyView={journeyView}
          onJourneyView={setJourneyView}
          display={display}
          onDisplay={setDisplay}
          onReset={resetAll}
          filtersActive={filtersActive}
          disabled={loading}
        />
      }
    >
      <p className="text-muted small mb-3">
        Follow every lead from its origin to enrollment and revenue. Select any stream to
        inspect the people behind it.
      </p>

      {(brandLabel || sliceContext) && (
        <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
          {brandLabel && (
            <span className="badge bg-secondary-subtle text-secondary-emphasis">
              Brand: {brandLabel}
            </span>
          )}
          {sliceContext && (
            <span className="badge bg-secondary-subtle text-secondary-emphasis">
              Cohort: {sliceContext.nodeLabel} · {sliceContext.cohortSize.toLocaleString()} of{' '}
              {sliceContext.totalLeads.toLocaleString()} leads
            </span>
          )}
        </div>
      )}

      {sliceError && <div className="alert alert-warning small">{sliceError}</div>}

      <JourneyKpiStrip kpis={kpis} isDark={isDark} loading={loading} />

      {loading && (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading the outreach journey…</span>
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="alert alert-danger" role="alert">
          <div className="fw-semibold">The journey could not be loaded.</div>
          <div className="small">{error}</div>
          <button type="button" className="btn btn-sm btn-outline-danger mt-2" onClick={load}>
            Try again
          </button>
        </div>
      )}

      {!loading && !error && !hasChart && (
        <div className="text-center text-muted py-5">
          <div className="fw-semibold">No lead journeys in this view.</div>
          <div className="small">
            {brandLabel
              ? `No lead has entered a ${brandLabel} campaign in this time window.`
              : 'No lead has moved between stages in this time window.'}
          </div>
        </div>
      )}

      {!loading && !error && hasChart && (
        <div className="row g-3">
          <div className="col-12 col-xl-8">
            <div className="d-flex gap-3 flex-wrap mb-2 small text-muted align-items-center">
              {STAGE_ORDER.map((s, i) => (
                <React.Fragment key={s.key}>
                  {i > 0 && <span aria-hidden="true">→</span>}
                  <span className="d-inline-flex align-items-center gap-1">
                    <span
                      aria-hidden="true"
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: '50%',
                        background: stageColor(s.key, isDark),
                        display: 'inline-block',
                      }}
                    />
                    {s.label}
                  </span>
                </React.Fragment>
              ))}
              <span className="ms-auto">
                {view.totalLinkVolume.toLocaleString()} lead movements
              </span>
            </div>

            {display === 'flow' ? (
              <JourneySankeyChart
                view={view}
                isDark={isDark}
                reducedMotion={reducedMotion}
                selection={selection}
                onSelect={setSelection}
                height={height}
              />
            ) : (
              <JourneyPathTable
                rows={rows}
                selection={selection}
                onSelect={setSelection}
                totalVolume={view.totalLinkVolume}
              />
            )}

            {view.collapsedCampaigns > 0 && (
              <p className="text-muted small mt-2 mb-0">
                {view.collapsedCampaigns} smaller campaigns are grouped so labels stay readable.
                Their volumes are summed into the grouped node, so column totals are unchanged.
              </p>
            )}
          </div>

          <div className="col-12 col-xl-4">
            {selection && (selectedNode || selectedLink) ? (
              <div
                className="border rounded"
                style={{ height: height + 40, background: 'var(--surface-raised, #fff)' }}
              >
                {selectedNode ? (
                  <CampaignNodeDetailsPanel
                    node={selectedNode}
                    edges={active?.edges ?? []}
                    allNodes={active?.nodes ?? []}
                    onClose={() => setSelection(null)}
                    onSlice={handleSlice}
                    sliceContext={sliceContext}
                    sliceLoading={sliceLoading}
                    sliceStack={sliceStack}
                  />
                ) : (
                  selectedLink && (
                    <JourneyEdgeUsersPanel
                      from={selectedLink.fromId}
                      to={selectedLink.toId}
                      fromLabel={selectedLink.fromName}
                      toLabel={selectedLink.toName}
                      onClose={() => setSelection(null)}
                    />
                  )
                )}
              </div>
            ) : (
              <JourneyInsightRail
                insights={insights}
                loading={loading}
                onFocus={(nodeId) => setSelection({ kind: 'node', nodeId })}
              />
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
