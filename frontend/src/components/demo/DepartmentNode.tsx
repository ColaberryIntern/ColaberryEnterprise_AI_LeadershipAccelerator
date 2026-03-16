import React from 'react';
import { DemoDepartment } from './demoData';

interface DepartmentNodeProps {
  department: DemoDepartment;
  isSelected: boolean;
  onClick: () => void;
}

export default function DepartmentNode({
  department,
  isSelected,
  onClick,
}: DepartmentNodeProps) {
  return (
    <button
      type="button"
      className="card border-0 shadow-sm w-100 text-start p-3 position-relative"
      onClick={onClick}
      style={{
        cursor: 'pointer',
        borderLeft: `4px solid ${department.color}`,
        background: isSelected ? department.bgLight : '#fff',
        outline: isSelected ? `2px solid ${department.color}` : 'none',
        transition: 'background 0.2s, outline 0.2s',
      }}
      aria-pressed={isSelected}
      aria-label={`${department.name} department — ${department.agents} AI agents`}
    >
      <div className="d-flex align-items-center gap-2">
        <span className="fs-4" aria-hidden="true">
          {department.icon}
        </span>
        <div className="flex-grow-1">
          <div className="fw-semibold small">{department.name}</div>
          <div className="text-muted" style={{ fontSize: '0.75rem' }}>
            {department.agents} AI Agents Running
          </div>
        </div>
        <span
          className="demo-pulse-dot"
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: department.color,
            flexShrink: 0,
          }}
        />
      </div>
    </button>
  );
}
