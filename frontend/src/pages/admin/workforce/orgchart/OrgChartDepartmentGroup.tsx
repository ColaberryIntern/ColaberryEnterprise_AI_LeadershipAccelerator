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
            className="wf-emp"
            style={{ display: 'flex', textAlign: 'left', border: undefined }}
            onClick={() => onSelect(h)}
          >
            <span className="wf-av" style={{ background: colorFor(h.id) }}>{initials(h.name)}</span>
            <div style={{ minWidth: 0 }}>
              <div className="nm">{h.name}</div>
              <div className="rl">{h.role}</div>
            </div>
            <div className="wl">
              <b>{h.leadership_agent_ids.length + h.staff_count}</b><br />in team
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default OrgChartDepartmentGroup;
