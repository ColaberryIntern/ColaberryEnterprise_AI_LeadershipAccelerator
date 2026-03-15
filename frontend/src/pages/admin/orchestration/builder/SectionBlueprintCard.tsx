import React, { useState, useCallback, useEffect, useRef } from 'react';
import { MiniSection, VariableOption, ArtifactOption } from './types';

interface GeneratedEvent {
  type: string;
  student_label: string;
  title: string;
  description: string;
  learning_goal: string;
}

interface SkillOptionItem { value: string; label: string; sub?: string }

interface Props {
  lessonId: string;
  lessonTitle?: string;
  lessonDescription?: string;
  lessonLearningGoal?: string;
  structurePrompt: string;
  onPromptChange: (prompt: string) => void;
  miniSections: MiniSection[];
  token: string;
  apiUrl: string;
  onApply: (events: GeneratedEvent[]) => void;
  // Section-level assignments
  sectionVariableKeys: string[];
  sectionArtifactIds: string[];
  sectionSkillIds: string[];
  onSectionAssignmentsChange: (updates: { section_variable_keys?: string[]; section_artifact_ids?: string[]; section_skill_ids?: string[] }) => void;
  // Reference data for multi-selects
  variableOptions: { value: string; label: string }[];
  artifactOptions: { value: string; label: string }[];
  skillOptions: SkillOptionItem[];
}

const TYPE_ICONS: Record<string, string> = {
  executive_reality_check: 'bi-lightbulb',
  ai_strategy: 'bi-diagram-3',
  prompt_template: 'bi-code-square',
  implementation_task: 'bi-clipboard-check',
  knowledge_check: 'bi-question-circle',
};

const TYPE_COLORS: Record<string, string> = {
  executive_reality_check: '#38a169',
  ai_strategy: '#2b6cb0',
  prompt_template: '#805ad5',
  implementation_task: '#dd6b20',
  knowledge_check: '#e53e3e',
};

function buildDefaultPrompt(title?: string, description?: string, learningGoal?: string): string {
  return `Section: "${title || 'Untitled Section'}"

Description: ${description || 'No description set'}

Learning Goal: ${learningGoal || 'No learning goal set'}

Generate a 5-event learning sequence for this section. Each event has a Title, Description, and Learning Goal.

The 5 events follow this pedagogical arc:
1. Concept Snapshot — Reality-check analysis grounding AI concepts in operational reality
2. AI Strategy — Strategic framework defining AI vs human decision boundaries
3. Prompt Template — Hands-on prompt engineering exercise producing a reusable template
4. Implementation Task — Practical assessment building a real deliverable
5. Knowledge Check — Scenario-based assessment validating comprehension

Requirements:
- Titles: concise (3-5 words), professional, specific to the section topic
- Descriptions: 1-2 sentences explaining what the learner will do
- Learning Goals: measurable outcomes starting with action verbs (Analyze, Design, Build, Evaluate)
- Events should build progressively on each other
- Audience: senior business executives (aged 35-60)`;
}

function ToggleChips({ items, selected, onToggle, colorActive, colorBg }: {
  items: { value: string; label: string }[];
  selected: string[];
  onToggle: (val: string) => void;
  colorActive?: string;
  colorBg?: string;
}) {
  return (
    <div className="d-flex flex-wrap gap-1">
      {items.map(item => {
        const isSelected = selected.includes(item.value);
        return (
          <button
            key={item.value}
            type="button"
            className="btn btn-sm py-0 px-1"
            style={{
              fontSize: 9,
              background: isSelected ? (colorBg || 'rgba(128,90,213,0.15)') : 'transparent',
              color: isSelected ? (colorActive || '#805ad5') : '#718096',
              border: `1px solid ${isSelected ? (colorActive || '#805ad5') + '40' : '#e2e8f0'}`,
              borderRadius: 4,
            }}
            onClick={() => onToggle(item.value)}
          >
            {isSelected && <i className="bi bi-check me-1" style={{ fontSize: 8 }}></i>}
            {item.label}
          </button>
        );
      })}
      {items.length === 0 && (
        <span className="text-muted" style={{ fontSize: 9 }}>No options available</span>
      )}
    </div>
  );
}

export default function SectionBlueprintCard({
  lessonId, lessonTitle, lessonDescription, lessonLearningGoal,
  structurePrompt, onPromptChange, miniSections, token, apiUrl, onApply,
  sectionVariableKeys, sectionArtifactIds, sectionSkillIds, onSectionAssignmentsChange,
  variableOptions, artifactOptions, skillOptions,
}: Props) {
  const [collapsed, setCollapsed] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatedEvents, setGeneratedEvents] = useState<GeneratedEvent[] | null>(null);
  const [error, setError] = useState('');
  const [localPrompt, setLocalPrompt] = useState(structurePrompt);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showVars, setShowVars] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [showArtifacts, setShowArtifacts] = useState(false);

  useEffect(() => { setLocalPrompt(structurePrompt); }, [structurePrompt]);

  useEffect(() => {
    if (!structurePrompt && lessonTitle) {
      setLocalPrompt(buildDefaultPrompt(lessonTitle, lessonDescription, lessonLearningGoal));
    }
  }, [lessonTitle, lessonDescription, lessonLearningGoal, structurePrompt]);

  const handlePromptEdit = useCallback((val: string) => {
    setLocalPrompt(val);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { onPromptChange(val); }, 1500);
  }, [onPromptChange]);

  const handleGenerate = async () => {
    if (!localPrompt.trim()) return;
    setGenerating(true);
    setError('');
    setGeneratedEvents(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/lessons/${lessonId}/generate-structure`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ structure_prompt: localPrompt }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setGeneratedEvents(data.events);
      setCollapsed(false);
    } catch (err: any) {
      setError(err.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleApply = () => {
    if (generatedEvents) {
      onApply(generatedEvents);
      setGeneratedEvents(null);
    }
  };

  const toggleArrayItem = (arr: string[], val: string): string[] =>
    arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];

  const varCount = sectionVariableKeys.length;
  const skillCount = sectionSkillIds.length;
  const artCount = sectionArtifactIds.length;
  const assignmentSummary = (varCount + skillCount + artCount) > 0
    ? `${varCount}V ${artCount}A ${skillCount}S`
    : '';

  return (
    <div className="card border-0 shadow-sm mb-2">
      <div
        className="card-header bg-white py-2 d-flex justify-content-between align-items-center"
        style={{ cursor: 'pointer' }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="fw-semibold small">
          <i className="bi bi-stars me-1" style={{ color: '#805ad5' }}></i>
          Section Blueprint
          {assignmentSummary && (
            <span className="badge ms-1" style={{ fontSize: 8, background: 'rgba(128,90,213,0.12)', color: '#553c9a' }}>
              {assignmentSummary}
            </span>
          )}
        </span>
        <i className={`bi bi-chevron-${collapsed ? 'right' : 'down'} text-muted`} style={{ fontSize: 11 }}></i>
      </div>

      {!collapsed && (
        <div className="card-body py-2">
          {/* Structure Prompt */}
          <textarea
            className="form-control form-control-sm mb-2"
            rows={8}
            value={localPrompt}
            onChange={e => handlePromptEdit(e.target.value)}
            placeholder="Describe the section to generate a 5-event learning structure..."
            style={{ fontSize: 11, fontFamily: 'monospace', lineHeight: 1.5 }}
          />

          <div className="d-flex gap-2 mb-2">
            <button className="btn btn-sm btn-primary flex-grow-1" onClick={handleGenerate} disabled={generating || !localPrompt.trim()}>
              {generating ? (
                <><span className="spinner-border spinner-border-sm me-1" style={{ width: 12, height: 12 }}></span>Generating...</>
              ) : (
                <><i className="bi bi-stars me-1"></i>Generate Structure</>
              )}
            </button>
            {!structurePrompt && localPrompt && (
              <button className="btn btn-sm btn-outline-secondary" onClick={() => onPromptChange(localPrompt)} title="Save prompt without generating">
                <i className="bi bi-save"></i>
              </button>
            )}
          </div>

          {error && (
            <div className="alert alert-danger py-1 px-2 mb-2" style={{ fontSize: 10 }}>
              <i className="bi bi-exclamation-triangle me-1"></i>{error}
            </div>
          )}

          {/* Generated Results Preview */}
          {generatedEvents && (
            <div className="mb-2">
              <h6 className="small fw-semibold mb-1" style={{ fontSize: 11 }}>
                <i className="bi bi-check-circle text-success me-1"></i>Generated Structure
              </h6>
              <div className="d-flex flex-column gap-1 mb-2">
                {generatedEvents.map((evt, i) => {
                  const existing = miniSections.find(ms => ms.mini_section_type === evt.type);
                  return (
                    <div key={evt.type} className="d-flex align-items-start gap-2 border rounded px-2 py-1" style={{ fontSize: 10 }}>
                      <span className="badge bg-light text-muted border mt-1" style={{ fontSize: 9, minWidth: 18 }}>{i + 1}</span>
                      <i className={`bi ${TYPE_ICONS[evt.type] || 'bi-circle'} mt-1`} style={{ color: TYPE_COLORS[evt.type], fontSize: 12 }}></i>
                      <div className="flex-grow-1" style={{ minWidth: 0 }}>
                        <div className="fw-semibold">{evt.title}</div>
                        <div className="text-muted text-truncate">{evt.description}</div>
                        <div className="text-muted fst-italic text-truncate" style={{ fontSize: 9 }}>Goal: {evt.learning_goal}</div>
                      </div>
                      {existing ? (
                        <span className="badge bg-warning-subtle text-dark border" style={{ fontSize: 8 }}>update</span>
                      ) : (
                        <span className="badge bg-success-subtle text-success border" style={{ fontSize: 8 }}>new</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <button className="btn btn-sm btn-success w-100" onClick={handleApply}>
                <i className="bi bi-check2-all me-1"></i>Apply to Mini-Sections
              </button>
            </div>
          )}

          {/* ─── Section-Level Assignments ─── */}
          <div className="border-top pt-2 mt-2">
            <span className="text-muted fw-medium" style={{ fontSize: 10 }}>
              <i className="bi bi-sliders me-1"></i>Section Assignments
            </span>
            <span className="text-muted d-block mb-1" style={{ fontSize: 9 }}>
              Applied to all mini-sections in this section automatically
            </span>

            {/* Variables */}
            <div className="mb-1">
              <button className="btn btn-link p-0 text-decoration-none d-flex align-items-center gap-1 w-100" onClick={() => setShowVars(!showVars)} style={{ fontSize: 10 }}>
                <i className={`bi bi-chevron-${showVars ? 'down' : 'right'}`} style={{ fontSize: 8 }}></i>
                <i className="bi bi-braces text-info"></i>
                <span>Variables</span>
                {varCount > 0 && <span className="badge bg-info-subtle text-info border ms-auto" style={{ fontSize: 8 }}>{varCount}</span>}
              </button>
              {showVars && (
                <div className="ms-3 mt-1">
                  <ToggleChips
                    items={variableOptions}
                    selected={sectionVariableKeys}
                    onToggle={v => onSectionAssignmentsChange({ section_variable_keys: toggleArrayItem(sectionVariableKeys, v) })}
                    colorActive="#0d6efd"
                    colorBg="rgba(13,110,253,0.1)"
                  />
                </div>
              )}
            </div>

            {/* Artifacts */}
            <div className="mb-1">
              <button className="btn btn-link p-0 text-decoration-none d-flex align-items-center gap-1 w-100" onClick={() => setShowArtifacts(!showArtifacts)} style={{ fontSize: 10 }}>
                <i className={`bi bi-chevron-${showArtifacts ? 'down' : 'right'}`} style={{ fontSize: 8 }}></i>
                <i className="bi bi-box text-warning"></i>
                <span>Artifacts</span>
                {artCount > 0 && <span className="badge bg-warning-subtle text-dark border ms-auto" style={{ fontSize: 8 }}>{artCount}</span>}
              </button>
              {showArtifacts && (
                <div className="ms-3 mt-1">
                  <ToggleChips
                    items={artifactOptions}
                    selected={sectionArtifactIds}
                    onToggle={v => onSectionAssignmentsChange({ section_artifact_ids: toggleArrayItem(sectionArtifactIds, v) })}
                    colorActive="#dd6b20"
                    colorBg="rgba(221,107,32,0.1)"
                  />
                </div>
              )}
            </div>

            {/* Skills */}
            <div className="mb-1">
              <button className="btn btn-link p-0 text-decoration-none d-flex align-items-center gap-1 w-100" onClick={() => setShowSkills(!showSkills)} style={{ fontSize: 10 }}>
                <i className={`bi bi-chevron-${showSkills ? 'down' : 'right'}`} style={{ fontSize: 8 }}></i>
                <i className="bi bi-award text-success"></i>
                <span>Skills</span>
                {skillCount > 0 && <span className="badge bg-success-subtle text-success border ms-auto" style={{ fontSize: 8 }}>{skillCount}</span>}
              </button>
              {showSkills && (
                <div className="ms-3 mt-1">
                  <ToggleChips
                    items={skillOptions}
                    selected={sectionSkillIds}
                    onToggle={v => onSectionAssignmentsChange({ section_skill_ids: toggleArrayItem(sectionSkillIds, v) })}
                    colorActive="#38a169"
                    colorBg="rgba(56,161,105,0.1)"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Mini-section summary */}
          {!generatedEvents && miniSections.length > 0 && (
            <div className="text-muted mt-2" style={{ fontSize: 9 }}>
              <i className="bi bi-info-circle me-1"></i>
              {miniSections.length} mini-section{miniSections.length !== 1 ? 's' : ''} exist — generate to preview updates
            </div>
          )}
        </div>
      )}
    </div>
  );
}
