import React from 'react';
import { Figure } from '../Figure';
import type { FigurePerson } from '../Figure';

/**
 * The 3D room's two drawing primitives (lifted out of Room3D, C25): a billboard standing on the floor at (x share of the width,
 * z share of the depth), and a standing figure.
 */
export function Billboard({ x, z, w, h, fw, fh, d, children, className = '', ...rest }: { x: number; z: number; w: number; h: number; fw: number; fh: number; d: number; children: React.ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={`cm-r3-bb ${className}`} style={{ width: w, height: h, transform: `translate3d(${fw * x - w / 2}px, ${fh - h}px, ${-d * z}px)` }} {...rest}>{children}</div>;
}

export const person = (p: FigurePerson, lanyard: boolean | undefined, onPick?: (at: { x: number; y: number }) => void, testId?: string): React.ReactElement => (
  <svg viewBox="-45 -128 90 132" width={70} height={130} overflow="visible"><Figure x={0} y={0} s={1} p={p} pose="stand" lanyard={lanyard} onPick={onPick} testId={testId} /></svg>
);
