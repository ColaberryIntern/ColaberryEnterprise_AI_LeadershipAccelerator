import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Layer, Rectangle, ResponsiveContainer, Sankey, Tooltip } from 'recharts';
import api from '../../../utils/api';
import { SectionCard } from '../shell';

/**
 * Traffic source -> site entered -> outcome.
 *
 * WHY A SANKEY AND NOT THE FORCE GRAPH IT REPLACES. The previous Navigation Flow
 * was a force-directed page graph, which answers "what connects to what". The
 * question this screen is actually asked is "where does traffic come from, which
 * property does it land on, and what happens to it" — a question about volume
 * along a path. Band width is proportional to sessions, so the answer is read
 * rather than deduced.
 *
 * COLOUR CARRIES THE SOURCE, and nothing else. Categorical hues are assigned in a
 * fixed order and never cycled, so a filter that removes a source does not repaint
 * the survivors. Site and outcome nodes are deliberately neutral: they are already
 * identified by their labels and their column, and colouring them too would imply
 * three unrelated palettes on one picture.
 *
 * PALETTE PROVENANCE. Drawn from the design system's `--chart-*` tokens and
 * VALIDATED rather than assumed — the system's default order fails colourblind
 * separation outright (its green and amber sit at ΔE 1.8 under protanopia, which
 * is indistinguishable), and its brand blue falls under the chroma floor and
 * reads grey. The order below passes lightness, chroma, CVD separation and the
 * normal-vision floor with teal standing in for that blue. Two amber/green steps
 * still sit under 3:1 against the surface, which the validator flags as needing
 * relief: every node is directly labelled and a full table view ships below the
 * chart, which is that relief.
 *
 * DARK MODE uses the system's own dark `--chart-*` steps. They sit outside the
 * validator's lightness band for a dark surface, but pass chroma, CVD and
 * contrast. Re-stepping them here would make this chart disagree with every other
 * chart in the product to fix a band it shares with all of them — a design-system
 * change, not a chart change.
 */

const SOURCE_COLORS_LIGHT = ['#FB2832', '#2BA39A', '#E8920C', '#7A5AF0', '#5BA63C', '#C2185B', '#6B6B6B'];
const SOURCE_COLORS_DARK = ['#FF6B72', '#44C0B6', '#F0A93A', '#9B83F5', '#8AC759', '#E85C92', '#B4B4B4'];

interface SankeyNodeData {
  name: string;
  stage: 'source' | 'site' | 'outcome';
}

interface ChannelKpi {
  channel: string;
  unique_visitors: number;
  sessions: number;
  converted: number;
  conversion_rate: number;
}

interface VisitorKpis {
  days: number;
  unique_visitors: number;
  unique_visitors_7d: number;
  sessions: number;
  new_visitors: number;
  returning_visitors: number;
  new_visitor_rate: number;
  sessions_per_visitor: number;
  bounce_rate: number;
  converted_visitors: number;
  conversion_rate: number;
  engaged_visitors: number;
  shallow_visitors: number;
  engaged_conversion_rate: number;
  by_site: ChannelKpi[];
  by_source: ChannelKpi[];
  source_attribution_pending: boolean;
}

interface SankeyPayload {
  nodes: SankeyNodeData[];
  links: Array<{ source: number; target: number; value: number }>;
  total_sessions: number;
  days: number;
  table: Array<{ source: string; site: string; outcome: string; sessions: number }>;
}

const RANGES = [
  { key: '7', label: '7 days' },
  { key: '30', label: '30 days' },
  { key: '90', label: '90 days' },
];

function useIsDark(): boolean {
  const [dark, setDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark',
  );
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const el = document.documentElement;
    const read = () => setDark(el.getAttribute('data-theme') === 'dark');
    const observer = new MutationObserver(read);
    observer.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
    read();
    return () => observer.disconnect();
  }, []);
  return dark;
}

function VisitorSankeyFlow(): React.ReactElement {
  const [data, setData] = useState<SankeyPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [days, setDays] = useState('30');
  const [showTable, setShowTable] = useState(false);
  const [kpis, setKpis] = useState<VisitorKpis | null>(null);
  const [channelView, setChannelView] = useState<'site' | 'source'>('site');
  const isDark = useIsDark();
  const palette = isDark ? SOURCE_COLORS_DARK : SOURCE_COLORS_LIGHT;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [res, kpiRes] = await Promise.all([
        api.get('/api/admin/visitor-analytics/flow-sankey', { params: { days } }),
        api.get('/api/admin/visitor-analytics/kpis', { params: { days } }).catch(() => null),
      ]);
      setData(res.data);
      if (kpiRes?.data) setKpis(kpiRes.data);
    } catch (err) {
      console.error('Failed to load visitor flow:', err);
      setError('Could not load the traffic flow.');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Colour is keyed to the SITE, by name.
   *
   * Two reasons, both learned from the first attempt rendering entirely grey.
   *
   * BY SITE, because the site is the only entity present in BOTH hops. Colouring
   * by traffic source leaves the second hop with nothing to inherit, and colouring
   * by outcome leaves the first hop with nothing to predict — a source→site band
   * aggregates several outcomes and cannot honestly carry one of their colours.
   * Site is also the thing worth distinguishing: seven properties feed this chart.
   *
   * BY NAME, not index, because recharts hands the link renderer node OBJECTS
   * whose shape varies by version. Indexing off `payload.source.index` silently
   * produced `undefined` for every band, every lookup missed, and the whole
   * diagram fell back to grey — a failure that looked like a design choice rather
   * than a bug. Names are stable across versions and unique within the site column.
   */
  const colorForSite = useMemo(() => {
    const map = new Map<string, string>();
    if (!data) return map;
    let next = 0;
    data.nodes.forEach((n) => {
      if (n.stage === 'site') {
        map.set(n.name, palette[next % palette.length]);
        next += 1;
      }
    });
    return map;
  }, [data, palette]);

  /** Outcome nodes read as a scale, so they take status colours rather than the
   *  categorical ramp — identified is a win, bounced is not, and the colour
   *  should say so without the reader consulting a legend. */
  const outcomeColor = useCallback(
    (name: string): string => {
      const light: Record<string, string> = {
        Identified: '#5BA63C',
        Engaged: '#2BA39A',
        Left: '#8C8C8C',
        Bounced: '#E8920C',
      };
      const dark: Record<string, string> = {
        Identified: '#8AC759',
        Engaged: '#44C0B6',
        Left: '#B4B4B4',
        Bounced: '#F0A93A',
      };
      return (isDark ? dark : light)[name] ?? (isDark ? '#B4B4B4' : '#8C8C8C');
    },
    [isDark],
  );

  /** Resolve whichever end of a link is a site, and colour the band by it. */
  const colorForLinkNames = useCallback(
    (sourceName?: string, targetName?: string): string => {
      if (sourceName && colorForSite.has(sourceName)) return colorForSite.get(sourceName)!;
      if (targetName && colorForSite.has(targetName)) return colorForSite.get(targetName)!;
      return isDark ? '#B4B4B4' : '#8C8C8C';
    },
    [colorForSite, isDark],
  );

  /**
   * The outcome column as shares of total.
   *
   * "Bounced 2,596" is the number the chart already draws; "58.1% bounced" is the
   * number someone can act on, and it is the one Ali asked for by name. Derived
   * from the same nodes the diagram renders, so the tiles and the bands can never
   * disagree — the alternative, a second query, is how a dashboard ends up
   * contradicting itself.
   */
  const outcomeTotals = useMemo(() => {
    if (!data || !data.total_sessions) return [];
    const totals = new Map<string, number>();
    for (const link of data.links) {
      const target = data.nodes[link.target];
      if (target?.stage !== 'outcome') continue;
      totals.set(target.name, (totals.get(target.name) ?? 0) + link.value);
    }
    const ORDER = ['Identified', 'Engaged', 'Left', 'Bounced'];
    const LABELS: Record<string, string> = {
      Identified: 'Identified (became a lead)',
      Engaged: 'Engaged (2+ pages)',
      Left: 'Left after one page',
      Bounced: 'Bounce rate',
    };
    return ORDER.filter((name) => totals.has(name)).map((name) => {
      const value = totals.get(name)!;
      return {
        name,
        label: LABELS[name] ?? name,
        value,
        pct: Math.round((value / data.total_sessions) * 1000) / 10,
      };
    });
  }, [data]);

  const chart = useMemo(() => {
    if (!data || data.nodes.length === 0) return null;
    return {
      nodes: data.nodes.map((n) => ({ ...n })),
      links: data.links.map((l) => ({ ...l })),
    };
  }, [data]);

  const renderNode = useCallback(
    (props: any) => {
      const { x, y, width, height, index, payload } = props;
      const stage: string = payload?.stage ?? 'site';
      const name: string = payload?.name ?? '';
      const value = Number(payload?.value ?? 0);
      const total = data?.total_sessions || 0;
      // Percentages, because 2,920 means nothing without knowing it is 65% of
      // everything. The share is the point of a Sankey; the raw count is detail.
      const pct = total > 0 ? Math.round((value / total) * 1000) / 10 : 0;

      const fill =
        stage === 'site'
          ? colorForSite.get(name) ?? (isDark ? '#4A4A4A' : '#D8D8D8')
          : stage === 'outcome'
            ? outcomeColor(name)
            : isDark
              ? '#6B6B6B'
              : '#8C8C8C';

      const labelOnLeft = stage === 'outcome';
      return (
        <Layer key={`node-${index}`}>
          <Rectangle x={x} y={y} width={width} height={height} fill={fill} radius={2} />
          <text
            x={labelOnLeft ? x - 8 : x + width + 8}
            y={y + height / 2 - 6}
            textAnchor={labelOnLeft ? 'end' : 'start'}
            dominantBaseline="middle"
            fontSize={12}
            fontWeight={600}
            fill="var(--color-text)"
          >
            {name}
          </text>
          <text
            x={labelOnLeft ? x - 8 : x + width + 8}
            y={y + height / 2 + 9}
            textAnchor={labelOnLeft ? 'end' : 'start'}
            dominantBaseline="middle"
            fontSize={11}
            fill="var(--color-text-light)"
          >
            {value.toLocaleString()} · {pct}%
          </text>
        </Layer>
      );
    },
    [colorForSite, outcomeColor, isDark, data],
  );

  const renderLink = useCallback(
    (props: any) => {
      const { sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, index, payload } = props;
      // Resolved by NAME. Reading `payload.source.index` returned undefined on
      // this recharts version, which is what made every band render grey.
      const stroke = colorForLinkNames(payload?.source?.name, payload?.target?.name);
      return (
        <path
          key={`link-${index}`}
          d={`M${sourceX},${sourceY}C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
          stroke={stroke}
          strokeWidth={linkWidth}
          strokeOpacity={0.5}
          fill="none"
        />
      );
    },
    [colorForLinkNames],
  );

  return (
    <SectionCard
      title="Traffic flow"
      icon="flow-chart"
      actions={
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <div className="btn-group btn-group-sm" role="group" aria-label="Time range">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                className={`btn btn-sm ${days === r.key ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setDays(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setShowTable((v) => !v)}>
            {showTable ? 'Hide table' : 'View as table'}
          </button>
        </div>
      }
    >
      <p className="text-muted small mb-3">
        The thicker the band, the more sessions followed that path. Self-identifying and
        behaviourally-detected crawlers are excluded, so this is human traffic.
      </p>

      {loading && (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      )}

      {!loading && error && <div className="alert alert-warning mb-0">{error}</div>}

      {!loading && !error && (!chart || chart.nodes.length === 0) && (
        <div className="text-center text-muted py-5">
          No human traffic in the last {days} days.
        </div>
      )}

      {!loading && !error && chart && chart.nodes.length > 0 && (
        <>
          {/* REACH -> ACQUISITION -> ENGAGEMENT -> CONVERSION.
              The order is the sequence a visitor actually moves through, so a
              number that looks wrong can be traced to the stage before it.

              Every figure counts PEOPLE, not sessions. 4,484 sessions is not
              4,484 anyone — it is ~994 people visiting ~4.5 times each, and a
              conversion rate computed per session would understate the funnel by
              exactly that factor. */}
          {kpis && (
            <div className="row g-2 mb-3">
              <div className="col-6 col-lg-3">
                <div className="h-100 p-2 rounded" style={{ background: 'var(--surface-sunken, #f7f7f6)', borderLeft: '4px solid #7A5AF0' }}>
                  <div className="small text-muted">Unique visitors</div>
                  <div className="fw-bold" style={{ fontSize: '1.5rem', lineHeight: 1.15 }}>
                    {kpis.unique_visitors.toLocaleString()}
                  </div>
                  <div className="small text-muted">{kpis.unique_visitors_7d.toLocaleString()} in last 7 days</div>
                </div>
              </div>
              <div className="col-6 col-lg-3">
                <div className="h-100 p-2 rounded" style={{ background: 'var(--surface-sunken, #f7f7f6)', borderLeft: '4px solid #2BA39A' }}>
                  <div className="small text-muted">Engaged visitors</div>
                  <div className="fw-bold" style={{ fontSize: '1.5rem', lineHeight: 1.15 }}>
                    {(kpis.engaged_visitors ?? 0).toLocaleString()}
                  </div>
                  <div className="small text-muted">
                    {(kpis.shallow_visitors ?? 0).toLocaleString()} hit and left · {kpis.new_visitor_rate}% new
                  </div>
                </div>
              </div>
              <div className="col-6 col-lg-3">
                <div className="h-100 p-2 rounded" style={{ background: 'var(--surface-sunken, #f7f7f6)', borderLeft: '4px solid #E8920C' }}>
                  <div className="small text-muted">Visits per person</div>
                  <div className="fw-bold" style={{ fontSize: '1.5rem', lineHeight: 1.15 }}>{kpis.sessions_per_visitor}</div>
                  <div className="small text-muted">{kpis.bounce_rate}% bounce · {kpis.sessions.toLocaleString()} sessions</div>
                </div>
              </div>
              <div className="col-6 col-lg-3">
                <div className="h-100 p-2 rounded" style={{ background: 'var(--surface-sunken, #f7f7f6)', borderLeft: '4px solid #5BA63C' }}>
                  <div className="small text-muted">Engaged → lead</div>
                  <div className="fw-bold" style={{ fontSize: '1.5rem', lineHeight: 1.15 }}>
                    {kpis.engaged_conversion_rate ?? kpis.conversion_rate}%
                  </div>
                  <div className="small text-muted">
                    {kpis.converted_visitors.toLocaleString()} leads · {kpis.conversion_rate}% of all visitors
                  </div>
                </div>
              </div>
            </div>
          )}

          {kpis && (kpis.shallow_visitors ?? 0) > 0 && (
            <p className="small text-muted mb-3">
              <strong>{(kpis.shallow_visitors ?? 0).toLocaleString()}</strong> of{' '}
              {kpis.unique_visitors.toLocaleString()} visitors viewed one page for under ten seconds and
              never returned — a hit rather than a read. They are counted but held separate, because
              conversion measured against them describes the traffic, not the site. Anyone who became a
              lead always counts as engaged.
            </p>
          )}

          {/* The outcome column expressed as numbers, because a band's thickness
              answers "which is bigger" but never "is 58% bounce good". Each tile
              carries the same colour as its node in the diagram, so the eye can
              move between the two without a legend. */}
          <div className="row g-2 mb-3">
            {outcomeTotals.map((o) => (
              <div className="col-6 col-lg-3" key={o.name}>
                <div
                  className="h-100 p-2 rounded"
                  style={{
                    background: 'var(--surface-sunken, #f7f7f6)',
                    borderLeft: `4px solid ${outcomeColor(o.name)}`,
                  }}
                >
                  <div className="small text-muted d-flex align-items-center gap-1">
                    <span
                      aria-hidden="true"
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: outcomeColor(o.name),
                        display: 'inline-block',
                      }}
                    />
                    {o.label}
                  </div>
                  <div className="fw-bold" style={{ fontSize: '1.25rem', lineHeight: 1.2 }}>
                    {o.pct}%
                  </div>
                  <div className="small text-muted">{o.value.toLocaleString()} sessions</div>
                </div>
              </div>
            ))}
          </div>

          <div className="d-flex gap-3 flex-wrap mb-2 small text-muted">
            <span>Traffic source</span>
            <span aria-hidden="true">→</span>
            <span>Site entered</span>
            <span aria-hidden="true">→</span>
            <span>Outcome</span>
            <span className="ms-auto">{data?.total_sessions.toLocaleString()} human sessions</span>
          </div>
          <div style={{ width: '100%', height: 460 }}>
            <ResponsiveContainer width="100%" height="100%">
              <Sankey
                data={chart}
                nodePadding={26}
                nodeWidth={12}
                margin={{ top: 10, right: 110, bottom: 10, left: 90 }}
                node={renderNode}
                link={renderLink}
              >
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface-raised, #fff)',
                    border: '1px solid var(--color-border, #ddd)',
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                  formatter={(value: any) => [`${Number(value).toLocaleString()} sessions`, '']}
                />
              </Sankey>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* CONVERSION BY CHANNEL — the ask, and the most decision-useful thing here.
          Sorted by traffic so the biggest audiences are read first, which is what
          exposes the gap: the property with the MOST visitors can be the one
          converting worst, and that only shows when the two sit side by side.

          Source is a separate view rather than a merged one because referrer
          capture shipped on 2026-09-04 and cannot be backfilled — bucketing
          everything unattributed into "Direct" would report a fact about a field
          that was empty, not about the audience. */}
      {kpis && (
        <div className="mt-4">
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
            <h6 className="mb-0">Conversion by {channelView === 'site' ? 'property' : 'source'}</h6>
            <div className="btn-group btn-group-sm" role="group" aria-label="Channel dimension">
              <button
                type="button"
                className={`btn btn-sm ${channelView === 'site' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setChannelView('site')}
              >
                By property
              </button>
              <button
                type="button"
                className={`btn btn-sm ${channelView === 'source' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setChannelView('source')}
              >
                By source
              </button>
            </div>
          </div>

          {channelView === 'source' && kpis.source_attribution_pending ? (
            <div className="alert alert-light border small mb-0">
              <strong>No source data yet.</strong> Referrer capture went live on 4 September and
              cannot be backfilled, so traffic that arrived before then has no recorded source.
              This fills in as new visitors arrive. Use <em>By property</em> in the meantime.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>{channelView === 'site' ? 'Property' : 'Source'}</th>
                    <th className="text-end">Unique visitors</th>
                    <th className="text-end">Sessions</th>
                    <th className="text-end">Leads</th>
                    <th style={{ minWidth: 160 }}>Conversion</th>
                  </tr>
                </thead>
                <tbody>
                  {(channelView === 'site' ? kpis.by_site : kpis.by_source).map((c) => {
                    const best = Math.max(
                      ...(channelView === 'site' ? kpis.by_site : kpis.by_source).map((x) => x.conversion_rate),
                      1,
                    );
                    return (
                      <tr key={c.channel}>
                        <td className="small fw-medium">{c.channel}</td>
                        <td className="text-end small">{c.unique_visitors.toLocaleString()}</td>
                        <td className="text-end small text-muted">{c.sessions.toLocaleString()}</td>
                        <td className="text-end small">{c.converted.toLocaleString()}</td>
                        <td>
                          <div className="d-flex align-items-center gap-2">
                            {/* Bar width is relative to the best performer, so the
                                spread between properties is visible rather than
                                every bar being a sliver against 100%. */}
                            <div style={{ flex: 1, height: 6, background: 'var(--color-border, #e4e4e3)', borderRadius: 3 }}>
                              <div
                                style={{
                                  width: `${Math.min(100, (c.conversion_rate / best) * 100)}%`,
                                  height: '100%',
                                  borderRadius: 3,
                                  background: c.conversion_rate >= best * 0.6 ? '#5BA63C' : c.conversion_rate > 0 ? '#E8920C' : '#8C8C8C',
                                }}
                              />
                            </div>
                            <span className="small text-nowrap" style={{ minWidth: 44 }}>{c.conversion_rate}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* The table is the accessibility relief for the two palette steps that sit
          under 3:1 against the surface, and the answer for anyone who would rather
          read numbers than a picture. */}
      {showTable && data && (
        <div className="table-responsive mt-3">
          <table className="table table-sm mb-0">
            <thead className="table-light">
              <tr>
                <th>Source</th>
                <th>Site</th>
                <th>Outcome</th>
                <th className="text-end">Sessions</th>
              </tr>
            </thead>
            <tbody>
              {data.table.map((r, i) => (
                <tr key={`${r.source}-${r.site}-${r.outcome}-${i}`}>
                  <td className="small">{r.source}</td>
                  <td className="small">{r.site}</td>
                  <td className="small">{r.outcome}</td>
                  <td className="small text-end">{r.sessions.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

export default VisitorSankeyFlow;
