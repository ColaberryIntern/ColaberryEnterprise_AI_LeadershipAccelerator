import React from 'react';
import { ALL_CATEGORIES, type Category } from './todayCategoryFilter';

/**
 * TimelineFilterChips — CAPE Phase 5 real filter chips (design doc §11
 * "Timeline header"), extracted from TodayShell.tsx into its own component
 * once that file crossed CLAUDE.md's 500-line hard ceiling a second time
 * (T012 added the chip logic on top of T011's already-tight budget).
 *
 * `enabled=false` renders the ORIGINAL decorative, always-0 chips
 * byte-for-byte — so `CAPE_TODAY_PLAN_ENABLED=false` keeps the Today page's
 * timeline header exactly as it was before Phase 5.
 */
const CATEGORY_LABELS = ['Your setup', 'Projects', 'Schedule', 'Your path', 'Classroom', 'Cert Prep', 'Community'];
const CATEGORY_CHIP_LABELS: Record<Category, string> = {
  my_path: 'My Path', ai_pulse: 'AI Pulse', classroom: 'Classroom',
  projects: 'Projects', community: 'Community', review: 'Review',
};

interface Props {
  enabled: boolean;
  filter: Category | 'all';
  counts: Record<Category, number>;
  onChange: (filter: Category | 'all') => void;
}

const TimelineFilterChips: React.FC<Props> = ({ enabled, filter, counts, onChange }) => {
  if (!enabled) {
    return (
      <div className="te-feed-filter">
        {CATEGORY_LABELS.map((label) => (
          <span key={label} className="fchip"><span>{label}</span> <span className="ct">0</span></span>
        ))}
      </div>
    );
  }

  return (
    <div className="te-feed-filter" role="tablist" aria-label="Filter your timeline">
      <button
        type="button"
        className="fchip"
        role="tab"
        aria-selected={filter === 'all'}
        onClick={() => onChange('all')}
        style={filter === 'all' ? { fontWeight: 700 } : undefined}
      >
        <span>All</span>
      </button>
      {ALL_CATEGORIES.map((cat) => (
        <button
          key={cat}
          type="button"
          className="fchip"
          role="tab"
          aria-selected={filter === cat}
          onClick={() => onChange(cat)}
          style={filter === cat ? { fontWeight: 700 } : undefined}
        >
          <span>{CATEGORY_CHIP_LABELS[cat]}</span> <span className="ct">{counts[cat]}</span>
        </button>
      ))}
    </div>
  );
};

export default TimelineFilterChips;
