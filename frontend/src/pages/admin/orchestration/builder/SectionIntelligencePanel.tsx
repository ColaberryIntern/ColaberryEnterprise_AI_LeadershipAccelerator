import React, { useState } from 'react';
import { MiniSection, TYPE_ICONS, DryRunResult, QualityBreakdown, Suggestion } from './types';
import ValidationSection from './ValidationSection';
import QualityScoreSection from './QualityScoreSection';
import SuggestionSection from './SuggestionSection';
import type { SkillCrossRef, ArtifactFlowRef } from './useCurriculumGraph';
import type { SectionVariableFlow, VariableReconciliation } from './useVariableFlow';
import type { DiagnosticsResult, VariableTraceResult, RepairPlan } from './useControlTower';

interface Props {
  sectionVariableKeys: string[];
  sectionArtifactIds: string[];
  sectionSkillIds: string[];
  miniSections: MiniSection[];
  variableOptions: { value: string; label: string }[];
  artifactOptions: { value: string; label: string }[];
  skillOptions: { value: string; label: string }[];
  lessonTitle?: string;
  lessonId?: string;
  skillGraph?: SkillCrossRef[];
  artifactFlow?: ArtifactFlowRef[];
  variableFlow?: SectionVariableFlow | null;
  variableReconciliation?: VariableReconciliation | null;
  onRefreshReconciliation?: () => void;
  // Diagnostic props
  editing?: Partial<MiniSection> | null;
  dryRun?: DryRunResult | null;
  validating?: boolean;
  onRevalidate?: () => void;
  qualityBreakdown?: QualityBreakdown | null;
  qualityLoading?: boolean;
  onRefreshQuality?: () => void;
  suggestions?: Suggestion[];
  suggestionsLoading?: boolean;
  applyingSuggestion?: string | null;
  onRefreshSuggestions?: () => void;
  onApplySuggestionFix?: (s: Suggestion) => void;
  onOpenDiagnostic?: () => void;
  onOpenRepair?: () => void;
  // Control Tower
  controlTower?: {
    diagnostics: DiagnosticsResult | null;
    variableTrace: VariableTraceResult | null;
    repairPlan: RepairPlan | null;
    loading: { diagnostics: boolean; trace: boolean; repair: boolean };
  };
  onRunDiagnostics?: () => void;
  onFetchVariableTrace?: () => void;
  onFetchRepairPlan?: (preview?: boolean) => void;
  onExecuteRepairPlan?: () => void;
}

function CollapsibleSection({ icon, title, count, color, children, warningCount }: {
  icon: string; title: string; count: number; color: string; children: React.ReactNode; warningCount?: number;
}) {
  const [open, setOpen] = useState(count > 0 || (warningCount || 0) > 0);
  return (
    <div className="mb-2">
      <button
        className="btn btn-link p-0 text-decoration-none d-flex align-items-center gap-1 w-100"
        onClick={() => setOpen(!open)}
        style={{ fontSize: 11, color: 'var(--color-text, var(--text-body))' }}
      >
        <i className={`bi bi-chevron-${open ? 'down' : 'right'}`} style={{ fontSize: 8 }}></i>
        <i className={`bi ${icon}`} style={{ color, fontSize: 11 }}></i>
        <span className="fw-medium">{title}</span>
        {count > 0 && (
          <span className="badge ms-auto" style={{ fontSize: 8, background: `color-mix(in srgb, ${color} 9%, transparent)`, color, border: `1px solid color-mix(in srgb, ${color} 19%, transparent)` }}>
            {count}
          </span>
        )}
        {(warningCount || 0) > 0 && (
          <span className="badge" style={{ fontSize: 8, background: 'var(--status-danger-bg)', color: 'var(--status-danger)', border: '1px solid var(--status-danger-bg)', marginLeft: count > 0 ? 4 : 'auto' }}>
            {warningCount}
          </span>
        )}
      </button>
      {open && <div className="ms-3 mt-1">{children}</div>}
    </div>
  );
}

export default function SectionIntelligencePanel({
  sectionVariableKeys, sectionArtifactIds, sectionSkillIds, miniSections,
  variableOptions, artifactOptions, skillOptions, lessonTitle,
  lessonId, skillGraph, artifactFlow, variableFlow, variableReconciliation, onRefreshReconciliation,
  editing, dryRun, validating, onRevalidate,
  qualityBreakdown, qualityLoading, onRefreshQuality,
  suggestions, suggestionsLoading, applyingSuggestion, onRefreshSuggestions, onApplySuggestionFix,
  onOpenDiagnostic, onOpenRepair,
  controlTower, onRunDiagnostics, onFetchVariableTrace, onFetchRepairPlan, onExecuteRepairPlan,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const resolveLabel = (id: string, options: { value: string; label: string }[]) =>
    options.find(o => o.value === id)?.label || id.slice(0, 12);

  // Variable flow counts
  const vfAvailable = variableFlow?.available?.length || 0;
  const vfRequired = variableFlow?.required?.length || 0;
  const vfProduced = variableFlow?.produced?.length || 0;
  const vfMissing = variableFlow?.missing?.length || 0;
  const totalVarCount = vfRequired + vfProduced;

  return (
    <div className="card border-0 shadow-sm mb-2">
      <div
        className="card-header bg-white py-2 d-flex justify-content-between align-items-center"
        style={{ cursor: 'pointer' }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="fw-semibold small">
          <i className="bi bi-cpu me-1" style={{ color: 'var(--color-primary, var(--red-500))' }}></i>
          Section Intelligence
        </span>
        <i className={`bi bi-chevron-${collapsed ? 'right' : 'down'} text-muted`} style={{ fontSize: 11 }}></i>
      </div>

      {!collapsed && (
        <div className="card-body py-2" style={{ fontSize: 10 }}>
          {lessonTitle && (
            <div className="fw-semibold mb-2" style={{ fontSize: 11, color: 'var(--color-primary, var(--red-500))' }}>
              {lessonTitle}
            </div>
          )}

          {/* Variables — Enhanced with Flow Categories */}
          <CollapsibleSection icon="bi-braces" title="Variables" count={totalVarCount} color="var(--blue-500)" warningCount={vfMissing}>
            {variableFlow ? (
              <div className="d-flex flex-column gap-2">
                {/* Missing Variables — Warning */}
                {vfMissing > 0 && (
                  <div className="p-1 rounded" style={{ background: 'var(--status-danger-bg)', border: '1px solid var(--status-danger-bg)' }}>
                    <div className="fw-medium mb-1" style={{ fontSize: 9, color: 'var(--status-danger)' }}>
                      <i className="bi bi-exclamation-triangle me-1"></i>
                      {vfMissing} missing variable{vfMissing > 1 ? 's' : ''}
                    </div>
                    <div className="d-flex flex-wrap gap-1">
                      {variableFlow.missing.map(v => (
                        <span key={v.key} className="badge" style={{ fontSize: 8, background: 'var(--status-danger-bg)', color: 'var(--status-danger)', border: '1px solid var(--status-danger-bg)' }}>
                          {v.key}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Required — referenced in prompts */}
                {vfRequired > 0 && (
                  <div>
                    <div className="fw-medium mb-1" style={{ fontSize: 9, color: 'var(--blue-500)' }}>
                      <i className="bi bi-arrow-down-left me-1"></i>Required ({vfRequired})
                    </div>
                    <div className="d-flex flex-wrap gap-1">
                      {variableFlow.required.map(v => (
                        <span key={v.key} className="badge" title={`Used in: ${v.usedIn.join(', ')}`} style={{ fontSize: 8, background: 'var(--status-info-bg)', color: 'var(--blue-500)', border: '1px solid var(--status-info-bg)' }}>
                          {v.key}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Produced — created by this section */}
                {vfProduced > 0 && (
                  <div>
                    <div className="fw-medium mb-1" style={{ fontSize: 9, color: 'var(--status-warning)' }}>
                      <i className="bi bi-arrow-up-right me-1"></i>Produced ({vfProduced})
                    </div>
                    <div className="d-flex flex-wrap gap-1">
                      {variableFlow.produced.map(v => (
                        <span key={v.key} className="badge" title={`Produced by: ${v.producedBy}`} style={{ fontSize: 8, background: 'var(--status-warning-bg)', color: 'var(--status-warning)', border: '1px solid var(--status-warning-bg)' }}>
                          {v.key}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Available — from prior sections + system */}
                {vfAvailable > 0 && (
                  <div>
                    <div className="fw-medium mb-1" style={{ fontSize: 9, color: 'var(--status-success)' }}>
                      <i className="bi bi-check-circle me-1"></i>Available ({vfAvailable})
                    </div>
                    <div className="d-flex flex-wrap gap-1">
                      {variableFlow.available.slice(0, 15).map(v => (
                        <span key={v.key} className="badge" title={`From: ${v.source} (${v.scope})`} style={{ fontSize: 8, background: 'var(--status-success-bg)', color: 'var(--status-success)', border: '1px solid var(--status-success-bg)' }}>
                          {v.key}
                        </span>
                      ))}
                      {vfAvailable > 15 && (
                        <span className="text-muted" style={{ fontSize: 8 }}>+{vfAvailable - 15} more</span>
                      )}
                    </div>
                  </div>
                )}

                {totalVarCount === 0 && vfMissing === 0 && (
                  <span className="text-muted">No variables referenced</span>
                )}
              </div>
            ) : (
              /* Fallback: flat list when flow data not available */
              <div className="d-flex flex-wrap gap-1">
                {sectionVariableKeys.map(k => (
                  <span key={k} className="badge" style={{ fontSize: 8, background: 'var(--status-info-bg)', color: 'var(--blue-500)', border: '1px solid var(--status-info-bg)' }}>
                    {resolveLabel(k, variableOptions)}
                  </span>
                ))}
                {sectionVariableKeys.length === 0 && <span className="text-muted">None assigned</span>}
              </div>
            )}
          </CollapsibleSection>

          {/* Skills Covered */}
          <CollapsibleSection icon="bi-award" title="Skills" count={sectionSkillIds.length} color="var(--status-success)">
            <div className="d-flex flex-column gap-1">
              {sectionSkillIds.map(id => {
                const matchedEntry = skillGraph?.find(s => {
                  const matchById = s.skill_id === id;
                  const matchBySection = s.sections?.some(sec => sec.lesson_id === lessonId);
                  return matchById || matchBySection;
                });
                const sectionCount = matchedEntry?.sections?.length || 0;
                const sectionRole = lessonId ? matchedEntry?.sections?.find(sec => sec.lesson_id === lessonId)?.role : undefined;
                const skillType = matchedEntry?.skill_type || 'core';
                const typeLabel = skillType === 'core' ? 'C' : skillType === 'supporting' ? 'S' : 'A';
                const typeColor = skillType === 'core' ? 'var(--status-success)' : skillType === 'supporting' ? 'var(--blue-500)' : 'var(--chart-5)';

                return (
                  <div key={id} className="d-flex align-items-center gap-1">
                    <span className="badge" style={{ fontSize: 7, background: `color-mix(in srgb, ${typeColor} 13%, transparent)`, color: typeColor, border: `1px solid color-mix(in srgb, ${typeColor} 25%, transparent)`, minWidth: 14, textAlign: 'center' }}>
                      {typeLabel}
                    </span>
                    <span className="badge" style={{ fontSize: 8, background: 'var(--status-success-bg)', color: 'var(--status-success)', border: '1px solid var(--status-success-bg)' }}>
                      {resolveLabel(id, skillOptions)}
                    </span>
                    {sectionCount > 1 && (
                      <span className="text-muted" style={{ fontSize: 7 }}>{sectionCount} sections</span>
                    )}
                    {sectionRole && (
                      <span className="badge ms-auto" style={{
                        fontSize: 7,
                        background: sectionRole === 'introduced' ? 'var(--status-success-bg)' : sectionRole === 'reinforced' ? 'var(--status-info-bg)' : 'color-mix(in srgb, var(--chart-5) 15%, transparent)',
                        color: sectionRole === 'introduced' ? 'var(--status-success)' : sectionRole === 'reinforced' ? 'var(--blue-500)' : 'var(--chart-5)',
                        border: 'none',
                      }}>
                        {sectionRole === 'introduced' ? 'Introduced' : sectionRole === 'reinforced' ? 'Reinforced' : 'Mastered'}
                      </span>
                    )}
                  </div>
                );
              })}
              {sectionSkillIds.length === 0 && <span className="text-muted">None assigned</span>}
            </div>
          </CollapsibleSection>

          {/* Artifacts */}
          <CollapsibleSection icon="bi-box" title="Artifacts" count={sectionArtifactIds.length} color="var(--status-warning)">
            <div className="d-flex flex-column gap-1">
              {sectionArtifactIds.map(id => {
                const flowEntry = artifactFlow?.find(a => a.artifact_id === id);
                const isProducer = flowEntry?.produced_by?.lesson_id === lessonId;
                const isConsumer = !isProducer && flowEntry?.produced_by != null;
                const downstreamCount = flowEntry?.consumed_by?.length || 0;
                const dirColor = isProducer ? 'var(--status-warning)' : isConsumer ? 'var(--blue-500)' : 'var(--text-muted)';
                const dirLabel = isProducer ? 'Produces' : isConsumer ? 'Uses' : '';
                const dirIcon = isProducer ? 'bi-arrow-up-right' : isConsumer ? 'bi-arrow-down-left' : '';

                return (
                  <div key={id} className="d-flex align-items-center gap-1">
                    {dirIcon && (
                      <i className={`bi ${dirIcon}`} style={{ fontSize: 8, color: dirColor }}></i>
                    )}
                    <span className="badge" style={{ fontSize: 8, background: `color-mix(in srgb, ${dirColor} 9%, transparent)`, color: dirColor, border: `1px solid color-mix(in srgb, ${dirColor} 19%, transparent)` }}>
                      {resolveLabel(id, artifactOptions)}
                    </span>
                    {dirLabel && (
                      <span className="text-muted" style={{ fontSize: 7 }}>{dirLabel}</span>
                    )}
                    {isProducer && downstreamCount > 0 && (
                      <span className="text-muted ms-auto" style={{ fontSize: 7 }}>{downstreamCount} downstream</span>
                    )}
                    {isConsumer && flowEntry?.produced_by && (
                      <span className="text-muted ms-auto" style={{ fontSize: 7 }}>from: {flowEntry.produced_by.lesson_title.slice(0, 20)}</span>
                    )}
                  </div>
                );
              })}
              {sectionArtifactIds.length === 0 && <span className="text-muted">None assigned</span>}
            </div>
          </CollapsibleSection>

          {/* Mini-Section Flow */}
          <CollapsibleSection icon="bi-arrow-right-circle" title="Pipeline Flow" count={miniSections.length} color="var(--chart-5)">
            <div className="d-flex flex-column gap-1">
              {miniSections.map((ms, i) => {
                const icon = TYPE_ICONS[ms.mini_section_type] || 'bi-circle';
                return (
                  <div key={ms.id} className="d-flex align-items-center gap-1" style={{ fontSize: 9 }}>
                    <span className="badge bg-light text-muted border" style={{ fontSize: 7, minWidth: 14 }}>{i + 1}</span>
                    <i className={`bi ${icon}`} style={{ fontSize: 10, color: 'var(--chart-5)' }}></i>
                    <span className="text-truncate">{ms.title || 'Untitled'}</span>
                    {ms.quality_score != null && (
                      <span className="ms-auto text-muted" style={{ fontSize: 8 }}>{Math.round(ms.quality_score)}%</span>
                    )}
                  </div>
                );
              })}
              {miniSections.length === 0 && <span className="text-muted">No mini-sections</span>}
            </div>
          </CollapsibleSection>

          {/* Variable Reconciliation */}
          {variableReconciliation && (
            (variableReconciliation.undefined_refs.length > 0 || variableReconciliation.orphaned_defs.length > 0) && (
              <CollapsibleSection
                icon="bi-arrow-repeat"
                title="Reconciliation"
                count={variableReconciliation.undefined_refs.length + variableReconciliation.orphaned_defs.length}
                color="var(--text-muted)"
              >
                <div className="d-flex flex-column gap-2">
                  {variableReconciliation.undefined_refs.length > 0 && (
                    <div>
                      <div className="fw-medium mb-1" style={{ fontSize: 9, color: 'var(--status-danger)' }}>
                        Undefined variables ({variableReconciliation.undefined_refs.length})
                      </div>
                      {variableReconciliation.undefined_refs.map(r => (
                        <div key={r.key} className="d-flex align-items-center gap-1 mb-1">
                          <span className="badge" style={{ fontSize: 8, background: 'var(--status-danger-bg)', color: 'var(--status-danger)', border: '1px solid var(--status-danger-bg)' }}>
                            {r.key}
                          </span>
                          <span className="text-muted" style={{ fontSize: 7 }}>{r.used_in_sections.join(', ')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {variableReconciliation.orphaned_defs.length > 0 && (
                    <div>
                      <div className="fw-medium mb-1" style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                        Unused definitions ({variableReconciliation.orphaned_defs.length})
                      </div>
                      {variableReconciliation.orphaned_defs.map(d => (
                        <div key={d.key} className="d-flex align-items-center gap-1 mb-1">
                          <span className="badge" style={{ fontSize: 8, background: 'var(--surface-subtle)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
                            {d.key}
                          </span>
                          <span className="text-muted" style={{ fontSize: 7 }}>{d.display_name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CollapsibleSection>
            )
          )}
          {onRefreshReconciliation && !variableReconciliation && (
            <button
              className="btn btn-sm btn-link p-0 text-muted"
              style={{ fontSize: 9 }}
              onClick={onRefreshReconciliation}
            >
              <i className="bi bi-arrow-repeat me-1"></i>Check variable reconciliation
            </button>
          )}

          {/* ─── Control Tower Sections ──────────────────────────── */}

          {/* System Health */}
          <CollapsibleSection
            icon="bi-shield-check"
            title="System Health"
            count={controlTower?.diagnostics ? 1 : 0}
            color="var(--status-success)"
            warningCount={controlTower?.diagnostics?.issues?.filter(i => i.severity === 'critical').length}
          >
            {controlTower?.diagnostics ? (() => {
              const d = controlTower.diagnostics!;
              const scoreColor = d.system_health_score > 80 ? 'var(--status-success)' : d.system_health_score > 50 ? 'var(--status-warning)' : 'var(--status-danger)';
              return (
                <div className="d-flex flex-column gap-2">
                  <div className="d-flex align-items-center gap-2">
                    <div className="fw-semibold" style={{ fontSize: 18, color: scoreColor }}>{d.system_health_score}</div>
                    <div className="flex-grow-1">
                      <div className="progress" style={{ height: 6 }}>
                        <div className="progress-bar" style={{ width: `${d.system_health_score}%`, background: scoreColor }} />
                      </div>
                    </div>
                  </div>
                  <div className="d-flex flex-wrap gap-1">
                    {d.summary.missing_count > 0 && (
                      <span className="badge" style={{ fontSize: 8, background: 'var(--status-danger-bg)', color: 'var(--status-danger)', border: '1px solid var(--status-danger-bg)' }}>
                        {d.summary.missing_count} missing
                      </span>
                    )}
                    {d.summary.timeline_violations > 0 && (
                      <span className="badge" style={{ fontSize: 8, background: 'var(--status-danger-bg)', color: 'var(--status-danger)', border: '1px solid var(--status-danger-bg)' }}>
                        {d.summary.timeline_violations} timeline
                      </span>
                    )}
                    {d.summary.undefined_count > 0 && (
                      <span className="badge" style={{ fontSize: 8, background: 'var(--status-warning-bg)', color: 'var(--status-warning)', border: '1px solid var(--status-warning-bg)' }}>
                        {d.summary.undefined_count} undefined
                      </span>
                    )}
                    {d.summary.orphaned_count > 0 && (
                      <span className="badge" style={{ fontSize: 8, background: 'var(--surface-subtle)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
                        {d.summary.orphaned_count} orphaned
                      </span>
                    )}
                    {d.issues.length === 0 && (
                      <span className="text-muted" style={{ fontSize: 9 }}>All clear</span>
                    )}
                  </div>
                  {d.issues.filter(i => i.severity === 'critical').length > 0 && (
                    <div>
                      <div className="fw-medium mb-1" style={{ fontSize: 9, color: 'var(--status-danger)' }}>Critical Issues</div>
                      {d.issues.filter(i => i.severity === 'critical').map((issue, idx) => (
                        <div key={idx} className="d-flex align-items-start gap-1 mb-1" style={{ fontSize: 9 }}>
                          <i className="bi bi-exclamation-triangle" style={{ color: 'var(--status-danger)', fontSize: 9 }}></i>
                          <span>{issue.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })() : (
              <button
                className="btn btn-sm btn-outline-secondary w-100 py-0"
                style={{ fontSize: 9 }}
                onClick={onRunDiagnostics}
                disabled={controlTower?.loading?.diagnostics}
              >
                {controlTower?.loading?.diagnostics ? (
                  <><span className="spinner-border spinner-border-sm me-1" role="status" style={{ width: 10, height: 10 }}></span>Scanning...</>
                ) : (
                  <><i className="bi bi-shield-check me-1"></i>Run Diagnostics</>
                )}
              </button>
            )}
          </CollapsibleSection>

          {/* Variable Trace */}
          <CollapsibleSection
            icon="bi-list-check"
            title="Variable Trace"
            count={controlTower?.variableTrace?.trace?.length || 0}
            color="var(--blue-500)"
            warningCount={controlTower?.variableTrace?.missing_count}
          >
            {controlTower?.variableTrace ? (() => {
              const t = controlTower.variableTrace!;
              return (
                <div className="d-flex flex-column gap-1">
                  <div className="d-flex gap-1 mb-1" style={{ fontSize: 8 }}>
                    <span className="badge" style={{ background: 'var(--status-success-bg)', color: 'var(--status-success)', border: '1px solid var(--status-success-bg)' }}>
                      {t.resolved_count} resolved
                    </span>
                    {t.missing_count > 0 && (
                      <span className="badge" style={{ background: 'var(--status-danger-bg)', color: 'var(--status-danger)', border: '1px solid var(--status-danger-bg)' }}>
                        {t.missing_count} missing
                      </span>
                    )}
                  </div>
                  {t.trace.map(v => {
                    const statusColor = v.status === 'resolved' ? 'var(--status-success)' : v.status === 'missing' ? 'var(--status-danger)' : 'var(--status-warning)';
                    return (
                      <div key={v.key} className="d-flex align-items-center gap-1" style={{ fontSize: 9 }}>
                        <span className="badge" style={{ fontSize: 8, background: `color-mix(in srgb, ${statusColor} 8%, transparent)`, color: statusColor, border: `1px solid color-mix(in srgb, ${statusColor} 19%, transparent)`, minWidth: 10 }}>
                          {v.status === 'resolved' ? '\u2713' : v.status === 'missing' ? '\u2717' : '!'}
                        </span>
                        <span className="fw-medium">{v.key}</span>
                        {v.value && <span className="text-muted text-truncate" style={{ maxWidth: 80 }}>= {v.value}</span>}
                        <span className="text-muted ms-auto" style={{ fontSize: 7 }}>{v.source_detail}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })() : (
              <button
                className="btn btn-sm btn-outline-secondary w-100 py-0"
                style={{ fontSize: 9 }}
                onClick={onFetchVariableTrace}
                disabled={controlTower?.loading?.trace || !lessonId}
              >
                {controlTower?.loading?.trace ? (
                  <><span className="spinner-border spinner-border-sm me-1" role="status" style={{ width: 10, height: 10 }}></span>Loading...</>
                ) : (
                  <><i className="bi bi-list-check me-1"></i>Load Trace</>
                )}
              </button>
            )}
          </CollapsibleSection>

          {/* Repair Plan */}
          <CollapsibleSection
            icon="bi-tools"
            title="Repair Plan"
            count={controlTower?.repairPlan?.impact_summary?.total_actions || 0}
            color="var(--status-warning)"
            warningCount={controlTower?.repairPlan?.impact_summary?.blocked_actions}
          >
            {controlTower?.repairPlan ? (() => {
              const p = controlTower.repairPlan!;
              const riskColor = p.overall_risk_level === 'low' ? 'var(--status-success)' : p.overall_risk_level === 'medium' ? 'var(--status-warning)' : 'var(--status-danger)';
              return (
                <div className="d-flex flex-column gap-2">
                  <div className="d-flex flex-wrap gap-1" style={{ fontSize: 8 }}>
                    <span className="badge" style={{ background: 'var(--status-success-bg)', color: 'var(--status-success)', border: '1px solid var(--status-success-bg)' }}>
                      {p.impact_summary.safe_actions} safe
                    </span>
                    {p.impact_summary.blocked_actions > 0 && (
                      <span className="badge" style={{ background: 'var(--status-danger-bg)', color: 'var(--status-danger)', border: '1px solid var(--status-danger-bg)' }}>
                        {p.impact_summary.blocked_actions} blocked
                      </span>
                    )}
                    <span className="badge" style={{ background: `color-mix(in srgb, ${riskColor} 8%, transparent)`, color: riskColor, border: `1px solid color-mix(in srgb, ${riskColor} 19%, transparent)` }}>
                      risk: {p.overall_risk_level}
                    </span>
                  </div>
                  {p.actions.slice(0, 10).map((action, idx) => {
                    const actRiskColor = action.risk_level === 'low' ? 'var(--status-success)' : action.risk_level === 'medium' ? 'var(--status-warning)' : 'var(--status-danger)';
                    return (
                      <div
                        key={idx}
                        className="d-flex align-items-start gap-1"
                        style={{ fontSize: 9, opacity: action.blocked ? 0.5 : 1 }}
                      >
                        {action.blocked ? (
                          <i className="bi bi-lock" style={{ fontSize: 9, color: 'var(--status-danger)' }}></i>
                        ) : (
                          <i className="bi bi-wrench" style={{ fontSize: 9, color: actRiskColor }}></i>
                        )}
                        <span className={action.blocked ? 'text-decoration-line-through' : ''}>
                          {action.description.slice(0, 80)}{action.description.length > 80 ? '...' : ''}
                        </span>
                        {action.downstream_sections.length > 0 && (
                          <span className="text-muted ms-auto" style={{ fontSize: 7, whiteSpace: 'nowrap' }}>
                            {action.downstream_sections.length} downstream
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {p.actions.length > 10 && (
                    <span className="text-muted" style={{ fontSize: 8 }}>+{p.actions.length - 10} more actions</span>
                  )}
                  {p.impact_summary.safe_actions > 0 && (
                    <button
                      className="btn btn-sm btn-outline-warning w-100 py-0 mt-1"
                      style={{ fontSize: 9 }}
                      onClick={onExecuteRepairPlan}
                      disabled={controlTower?.loading?.repair}
                    >
                      {controlTower?.loading?.repair ? (
                        <><span className="spinner-border spinner-border-sm me-1" role="status" style={{ width: 10, height: 10 }}></span>Applying...</>
                      ) : (
                        <><i className="bi bi-play-circle me-1"></i>Apply Safe Repairs ({p.impact_summary.safe_actions})</>
                      )}
                    </button>
                  )}
                </div>
              );
            })() : (
              <button
                className="btn btn-sm btn-outline-secondary w-100 py-0"
                style={{ fontSize: 9 }}
                onClick={() => onFetchRepairPlan?.(true)}
                disabled={controlTower?.loading?.repair}
              >
                {controlTower?.loading?.repair ? (
                  <><span className="spinner-border spinner-border-sm me-1" role="status" style={{ width: 10, height: 10 }}></span>Analyzing...</>
                ) : (
                  <><i className="bi bi-tools me-1"></i>Preview Repairs</>
                )}
              </button>
            )}
          </CollapsibleSection>

          {/* Diagnostic Tools — shown when a mini-section is selected */}
          {editing && (
            <>
              <hr className="my-2" style={{ opacity: 0.15 }} />
              <div className="fw-semibold mb-1" style={{ fontSize: 10, color: 'var(--color-text-light, var(--text-muted))' }}>
                <i className="bi bi-activity me-1"></i>Diagnostics
                {editing.title && <span className="fw-normal ms-1">— {editing.title}</span>}
              </div>

              {/* Validation */}
              <CollapsibleSection icon="bi-check-circle" title="Validation" count={0} color="var(--blue-500)">
                <ValidationSection
                  editing={editing}
                  dryRun={dryRun || null}
                  validating={validating || false}
                  onRevalidate={onRevalidate || (() => {})}
                />
              </CollapsibleSection>

              {/* Quality Score */}
              {editing.id && (
                <CollapsibleSection icon="bi-graph-up" title="Quality Score" count={0} color="var(--status-success)">
                  <QualityScoreSection
                    miniSectionId={editing.id}
                    qualityBreakdown={qualityBreakdown || null}
                    loading={qualityLoading || false}
                    onRefresh={onRefreshQuality || (() => {})}
                  />
                </CollapsibleSection>
              )}

              {/* Improve to 100 */}
              {editing.id && (
                <CollapsibleSection icon="bi-lightbulb" title="Improve to 100" count={suggestions?.length || 0} color="var(--status-warning)">
                  <SuggestionSection
                    miniSectionId={editing.id}
                    suggestions={suggestions || []}
                    loading={suggestionsLoading || false}
                    applying={applyingSuggestion || null}
                    onRefresh={onRefreshSuggestions || (() => {})}
                    onApplyFix={onApplySuggestionFix || (() => {})}
                  />
                </CollapsibleSection>
              )}

              {/* Full Diagnostic + Auto-Repair buttons */}
              {editing.id && (
                <div className="d-flex gap-2 mt-2">
                  <button className="btn btn-sm btn-outline-primary flex-grow-1 py-0" style={{ fontSize: 9 }} onClick={onOpenDiagnostic}>
                    <i className="bi bi-clipboard2-pulse me-1"></i>Full Diagnostic
                  </button>
                  <button className="btn btn-sm btn-outline-warning flex-grow-1 py-0" style={{ fontSize: 9 }} onClick={onOpenRepair}>
                    <i className="bi bi-wrench-adjustable me-1"></i>Auto-Repair
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
