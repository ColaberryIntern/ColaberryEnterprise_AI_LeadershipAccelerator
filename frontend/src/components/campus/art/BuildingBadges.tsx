import React from 'react';
import type { CampusBuilding, ExplorerAccess } from '../campusMap';
import type { CampusPerson } from '../campusApi';
import { rungTone } from '../../../services/bandLadder';
import '../../../styles/rungTones.css';

/**
 * The prototype's three building markers (drawBuilding + renderMoment in docs/design/campus/colaberry-campus.html), drawn in
 * the building's local frame (origin = the ground line's center) and fed only by real data:
 *  - the people chip, right-aligned left of the body: a white pill with up to three level-toned dots and the live head count;
 *  - the status badge, left-aligned right of the roof: ON AIR (red) from broadcast discovery, otherwise the viewer's access
 *    (OPEN in green for Explorers, PREVIEW, DEMO, or a lock), never an invented event;
 *  - the stop badge, centered above the roof: STOP n for today's plan route (the next stop green), as the prototype's tour.
 * All three are aria-hidden: the building's own aria-label already says on air, the access and the head count.
 */
type Kind = CampusBuilding['kind'];
const chipY = (kind: Kind, h: number) => (kind === 'office' ? -34 : kind === 'amphi' ? -30 : -h + 14);
const badgeY = (kind: Kind, h: number) => (kind === 'amphi' ? -30 : kind === 'gate' ? -40 : -h + 14);
/** Compact maps are drawn at about a fifth of their size: their markers are scaled up to stay readable. */
const COMPACT_SCALE = 3.2;

export function PeopleChip({ b, count, shown = [], compact }: { b: CampusBuilding; count: number; shown?: CampusPerson[]; compact: boolean }): React.ReactElement {
  const hw = b.kind === 'gate' ? 40 : b.pos.w / 2;
  const dots = compact ? [] : shown.slice(0, 3);
  const txt = String(count);
  const wd = 14 + dots.length * 6 + txt.length * 5.6;
  return (
    <g className="cm-count" data-count={count} aria-hidden="true"
      transform={`translate(${-hw - 6} ${b.kind === 'gate' ? -40 : chipY(b.kind, b.pos.h)})${compact ? ` scale(${COMPACT_SCALE})` : ''}`}>
      <rect x={-wd} y={-9} width={wd} height={18} rx={9} />
      {dots.map((p, i) => (
        <circle key={p.enrollment_id} className={`cm-count-dot${p.rung_name ? ` rung-${rungTone(p.rung_name)}` : ''}`} cx={-wd + 9 + i * 6} cy={0} r={4.2} />
      ))}
      <text x={-6} y={3.4} textAnchor="end">{txt}</text>
    </g>
  );
}

/** The status badge's words and tone; null = no badge. OPEN is shown only where the Explorer view asks for it. */
export function statusOf(access: ExplorerAccess, onAir: boolean, showOpen: boolean): { text: string; tone: '' | 'hot' | 'live' } | null {
  if (onAir) return { text: 'ON AIR', tone: 'hot' };
  if (access === 'open') return showOpen ? { text: 'OPEN', tone: 'live' } : null;
  if (access === 'preview') return { text: 'PREVIEW', tone: '' };
  if (access === 'demo') return { text: 'DEMO', tone: '' };
  return { text: '\u{1F512}', tone: '' };
}

const badgeWidth = (text: string) => text.length * 5.2 + 16;

export function StatusBadge({ b, status, compact }: { b: CampusBuilding; status: { text: string; tone: string }; compact: boolean }): React.ReactElement {
  const hw = b.kind === 'gate' ? 40 : b.pos.w / 2;
  const onAir = status.text === 'ON AIR';
  return (
    <g className={`cm-badge${status.tone ? ` is-${status.tone}` : ''}${onAir ? ' cm-onair' : ''}`} aria-hidden="true"
      data-testid={onAir ? `cm-onair-${b.id}` : `cm-badge-${b.id}`}
      transform={`translate(${hw + 6} ${badgeY(b.kind, b.pos.h)})${compact ? ` scale(${COMPACT_SCALE})` : ''}`}>
      <rect x={0} y={-9} width={badgeWidth(status.text)} height={18} rx={9} />
      <text x={8} y={3.5}>{status.text}</text>
    </g>
  );
}

/** WP-2: a tour stop above the roof (the prototype's renderMoment badges while touring: STOP n, or an Explorer's "n · OPEN"), the
 *  current stop green. It takes the status badge's place while the tour runs. */
export function TourBadge({ b, text, live }: { b: CampusBuilding; text: string; live: boolean }): React.ReactElement {
  const bw = badgeWidth(text);
  const lift = b.kind === 'gate' ? 64 : b.pos.h + (b.kind === 'amphi' ? 8 : b.kind === 'tower' ? 44 : 40);
  return (
    <g className={`cm-badge cm-tour-stop${live ? ' is-live' : ''}`} aria-hidden="true" data-testid={`cm-tour-stop-${b.id}`} transform={`translate(${-bw / 2} ${-lift})`}>
      <rect x={0} y={-9} width={bw} height={18} rx={9} />
      <text x={8} y={3.5}>{text}</text>
    </g>
  );
}

/** WP-2: today's plan step at a building (the prototype's .plan-n pin at its top-left corner): its number, a tick once done, filled
 *  for the next step. A press walks there (it sits inside the building's own button). */
export function PlanPin({ b, n, done, next }: { b: CampusBuilding; n: number; done: boolean; next: boolean }): React.ReactElement {
  const x = b.kind === 'gate' ? -30 : -b.pos.w / 2 + 6;
  return (
    <g className={`cm-plan-pin${done ? ' is-done' : next ? ' is-next' : ''}`} aria-hidden="true" data-testid={`cm-plan-pin-${b.id}`} transform={`translate(${x} -4)`}>
      <circle r={9} />
      <text y={3.6} textAnchor="middle">{done ? '✓' : n}</text>
    </g>
  );
}
