import React, { useState } from 'react';
import useMiniSectionBuilder from './builder/useMiniSectionBuilder';
import ObjectConfigEngine from './builder/ObjectConfigEngine';
import InlineVariableCreator from './builder/InlineVariableCreator';
import InlineSkillCreator from './builder/InlineSkillCreator';
import InlineArtifactCreator from './builder/InlineArtifactCreator';
import BackfillButton from './builder/BackfillButton';
import SectionBlueprintCard from './builder/SectionBlueprintCard';
import DiagnosticReportModal from './builder/DiagnosticReportModal';
import AutoRepairModal from './builder/AutoRepairModal';
import CurriculumMapNavigator from './builder/CurriculumMapNavigator';
import MiniSectionPipeline from './builder/MiniSectionPipeline';
import SectionIntelligencePanel from './builder/SectionIntelligencePanel';
import PromptDebuggerPanel from './builder/PromptDebuggerPanel';
import AISimulationWorkspace from './builder/AISimulationWorkspace';
import { PROMPT_PAIRS } from './builder/types';

interface GeneratedEvent {
  type: string;
  student_label: string;
  title: string;
  description: string;
  learning_goal: string;
}

export default function MiniSectionControlTab({ token, apiUrl, initialLessonId }: { token: string; apiUrl: string; initialLessonId?: string | null }) {
  const builder = useMiniSectionBuilder({ token, apiUrl, initialLessonId });
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  const handleSaveStructurePrompt = async (prompt: string) => {
    if (!builder.selectedLessonId) return;
    builder.setStructurePrompt(prompt);
    try {
      await fetch(`${apiUrl}/api/admin/orchestration/lessons/${builder.selectedLessonId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ structure_prompt: prompt }),
      });
    } catch { /* silent save */ }
  };

  const handleSectionAssignmentsChange = async (updates: { section_variable_keys?: string[]; section_artifact_ids?: string[]; section_skill_ids?: string[] }) => {
    if (!builder.selectedLessonId) return;
    if (updates.section_variable_keys) builder.setSectionVariableKeys(updates.section_variable_keys);
    if (updates.section_artifact_ids) builder.setSectionArtifactIds(updates.section_artifact_ids);
    if (updates.section_skill_ids) builder.setSectionSkillIds(updates.section_skill_ids);
    try {
      await fetch(`${apiUrl}/api/admin/orchestration/lessons/${builder.selectedLessonId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
    } catch { /* silent save */ }
  };

  const handleApplyStructure = async (events: GeneratedEvent[]) => {
    if (!builder.selectedLessonId) return;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    for (const evt of events) {
      const existing = builder.miniSections.find(ms => ms.mini_section_type === evt.type);
      if (existing) {
        await fetch(`${apiUrl}/api/admin/orchestration/mini-sections/${existing.id}`, {
          method: 'PUT', headers,
          body: JSON.stringify({ title: evt.title, description: evt.description }),
        });
      } else {
        const maxOrder = builder.miniSections.reduce((max, ms) => Math.max(max, ms.mini_section_order || 0), 0);
        const order = maxOrder + 1;
        // Auto-populate default prompts from TypeDefinition
        const promptDefaults: Record<string, string> = {};
        const td = builder.typeDefinitions?.find(t => t.slug === evt.type);
        if (td?.default_prompts) {
          for (const pair of PROMPT_PAIRS) {
            const dp = td.default_prompts[pair.key];
            if (dp) {
              const merged = dp.system && dp.user ? dp.system + '\n\n' + dp.user : dp.system || dp.user || '';
              if (merged) promptDefaults[pair.systemField] = merged;
            }
          }
        }
        await fetch(`${apiUrl}/api/admin/orchestration/lessons/${builder.selectedLessonId}/mini-sections`, {
          method: 'POST', headers,
          body: JSON.stringify({
            mini_section_type: evt.type,
            title: evt.title,
            description: `${evt.description}${evt.learning_goal ? '\nLearning Goal: ' + evt.learning_goal : ''}`,
            mini_section_order: order,
            is_active: true,
            ...promptDefaults,
          }),
        });
      }
    }
    builder.selectLesson(builder.selectedLessonId);
  };

  return (
    <div>
      {/* Inline Creator Modals */}
      {builder.inlineCreator === 'variable' && (
        <InlineVariableCreator
          token={token} apiUrl={apiUrl}
          onCreated={(key) => {
            builder.setInlineCreator(null);
            builder.refreshReferenceData();
            if (builder.editing) {
              builder.updateEditing({ associated_variable_keys: [...(builder.editing.associated_variable_keys || []), key] });
            }
          }}
          onCancel={() => builder.setInlineCreator(null)}
        />
      )}
      {builder.inlineCreator === 'skill' && (
        <InlineSkillCreator
          token={token} apiUrl={apiUrl}
          onCreated={(skillId) => {
            builder.setInlineCreator(null);
            builder.refreshReferenceData();
            if (builder.editing) {
              builder.updateEditing({ associated_skill_ids: [...(builder.editing.associated_skill_ids || []), skillId] });
            }
          }}
          onCancel={() => builder.setInlineCreator(null)}
        />
      )}
      {builder.inlineCreator === 'artifact' && (
        <InlineArtifactCreator
          token={token} apiUrl={apiUrl}
          onCreated={(artifactId) => {
            builder.setInlineCreator(null);
            builder.refreshReferenceData();
            if (builder.editing) {
              builder.updateEditing({ creates_artifact_ids: [...(builder.editing.creates_artifact_ids || []), artifactId] });
            }
          }}
          onCancel={() => builder.setInlineCreator(null)}
        />
      )}

      {/* AI Simulation Workspace */}
      {builder.showSimulation && builder.selectedLessonId && (
        <AISimulationWorkspace
          miniSections={builder.miniSections}
          lessonTitle={builder.selectedLesson?.title || 'Untitled'}
          lessonId={builder.selectedLessonId}
          token={token}
          apiUrl={apiUrl}
          onClose={() => builder.setShowSimulation(false)}
        />
      )}

      {/* Diagnostic Report Modal */}
      {builder.showDiagnosticModal && (
        <DiagnosticReportModal
          report={builder.diagnosticReport}
          loading={builder.diagnosticLoading}
          onClose={() => builder.setShowDiagnosticModal(false)}
          onRun={() => builder.runDiagnostic()}
        />
      )}

      {/* Auto-Repair Modal */}
      {builder.showRepairModal && (
        <AutoRepairModal
          result={builder.repairResult}
          loading={builder.repairLoading}
          onClose={() => builder.setShowRepairModal(false)}
          onRun={(dryRun) => builder.runAutoRepair(dryRun)}
        />
      )}

      {!builder.selectedLessonId ? (
        <div className="row g-3">
          <div className="col-lg-3">
            <CurriculumMapNavigator
              modules={builder.modules}
              selectedLessonId={builder.selectedLessonId}
              onSelectLesson={id => builder.selectLesson(id)}
            />
          </div>
          <div className="col-lg-9">
            <div className="card border-0 shadow-sm">
              <div className="card-body text-center py-5">
                <i className="bi bi-cursor-fill" style={{ fontSize: 36, color: 'var(--color-text-light)' }}></i>
                <h6 className="fw-bold mt-3">Select a Section</h6>
                <p className="text-muted small">Choose a section from the navigator to configure its mini-sections, preview content, and run simulations.</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="row g-3">
          {/* LEFT PANEL — Navigator + Blueprint + Pipeline */}
          <div style={{ flex: leftCollapsed ? '0 0 auto' : undefined, width: leftCollapsed ? 40 : undefined, transition: 'all 0.2s ease' }} className={leftCollapsed ? '' : 'col-lg-3'}>
            {leftCollapsed ? (
              <button
                className="btn btn-sm btn-outline-secondary w-100 py-2"
                onClick={() => setLeftCollapsed(false)}
                title="Expand left panel"
                style={{ fontSize: 10, writingMode: 'vertical-rl', height: 120 }}
              >
                <i className="bi bi-chevron-right"></i>
              </button>
            ) : (
              <>
                <div className="d-flex justify-content-end mb-1">
                  <button
                    className="btn btn-sm btn-link text-muted p-0"
                    onClick={() => setLeftCollapsed(true)}
                    title="Collapse left panel"
                    style={{ fontSize: 10 }}
                  >
                    <i className="bi bi-chevron-bar-left"></i>
                  </button>
                </div>
                <CurriculumMapNavigator
                  modules={builder.modules}
                  selectedLessonId={builder.selectedLessonId}
                  onSelectLesson={id => builder.selectLesson(id)}
                />

                <SectionBlueprintCard
                  lessonId={builder.selectedLessonId}
                  lessonTitle={builder.selectedLesson?.title}
                  lessonDescription={builder.lessonDescription}
                  lessonLearningGoal={builder.lessonLearningGoal}
                  structurePrompt={builder.structurePrompt}
                  onPromptChange={handleSaveStructurePrompt}
                  miniSections={builder.miniSections}
                  token={token}
                  apiUrl={apiUrl}
                  onApply={handleApplyStructure}
                  sectionVariableKeys={builder.sectionVariableKeys}
                  sectionArtifactIds={builder.sectionArtifactIds}
                  sectionSkillIds={builder.sectionSkillIds}
                  onSectionAssignmentsChange={handleSectionAssignmentsChange}
                  variableOptions={builder.variableOptions.map(v => ({ value: v.value, label: v.label }))}
                  artifactOptions={builder.artifactOptions.map(a => ({ value: a.value, label: a.label }))}
                  skillOptions={builder.skillOptions.map(s => ({ value: s.value, label: s.label }))}
                />

                {/* Action Toolbar */}
                <div className="d-flex gap-1 mb-2 flex-wrap">
                  <button className="btn btn-sm btn-primary py-0 px-2" style={{ fontSize: 10 }} onClick={builder.startCreate}>
                    <i className="bi bi-plus-lg me-1"></i>Add
                  </button>
                  <button className="btn btn-sm btn-outline-info py-0 px-2" style={{ fontSize: 10 }} onClick={() => builder.setShowSimulation(true)}>
                    <i className="bi bi-robot me-1"></i>Simulate
                  </button>
                  <BackfillButton token={token} apiUrl={apiUrl} onComplete={() => {
                    builder.refreshReferenceData();
                    if (builder.selectedLessonId) builder.selectLesson(builder.selectedLessonId);
                  }} />
                </div>

                {/* Mini-Section Pipeline */}
                <div className="card border-0 shadow-sm">
                  <div className="card-header bg-white py-2 d-flex justify-content-between align-items-center">
                    <span className="fw-semibold small">
                      <i className="bi bi-signpost-split me-1" style={{ color: 'var(--color-primary, #1a365d)' }}></i>
                      Pipeline
                    </span>
                    <span className="badge bg-info" style={{ fontSize: 9 }}>{builder.miniSections.length} steps</span>
                  </div>
                  <div className="card-body py-2">
                    <MiniSectionPipeline
                      miniSections={builder.miniSections}
                      selectedId={builder.selectedMiniSectionId}
                      onSelect={id => builder.selectMiniSection(id)}
                      onReorder={builder.reorderItems}
                      onDelete={builder.handleDelete}
                      isDirtyId={builder.isDirty ? builder.selectedMiniSectionId : null}
                      loading={builder.loading}
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* CENTER PANEL — Object Config Engine */}
          <div className="col" style={{ transition: 'all 0.2s ease' }}>
            <ObjectConfigEngine
              editing={builder.editing}
              isNew={builder.isNewItem}
              isDirty={builder.isDirty}
              miniSections={builder.miniSections}
              prompts={builder.prompts}
              skillOptions={builder.skillOptions}
              variableOptions={builder.variableOptions}
              artifactOptions={builder.artifactOptions}
              variables={builder.variables}
              systemVariables={builder.systemVariables}
              artifacts={builder.artifacts}
              promptBodies={builder.promptBodies}
              fetchPromptBody={builder.fetchPromptBody}
              dryRun={builder.dryRun}
              variableMap={builder.variableMap}
              validating={builder.validating}
              onRevalidate={builder.runValidation}
              onUpdate={builder.updateEditing}
              onSave={builder.handleSave}
              onCancel={builder.cancelEdit}
              onDelete={builder.handleDelete}
              saving={builder.saving}
              error={builder.error}
              onCreateVariable={() => builder.setInlineCreator('variable')}
              onCreateSkill={() => builder.setInlineCreator('skill')}
              onCreateArtifact={() => builder.setInlineCreator('artifact')}
              qualityBreakdown={builder.qualityBreakdown}
              qualityLoading={builder.qualityLoading}
              onRefreshQuality={() => builder.fetchQualityScore()}
              suggestions={builder.suggestions}
              suggestionsLoading={builder.suggestionsLoading}
              applyingSuggestion={builder.applyingSuggestion}
              onRefreshSuggestions={() => builder.fetchSuggestions()}
              onApplySuggestionFix={builder.applySuggestionFix}
              onOpenDiagnostic={() => { builder.setShowDiagnosticModal(true); builder.runDiagnostic(); }}
              onOpenRepair={() => builder.setShowRepairModal(true)}
              onSelectMiniSection={builder.selectMiniSection}
              typeDefinitions={builder.typeDefinitions}
              sectionVariableKeys={builder.sectionVariableKeys}
              sectionArtifactIds={builder.sectionArtifactIds}
              sectionSkillIds={builder.sectionSkillIds}
              lessonTitle={builder.selectedLesson?.title}
              lessonId={builder.selectedLessonId}
              token={token}
              apiUrl={apiUrl}
            />
          </div>

          {/* RIGHT PANEL — Intelligence + Prompt Debugger */}
          <div style={{ flex: rightCollapsed ? '0 0 auto' : undefined, width: rightCollapsed ? 40 : undefined, transition: 'all 0.2s ease' }} className={rightCollapsed ? '' : 'col-lg-4'}>
            {rightCollapsed ? (
              <button
                className="btn btn-sm btn-outline-secondary w-100 py-2"
                onClick={() => setRightCollapsed(false)}
                title="Expand right panel"
                style={{ fontSize: 10, writingMode: 'vertical-rl', height: 120 }}
              >
                <i className="bi bi-chevron-left"></i>
              </button>
            ) : (
              <>
                <div className="d-flex justify-content-start mb-1">
                  <button
                    className="btn btn-sm btn-link text-muted p-0"
                    onClick={() => setRightCollapsed(true)}
                    title="Collapse right panel"
                    style={{ fontSize: 10 }}
                  >
                    <i className="bi bi-chevron-bar-right"></i>
                  </button>
                </div>
                <SectionIntelligencePanel
                  sectionVariableKeys={builder.sectionVariableKeys}
                  sectionArtifactIds={builder.sectionArtifactIds}
                  sectionSkillIds={builder.sectionSkillIds}
                  miniSections={builder.miniSections}
                  variableOptions={builder.variableOptions.map(v => ({ value: v.value, label: v.label }))}
                  artifactOptions={builder.artifactOptions.map(a => ({ value: a.value, label: a.label }))}
                  skillOptions={builder.skillOptions.map(s => ({ value: s.value, label: s.label }))}
                  lessonTitle={builder.selectedLesson?.title}
                  editing={builder.editing}
                  dryRun={builder.dryRun}
                  validating={builder.validating}
                  onRevalidate={builder.runValidation}
                  qualityBreakdown={builder.qualityBreakdown}
                  qualityLoading={builder.qualityLoading}
                  onRefreshQuality={() => builder.fetchQualityScore()}
                  suggestions={builder.suggestions}
                  suggestionsLoading={builder.suggestionsLoading}
                  applyingSuggestion={builder.applyingSuggestion}
                  onRefreshSuggestions={() => builder.fetchSuggestions()}
                  onApplySuggestionFix={builder.applySuggestionFix}
                  onOpenDiagnostic={() => { builder.setShowDiagnosticModal(true); builder.runDiagnostic(); }}
                  onOpenRepair={() => builder.setShowRepairModal(true)}
                />
                <PromptDebuggerPanel
                  lessonId={builder.selectedLessonId}
                  token={token}
                  apiUrl={apiUrl}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
