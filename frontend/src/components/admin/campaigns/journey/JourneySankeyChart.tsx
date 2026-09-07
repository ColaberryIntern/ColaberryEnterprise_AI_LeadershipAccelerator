/**
 * The diagram. Rendering only — it receives a finished view model and reports
 * clicks upward; it never fetches, filters or derives a number.
 *
 * WHY RECHARTS. `recharts` is already a dependency of this app and already draws
 * the Visitors Sankey, so this adds no bundle, no licence and no lockfile change.
 * The alternative, extending `react-force-graph-2d`, is the thing being replaced.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Layer, Rectangle, ResponsiveContainer, Sankey } from 'recharts';
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

export default function JourneySankeyChart({
  view,
  isDark,
  reducedMotion,
  selection,
  onSelect,
  height,
}: Props): React.ReactElement {
  const [tip, setTip] = useState<TipState | null>(null);

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
      // Outcome labels sit to the LEFT of their node, because they are the last
      // column and a right-hand label would be clipped by the plot edge.
      const labelLeft = node.stage === 'outcome';
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
    [view.nodes, emphasised, selection, colorForNode, onSelect],
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

      return (
        <path
          key={`link-${index}`}
          // Stable hook. Recharts draws NODES as <path class="recharts-rectangle">
          // too, so "every path with role=button" selects nodes as well as ribbons —
          // which is how a selector meant for 6 bands quietly matched 13 elements.
          className="journey-ribbon"
          d={`M${sourceX},${sourceY}C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
          stroke={stroke}
          strokeWidth={linkWidth}
          // A minimum hit area is applied by the invisible companion path below,
          // never by inflating strokeWidth — widening the ribbon itself would make
          // a 4-lead path look as heavy as a 400-lead one.
          strokeOpacity={selected ? 0.85 : dimmed ? 0.08 : 0.42}
          fill="none"
          style={{
            cursor: 'pointer',
            transition: reducedMotion ? 'none' : 'stroke-opacity 140ms ease',
          }}
          role="button"
          tabIndex={0}
          aria-label={`${link.fromName} to ${link.toName}: ${link.value.toLocaleString()} leads${
            pct === null ? '' : `, ${pct.toFixed(1)} percent of ${link.fromName}`
          }. ${link.aggregate ? 'Grouped path.' : 'Activate to list these leads.'}`}
          onClick={() => onSelect({ kind: 'link', from: link.fromId, to: link.toId })}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect({ kind: 'link', from: link.fromId, to: link.toId });
            }
          }}
          onMouseMove={(e: React.MouseEvent) =>
            showTip(e, `${link.fromName} → ${link.toName}`, [
              `${link.value.toLocaleString()} leads`,
              ...(pct === null ? [] : [`${pct.toFixed(1)}% of ${link.fromName}`]),
              ...(link.medianHours === null
                ? []
                : [`Median ${formatHours(link.medianHours)} to make this move`]),
              link.aggregate ? 'Grouped path — expand to inspect' : 'Click to list these leads',
            ])
          }
          onMouseLeave={() => setTip(null)}
        />
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
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={chartData}
            nodePadding={22}
            nodeWidth={NODE_WIDTH}
            margin={{ top: 8, right: 132, bottom: 8, left: 108 }}
            node={renderNode}
            link={renderLink}
          />
        </ResponsiveContainer>
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
