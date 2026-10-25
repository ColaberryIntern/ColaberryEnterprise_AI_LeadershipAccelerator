import type { Engine } from './engine/engineTypes';
import type { GameId } from './engine/gameRules';
import { byteChase } from './engine/byteChaseEngine';
import { launchLab } from './engine/launchLabEngine';
import { bugBreaker } from './engine/bugBreakerEngine';
import { stackDrop } from './engine/stackDropEngine';
import { tokenTrail } from './engine/tokenTrailEngine';

/**
 * The five games (Campus v8, C34/C35) in one place: name, one line, controls, whether it is new, and its engine. The page, the cabinet,
 * the room and the leaderboards all read this list. Original names and designs (round-1 Q3; no third-party trade dress).
 */
export interface GameInfo { id: GameId; name: string; blurb: string; controls: string; isNew: boolean; engine: Engine<unknown> }

export const GAME_CATALOG: GameInfo[] = [
  { id: 'stack-drop', name: 'Stack Drop', blurb: 'Drop the data blocks, fill whole rows and clear them before the stack reaches the top.', controls: '← → move · ↑ rotate · ↓ soft drop · Space hard drop', isNew: true, engine: stackDrop as Engine<unknown> },
  { id: 'token-trail', name: 'Token Trail', blurb: 'Collect the T tokens to grow your trail; keep clear of the walls and your own tail.', controls: 'Arrows or WASD to turn', isNew: true, engine: tokenTrail as Engine<unknown> },
  { id: 'byte-chase', name: 'Byte Chase', blurb: 'Guide a data packet through the circuit, collect bits, and freeze the glitches with keys.', controls: 'Arrows or WASD to move', isNew: false, engine: byteChase as Engine<unknown> },
  { id: 'launch-lab', name: 'Launch Lab', blurb: 'Aim the launch pad and clear the glitch nodes off the server racks.', controls: 'Mouse or arrows to aim · Space to launch', isNew: false, engine: launchLab as Engine<unknown> },
  { id: 'bug-breaker', name: 'Bug Breaker', blurb: 'Keep the ball up and break the wall of bugs.', controls: 'Mouse, finger or arrows · Space to serve', isNew: false, engine: bugBreaker as Engine<unknown> },
];

export const gameInfo = (id: GameId): GameInfo => GAME_CATALOG.find((g) => g.id === id) ?? GAME_CATALOG[0];

/**
 * The featured game (G1): the newest game you have not played; otherwise the game where you are closest to the next rank (your best
 * rank that is not already first); otherwise the first game.
 */
export function featuredGame(bests: Partial<Record<GameId, number>>, ranks: Partial<Record<GameId, number>>): GameInfo {
  const unplayed = GAME_CATALOG.find((g) => g.isNew && bests[g.id] === undefined);
  if (unplayed) return unplayed;
  const chasing = GAME_CATALOG.filter((g) => (ranks[g.id] ?? 0) > 1).sort((a, b) => (ranks[a.id] as number) - (ranks[b.id] as number))[0];
  return chasing ?? GAME_CATALOG[0];
}

export const mmss = (s: number): string => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;
