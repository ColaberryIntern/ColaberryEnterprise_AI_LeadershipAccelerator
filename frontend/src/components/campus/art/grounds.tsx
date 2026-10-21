import React from 'react';
import { art } from './artColor';

/**
 * The campus grounds, ported from the prototype (drawGround, drawPaths, drawDistrictDecor, drawTrees; SVG defs for the grass and
 * paving patterns). World coordinates (1000 x 700); everything here is decoration and aria-hidden. The water shimmer is a CSS
 * animation on .water that the campus turns off with reduce motion.
 */
export const HUB = { x: 500, y: 400 };
export const AVE = 592;
export const GATE = { x: 500, y: 640 };

/** The pattern defs and the endless grass under the world. */
export function GroundPatterns(): React.ReactElement {
  return (
    <>
      <defs>
        <pattern id="cm-paving" width="24" height="24" patternUnits="userSpaceOnUse">
          <rect width="24" height="24" fill={art('paving')} />
          <path d="M24 0H0V24" fill="none" stroke={art('paving-line')} strokeWidth="1" />
        </pattern>
        <pattern id="cm-grass" width="22" height="22" patternUnits="userSpaceOnUse">
          <rect width="22" height="22" fill={art('ground')} />
          <circle cx="4" cy="6" r="1" fill={art('ground-dot')} />
          <circle cx="15" cy="16" r="1" fill={art('ground-dot')} />
        </pattern>
      </defs>
      <rect className="dimmable" x={-1500} y={-1500} width={4000} height={4000} fill="url(#cm-grass)" data-testid="cm-ground-grass" />
    </>
  );
}

/** The paved district, the quad lawn, the gate lawn and the pond. */
export function Ground(): React.ReactElement {
  return (
    <g className="dimmable" aria-hidden="true">
      <path d="M640 112H968V664H596V472H812V296H640Z" fill="url(#cm-paving)" stroke={art('district-edge')} strokeWidth={3} strokeLinejoin="round" data-testid="cm-district" />
      <ellipse cx={500} cy={395} rx={175} ry={95} fill={art('lawn')} data-testid="cm-quad-lawn" />
      <rect x={60} y={600} width={536} height={70} rx={30} fill={art('lawn-gate')} />
      <ellipse cx={880} cy={200} rx={60} ry={30} fill={art('water')} />
      <ellipse className="water" cx={880} cy={200} rx={60} ry={30} fill={art('water-hi')} />
    </g>
  );
}

export interface PathDoor { id: string; x: number; y: number; zone: 'up' | 'ave' | 'gate' }

function Seg({ d, w }: { d: string; w: number }): React.ReactElement {
  return (
    <>
      <path d={d} stroke={art('path-edge')} strokeWidth={w + 4} fill="none" strokeLinecap="round" />
      <path d={d} stroke={art('path')} strokeWidth={w} fill="none" strokeLinecap="round" />
    </>
  );
}

/** Two-tone paths: upper buildings to the hub, the avenue, lower buildings down to it, the spine to the gate; the fountain. */
export function QuadAndPaths({ doors }: { doors: PathDoor[] }): React.ReactElement {
  return (
    <g className="dimmable" aria-hidden="true" data-testid="cm-paths">
      {doors.filter((b) => b.zone === 'up').map((b) => <Seg key={`u-${b.id}`} d={`M${HUB.x} ${HUB.y}L${b.x} ${b.y + 6}`} w={12} />)}
      <Seg d={`M100 ${AVE}L900 ${AVE}`} w={16} />
      {doors.filter((b) => b.zone === 'ave').map((b) => <Seg key={`a-${b.id}`} d={`M${b.x} ${b.y + 6}L${b.x} ${AVE}`} w={12} />)}
      <Seg d={`M500 ${HUB.y}L500 ${GATE.y + 30}`} w={18} />
      <g data-testid="cm-fountain">
        <circle cx={500} cy={400} r={34} fill={art('path-edge')} />
        <circle cx={500} cy={400} r={28} fill={art('fountain')} />
        <circle className="water" cx={500} cy={400} r={20} fill={art('water-hi')} />
        <circle cx={500} cy={400} r={6} fill={art('white')} opacity={0.9} />
      </g>
      <text x={500} y={448} textAnchor="middle" fontSize={9} fontWeight={700} letterSpacing={2} fill={art('quad-text')} data-testid="cm-quad-label">THE QUAD</text>
    </g>
  );
}

const LAMPS: [number, number][] = [[640, AVE - 34 + 22], [710, AVE - 12], [780, AVE - 12], [850, AVE - 12], [920, AVE - 12], [670, 250], [835, 330], [835, 420]];

/** Lamp posts and the COLABERRY WORKS / BUSINESS DISTRICT sign. */
export function District(): React.ReactElement {
  return (
    <g className="dimmable" aria-hidden="true">
      {LAMPS.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect x={x - 1.5} y={y - 22} width={3} height={22} fill={art('lamp-post')} />
          <circle cx={x} cy={y - 23} r={4} fill={art('lamp')} stroke={art('lamp-post')} strokeWidth={1.5} />
        </g>
      ))}
      <g transform="translate(892,312)" data-testid="cm-district-sign">
        <rect x={-68} y={-26} width={136} height={40} rx={6} fill={art('sign')} />
        <rect x={-68} y={14} width={136} height={6} fill={art('sign-base')} />
        <text x={0} y={-8} textAnchor="middle" fontSize={10.5} fontWeight={800} fill={art('white')} letterSpacing={1.5}>COLABERRY WORKS</text>
        <text x={0} y={6} textAnchor="middle" fontSize={7.5} fill={art('sign-sub')} letterSpacing={1.2} fontWeight={700}>BUSINESS DISTRICT</text>
      </g>
    </g>
  );
}

const TREE_SPOTS: [number, number][] = [[60, 190], [92, 222], [372, 150], [624, 140], [652, 168], [905, 300], [935, 330], [950, 420], [55, 420], [88, 452],
  [410, 480], [592, 482], [332, 410], [640, 470], [960, 610], [40, 610], [420, 640], [580, 640], [870, 120], [60, 300], [220, 400], [790, 420], [825, 450], [180, 140]];
const inDistrict = (x: number, y: number) => (x >= 628 && y <= 300) || (x >= 800 && y <= 480) || (x >= 590 && y >= 460);
const PLANTERS: [number, number][] = [[700, 140], [960, 250], [965, 470], [620, 650]];

/** The prototype's fixed trees (none inside the district or on the Game Room), and the district's planters. */
export function Trees(): React.ReactElement {
  return (
    <g className="dimmable" aria-hidden="true" data-testid="cm-trees">
      {/* One symbol per size and tone, each tree a single <use> (the map is drawn up to three times on a page). Every map
          defines the same ids with the same content, so whichever one a <use> resolves to draws the same tree. */}
      <defs>
        {[0, 1, 2].flatMap((k) => [0, 1].map((tone) => {
          const r = 10 + k * 3;
          return (
            <symbol key={`s${k}${tone}`} id={`cm-tree-${k}-${tone}`} overflow="visible">
              <ellipse cx={0} cy={r - 2} rx={r} ry={4} fill={art('tree-shadow')} />
              <circle cx={0} cy={0} r={r} fill={art(tone ? 'tree-1' : 'tree-2')} />
              <circle cx={-r * 0.3} cy={-r * 0.3} r={r * 0.45} fill={art('tree-hi')} opacity={0.7} />
            </symbol>
          );
        }))}
      </defs>
      {TREE_SPOTS.map(([x, y], i) => {
        if (inDistrict(x, y) || (Math.abs(x - 210) < 80 && Math.abs(y - 428) < 62)) return null;
        return <use key={`t${i}`} className="cm-tree" href={`#cm-tree-${i % 3}-${i % 2}`} x={x} y={y} />;
      })}
      {PLANTERS.map(([x, y]) => (
        <g key={`p${x}`}>
          <rect x={x - 9} y={y - 6} width={18} height={10} rx={2} fill={art('sign-base')} />
          <circle cx={x} cy={y - 9} r={8} fill={art('tree-1')} />
        </g>
      ))}
    </g>
  );
}
