import React from 'react';
import { art } from '../art/artColor';

/**
 * The back walls that carry facts (WP-5; the prototype's featureSVG, D:2259-2314), fed only by real data. The prototype's sample
 * sessions, tickets, clients and demo titles are never drawn: with nothing true to show, a wall says so plainly or keeps its blank
 * placeholder shapes.
 *  - the Schedule board: today's live session, the next event and your plan steps, with their state;
 *  - the sprint wall: your active build's tasks by status, YOU on the one in progress (real statuses have no review step, so the
 *    third column is BLOCKED rather than the prototype's REVIEW);
 *  - the gallery screens: titles of showcased work;
 *  - the arcade: each cabinet's art, "▶ TAP TO PLAY" and your best score this week.
 */
export interface WallFacts {
  /** "THURSDAY" (Central). */
  day?: string;
  schedule?: { time: string; title: string; status: string }[];
  sprint?: { name: string; cols: { title: string; tasks: { id: string; title: string; you: boolean }[] }[] } | null;
  screens?: string[];
  /** The Events Hall banner ("OPEN HOUSE · OCT 29") and the Classroom screen ("Session 5 · Agents and MCP"). */
  eventBanner?: string | null;
  classroom?: string | null;
  /** Your best this week per game (from the Game Room board). */
  best?: Partial<Record<string, number>>;
}

const F = "'DM Sans',system-ui,sans-serif";
const MONO = 'ui-monospace,Menlo,monospace';
const PCOL = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10'].map((p) => art(`in-${p}`));
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function ScheduleBoard({ day, rows }: { day?: string; rows?: WallFacts['schedule'] }): React.ReactElement {
  return (
    <g data-testid="cm-wall-schedule">
      <rect x={250} y={90} width={480} height={170} rx={6} fill={art('in-board')} />
      <text x={270} y={118} fontSize={12} fontWeight={700} fill={art('in-board-amber')} fontFamily={MONO} letterSpacing={2}>{day ? `TODAY · ${day}` : 'TODAY'}</text>
      {rows && rows.length > 0
        ? rows.slice(0, 4).map((r, i) => (
          <g key={i}>
            <text x={270} y={150 + i * 28} fontSize={13} fill={art('in-board-text')} fontFamily={MONO}>{`${r.time.padEnd(7)} ${clip(r.title, 30)}`}</text>
            <text x={712} y={150 + i * 28} textAnchor="end" fontSize={11} fill={art('in-board-ok')} fontFamily={MONO}>{r.status}</text>
          </g>
        ))
        : <text x={270} y={154} fontSize={13} fill={art('in-board-text')} fontFamily={MONO} opacity={0.75}>NOTHING ELSE ON TODAY</text>}
    </g>
  );
}

const SPRINT_COLS: [string, string][] = [['BACKLOG', 'sign-base'], ['IN PROGRESS', 'red'], ['BLOCKED', 'amphi'], ['SHIPPED', 'live']];

export function SprintWall({ sprint }: { sprint?: WallFacts['sprint'] }): React.ReactElement {
  return (
    <g data-testid="cm-wall-sprint">
      <rect x={196} y={82} width={552} height={220} rx={6} fill={art('white')} stroke={art('in-kanban-edge')} strokeWidth={3} />
      <text x={212} y={102} fontSize={10} fontWeight={800} fill={art('studio')} fontFamily={F} letterSpacing={1.5}>{sprint ? `BUILD BOARD · ${clip(sprint.name.toUpperCase(), 40)}` : 'SPRINT BOARD'}</text>
      {SPRINT_COLS.map(([col, tone], i) => {
        const tasks = sprint?.cols.find((c) => c.title === col)?.tasks ?? null;
        return (
          <g key={col}>
            <rect x={206 + i * 134} y={110} width={126} height={184} rx={4} fill={art('in-ticket-col')} />
            <text x={214 + i * 134} y={126} fontSize={9} fontWeight={800} fill={art(tone)} fontFamily={F} letterSpacing={1}>{col}</text>
            {(tasks ?? [null, null]).slice(0, 2).map((t, r) => (
              <g key={r}>
                <rect x={212 + i * 134} y={134 + r * 52} width={114} height={44} rx={4} fill={art('white')} stroke={t?.you ? art('red') : art('in-ticket-edge')} strokeWidth={t?.you ? 2.5 : 1} />
                <rect x={212 + i * 134} y={134 + r * 52} width={4} height={44} fill={PCOL[(i * 2 + r) % PCOL.length]} />
                {t ? <>
                  <text x={222 + i * 134} y={150 + r * 52} fontSize={9} fontWeight={700} fill={art('sign-base')} fontFamily={MONO}>{clip(t.id, 14)}</text>
                  <text x={222 + i * 134} y={166 + r * 52} fontSize={10} fontWeight={600} fill={art('pic-ink')} fontFamily={F}>{clip(t.title, 17)}</text>
                  {t.you && <><rect x={292 + i * 134} y={128 + r * 52} width={26} height={13} rx={6} fill={art('red')} />
                    <text x={305 + i * 134} y={137.5 + r * 52} textAnchor="middle" fontSize={7.5} fontWeight={800} fill={art('white')} fontFamily={F}>YOU</text></>}
                </> : <>
                  <rect x={222 + i * 134} y={146 + r * 52} width={60} height={6} rx={2} fill={art('in-ticket-edge')} />
                  <rect x={222 + i * 134} y={160 + r * 52} width={88} height={7} rx={2} fill={art('in-ticket-edge')} />
                </>}
              </g>
            ))}
          </g>
        );
      })}
      <polygon points="18,118 150,136 150,302 18,330" fill={art('in-glass')} stroke={art('in-glass-edge')} strokeWidth={3} />
      <line x1={84} y1={127} x2={84} y2={316} stroke={art('in-glass-edge')} strokeWidth={2} />
      <text x={30} y={196} fontSize={10} fontWeight={800} fill={art('library')} fontFamily={F}>STANDUP</text>
    </g>
  );
}

export function GalleryScreens({ titles, banner }: { titles?: string[]; banner: string }): React.ReactElement {
  return (
    <g data-testid="cm-wall-screens">
      {[214, 398, 582].map((x, i) => (
        <g key={x}><rect x={x} y={104} width={164} height={104} rx={5} fill={art('screen-frame')} /><rect x={x + 8} y={112} width={148} height={88} fill={art('white')} />
          <rect x={x + 8} y={112} width={148} height={14} fill={art(['screen-1', 'screen-2', 'screen-3'][i])} /><rect x={x + 16} y={134} width={60} height={58} fill={art('in-ticket-col')} />
          <rect x={x + 84} y={134} width={64} height={8} fill={art('in-ticket-edge')} /><rect x={x + 84} y={148} width={50} height={8} fill={art('in-ticket-edge')} />
          <rect x={x + 74} y={208} width={16} height={22} fill={art('antenna')} />
          {titles?.[i] && <text x={x + 82} y={250} textAnchor="middle" fontSize={12} fontWeight={700} fill={art('in-frame')} fontFamily={F}>{clip(titles[i], 22)}</text>}
        </g>
      ))}
      <rect x={300} y={268} width={360} height={40} rx={4} fill={art('gallery')} />
      <text x={480} y={294} textAnchor="middle" fontSize={13} fontWeight={800} fill={art('white')} fontFamily={F} letterSpacing={2}>{banner.toUpperCase()}</text>
    </g>
  );
}

/** Small art for each of the build's own games (its own designs, not the prototype's look-alikes, decision Q3). */
function GameArt({ id, x, y, c }: { id: string; x: number; y: number; c: string }): React.ReactElement {
  if (id === 'byte-chase') return <g>{[0, 1, 2, 3, 4].map((i) => <rect key={i} x={x + 14 + i * 16} y={y + 44} width={5} height={5} fill={c} opacity={0.8} />)}
    <rect x={x + 6} y={y + 36} width={20} height={20} rx={4} fill={c} /><circle cx={x + 90} cy={y + 46} r={8} fill={art('neon-2')} /></g>;
  if (id === 'launch-lab') return <g><rect x={x + 10} y={y + 72} width={22} height={8} fill={c} />
    <path d={`M${x + 21} ${y + 70} Q${x + 54} ${y + 2} ${x + 88} ${y + 54}`} fill="none" stroke={c} strokeWidth={2} strokeDasharray="4 4" />
    <circle cx={x + 88} cy={y + 56} r={7} fill={art('neon-3')} /><rect x={x + 80} y={y + 64} width={18} height={20} fill={art('in-cab-2-d')} stroke={c} /></g>;
  return <g>{[0, 1, 2].map((r) => [0, 1, 2, 3, 4].map((i) => <rect key={`${r}-${i}`} x={x + 8 + i * 19} y={y + 10 + r * 11} width={16} height={8} fill={PCOL[(r * 5 + i) % PCOL.length]} />))}
    <rect x={x + 38} y={y + 80} width={32} height={5} rx={2} fill={c} /><circle cx={x + 54} cy={y + 66} r={4} fill={c} /></g>;
}

const GAMES: [string, string, string, string, string][] = [
  ['byte-chase', 'Byte Chase', 'in-cab-1', 'in-cab-1-d', 'neon-3'], ['launch-lab', 'Launch Lab', 'in-cab-2', 'in-cab-2-d', 'neon-4'], ['bug-breaker', 'Bug Breaker', 'in-cab-3', 'in-cab-3-d', 'neon-2'],
];

export function Arcade({ best }: { best?: WallFacts['best'] }): React.ReactElement {
  return (
    <>
      <text x={500} y={76} textAnchor="middle" fontSize={20} fontWeight={900} fill={art('neon-text')} fontFamily={F} letterSpacing={5}>GAME ROOM</text>
      {GAMES.map(([id, name, c1, c1d, c2], i) => { const x = 250 + i * 184; const b = best?.[id]; return (
        <g key={id} className="cm-cab" data-game={id}>
          <rect x={x} y={96} width={132} height={236} rx={10} fill={art(c1)} />
          <rect x={x + 8} y={104} width={116} height={26} rx={5} fill={art('neon-sign')} />
          <text x={x + 66} y={122} textAnchor="middle" fontSize={12} fontWeight={900} fill={art(c2)} fontFamily={F} letterSpacing={1}>{name.toUpperCase()}</text>
          <rect x={x + 12} y={138} width={108} height={92} rx={6} fill={art('in-cab-screen')} stroke={art(c2)} strokeWidth={2} />
          <GameArt id={id} x={x + 12} y={138} c={art(c2)} />
          <rect x={x + 6} y={240} width={120} height={36} rx={5} fill={art(c1d)} />
          <circle cx={x + 40} cy={258} r={7} fill={art('joystick')} /><circle cx={x + 40} cy={244} r={5} fill={art('red')} />
          <circle cx={x + 84} cy={258} r={6} fill={art('neon-3')} /><circle cx={x + 100} cy={258} r={6} fill={art('neon-2')} />
          <text x={x + 66} y={304} textAnchor="middle" fontSize={11} fontWeight={800} fill={art('white')} fontFamily={F}>▶ TAP TO PLAY</text>
          <text x={x + 66} y={320} textAnchor="middle" fontSize={10} fill={art(c2)} fontFamily={MONO} data-testid={`cm-cab-best-${id}`}>BEST {typeof b === 'number' ? b.toLocaleString('en-US') : '—'}</text>
        </g>
      ); })}
    </>
  );
}
