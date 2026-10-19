import React from 'react';
import { H, W, Engine } from './engine/engineTypes';
import { useCanvasGame } from './useCanvasGame';

/**
 * One game cabinet (Colaberry Campus C10): the 480 x 360 canvas, scaled by CSS, plus the score, lives and level line. One component for
 * all three games (the engines differ, the cabinet does not). `onOver` gets the final score; `onScore` sees every HUD update so the page
 * can still submit a game the cap interrupted.
 */
export interface GameCanvasProps<S> { engine: Engine<S>; running: boolean; onOver: (score: number) => void; onScore?: (score: number) => void; label: string }

export default function GameCanvas<S>({ engine, running, onOver, onScore, label }: GameCanvasProps<S>): React.ReactElement {
  const { canvasRef, hud } = useCanvasGame(engine, running, onOver);
  React.useEffect(() => { onScore?.(hud.score); }, [hud.score, onScore]);
  return (
    <div className="gr-cabinet">
      <canvas ref={canvasRef} width={W} height={H} className="gr-canvas" role="img" aria-label={`${label} game area`} data-testid="gr-canvas" />
      <div className="gr-hud" aria-live="polite" data-testid="gr-hud">
        <span>Score {hud.score}</span><span>Level {hud.level}</span><span>{engine.id === 'launch-lab' ? 'Orbs' : 'Lives'} {hud.lives}</span>
      </div>
      {hud.hint && <p className="gr-hint">{hud.hint}</p>}
    </div>
  );
}
