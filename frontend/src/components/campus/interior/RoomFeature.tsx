import React from 'react';
import { art } from '../art/artColor';
import type { Feature } from './roomModel';

/**
 * Each building's back-wall feature, ported from the prototype's featureSVG. The pictures are the prototype's; its invented facts
 * are not: no made-up events, dates, client names or tickets (the real-data rule). Where the prototype wrote one, a neutral sign
 * names the room instead. The Classroom screen says ON AIR only while a broadcast really is on air here.
 */
const F = "'DM Sans',system-ui,sans-serif";
const MONO = 'ui-monospace,Menlo,monospace';
const PCOL = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10'].map((p) => art(`in-${p}`));
const GAMES: [string, string, string, string][] = [['Byte Chase', 'in-cab-1', 'in-cab-1-d', 'neon-3'], ['Launch Lab', 'in-cab-2', 'in-cab-2-d', 'neon-4'], ['Bug Breaker', 'in-cab-3', 'in-cab-3-d', 'neon-2']];

function Shelves(): React.ReactElement {
  return <>{[230, 380, 530].map((x) => (
    <g key={x}><rect x={x} y={90} width={130} height={200} fill={art('in-wood')} />
      {[0, 1, 2, 3].map((r) => (
        <g key={r}><rect x={x + 6} y={100 + r * 46} width={118} height={40} fill={art('in-wood-d')} />
          {Array.from({ length: 9 }, (_, i) => <rect key={i} x={x + 9 + i * 13} y={104 + r * 46 + (i % 3) * 3} width={10} height={36 - (i % 3) * 3} fill={PCOL[(i + r + x) % PCOL.length]} />)}
        </g>
      ))}
    </g>
  ))}</>;
}

function Arcade(): React.ReactElement {
  return (
    <>
      <text x={500} y={76} textAnchor="middle" fontSize={20} fontWeight={900} fill={art('neon-text')} fontFamily={F} letterSpacing={5}>GAME ROOM</text>
      {GAMES.map(([name, c1, c1d, c2], i) => { const x = 250 + i * 184; return (
        <g key={name}>
          <rect x={x} y={96} width={132} height={236} rx={10} fill={art(c1)} />
          <rect x={x + 8} y={104} width={116} height={26} rx={5} fill={art('neon-sign')} />
          <text x={x + 66} y={122} textAnchor="middle" fontSize={12} fontWeight={900} fill={art(c2)} fontFamily={F} letterSpacing={1}>{name.toUpperCase()}</text>
          <rect x={x + 12} y={138} width={108} height={92} rx={6} fill={art('in-cab-screen')} stroke={art(c2)} strokeWidth={2} />
          <rect x={x + 6} y={240} width={120} height={36} rx={5} fill={art(c1d)} />
          <circle cx={x + 40} cy={258} r={7} fill={art('joystick')} /><circle cx={x + 40} cy={244} r={5} fill={art('red')} />
          <circle cx={x + 84} cy={258} r={6} fill={art('neon-3')} /><circle cx={x + 100} cy={258} r={6} fill={art('neon-2')} />
        </g>
      ); })}
    </>
  );
}

/** `name` is the building's name as this viewer sees it (Workplace names rename rooms), for the signs that name the room. */
export default function RoomFeature({ feature, onAir, name }: { feature: Feature; onAir: boolean; name: string }): React.ReactElement {
  switch (feature) {
    case 'arcade': return <Arcade />;
    case 'screen': return (
      <g>
        <rect x={320} y={88} width={360} height={184} rx={6} fill={art('in-screen')} />
        <text x={500} y={186} textAnchor="middle" fontSize={22} fontWeight={700} fill={art('white')} fontFamily="Fraunces,Georgia,serif">{name}</text>
        {onAir && <><rect x={340} y={108} width={74} height={22} rx={5} fill={art('red')} /><text x={377} y={123} textAnchor="middle" fontSize={11} fontWeight={800} fill={art('white')} fontFamily={F}>ON AIR</text></>}
      </g>
    );
    case 'shelves': return <Shelves />;
    case 'schedule': return (
      <g>
        <rect x={250} y={90} width={480} height={170} rx={6} fill={art('in-board')} />
        <text x={270} y={118} fontSize={12} fontWeight={700} fill={art('in-board-amber')} fontFamily={MONO} letterSpacing={2}>TODAY</text>
        {[0, 1, 2, 3].map((i) => <rect key={i} x={270} y={138 + i * 28} width={300 - i * 40} height={9} rx={2} fill={art('in-board-text')} opacity={0.35} />)}
      </g>
    );
    case 'kanban': return (
      <g>
        <rect x={240} y={90} width={500} height={180} rx={4} fill={art('white')} stroke={art('in-kanban-edge')} strokeWidth={3} />
        {['TO DO', 'BUILDING', 'SHIPPED'].map((h, c) => (
          <g key={h}><text x={290 + c * 160} y={114} fontSize={12} fontWeight={800} fill={art('studio')} fontFamily={F}>{h}</text>
            {[0, 1, 2].slice(0, 3 - (c % 2)).map((r) => <rect key={r} x={265 + c * 160 + (r % 2) * 14} y={126 + r * 44} width={110} height={34} fill={art(`in-note-${c + 1}`)} transform={`rotate(${(r - 1) * 2} ${320 + c * 160} ${143 + r * 44})`} />)}
          </g>
        ))}
      </g>
    );
    case 'stage': return (
      <g>
        <rect x={270} y={80} width={460} height={46} rx={4} fill={art('in-stage')} />
        <text x={500} y={110} textAnchor="middle" fontSize={18} fontWeight={800} fill={art('white')} fontFamily={F} letterSpacing={3}>{name.toUpperCase()}</text>
        <path d="M240 330 L280 250 H720 L760 330Z" fill={art('in-stage-floor')} /><rect x={470} y={200} width={60} height={56} fill={art('in-stage-dark')} />
      </g>
    );
    case 'quiet': return (
      <g>
        <circle cx={500} cy={140} r={44} fill={art('white')} stroke={art('in-quiet')} strokeWidth={6} />
        <path d="M500 140V108M500 140l22 10" stroke={art('clock-hand')} strokeWidth={5} strokeLinecap="round" />
        <rect x={380} y={206} width={240} height={44} rx={6} fill={art('in-quiet')} />
        <text x={500} y={234} textAnchor="middle" fontSize={14} fontWeight={700} fill={art('white')} fontFamily={F}>Knowledge checks · quiet please</text>
      </g>
    );
    case 'stars': return (
      <g>
        <circle cx={500} cy={180} r={120} fill={art('in-sky')} stroke={art('in-sky-rim')} strokeWidth={8} />
        {Array.from({ length: 40 }, (_, i) => <circle key={i} cx={500 + Math.cos(i * 2.4) * ((i * 37) % 110)} cy={180 + Math.sin(i * 2.4) * ((i * 37) % 110)} r={(i % 3) * 0.6 + 0.8} fill={art('white')} />)}
        <path d="M500 110L560 160L535 235L465 235L440 160Z" fill={art('in-star-tint')} stroke={art('in-star-gold')} strokeWidth={2} />
        <text x={500} y={320} textAnchor="middle" fontSize={12} fill={art('in-star-gold')} fontFamily={F} fontWeight={700} letterSpacing={2}>YOUR PROGRESS</text>
      </g>
    );
    case 'lounge': return (
      <g>
        <rect x={230} y={96} width={150} height={150} rx={6} fill={art('in-lounge-panel')} stroke={art('white')} strokeWidth={8} />
        <rect x={620} y={96} width={150} height={150} rx={6} fill={art('in-lounge-panel')} stroke={art('white')} strokeWidth={8} />
        <text x={500} y={160} textAnchor="middle" fontSize={28} fontWeight={800} fill={art('in-lounge-neon')} fontFamily={F}>LIVE ROOMS</text>
        <circle cx={500} cy={196} r={7} fill={art('in-lounge-dot')} />
      </g>
    );
    case 'frames': return <>{([[230, 100, 120, 150, 'lecture'], [380, 90, 110, 110, 'studio'], [520, 100, 140, 120, 'amphi'], [690, 92, 90, 140, 'library']] as [number, number, number, number, string][]).map(([x, y, w, h, c], i) => (
      <g key={x}><rect x={x} y={y} width={w} height={h} fill={art('white')} stroke={art('in-frame')} strokeWidth={6} />
        <circle cx={x + w / 2} cy={y + h / 2} r={Math.min(w, h) / 3.2} fill={art(c)} opacity={0.85} />
        <rect x={x + 8} y={y + h - 26} width={w * 0.5} height={14} fill={PCOL[(i + 3) % PCOL.length]} opacity={0.7} /></g>
    ))}</>;
    case 'city': return (
      <g>
        <rect x={230} y={90} width={330} height={170} fill={art('in-city-sky')} />
        {[[240, 60], [275, 110], [310, 80], [350, 130], [395, 70], [430, 100], [470, 140], [510, 90]].map(([x, h]) => <rect key={x} x={x} y={260 - h} width={32} height={h} fill={art('in-city-bldg')} />)}
        <rect x={586} y={100} width={150} height={120} rx={6} fill={art('in-city-board')} />
        <text x={661} y={152} textAnchor="middle" fontSize={13} fontWeight={800} fill={art('white')} fontFamily={F}>AI INTERNSHIP</text>
        <text x={661} y={176} textAnchor="middle" fontSize={11} fill={art('in-city-board-sub')} fontFamily={F}>Client work</text>
      </g>
    );
    case 'sprint': return (
      <g>
        <rect x={196} y={82} width={552} height={220} rx={6} fill={art('white')} stroke={art('in-kanban-edge')} strokeWidth={3} />
        <text x={212} y={102} fontSize={10} fontWeight={800} fill={art('studio')} fontFamily={F} letterSpacing={1.5}>SPRINT BOARD</text>
        {(['BACKLOG', 'IN PROGRESS', 'REVIEW', 'SHIPPED'] as const).map((col, i) => (
          <g key={col}>
            <rect x={206 + i * 134} y={110} width={126} height={184} rx={4} fill={art('in-ticket-col')} />
            <text x={214 + i * 134} y={126} fontSize={9} fontWeight={800} fill={art(['sign-base', 'red', 'amphi', 'live'][i])} fontFamily={F} letterSpacing={1}>{col}</text>
            {[0, 1].slice(0, i === 3 ? 1 : 2).map((r) => (
              <g key={r}><rect x={212 + i * 134} y={134 + r * 52} width={114} height={44} rx={4} fill={art('white')} stroke={art('in-ticket-edge')} />
                <rect x={212 + i * 134} y={134 + r * 52} width={4} height={44} fill={PCOL[(i * 2 + r) % PCOL.length]} />
                <rect x={222 + i * 134} y={146 + r * 52} width={60} height={6} rx={2} fill={art('in-ticket-edge')} />
                <rect x={222 + i * 134} y={160 + r * 52} width={88} height={7} rx={2} fill={art('in-ticket-edge')} /></g>
            ))}
          </g>
        ))}
        <polygon points="18,118 150,136 150,302 18,330" fill={art('in-glass')} stroke={art('in-glass-edge')} strokeWidth={3} />
        <line x1={84} y1={127} x2={84} y2={316} stroke={art('in-glass-edge')} strokeWidth={2} />
        <text x={30} y={196} fontSize={10} fontWeight={800} fill={art('library')} fontFamily={F}>STANDUP</text>
      </g>
    );
    case 'clients': return (
      <g>
        <rect x={196} y={88} width={270} height={180} fill={art('in-city-sky')} />
        {[[204, 60], [236, 118], [268, 84], [302, 140], [340, 72], [374, 104], [410, 150], [440, 96]].map(([x, h]) => <rect key={x} x={x} y={268 - h} width={26} height={h} fill={art('in-city-bldg')} />)}
        <rect x={196} y={88} width={270} height={180} fill="none" stroke={art('white')} strokeWidth={8} />
        <rect x={490} y={96} width={250} height={168} rx={6} fill={art('sign')} />
        <text x={506} y={120} fontSize={10} fontWeight={800} fill={art('sign-sub')} fontFamily={F} letterSpacing={1.5}>CLIENT ENGAGEMENTS</text>
        {[0, 1, 2].map((i) => <g key={i}><circle cx={512} cy={146 + i * 40} r={5} fill={art(['in-lounge-dot', 'neon-3', 'sign-sub'][i])} /><rect x={524} y={140 + i * 40} width={140 - i * 20} height={9} rx={2} fill={art('sign-sub')} opacity={0.5} /></g>)}
      </g>
    );
    case 'screens': return (
      <g>
        {[214, 398, 582].map((x, i) => (
          <g key={x}><rect x={x} y={104} width={164} height={104} rx={5} fill={art('screen-frame')} /><rect x={x + 8} y={112} width={148} height={88} fill={art('white')} />
            <rect x={x + 8} y={112} width={148} height={14} fill={art(['screen-1', 'screen-2', 'screen-3'][i])} /><rect x={x + 16} y={134} width={60} height={58} fill={art('in-ticket-col')} />
            <rect x={x + 84} y={134} width={64} height={8} fill={art('in-ticket-edge')} /><rect x={x + 84} y={148} width={50} height={8} fill={art('in-ticket-edge')} />
            <rect x={x + 74} y={208} width={16} height={22} fill={art('antenna')} /></g>
        ))}
        <rect x={300} y={268} width={360} height={40} rx={4} fill={art('gallery')} />
        <text x={480} y={294} textAnchor="middle" fontSize={13} fontWeight={800} fill={art('white')} fontFamily={F} letterSpacing={2}>{name.toUpperCase()}</text>
      </g>
    );
    default: return <g />;
  }
}
