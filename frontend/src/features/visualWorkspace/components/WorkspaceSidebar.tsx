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

type Lifecycle = 'suggested' | 'accepted' | 'built' | 'verified' | 'rejected';
const LIFECYCLE_ORDER: Lifecycle[] = ['suggested', 'accepted', 'built', 'verified'];
const LIFECYCLE_META: Record<Lifecycle, { label: string; icon: string; tone: string }> = {
  suggested: { label: 'Suggested',  icon: 'bi-stars',              tone: '#6b7280' },
  accepted:  { label: 'Accepted',   icon: 'bi-check2',             tone: '#1d4ed8' },
  built:     { label: 'Built',      icon: 'bi-lightning-charge',   tone: '#7c3aed' },
  verified:  { label: 'Verified',   icon: 'bi-check2-circle',      tone: '#15803d' },
  rejected:  { label: 'Rejected',   icon: 'bi-slash-circle',       tone: '#6b7280' },
};

export interface SidebarIssue {
  id: string;
  index: number;
  title: string;
  kind: string;
  severity: CritiqueSeverity;
  status: IssueStatus;
  region_label?: string;
  // 2026-05-21 Visual Scan additions.
  scope?: 'page' | 'global' | 'component';
  lifecycle?: 'suggested' | 'accepted' | 'built' | 'verified' | 'rejected';
  createdByScan?: boolean;
  rationale?: string;
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
  // 2026-05-21: lifecycle transitions for the Resolved workflow + bulk
  // accept/reject actions on suggested items.
  onLifecycleChange?: (id: string, stage: 'accepted' | 'rejected' | 'verified') => void;
}

// Legacy 5-section vocabulary kept for back-compat with the IssueStatus
// type system. The new sidebar groups by SCOPE × LIFECYCLE instead.
// (kept to satisfy old IssueStatus references elsewhere if any)
void ([] as IssueStatus[]);

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
  onLifecycleChange,
}) => {
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
        <div style={{ fontSize: 13, fontWeight: 600, color: '#FB2832', marginTop: 2 }}>
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

      {/* 2026-05-21: scope groups (GLOBAL / PAGE-SPECIFIC) with lifecycle
          sub-sections inside each. Replaces the flat 5-section view. */}
      <div className="vw-sidebar-scroll">
        <ScopeGroup
          title="GLOBAL (theme / design system)"
          hint="Fixes that should apply across all pages"
          issues={filtered.filter(i => i.scope === 'global' || i.scope === 'component')}
          selectedId={selectedId}
          onSelect={onSelect}
          onLifecycleChange={onLifecycleChange}
          filterActive={!!filter}
        />
        <ScopeGroup
          title="PAGE-SPECIFIC (just this surface)"
          hint="Fixes that live only on this page"
          issues={filtered.filter(i => !i.scope || i.scope === 'page')}
          selectedId={selectedId}
          onSelect={onSelect}
          onLifecycleChange={onLifecycleChange}
          filterActive={!!filter}
        />
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

/**
 * ScopeGroup — renders one scope band (GLOBAL or PAGE-SPECIFIC) with
 * lifecycle sub-sections inside. Each suggested item gets inline
 * Accept / Reject buttons; built/verified items show the lifecycle
 * pill but no actions (they're handled in the IssueDetailsPanel).
 */
const ScopeGroup: React.FC<{
  title: string;
  hint: string;
  issues: SidebarIssue[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onLifecycleChange?: (id: string, stage: 'accepted' | 'rejected' | 'verified') => void;
  filterActive: boolean;
}> = ({ title, hint, issues, selectedId, onSelect, onLifecycleChange, filterActive }) => {
  const [open, setOpen] = useState(true);
  if (issues.length === 0 && !filterActive) {
    return (
      <div className="vw-sidebar-section">
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--color-text-light)' }}>
          {title}
        </div>
        <div className="vw-sidebar-empty" style={{ fontSize: 11 }}>{hint} — nothing yet.</div>
      </div>
    );
  }
  const byStage: Record<Lifecycle, SidebarIssue[]> = {
    suggested: [], accepted: [], built: [], verified: [], rejected: [],
  };
  for (const i of issues) byStage[i.lifecycle || 'suggested'].push(i);

  const suggestedItems = byStage.suggested;
  const handleAcceptAll = () => suggestedItems.forEach(i => onLifecycleChange?.(i.id, 'accepted'));
  const handleRejectAll = () => suggestedItems.forEach(i => onLifecycleChange?.(i.id, 'rejected'));

  return (
    <div className="vw-sidebar-section" style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8 }}>
      <button
        type="button"
        className="vw-section-toggle"
        onClick={() => setOpen(v => !v)}
        style={{ fontWeight: 700 }}
      >
        {title}
        <span className="vw-section-count">{issues.length}</span>
        <i className={`bi ${open ? 'bi-chevron-down' : 'bi-chevron-right'} ms-auto`} style={{ fontSize: 10 }}></i>
      </button>
      {open && (
        <>
          <div style={{ fontSize: 10.5, color: 'var(--color-text-light)', fontStyle: 'italic', marginTop: 2, marginBottom: 6 }}>
            {hint}
          </div>
          {suggestedItems.length > 1 && onLifecycleChange && (
            <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
              <button
                type="button"
                onClick={handleAcceptAll}
                title={`Accept all ${suggestedItems.length} suggested in this scope`}
                style={{ fontSize: 10, padding: '2px 8px', background: 'rgba(21,128,61,0.10)', color: '#15803d', border: '1px solid rgba(21,128,61,0.25)', borderRadius: 3, cursor: 'pointer' }}
              >
                <i className="bi bi-check-all me-1"></i>Accept all ({suggestedItems.length})
              </button>
              <button
                type="button"
                onClick={handleRejectAll}
                title={`Reject all ${suggestedItems.length} suggested in this scope`}
                style={{ fontSize: 10, padding: '2px 8px', background: 'transparent', color: 'var(--color-text-light)', border: '1px solid var(--color-border)', borderRadius: 3, cursor: 'pointer' }}
              >
                <i className="bi bi-slash-circle me-1"></i>Reject all
              </button>
            </div>
          )}
          {LIFECYCLE_ORDER.map(stage => {
            const items = byStage[stage];
            if (items.length === 0) return null;
            const meta = LIFECYCLE_META[stage];
            return (
              <div key={stage} style={{ marginTop: 6 }}>
                <div style={{ fontSize: 10, color: meta.tone, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                  <i className={`bi ${meta.icon} me-1`}></i>{meta.label} · {items.length}
                </div>
                {items.map(i => (
                  <div key={i.id} style={{ marginBottom: 4 }}>
                    <IssueCard
                      index={i.index}
                      title={i.title}
                      kind={i.kind}
                      severity={i.severity}
                      region_label={i.region_label}
                      active={i.id === selectedId}
                      resolved={stage === 'verified'}
                      onSelect={() => onSelect(i.id)}
                    />
                    {stage === 'suggested' && onLifecycleChange && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 2, marginLeft: 8 }}>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onLifecycleChange(i.id, 'accepted'); }}
                          title="Accept this suggestion"
                          style={{ fontSize: 10, padding: '1px 6px', background: 'transparent', color: '#15803d', border: '1px solid rgba(21,128,61,0.25)', borderRadius: 3, cursor: 'pointer' }}
                        >
                          ✓ Accept
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onLifecycleChange(i.id, 'rejected'); }}
                          title="Reject this suggestion"
                          style={{ fontSize: 10, padding: '1px 6px', background: 'transparent', color: 'var(--color-text-light)', border: '1px solid var(--color-border)', borderRadius: 3, cursor: 'pointer' }}
                        >
                          ✗ Reject
                        </button>
                      </div>
                    )}
                    {stage === 'built' && onLifecycleChange && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 2, marginLeft: 8 }}>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onLifecycleChange(i.id, 'verified'); }}
                          title="Confirm the fix is live on the page"
                          style={{ fontSize: 10, padding: '1px 6px', background: 'transparent', color: '#15803d', border: '1px solid rgba(21,128,61,0.25)', borderRadius: 3, cursor: 'pointer' }}
                        >
                          ✓ Mark verified
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
          {byStage.rejected.length > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ fontSize: 10.5, color: 'var(--color-text-light)', cursor: 'pointer' }}>
                {byStage.rejected.length} rejected
              </summary>
              {byStage.rejected.map(i => (
                <div key={i.id} style={{ marginTop: 4, opacity: 0.55 }}>
                  <IssueCard
                    index={i.index} title={i.title} kind={i.kind}
                    severity={i.severity} region_label={i.region_label}
                    active={i.id === selectedId} resolved={false}
                    onSelect={() => onSelect(i.id)}
                  />
                </div>
              ))}
            </details>
          )}
        </>
      )}
    </div>
  );
};

export default WorkspaceSidebar;
