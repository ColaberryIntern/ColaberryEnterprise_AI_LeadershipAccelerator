import React, { useState } from 'react';
import { MiniSection, TYPE_ICONS, DryRunResult, QualityBreakdown, Suggestion } from './types';
import ValidationSection from './ValidationSection';
import QualityScoreSection from './QualityScoreSection';
import SuggestionSection from './SuggestionSection';
import type { SkillCrossRef, ArtifactFlowRef } from './useCurriculumGraph';

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
}

function CollapsibleSection({ icon, title, count, color, children }: {
  icon: string; title: string; count: number; color: string; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(count > 0);
  return (
    <div className="mb-2">
      <button
        className="btn btn-link p-0 text-decoration-none d-flex align-items-center gap-1 w-100"
        onClick={() => setOpen(!open)}
        style={{ fontSize: 11, color: 'var(--color-text, #2d3748)' }}
      >
        <i className={`bi bi-chevron-${open ? 'down' : 'right'}`} style={{ fontSize: 8 }}></i>
        <i className={`bi ${icon}`} style={{ color, fontSize: 11 }}></i>
        <span className="fw-medium">{title}</span>
        {count > 0 && (
          <span className="badge ms-auto" style={{ fontSize: 8, background: `${color}18`, color, border: `1px solid ${color}30` }}>
            {count}
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
  lessonId, skillGraph, artifactFlow,
  editing, dryRun, validating, onRevalidate,
  qualityBreakdown, qualityLoading, onRefreshQuality,
  suggestions, suggestionsLoading, applyingSuggestion, onRefreshSuggestions, onApplySuggestionFix,
  onOpenDiagnostic, onOpenRepair,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const resolveLabel = (id: string, options: { value: string; label: string }[]) =>
    options.find(o => o.value === id)?.label || id.slice(0, 12);

  return (
    <div className="card border-0 shadow-sm mb-2">
      <div
        className="card-header bg-white py-2 d-flex justify-content-between align-items-center"
        style={{ cursor: 'pointer' }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="fw-semibold small">
          <i className="bi bi-cpu me-1" style={{ color: 'var(--color-primary, #1a365d)' }}></i>
          Section Intelligence
        </span>
        <i className={`bi bi-chevron-${collapsed ? 'right' : 'down'} text-muted`} style={{ fontSize: 11 }}></i>
      </div>

      {!collapsed && (
        <div className="card-body py-2" style={{ fontSize: 10 }}>
          {lessonTitle && (
            <div className="fw-semibold mb-2" style={{ fontSize: 11, color: 'var(--color-primary, #1a365d)' }}>
              {lessonTitle}
            </div>
          )}

          {/* Variables Used */}
          <CollapsibleSection icon="bi-braces" title="Variables" count={sectionVariableKeys.length} color="#0d6efd">
            <div className="d-flex flex-wrap gap-1">
              {sectionVariableKeys.map(k => (
                <span key={k} className="badge" style={{ fontSize: 8, background: 'rgba(13,110,253,0.1)', color: '#0d6efd', border: '1px solid rgba(13,110,253,0.2)' }}>
                  {resolveLabel(k, variableOptions)}
                </span>
              ))}
              {sectionVariableKeys.length === 0 && <span className="text-muted">None assigned</span>}
            </div>
          </CollapsibleSection>

          {/* Skills Covered */}
          <CollapsibleSection icon="bi-award" title="Skills" count={sectionSkillIds.length} color="#38a169">
            <div className="d-flex flex-column gap-1">
              {sectionSkillIds.map(id => {
                const graphEntry = skillGraph?.find(s => s.skill_id === id || s.sections?.some(sec => sec.lesson_id === lessonId));
                const matchedEntry = skillGraph?.find(s => {
                  const matchById = s.skill_id === id;
                  const matchBySection = s.sections?.some(sec => sec.lesson_id === lessonId);
                  return matchById || matchBySection;
                });
                const sectionCount = matchedEntry?.sections?.length || 0;
                const sectionRole = lessonId ? matchedEntry?.sections?.find(sec => sec.lesson_id === lessonId)?.role : undefined;
                const skillType = matchedEntry?.skill_type || 'core';
                const typeLabel = skillType === 'core' ? 'C' : skillType === 'supporting' ? 'S' : 'A';
                const typeColor = skillType === 'core' ? '#38a169' : skillType === 'supporting' ? '#0d6efd' : '#7c3aed';

                return (
                  <div key={id} className="d-flex align-items-center gap-1">
                    <span className="badge" style={{ fontSize: 7, background: `${typeColor}20`, color: typeColor, border: `1px solid ${typeColor}40`, minWidth: 14, textAlign: 'center' }}>
                      {typeLabel}
                    </span>
                    <span className="badge" style={{ fontSize: 8, background: 'rgba(56,161,105,0.1)', color: '#38a169', border: '1px solid rgba(56,161,105,0.2)' }}>
                      {resolveLabel(id, skillOptions)}
                    </span>
                    {sectionCount > 1 && (
                      <span className="text-muted" style={{ fontSize: 7 }}>{sectionCount} sections</span>
                    )}
                    {sectionRole && (
                      <span className="badge ms-auto" style={{
                        fontSize: 7,
                        background: sectionRole === 'introduced' ? 'rgba(56,161,105,0.15)' : sectionRole === 'reinforced' ? 'rgba(13,110,253,0.15)' : 'rgba(124,58,237,0.15)',
                        color: sectionRole === 'introduced' ? '#38a169' : sectionRole === 'reinforced' ? '#0d6efd' : '#7c3aed',
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
          <CollapsibleSection icon="bi-box" title="Artifacts" count={sectionArtifactIds.length} color="#dd6b20">
            <div className="d-flex flex-column gap-1">
              {sectionArtifactIds.map(id => {
                const flowEntry = artifactFlow?.find(a => a.artifact_id === id);
                const isProducer = flowEntry?.produced_by?.lesson_id === lessonId;
                const isConsumer = !isProducer && flowEntry?.produced_by != null;
                const downstreamCount = flowEntry?.consumed_by?.length || 0;
                const dirColor = isProducer ? '#dd6b20' : isConsumer ? '#0d6efd' : '#718096';
                const dirLabel = isProducer ? 'Produces' : isConsumer ? 'Uses' : '';
                const dirIcon = isProducer ? 'bi-arrow-up-right' : isConsumer ? 'bi-arrow-down-left' : '';

                return (
                  <div key={id} className="d-flex align-items-center gap-1">
                    {dirIcon && (
                      <i className={`bi ${dirIcon}`} style={{ fontSize: 8, color: dirColor }}></i>
                    )}
                    <span className="badge" style={{ fontSize: 8, background: `${dirColor}18`, color: dirColor, border: `1px solid ${dirColor}30` }}>
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
          <CollapsibleSection icon="bi-arrow-right-circle" title="Pipeline Flow" count={miniSections.length} color="#7c3aed">
            <div className="d-flex flex-column gap-1">
              {miniSections.map((ms, i) => {
                const icon = TYPE_ICONS[ms.mini_section_type] || 'bi-circle';
                return (
                  <div key={ms.id} className="d-flex align-items-center gap-1" style={{ fontSize: 9 }}>
                    <span className="badge bg-light text-muted border" style={{ fontSize: 7, minWidth: 14 }}>{i + 1}</span>
                    <i className={`bi ${icon}`} style={{ fontSize: 10, color: '#7c3aed' }}></i>
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

          {/* Diagnostic Tools — shown when a mini-section is selected */}
          {editing && (
            <>
              <hr className="my-2" style={{ opacity: 0.15 }} />
              <div className="fw-semibold mb-1" style={{ fontSize: 10, color: 'var(--color-text-light, #718096)' }}>
                <i className="bi bi-activity me-1"></i>Diagnostics
                {editing.title && <span className="fw-normal ms-1">— {editing.title}</span>}
              </div>

              {/* Validation */}
              <CollapsibleSection icon="bi-check-circle" title="Validation" count={0} color="#0d6efd">
                <ValidationSection
                  editing={editing}
                  dryRun={dryRun || null}
                  validating={validating || false}
                  onRevalidate={onRevalidate || (() => {})}
                />
              </CollapsibleSection>

              {/* Quality Score */}
              {editing.id && (
                <CollapsibleSection icon="bi-graph-up" title="Quality Score" count={0} color="#38a169">
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
                <CollapsibleSection icon="bi-lightbulb" title="Improve to 100" count={suggestions?.length || 0} color="#dd6b20">
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
