import React from 'react';
import type { TicketTypeFilterOption } from '../../../utils/ticketTypeMeta';
import type { TicketCreatorOption } from '../../../services/ticketCreatorApi';

/**
 * TicketBoardFilterBar — the Priority/Type/Source/Creator dropdown row on
 * `/admin/tickets` (extracted from AdminTicketBoardPage.tsx, Org Chart v5,
 * 2026-08-21, session CC-20260818-x4nk continued).
 *
 * CLAUDE.md's Modular Composition Rule: `AdminTicketBoardPage.tsx` was 620
 * lines — over the 500-line hard ceiling — before this change, and "the next
 * change to it MUST split it before adding new code." This run's next
 * change WAS new filter-bar code (the Creator select below), so that code
 * lands here, in a fresh, appropriately-scoped module, not in the monolith.
 * Presentational + controlled only: every piece of filter state and its
 * setter is owned by the parent page; this component renders the row and
 * calls the setters it's given. `typeOptions` is pre-built by the parent
 * (via `buildTicketTypeFilterOptions(stats?.byType)`) so this component
 * stays free of the stats-shaping concern — one responsibility, matching
 * `OrgChartDepartmentGroup.tsx`'s established simple-props extraction
 * pattern in this repo.
 *
 * Org Chart v5 Creator filter — the real fix: v4 (PR #1675) already wired
 * the `?creator=<agent_name>` deep link and a visible/clearable badge chip,
 * but that chip displayed the RAW internal `agent_name` slug (e.g.
 * `cory-engine`) and offered no way to CHANGE it to a different agent
 * in-page — only clear it. This `<select>`, populated from
 * `GET /api/admin/tickets/creators` (the same roster the org chart's own
 * Leadership+Staff cards draw from), fixes both: it shows the friendly
 * `display_name`, and picking a different option changes the filter live,
 * matching the exact interaction pattern of Priority/Type/Source. A
 * deep-linked or otherwise-set `filterCreator` value that isn't (yet, or
 * ever) in `creatorOptions` still renders as a synthetic option — the
 * active filter is never silently hidden, even before the roster fetch
 * resolves or if it targets a since-removed agent.
 */

interface TicketBoardFilterBarProps {
  filterPriority: string;
  setFilterPriority: (value: string) => void;
  filterType: string;
  setFilterType: (value: string) => void;
  filterSource: string;
  setFilterSource: (value: string) => void;
  filterCreator: string;
  setFilterCreator: (value: string) => void;
  typeOptions: TicketTypeFilterOption[];
  creatorOptions: TicketCreatorOption[];
  onClear: () => void;
}

const TicketBoardFilterBar: React.FC<TicketBoardFilterBarProps> = ({
  filterPriority,
  setFilterPriority,
  filterType,
  setFilterType,
  filterSource,
  setFilterSource,
  filterCreator,
  setFilterCreator,
  typeOptions,
  creatorOptions,
  onClear,
}) => {
  const creatorOptionsSorted = [...creatorOptions].sort((a, b) => a.display_name.localeCompare(b.display_name));
  const activeCreatorKnown = !filterCreator || creatorOptionsSorted.some((c) => c.agent_name === filterCreator);

  return (
    <>
      <select className="form-select form-select-sm" style={{ width: 140 }} value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
        <option value="">All Priorities</option>
        <option value="critical">Critical</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
      <select className="form-select form-select-sm" style={{ width: 160 }} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
        <option value="">All Types</option>
        {/* Data-driven from real ticket data (stats.byType), not a hardcoded list —
            every type that actually exists on a real ticket appears here, agent-
            generated types included, so this can never again silently omit a new
            TicketType the way it omitted student_support/reese_autonomous_outreach. */}
        {typeOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label} ({opt.count})</option>
        ))}
      </select>
      <select className="form-select form-select-sm" style={{ width: 140 }} value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
        <option value="">All Sources</option>
        <option value="cory">Cory</option>
        <option value="manual">Manual</option>
        <option value="system">System</option>
        <option value="ai_workforce">AI Workforce</option>
      </select>
      <select
        className="form-select form-select-sm"
        style={{ width: 220 }}
        aria-label="Creator"
        value={filterCreator}
        onChange={(e) => setFilterCreator(e.target.value)}
      >
        <option value="">All Creators</option>
        {creatorOptionsSorted.map((c) => (
          <option key={c.agent_name} value={c.agent_name}>{c.display_name}</option>
        ))}
        {/* Keeps a deep-linked/typed-in filter visible even if the roster
            hasn't loaded yet or targets an agent no longer in the current
            hierarchy — never silently drops the active filter. */}
        {!activeCreatorKnown && <option value={filterCreator}>{filterCreator}</option>}
      </select>
      <button className="btn btn-sm btn-outline-secondary" onClick={onClear}>
        Clear
      </button>
    </>
  );
};

export default TicketBoardFilterBar;
