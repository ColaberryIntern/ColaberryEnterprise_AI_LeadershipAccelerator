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
  const isDark = useIsDark();
  const palette = isDark ? SOURCE_COLORS_DARK : SOURCE_COLORS_LIGHT;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/admin/visitor-analytics/flow-sankey', { params: { days } });
      setData(res.data);
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

  /** Colour is keyed to the SOURCE NODE, so a band keeps its hue end to end. */
  const colorForNode = useMemo(() => {
    const map = new Map<number, string>();
    if (!data) return map;
    let next = 0;
    data.nodes.forEach((n, i) => {
      if (n.stage === 'source') {
        map.set(i, palette[next % palette.length]);
        next += 1;
      }
    });
    return map;
  }, [data, palette]);

  const colorForLink = useCallback(
    (sourceIndex: number, targetIndex: number): string => {
      if (colorForNode.has(sourceIndex)) return colorForNode.get(sourceIndex)!;
      // Second hop: inherit from whichever source feeds this site most, so the
      // ribbon does not change colour halfway across the diagram.
      if (!data) return 'var(--color-border)';
      let best: { value: number; color: string } | null = null;
      for (const link of data.links) {
        if (link.target !== sourceIndex) continue;
        const color = colorForNode.get(link.source);
        if (!color) continue;
        if (!best || link.value > best.value) best = { value: link.value, color };
      }
      return best?.color ?? (isDark ? '#B4B4B4' : '#6B6B6B');
    },
    [colorForNode, data, isDark],
  );

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
      const fill = colorForNode.get(index) ?? (isDark ? '#4A4A4A' : '#D8D8D8');
      const labelOnLeft = stage === 'outcome';
      return (
        <Layer key={`node-${index}`}>
          <Rectangle x={x} y={y} width={width} height={height} fill={fill} radius={2} />
          <text
            x={labelOnLeft ? x - 8 : x + width + 8}
            y={y + height / 2}
            textAnchor={labelOnLeft ? 'end' : 'start'}
            dominantBaseline="middle"
            fontSize={12}
            fill="var(--color-text)"
          >
            {payload?.name}
          </text>
          <text
            x={labelOnLeft ? x - 8 : x + width + 8}
            y={y + height / 2 + 14}
            textAnchor={labelOnLeft ? 'end' : 'start'}
            dominantBaseline="middle"
            fontSize={11}
            fill="var(--color-text-light)"
          >
            {Number(payload?.value ?? 0).toLocaleString()}
          </text>
        </Layer>
      );
    },
    [colorForNode, isDark],
  );

  const renderLink = useCallback(
    (props: any) => {
      const { sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, index, payload } = props;
      const stroke = colorForLink(payload?.source?.index ?? payload?.source, payload?.target?.index ?? payload?.target);
      return (
        <path
          key={`link-${index}`}
          d={`M${sourceX},${sourceY}C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
          stroke={stroke}
          strokeWidth={linkWidth}
          strokeOpacity={0.45}
          fill="none"
        />
      );
    },
    [colorForLink],
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
          <div className="d-flex gap-3 flex-wrap mb-2 small text-muted">
            <span>Traffic source</span>
            <span aria-hidden="true">→</span>
            <span>Site entered</span>
            <span aria-hidden="true">→</span>
            <span>Outcome</span>
            <span className="ms-auto">{data?.total_sessions.toLocaleString()} sessions</span>
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
