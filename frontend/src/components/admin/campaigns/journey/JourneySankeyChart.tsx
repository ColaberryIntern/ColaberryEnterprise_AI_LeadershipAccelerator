/**
 * The diagram. Rendering only — it receives a finished view model and reports
 * clicks upward; it never fetches, filters or derives a number.
 *
 * WHY RECHARTS. `recharts` is already a dependency of this app and already draws
 * the Visitors Sankey, so this adds no bundle, no licence and no lockfile change.
 * The alternative, extending `react-force-graph-2d`, is the thing being replaced.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Layer, Rectangle, Sankey } from 'recharts';
import type { SankeyViewModel, SankeyViewNode } from './campaignSankeyAdapter';
import { deadEndColor, stageColor } from './journeyPalette';

export interface JourneySelection {
  kind: 'node' | 'link';
  nodeId?: string;
  from?: string;
  to?: string;
}

interface Props {
  view: SankeyViewModel;
  isDark: boolean;
  reducedMotion: boolean;
  selection: JourneySelection | null;
  onSelect: (selection: JourneySelection) => void;
  height: number;
}

interface TipState {
  x: number;
  y: number;
  title: string;
  lines: string[];
}

const NODE_WIDTH = 13;

/**
 * Width used before the container has been measured, and in jsdom, which has no
 * ResizeObserver. Chosen to match the column this chart sits in at desktop width
 * so the first paint is not visibly re-laid-out a frame later.
 */
const FALLBACK_WIDTH = 900;

/**
 * Vertical room per node.
 *
 * The chart is NOT a fixed height. With 23 nodes in a 520px box the outcome column
 * collapses to sub-pixel slivers and its labels land on top of the campaign labels
 * above them — which is the exact crowding this whole screen exists to fix, moved
 * from the horizontal axis to the vertical one. Height therefore grows with the
 * node count and the page scrolls.
 */
const MIN_PX_PER_NODE = 38;

/** Right-hand fraction of the plot whose labels must render inward. */
const LABEL_FLIP_AT = 0.82;

/**
 * Floor on the plot's own width, independent of the container's.
 *
 * Seven columns of labelled nodes do not fit in a sidebar-flanked column. Squeezed
 * to ~880px the labels collide whichever way they point: anchored outward they run
 * into the next column, flipped inward they run into the previous one. Narrowing
 * the labels instead turns "Executive AI Briefing Q3" into "Exec…", which is not a
 * readable chart either.
 *
 * So the plot keeps the width it needs and the WRAPPER scrolls horizontally when
 * the container is smaller — the standard treatment for wide diagrams, and the one
 * that keeps the page itself from scrolling sideways.
 */
const MIN_CHART_WIDTH = 1180;

/** Minimum clickable thickness for a ribbon, independent of its drawn width. */
const MIN_HIT_WIDTH = 14;

/**
 * Measure the available width.
 *
 * Replaces recharts' ResponsiveContainer because the label-side decision needs the
 * plot width as a NUMBER: without it, "is this node in the last column" has to be
 * guessed from the stage, and a campaign label then renders rightward straight into
 * the outcome column. Measuring also lets the height scale with the node count,
 * which ResponsiveContainer cannot do since it derives height from its parent.
 */
function useMeasuredWidth(): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => {
      const w = el.clientWidth;
      if (w > 0) setWidth(w);
    };
    read();
    // jsdom and older browsers have no ResizeObserver; the fallback width stands.
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width];
}

export default function JourneySankeyChart({
  view,
  isDark,
  reducedMotion,
  selection,
  onSelect,
  height,
}: Props): React.ReactElement {
  const [tip, setTip] = useState<TipState | null>(null);
  const [wrapRef, width] = useMeasuredWidth();

  // Grows with the node count so the outcome column keeps a readable band.
  const chartHeight = Math.max(height, view.nodes.length * MIN_PX_PER_NODE);
  const chartWidth = Math.max(width, MIN_CHART_WIDTH);
  const flipX = chartWidth * LABEL_FLIP_AT;

  /**
   * Nodes that receive leads but pass none on. Derived, not listed: a layer added
   * to the backend later is muted by the same rule without a change here.
   */
  const deadEnds = useMemo(() => {
    const out = new Set<string>();
    const hasOutgoing = new Set(view.links.map((l) => l.fromId));
    for (const n of view.nodes) {
      if (n.nodeType !== 'outcome' && !hasOutgoing.has(n.id)) out.add(n.id);
    }
    return out;
  }, [view]);

  const colorForNode = useCallback(
    (node: SankeyViewNode): string =>
      deadEnds.has(node.id) ? deadEndColor(isDark) : stageColor(node.stage, isDark),
    [deadEnds, isDark],
  );

  /** Ids on the selected path, so selection can dim everything else. */
  const emphasised = useMemo(() => {
    if (!selection) return null;
    const ids = new Set<string>();
    if (selection.kind === 'node' && selection.nodeId) {
      ids.add(selection.nodeId);
      for (const l of view.links) {
        if (l.fromId === selection.nodeId) ids.add(l.toId);
        if (l.toId === selection.nodeId) ids.add(l.fromId);
      }
    } else if (selection.kind === 'link') {
      if (selection.from) ids.add(selection.from);
      if (selection.to) ids.add(selection.to);
    }
    return ids;
  }, [selection, view.links]);

  const linkIsSelected = useCallback(
    (fromId: string, toId: string): boolean =>
      selection?.kind === 'link' && selection.from === fromId && selection.to === toId,
    [selection],
  );

  const showTip = (evt: { clientX: number; clientY: number }, title: string, lines: string[]) => {
    // Clamped to the viewport so a tooltip on a right-hand outcome node cannot be
    // pushed off screen where it is unreadable.
    const pad = 16;
    const w = 260;
    const x = Math.min(evt.clientX + pad, window.innerWidth - w - pad);
    const y = Math.min(evt.clientY + pad, window.innerHeight - 120);
    setTip({ x: Math.max(pad, x), y: Math.max(pad, y), title, lines });
  };

  const renderNode = useCallback(
    (props: any): React.ReactElement => {
      const { x, y, width, height: h, index, payload } = props;
      const node: SankeyViewNode | undefined = view.nodes[payload?.__index ?? index];
      if (!node) return <Layer key={`node-${index}`} />;

      const dimmed = emphasised ? !emphasised.has(node.id) : false;
      const isSelected = selection?.kind === 'node' && selection.nodeId === node.id;
      /**
       * Labels flip inward on the right-hand side of the plot, decided by POSITION
       * rather than by stage. Keying it to `stage === 'outcome'` was wrong: campaign
       * nodes also sit near the right edge, so their labels rendered outward and
       * landed on top of the outcome column's labels. Position is what actually
       * determines whether there is room, and it stays correct when a future layer
       * changes which stage happens to be last.
       */
      const labelLeft = x > flipX;
      const fill = colorForNode(node);

      return (
        <Layer key={`node-${index}`}>
          <Rectangle
            x={x}
            y={y}
            width={width}
            height={h}
            fill={fill}
            radius={2}
            fillOpacity={dimmed ? 0.25 : 1}
            stroke={isSelected ? 'var(--color-text, #17181c)' : 'none'}
            strokeWidth={isSelected ? 2 : 0}
            style={{ cursor: 'pointer' }}
            role="button"
            tabIndex={0}
            aria-label={`${node.stageLabel}: ${node.fullName}, ${node.value.toLocaleString()} leads. ${
              node.drillable ? 'Activate to inspect these leads.' : 'Grouped — expand to inspect.'
            }`}
            onClick={() => onSelect({ kind: 'node', nodeId: node.id })}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect({ kind: 'node', nodeId: node.id });
              }
            }}
            onMouseMove={(e: React.MouseEvent) =>
              showTip(e, node.fullName, [
                `${node.stageLabel} · ${node.value.toLocaleString()} leads`,
                ...(node.brandName ? [`Brand: ${node.brandName}`] : []),
                node.drillable ? 'Click to inspect these leads' : 'Grouped — switch view to expand',
              ])
            }
            onMouseLeave={() => setTip(null)}
          />
          <text
            x={labelLeft ? x - 8 : x + width + 8}
            y={y + h / 2 - 6}
            textAnchor={labelLeft ? 'end' : 'start'}
            dominantBaseline="middle"
            fontSize={12}
            fontWeight={600}
            fill="var(--color-text, #17181c)"
            opacity={dimmed ? 0.35 : 1}
            pointerEvents="none"
          >
            {node.name}
          </text>
          <text
            x={labelLeft ? x - 8 : x + width + 8}
            y={y + h / 2 + 9}
            textAnchor={labelLeft ? 'end' : 'start'}
            dominantBaseline="middle"
            fontSize={11}
            fill="var(--color-text-light, #68707c)"
            opacity={dimmed ? 0.35 : 1}
            pointerEvents="none"
          >
            {node.value.toLocaleString()}
          </text>
        </Layer>
      );
    },
    // flipX MUST be here. Without it the renderer keeps the closure it was built
    // with at the fallback width, so after the container is measured recharts
    // re-lays the chart out at the real width while the label-side decision still
    // uses the old one — and every right-hand label flips inward over the column
    // beside it. The chart looked mis-designed; it was one stale dependency.
    [view.nodes, emphasised, selection, colorForNode, onSelect, flipX],
  );

  const renderLink = useCallback(
    (props: any): React.ReactElement => {
      const {
        sourceX,
        targetX,
        sourceY,
        targetY,
        sourceControlX,
        targetControlX,
        linkWidth,
        index,
      } = props;
      const link = view.links[index];
      if (!link) return <Layer key={`link-${index}`} />;

      const dimmed = emphasised ? !(emphasised.has(link.fromId) && emphasised.has(link.toId)) : false;
      const selected = linkIsSelected(link.fromId, link.toId);
      const from = view.nodes[link.source];
      const stroke = from ? colorForNode(from) : deadEndColor(isDark);

      const pct = from && from.value > 0 ? (link.value / from.value) * 100 : null;

      const d = `M${sourceX},${sourceY}C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`;
      const label = `${link.fromName} to ${link.toName}: ${link.value.toLocaleString()} leads${
        pct === null ? '' : `, ${pct.toFixed(1)} percent of ${link.fromName}`
      }. ${link.aggregate ? 'Grouped path.' : 'Activate to list these leads.'}`;
      const select = () => onSelect({ kind: 'link', from: link.fromId, to: link.toId });
      const hover = (e: React.MouseEvent) =>
        showTip(e, `${link.fromName} → ${link.toName}`, [
          `${link.value.toLocaleString()} leads`,
          ...(pct === null ? [] : [`${pct.toFixed(1)}% of ${link.fromName}`]),
          ...(link.medianHours === null
            ? []
            : [`Median ${formatHours(link.medianHours)} to make this move`]),
          link.aggregate ? 'Grouped path — expand to inspect' : 'Click to list these leads',
        ]);

      return (
        <Layer key={`link-${index}`}>
          {/*
            INVISIBLE HIT AREA. 59 paid leads out of 44,619 movements is a band under
            one pixel thick — honest as a picture, impossible as a target. This path
            carries the interaction at a usable thickness while the visible ribbon
            below keeps its true width, so a small outcome stays clickable WITHOUT
            being drawn heavier than it is. Widening the visible stroke instead would
            make a 59-lead path look like a 400-lead one, which is the one thing a
            Sankey must never do.
          */}
          <path
            className="journey-ribbon"
            d={d}
            stroke="transparent"
            strokeWidth={Math.max(MIN_HIT_WIDTH, linkWidth)}
            fill="none"
            style={{ cursor: 'pointer' }}
            role="button"
            tabIndex={0}
            aria-label={label}
            onClick={select}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                select();
              }
            }}
            onMouseMove={hover}
            onMouseLeave={() => setTip(null)}
          />
          <path
            className="journey-ribbon-fill"
            d={d}
            stroke={stroke}
            strokeWidth={linkWidth}
            strokeOpacity={selected ? 0.85 : dimmed ? 0.08 : 0.42}
            fill="none"
            pointerEvents="none"
            style={{ transition: reducedMotion ? 'none' : 'stroke-opacity 140ms ease' }}
          />
        </Layer>
      );
    },
    [view, emphasised, linkIsSelected, colorForNode, isDark, onSelect, reducedMotion],
  );

  // Recharts consumes plain index links; the view model's extra fields ride along
  // in a parallel array read by index inside the renderers.
  const chartData = useMemo(
    () => ({
      nodes: view.nodes.map((n, i) => ({ name: n.fullName, __index: i })),
      links: view.links.map((l) => ({ source: l.source, target: l.target, value: l.value })),
    }),
    [view],
  );

  return (
    <>
      <div
        ref={wrapRef}
        // The diagram scrolls inside its own box; the page never scrolls sideways.
        style={{ width: '100%', overflowX: 'auto' }}
      >
        <Sankey
          width={chartWidth}
          height={chartHeight}
          data={chartData}
          nodePadding={22}
          nodeWidth={NODE_WIDTH}
          // Symmetric margins: labels flip inward past LABEL_FLIP_AT, so the right
          // side no longer needs the extra gutter an outward label required.
          margin={{ top: 8, right: 150, bottom: 8, left: 16 }}
          node={renderNode}
          link={renderLink}
        />
      </div>
      {tip && (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            left: tip.x,
            top: tip.y,
            zIndex: 1080,
            maxWidth: 260,
            pointerEvents: 'none',
            background: 'var(--surface-raised, #16181d)',
            color: 'var(--color-text, #fff)',
            border: '1px solid var(--color-border, #2c2f36)',
            borderRadius: 8,
            padding: '9px 11px',
            fontSize: 12,
            boxShadow: '0 8px 30px rgba(0,0,0,.25)',
          }}
        >
          <strong style={{ display: 'block', marginBottom: 3 }}>{tip.title}</strong>
          {tip.lines.map((line) => (
            <div key={line} style={{ opacity: 0.85 }}>
              {line}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function formatHours(hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}
