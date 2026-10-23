import React from 'react';
import { art } from '../art/artColor';
import type { Feature } from './roomModel';
import { Arcade, GalleryScreens, ScheduleBoard, SprintWall } from './RoomWalls';
import type { WallFacts } from './RoomWalls';

export type { WallFacts } from './RoomWalls';

/**
 * Each building's back-wall feature, ported from the prototype's featureSVG. The pictures are the prototype's; its invented facts
 * are not: no made-up events, dates, client names or tickets (the real-data rule). Where the prototype wrote one, a neutral sign
 * names the room instead. The Classroom screen says ON AIR only while a broadcast really is on air here.
 * WP-5: the walls that carry facts (schedule, sprint, gallery, arcade) live in RoomWalls; the Classroom screen shows the next
 * session and the Events Hall banner the next event, when there is one.
 */
const F = "'DM Sans',system-ui,sans-serif";
const PCOL = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10'].map((p) => art(`in-${p}`));

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

/** `name` is the building's name as this viewer sees it (Workplace names rename rooms), for the signs that name the room. */
export default function RoomFeature({ feature, onAir, name, wall = {} }: { feature: Feature; onAir: boolean; name: string; wall?: WallFacts }): React.ReactElement {
  switch (feature) {
    case 'arcade': return <Arcade best={wall.best} />;
    case 'screen': return (
      <g>
        <rect x={320} y={88} width={360} height={184} rx={6} fill={art('in-screen')} />
        <text x={500} y={186} textAnchor="middle" fontSize={22} fontWeight={700} fill={art('white')} fontFamily="Fraunces,Georgia,serif">{(!onAir && wall.classroom) || name}</text>
        {onAir && <><rect x={340} y={108} width={74} height={22} rx={5} fill={art('red')} /><text x={377} y={123} textAnchor="middle" fontSize={11} fontWeight={800} fill={art('white')} fontFamily={F}>ON AIR</text></>}
      </g>
    );
    case 'shelves': return <Shelves />;
    case 'schedule': return <ScheduleBoard day={wall.day} rows={wall.schedule} />;
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
        <text x={500} y={110} textAnchor="middle" fontSize={18} fontWeight={800} fill={art('white')} fontFamily={F} letterSpacing={3}>{(wall.eventBanner || name).toUpperCase()}</text>
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
        <text x={500} y={320} textAnchor="middle" fontSize={12} fill={art('in-star-gold')} fontFamily={F} fontWeight={700} letterSpacing={2}>YOUR SKILL CONSTELLATION</text>
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
    case 'sprint': return <SprintWall sprint={wall.sprint} />;
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
    case 'screens': return <GalleryScreens titles={wall.screens} banner={name} />;
    default: return <g />;
  }
}
