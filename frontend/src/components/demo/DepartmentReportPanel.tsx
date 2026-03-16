import React from 'react';
import { DemoDepartment } from './demoData';
import AgentActivityList from './AgentActivityList';
import DemoRadarChart from './DemoRadarChart';

interface DepartmentReportPanelProps {
  department: DemoDepartment;
}

function ScoreBadge({ score }: { score: number }) {
  let bg = 'bg-success';
  if (score < 50) bg = 'bg-danger';
  else if (score < 75) bg = 'bg-warning text-dark';

  return (
    <span className={`badge ${bg} px-3 py-2`} style={{ fontSize: '0.85rem' }}>
      AI Opportunity Score: {score}/100
    </span>
  );
}

export default function DepartmentReportPanel({
  department,
}: DepartmentReportPanelProps) {
  return (
    <div className="card border-0 shadow-sm h-100">
      <div
        className="card-header bg-white d-flex align-items-center justify-content-between flex-wrap gap-2 py-3"
        style={{ borderBottom: `3px solid ${department.color}` }}
      >
        <div>
          <h3 className="h5 mb-1">
            <span aria-hidden="true">{department.icon}</span>{' '}
            {department.name} Department Analysis
          </h3>
          <span className="text-muted small">
            Running {department.agents} AI Agents
          </span>
        </div>
        <ScoreBadge score={department.opportunityScore} />
      </div>

      <div className="card-body p-4">
        {/* Agent Activity */}
        <div className="mb-4">
          <h4 className="h6 fw-semibold mb-2">Active Agents</h4>
          <AgentActivityList agents={department.agentNames} />
        </div>

        {/* Recent Activity */}
        <div className="mb-4">
          <h4 className="h6 fw-semibold mb-2">Recent Activity</h4>
          <ul className="list-unstyled small mb-0">
            {department.activity.map((item) => (
              <li key={item} className="mb-1 text-muted">
                <span style={{ color: department.color }}>&#9654;</span> {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Key Findings */}
        <div className="mb-4">
          <h4 className="h6 fw-semibold mb-2">Key Findings</h4>
          <ul className="list-unstyled small mb-0">
            {department.findings.map((finding) => (
              <li key={finding} className="mb-2">
                <span className="badge bg-light text-dark border me-1" style={{ fontSize: '0.7rem' }}>
                  FINDING
                </span>
                {finding}
              </li>
            ))}
          </ul>
        </div>

        {/* Recommended Actions */}
        <div className="mb-4">
          <h4 className="h6 fw-semibold mb-2">Recommended Actions</h4>
          <ul className="list-unstyled small mb-0">
            {department.recommendations.map((rec, i) => (
              <li key={rec} className="mb-2 d-flex gap-2">
                <span
                  className="badge rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                  style={{
                    width: 22,
                    height: 22,
                    backgroundColor: department.color,
                    color: '#fff',
                    fontSize: '0.65rem',
                  }}
                >
                  {i + 1}
                </span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Business Impact */}
        <div className="mb-4 p-3 rounded" style={{ background: department.bgLight }}>
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div>
              <div className="small fw-semibold text-muted">Projected Impact</div>
              <div className="fw-bold" style={{ color: department.color }}>
                {department.impact}
              </div>
            </div>
            <div className="text-end">
              <div className="small fw-semibold text-muted">Business Value</div>
              <div className="fw-bold" style={{ color: 'var(--color-accent)' }}>
                {department.impactValue}
              </div>
            </div>
          </div>
        </div>

        {/* Radar Chart */}
        <div>
          <h4 className="h6 fw-semibold mb-2">Performance: Current vs. With AI</h4>
          <DemoRadarChart data={department.radarData} />
        </div>
      </div>
    </div>
  );
}
