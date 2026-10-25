import React, { useEffect, useRef } from 'react';
import { H, W, seededRng } from './engine/engineTypes';
import { paletteFrom } from './useCanvasGame';
import { gameInfo } from './gameCatalog';
import type { GameId } from './engine/gameRules';

/**
 * A game's art for its card, the hero and the room's cabinets (C34; the prototype's drawArt): the game's own first frame, drawn once by
 * its real engine (seeded, so it is the same picture every time) in the page's palette. Decorative: hidden from assistive tech. jsdom
 * has no canvas, so in tests it renders an empty canvas.
 */
export default function GameArt({ game, className }: { game: GameId; className?: string }): React.ReactElement {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext?.('2d');
    if (!c || !ctx) return;
    const engine = gameInfo(game).engine;
    const rng = seededRng(7);
    const s = engine.init(rng);
    for (let i = 0; i < 20; i += 1) engine.update(s, 1 / 30, { left: false, right: false, up: false, down: false, action: false, pointer: null, swipe: null }, rng);
    engine.draw(ctx as unknown as Parameters<typeof engine.draw>[0], s, paletteFrom(c));
  }, [game]);
  return <canvas ref={ref} width={W} height={H} className={`gr-art${className ? ` ${className}` : ''}`} aria-hidden="true" data-testid={`gr-art-${game}`} />;
}
