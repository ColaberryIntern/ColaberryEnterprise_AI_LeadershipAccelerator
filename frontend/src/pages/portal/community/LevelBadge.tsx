import React from 'react';
import { levelName } from '../../../services/communityApi';
import { isFiveBandUiEnabled, bandRungForLevel, rungTone } from '../../../services/onboardingApi';
import '../../../styles/rungTones.css';

interface Props {
  level: number;
  size?: 'sm' | 'md';
  /**
   * Optional server-authoritative band rung to show instead of deriving it from
   * `level`. Only used when the 5-band UI flag is on; otherwise ignored so the
   * legacy "Level N · name" output stays byte-identical.
   */
  rungName?: string;
}

// Level colors reuse the existing Design-E token palette (TodayShell.css) —
// no new hex values. lvl-4 uses --cherry (the brand accent) to read as the
// top tier, matching the reference mockup's intent without inventing tokens.
const LEVEL_CLASS: Record<number, string> = {
  1: 'cm-lvl-1',
  2: 'cm-lvl-2',
  3: 'cm-lvl-3',
  4: 'cm-lvl-4',
};

const LevelBadge: React.FC<Props> = ({ level, size = 'md', rungName }) => {
  // 5-band re-skin: show the canonical band rung (e.g. "AI Enabled II"). The rung
  // falls back to the free points-band derived from `level` when a caller has no
  // server band on hand. The COLOUR follows the rung too (one tone per rung, see
  // rungTone) — before 2026-09-16 it followed the points level, so every promoted
  // learner wore the same pink as the free ceiling. Flag OFF → legacy
  // "Level N · Apprentice/…/Principal" with the legacy level colours.
  if (isFiveBandUiEnabled()) {
    const rung = rungName ?? bandRungForLevel(level);
    return <span className={`cm-lvl-badge rung-${rungTone(rung)}${size === 'sm' ? ' sm' : ''}`}>{rung}</span>;
  }
  const cls = `cm-lvl-badge ${LEVEL_CLASS[level] || 'cm-lvl-1'}${size === 'sm' ? ' sm' : ''}`;
  return (
    <span className={cls}>
      Level {level} · {levelName(level)}
    </span>
  );
};

export default LevelBadge;
