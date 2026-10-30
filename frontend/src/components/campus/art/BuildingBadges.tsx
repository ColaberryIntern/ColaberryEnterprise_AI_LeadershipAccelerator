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
 *
 * WP-3: a press on the people chip opens the peek (who is in there; pointer only: the arrival panel's Who's here is the keyboard
 * way to the same people); while presence is down every chip reads "—" (unknown, not zero); a partner sees "N · M yours" with their
 * teammates' dots in teal; a member's badge slot can carry what is next there ("Class in 1d 3h"), and the urgent ring pulses on a
 * building whose class starts within 15 minutes.
 */
type Kind = CampusBuilding['kind'];
const chipY = (kind: Kind, h: number) => (kind === 'office' ? -34 : kind === 'amphi' ? -30 : -h + 14);
const badgeY = (kind: Kind, h: number) => (kind === 'amphi' ? -30 : kind === 'gate' ? -40 : -h + 14);
/** Compact maps are drawn at about a fifth of their size: their markers are scaled up to stay readable. */
const COMPACT_SCALE = 3.2;

export function PeopleChip({ b, count, shown = [], compact, yours = 0, down = false, onPeek }: {
  b: CampusBuilding; count: number; shown?: CampusPerson[]; compact: boolean; yours?: number; down?: boolean;
  onPeek?: (e: React.MouseEvent) => void;
}): React.ReactElement {
  const hw = b.kind === 'gate' ? 40 : b.pos.w / 2;
  const dots = compact || down ? [] : shown.slice(0, 3);
  const txt = down ? '—' : yours > 0 ? `${count} · ${yours} yours` : String(count);
  const wd = down ? 24 : 14 + dots.length * 6 + txt.length * 5.6;
  const peek = onPeek && !down ? (e: React.MouseEvent) => { e.stopPropagation(); onPeek(e); } : undefined;
  return (
    <g className={`cm-count${down ? ' is-down' : ''}${peek ? ' is-peekable' : ''}`} data-count={down ? undefined : count} aria-hidden="true" data-testid={`cm-count-${b.id}`}
      onClick={peek} transform={`translate(${-hw - 6} ${b.kind === 'gate' ? -40 : chipY(b.kind, b.pos.h)})${compact ? ` scale(${COMPACT_SCALE})` : ''}`}>
      <rect x={-wd} y={-9} width={wd} height={18} rx={9} />
      {dots.map((p, i) => (
        <circle key={p.enrollment_id} className={`cm-count-dot${yours > 0 ? ' is-team' : p.rung_name ? ` rung-${rungTone(p.rung_name)}` : ''}`} cx={-wd + 9 + i * 6} cy={0} r={4.2} />
      ))}
      <text x={down ? -12 : -6} y={3.4} textAnchor={down ? 'middle' : 'end'}>{txt}</text>
    </g>
  );
}

/** The status badge's words and tone; null = no badge. OPEN is shown only where the Explorer view asks for it. */
export type BadgeStatus = { text: string; tone: '' | 'hot' | 'live' };
export function statusOf(access: ExplorerAccess, onAir: boolean, showOpen: boolean, moment?: BadgeStatus | null): BadgeStatus | null {
  if (onAir) return { text: 'ON AIR', tone: 'hot' };
  if (access === 'open') return moment ?? (showOpen ? { text: 'OPEN', tone: 'live' } : null);
  if (access === 'preview') return { text: 'PREVIEW', tone: '' };
  if (access === 'demo') return { text: 'DEMO', tone: '' };
  return { text: '\u{1F512}', tone: '' };
}

const badgeWidth = (text: string) => text.length * 5.2 + 16;

/** WP-3: the urgent ring (the prototype's .ping): a red circle round the building that pulses while something starts within 15
 *  minutes there (CSS animates it only on .cm-bld.is-urgent). */
export function UrgentPing({ b }: { b: CampusBuilding }): React.ReactElement {
  return <circle className="cm-ping" cx={0} cy={-b.pos.h / 2} r={Math.max(b.pos.w, b.pos.h) * 0.62} aria-hidden="true" />;
}

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

/** C23 phase 3 (WP-10, D:1703 and D:3285-3287): unread notifications that belong to this building, a red count pin at its top-left
 *  corner above the roof, with a pulsing ring. A press opens the notifications (the bell); it is a mouse shortcut inside the building's
 *  own button, so it is hidden from assistive tech (the bell carries the same list and count). */
export const OPEN_BELL_EVENT = 'cm-open-bell';
export function NotifPin({ b, n }: { b: CampusBuilding; n: number }): React.ReactElement {
  const y = b.id === 'amphi' ? -44 : -b.pos.h - 14;
  return (
    <g className="cm-notif-pin" aria-hidden="true" data-testid={`cm-notif-pin-${b.id}`} transform={`translate(${-b.pos.w / 2 + 2} ${y})`}
      onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new Event(OPEN_BELL_EVENT)); }}>
      <circle className="ring" r={11} />
      <circle className="dot" r={8.5} />
      <text y={3.6} textAnchor="middle">{n > 9 ? '9+' : n}</text>
    </g>
  );
}
