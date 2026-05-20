/**
 * WorkspaceSidebar — left rail.
 *
 * Sections:
 *   1. Open issues (no decision yet, no accepted suggestion)
 *   2. Suggested improvements (have at least one suggestion)
 *   3. Ready for prompt (have at least one accepted suggestion)
 *   4. Verification queue (manually marked verifying — V1 same as ready)
 *   5. Resolved
 */
import React, { useState } from 'react';
import IssueCard from './IssueCard';
import type { CritiqueSeverity, IssueStatus, SidebarSectionCount } from '../types';

export interface SidebarIssue {
  id: string;
  index: number;
  title: string;
  kind: string;
  severity: CritiqueSeverity;
  status: IssueStatus;
  region_label?: string;
}

interface Props {
  pageRoute: string;
  previewOrigin: string;
  onPreviewOriginChange: (v: string) => void;
  onPageRouteChange: (v: string) => void;
  issues: SidebarIssue[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCloseSession: () => void;
  counts: SidebarSectionCount;
  // Phase A (2026-05-20): cap-level free-form note panel. Rendered above
  // the filter so it sits in the operator's primary eye-path.
  capNotesSlot?: React.ReactNode;
}

const SECTIONS: { key: IssueStatus; label: string; icon: string }[] = [
  { key: 'open', label: 'Open issues', icon: 'bi-circle' },
  { key: 'suggested', label: 'Suggested improvements', icon: 'bi-stars' },
  { key: 'ready', label: 'Ready for prompt', icon: 'bi-lightning-charge' },
  { key: 'verifying', label: 'Verification queue', icon: 'bi-clipboard-check' },
  { key: 'resolved', label: 'Resolved', icon: 'bi-check2-circle' },
];

const WorkspaceSidebar: React.FC<Props> = ({
  pageRoute,
  previewOrigin,
  onPreviewOriginChange,
  onPageRouteChange,
  issues,
  selectedId,
  onSelect,
  onCloseSession,
  counts,
  capNotesSlot,
}) => {
  const [expanded, setExpanded] = useState<Record<IssueStatus, boolean>>({
    open: true,
    suggested: true,
    ready: true,
    verifying: false,
    resolved: false,
  });
  const [filter, setFilter] = useState('');

  const filtered = issues.filter(i =>
    !filter || i.title.toLowerCase().includes(filter.toLowerCase()) ||
    i.kind.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <aside className="vw-sidebar">
      {/* Header */}
      <div className="vw-sidebar-header">
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-light)', fontWeight: 600 }}>
          Visual Workspace
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primary)', marginTop: 2 }}>
          {pageRoute || '/'}
        </div>
        <div style={{ fontSize: 10, color: 'var(--color-text-light)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
          {previewOrigin}
        </div>
      </div>

      {/* Page picker */}
      <div className="vw-sidebar-section">
        <h6 className="vw-sidebar-section-title">Target page</h6>
        <input
          className="form-control form-control-sm mb-1"
          placeholder="Preview origin"
          value={previewOrigin}
          onChange={(e) => onPreviewOriginChange(e.target.value)}
        />
        <input
          className="form-control form-control-sm mb-1"
          placeholder="/route"
          value={pageRoute}
          onChange={(e) => onPageRouteChange(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary w-100"
          onClick={onCloseSession}
        >
          <i className="bi bi-arrow-left-circle me-1"></i>Pick another session
        </button>
      </div>

      {/* Cap-level note (Phase A, 2026-05-20) */}
      {capNotesSlot}

      {/* Filter */}
      <div className="vw-sidebar-section">
        <input
          className="form-control form-control-sm"
          placeholder="Filter issues…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {/* Sections */}
      <div className="vw-sidebar-scroll">
        {SECTIONS.map(section => {
          const sectionIssues = filtered.filter(i => i.status === section.key);
          const isExpanded = expanded[section.key];
          const count = counts[section.key];
          return (
            <div key={section.key} className="vw-sidebar-section">
              <button
                type="button"
                className="vw-section-toggle"
                onClick={() => setExpanded(prev => ({ ...prev, [section.key]: !prev[section.key] }))}
              >
                <i className={`bi ${section.icon} me-1`}></i>
                {section.label}
                <span className="vw-section-count">{count}</span>
                <i className={`bi ${isExpanded ? 'bi-chevron-down' : 'bi-chevron-right'} ms-auto`} style={{ fontSize: 10 }}></i>
              </button>
              {isExpanded && (
                <div style={{ marginTop: 6 }}>
                  {sectionIssues.length === 0 && (
                    <div className="vw-sidebar-empty">
                      {filter ? 'no matches' : 'nothing here yet'}
                    </div>
                  )}
                  {sectionIssues.map(i => (
                    <IssueCard
                      key={i.id}
                      index={i.index}
                      title={i.title}
                      kind={i.kind}
                      severity={i.severity}
                      region_label={i.region_label}
                      active={i.id === selectedId}
                      resolved={i.status === 'resolved'}
                      onSelect={() => onSelect(i.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="vw-sidebar-footer">
        <span style={{ fontSize: 11, color: 'var(--color-text-light)' }}>
          {counts.total} total · {counts.resolved} resolved
        </span>
      </div>
    </aside>
  );
};

export default WorkspaceSidebar;
