import { NO_INPUT, Input, Palette, Ctx } from './engineTypes';

/** Test helpers for the Game Room engines: a recording 2D context, a palette, and input builders. */
export const PALETTE: Palette = { bg: 'bg', ink: 'ink', muted: 'muted', line: 'line', berry: 'berry', cherry: 'cherry', leaf: 'leaf', amber: 'amber', surface: 'surface' };

export interface Call { op: string; args: unknown[]; fill: string }
export function recordingCtx(): Ctx & { calls: Call[] } {
  const calls: Call[] = [];
  const ctx = {
    calls, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left' as CanvasTextAlign, globalAlpha: 1,
  } as unknown as Ctx & { calls: Call[] };
  for (const op of ['fillRect', 'strokeRect', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'fill', 'stroke', 'arc', 'fillText', 'save', 'restore']) {
    (ctx as unknown as Record<string, unknown>)[op] = (...args: unknown[]) => { calls.push({ op, args, fill: String((ctx as unknown as { fillStyle: string }).fillStyle) }); };
  }
  return ctx;
}

export const input = (o: Partial<Input> = {}): Input => ({ ...NO_INPUT, ...o });
