import React from 'react';
import { H, W, Engine, Hud } from './engine/engineTypes';
import { useCanvasGame } from './useCanvasGame';

/**
 * One game cabinet (Colaberry Campus C10): the 480 x 360 canvas, scaled by CSS, plus the score, lives and level line. One component for
 * all three games (the engines differ, the cabinet does not). `onOver` gets the final score; `onScore` sees every HUD update so the page
 * can still submit a game the cap interrupted.
 */
export interface GameCanvasProps<S> {
  engine: Engine<S>; running: boolean; onOver: (score: number) => void; onScore?: (score: number) => void; label: string;
  /** C34: the cabinet modal shows score, level and lives in its own header pills, so it hides this line. */
  onHud?: (hud: Hud) => void; hideHud?: boolean;
}

export default function GameCanvas<S>({ engine, running, onOver, onScore, label, onHud, hideHud }: GameCanvasProps<S>): React.ReactElement {
  const { canvasRef, hud } = useCanvasGame(engine, running, onOver);
  React.useEffect(() => { onScore?.(hud.score); }, [hud.score, onScore]);
  React.useEffect(() => { onHud?.(hud); }, [hud, onHud]);
  const livesWord = engine.id === 'launch-lab' ? 'Orbs' : 'Lives';
  // C11: the score changes many times a second; announcing it buried everything else. Only level, lives and the end are spoken.
  const spoken = hud.over ? `Game over. Score ${hud.score}.` : running ? `Level ${hud.level}. ${livesWord} ${hud.lives}.` : '';
  return (
    <div className="gr-cabinet">
      {/* Focusable so the game's keys are read here and nowhere else (useCanvasGame); focused when a game starts. */}
      <canvas ref={canvasRef} width={W} height={H} className="gr-canvas" tabIndex={0} role="application"
        aria-label={`${label} game area. Arrow keys or W A S D to move, Space to act.`} data-testid="gr-canvas" />
      {!hideHud && (
        <div className="gr-hud" data-testid="gr-hud">
          <span>Score {hud.score}</span><span>Level {hud.level}</span><span>{livesWord} {hud.lives}</span>
        </div>
      )}
      <p className="gr-sr-only" aria-live="polite" data-testid="gr-announce">{spoken}</p>
      {hud.hint && <p className="gr-hint">{hud.hint}</p>}
    </div>
  );
}
