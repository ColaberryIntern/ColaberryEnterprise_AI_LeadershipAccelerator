import React, { useState } from 'react';
import useMiniSectionBuilder from './builder/useMiniSectionBuilder';
import StudentStructureTree from './builder/StudentStructureTree';
import ObjectConfigEngine from './builder/ObjectConfigEngine';
import TestSimulationPanel from './builder/TestSimulationPanel';
import InlineVariableCreator from './builder/InlineVariableCreator';
import InlineSkillCreator from './builder/InlineSkillCreator';
import InlineArtifactCreator from './builder/InlineArtifactCreator';
import BackfillButton from './builder/BackfillButton';
import DiagnosticReportModal from './builder/DiagnosticReportModal';
import AutoRepairModal from './builder/AutoRepairModal';
import { Lesson, TYPE_OPTIONS, TYPE_ICONS } from './builder/types';

export default function MiniSectionControlTab({ token, apiUrl, initialLessonId }: { token: string; apiUrl: string; initialLessonId?: string | null }) {
  const builder = useMiniSectionBuilder({ token, apiUrl, initialLessonId });

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

      {/* Test AI Simulation Modal */}
      {builder.showSimulation && builder.selectedLessonId && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true">
          <div className="modal-dialog modal-xl">
            <div className="modal-content">
              <div className="modal-header py-2">
                <h6 className="modal-title" style={{ fontSize: 13 }}>
                  <i className="bi bi-robot me-1"></i>Test AI Simulation
                </h6>
                <button className="btn-close" onClick={() => builder.setShowSimulation(false)} style={{ fontSize: 10 }} />
              </div>
              <div className="modal-body" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
                <TestSimulationPanel
                  miniSections={builder.miniSections}
                  lessonTitle={builder.selectedLesson?.title || 'Untitled'}
                  lessonId={builder.selectedLessonId}
                  token={token}
                  apiUrl={apiUrl}
                />
              </div>
            </div>
          </div>
        </div>
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

      {/* Section Selector Bar */}
      <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
        <select
          className="form-select form-select-sm"
          style={{ maxWidth: 400 }}
          value={builder.selectedLessonId}
          onChange={e => builder.selectLesson(e.target.value)}
        >
          <option value="">Select a section...</option>
          {builder.modules.map(m => (
            <optgroup key={m.id} label={`Module ${m.module_number}: ${m.title}`}>
              {(m.lessons || []).map((l: Lesson) => (
                <option key={l.id} value={l.id}>Section {l.lesson_number}: {l.title}</option>
              ))}
            </optgroup>
          ))}
        </select>
        {builder.selectedLessonId && (
          <>
            <button className="btn btn-sm btn-primary" onClick={builder.startCreate}>
              <i className="bi bi-plus-lg me-1"></i>Add
            </button>
            <button className="btn btn-sm btn-outline-info" onClick={() => builder.setShowSimulation(true)}>
              <i className="bi bi-robot me-1"></i>Simulate AI
            </button>
            <BackfillButton token={token} apiUrl={apiUrl} onComplete={() => {
              builder.refreshReferenceData();
              if (builder.selectedLessonId) builder.selectLesson(builder.selectedLessonId);
            }} />
          </>
        )}
      </div>

      {!builder.selectedLessonId ? (
        <div className="card border-0 shadow-sm">
          <div className="card-body text-center py-5">
            <i className="bi bi-cursor-fill" style={{ fontSize: 36, color: 'var(--color-text-light)' }}></i>
            <h6 className="fw-bold mt-3">Select a Section</h6>
            <p className="text-muted small">Choose a section above to configure its mini-sections, preview content, and run simulations.</p>
          </div>
        </div>
      ) : (
        <div className="row g-3">
          {/* LEFT PANEL — Student Structure Mirror */}
          <div className="col-lg-4">
            <div className="card border-0 shadow-sm">
              <div className="card-header bg-white py-2 d-flex justify-content-between align-items-center">
                <span className="fw-semibold small">
                  <i className="bi bi-list-nested me-1"></i>
                  {builder.selectedLesson?.title || 'Student View'}
                </span>
                <span className="badge bg-info" style={{ fontSize: 10 }}>{builder.miniSections.length} items</span>
              </div>
              <div className="card-body py-2" style={{ maxHeight: 500, overflowY: 'auto' }}>
                <StudentStructureTree
                  miniSections={builder.miniSections}
                  selectedId={builder.selectedMiniSectionId}
                  onSelect={(id) => { builder.selectMiniSection(id); }}
                  onMove={builder.moveItem}
                  onDelete={builder.handleDelete}
                  isDirtyId={builder.isDirty ? builder.selectedMiniSectionId : null}
                  loading={builder.loading}
                />
              </div>
            </div>
          </div>

          {/* RIGHT PANEL — Configure (with inline preview) */}
          <div className="col-lg-8">
            {/* Type tabs — one per mini-section type */}
            {builder.miniSections.length > 0 && (
              <div className="d-flex border-bottom bg-white rounded-top shadow-sm mb-0" style={{ overflowX: 'auto' }}>
                {TYPE_OPTIONS.map(type => {
                  const ms = builder.miniSections.find(m => m.mini_section_type === type.value);
                  const isActive = builder.editing?.mini_section_type === type.value;
                  return (
                    <button
                      key={type.value}
                      className={`btn btn-sm rounded-0 border-0 px-3 py-2 ${isActive ? 'fw-bold text-primary' : 'text-muted'}`}
                      style={{
                        fontSize: 11,
                        whiteSpace: 'nowrap',
                        borderBottom: isActive ? '2px solid var(--color-primary-light, #2b6cb0)' : '2px solid transparent',
                      }}
                      onClick={() => ms && builder.selectMiniSection(ms.id)}
                      disabled={!ms}
                    >
                      <i className={`bi ${TYPE_ICONS[type.value] || 'bi-circle'} me-1`}></i>
                      {type.studentLabel}
                    </button>
                  );
                })}
              </div>
            )}
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
              typeDefinitions={builder.typeDefinitions}
              lessonTitle={builder.selectedLesson?.title}
              lessonId={builder.selectedLessonId}
              token={token}
              apiUrl={apiUrl}
            />
          </div>
        </div>
      )}
    </div>
  );
}
