import React from 'react';
import type { OrgChartHuman } from '../../../../services/workforceOrgChartApi';

/**
 * OrgChartDepartmentGroup — one department's sub-section under Human
 * Employees (org-chart departments build, 2026-08-19, session
 * CC-20260818-x4nk continued: "we need to divide them up into dept").
 * Extracted out of OrgChartSection.tsx per CLAUDE.md's Modular Composition
 * Rule once department grouping pushed that file toward its size ceiling —
 * this component owns exactly one thing: rendering one department's roster
 * cards. Renders nothing (not even an empty header) for a department with
 * zero members, so departments with real people don't scroll past pages of
 * empty sections.
 *
 * Org Chart v5 (2026-08-21) — cards render as `wf-emp wf-emp-grid`, the new
 * 2-row layout (see themeKit.tsx's own header comment): avatar+name on top,
 * team count below. Same restructure applied to Leadership/Staff cards in
 * OrgChartSection.tsx for a consistent card system across the whole grid,
 * even though human names are short and were never individually at risk of
 * the character-wrapping bug that motivated this change.
 */

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

interface OrgChartDepartmentGroupProps {
  department: string;
  humans: OrgChartHuman[];
  colorFor: (id: string) => string;
  onSelect: (human: OrgChartHuman) => void;
}

const OrgChartDepartmentGroup: React.FC<OrgChartDepartmentGroupProps> = ({ department, humans, colorFor, onSelect }) => {
  if (humans.length === 0) return null;

  return (
    <div className="wf-dept-group">
      <div className="wf-lab" style={{ marginTop: 14 }}>{department} · {humans.length}</div>
      <div className="wf-dirs">
        {humans.map((h) => (
          <button
            key={h.id}
            type="button"
            className="wf-emp wf-emp-grid"
            style={{ textAlign: 'left', border: undefined }}
            onClick={() => onSelect(h)}
          >
            <div className="wf-emp-head">
              <span className="wf-av" style={{ background: colorFor(h.id) }}>{initials(h.name)}</span>
              <div style={{ minWidth: 0 }}>
                <div className="nm" title={h.name}>{h.name}</div>
                <div className="rl">{h.role}</div>
              </div>
            </div>
            <div className="wf-emp-meta">
              <div className="wl">
                <b>{h.leadership_agent_ids.length + h.staff_count}</b><br />in team
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default OrgChartDepartmentGroup;
