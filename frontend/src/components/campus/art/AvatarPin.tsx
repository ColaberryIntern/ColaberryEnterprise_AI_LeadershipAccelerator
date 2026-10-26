import React from 'react';
import { GearOnHead } from '../AvatarGear';
import { publicOnly } from '../campusGear';
import type { Equipped } from '../campusGear';
import type { Pt } from '../walkPath';

/**
 * You on the map (the prototype's #avatar and renderMyAvatar, D:1059-1067, D:3179-3188; WP-3): the teardrop in your account's colour
 * (members red, Explorers green, partners navy, staff dark green), your photo in its head (or your initials, from your NAME), your
 * gear, and the yellow "Lv N" tag for those who earn points. It bobs while walking, faster while running (C46: no rides; the campus
 * is walked).
 */
export interface Me { initials: string; photo?: string | null; level?: number | null; tone?: 'member' | 'explorer' | 'business' | 'staff' }

export default function AvatarPin({ pos, moving, running = false, reduceMotion, ownGear, me }: {
  pos: Pt; moving: boolean; running?: boolean; reduceMotion: boolean; ownGear?: Equipped; me?: Me | null;
}): React.ReactElement {
  const tone = me?.tone ?? 'member';
  const lv = me?.level ?? null;
  return (
    <g className={`cm-avatar is-${tone}${moving ? (running ? ' is-running' : ' is-walking') : ''}`} transform={`translate(${pos.x} ${pos.y})`} aria-hidden="true" data-testid="cm-avatar">
      <ellipse className="cm-pin-shadow" cx={0} cy={3} rx={7} ry={2.5} />
      <g className="bob">
        <path className="cm-pin" d="M0 2 L-7 -12 A9 9 0 1 1 7 -12 Z" />
        {me?.photo
          ? <>
              <defs><clipPath id="cm-pin-photo"><circle cx={0} cy={-15} r={7.6} /></clipPath></defs>
              <image className="cm-pin-photo" href={me.photo} x={-7.6} y={-22.6} width={15.2} height={15.2} preserveAspectRatio="xMidYMid slice" clipPath="url(#cm-pin-photo)" data-testid="cm-avatar-photo" />
            </>
          : me?.initials
            ? <text className="cm-pin-initials" x={0} y={-15.2} textAnchor="middle">{me.initials.slice(0, 2)}</text>
            : <circle className="cm-pin-dot" cx={0} cy={-17.7} r={3.6} />}
        {ownGear && <GearOnHead gear={publicOnly(ownGear)} cx={0} cy={-17.7} r={9} />}
        {lv !== null && (
          <g className="cm-pin-lv" data-testid="cm-avatar-level">
            <rect x={7} y={-29} width={17} height={9} rx={4.5} />
            <text x={15.5} y={-22.6} textAnchor="middle">Lv{lv}</text>
          </g>
        )}
      </g>
    </g>
  );
}
