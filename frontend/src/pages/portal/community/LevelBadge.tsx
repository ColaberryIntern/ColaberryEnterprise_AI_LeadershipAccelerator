import React from 'react';
import { levelName } from '../../../services/communityApi';

interface Props {
  level: number;
  size?: 'sm' | 'md';
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

const LevelBadge: React.FC<Props> = ({ level, size = 'md' }) => (
  <span className={`cm-lvl-badge ${LEVEL_CLASS[level] || 'cm-lvl-1'}${size === 'sm' ? ' sm' : ''}`}>
    Level {level} · {levelName(level)}
  </span>
);

export default LevelBadge;
