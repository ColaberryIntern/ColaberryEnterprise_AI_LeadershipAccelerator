import React, { useState, useCallback, useEffect, useRef } from 'react';
import { MiniSection } from './types';

interface GeneratedEvent {
  type: string;
  student_label: string;
  title: string;
  description: string;
  learning_goal: string;
}

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

export default function SectionBlueprintCard({
  lessonId, lessonTitle, lessonDescription, lessonLearningGoal,
  structurePrompt, onPromptChange, miniSections, token, apiUrl, onApply,
}: Props) {
  const [collapsed, setCollapsed] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatedEvents, setGeneratedEvents] = useState<GeneratedEvent[] | null>(null);
  const [error, setError] = useState('');
  const [localPrompt, setLocalPrompt] = useState(structurePrompt);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from parent
  useEffect(() => {
    setLocalPrompt(structurePrompt);
  }, [structurePrompt]);

  // Auto-populate default prompt if empty
  useEffect(() => {
    if (!structurePrompt && lessonTitle) {
      const defaultPrompt = buildDefaultPrompt(lessonTitle, lessonDescription, lessonLearningGoal);
      setLocalPrompt(defaultPrompt);
    }
  }, [lessonTitle, lessonDescription, lessonLearningGoal, structurePrompt]);

  // Debounced save
  const handlePromptEdit = useCallback((val: string) => {
    setLocalPrompt(val);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      onPromptChange(val);
    }, 1500);
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
        </span>
        <i className={`bi bi-chevron-${collapsed ? 'right' : 'down'} text-muted`} style={{ fontSize: 11 }}></i>
      </div>

      {!collapsed && (
        <div className="card-body py-2">
          <textarea
            className="form-control form-control-sm mb-2"
            rows={8}
            value={localPrompt}
            onChange={e => handlePromptEdit(e.target.value)}
            placeholder="Describe the section to generate a 5-event learning structure..."
            style={{ fontSize: 11, fontFamily: 'monospace', lineHeight: 1.5 }}
          />

          <div className="d-flex gap-2 mb-2">
            <button
              className="btn btn-sm btn-primary flex-grow-1"
              onClick={handleGenerate}
              disabled={generating || !localPrompt.trim()}
            >
              {generating ? (
                <><span className="spinner-border spinner-border-sm me-1" style={{ width: 12, height: 12 }}></span>Generating...</>
              ) : (
                <><i className="bi bi-stars me-1"></i>Generate Structure</>
              )}
            </button>
            {!structurePrompt && localPrompt && (
              <button
                className="btn btn-sm btn-outline-secondary"
                onClick={() => onPromptChange(localPrompt)}
                title="Save prompt without generating"
              >
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
            <div>
              <h6 className="small fw-semibold mb-1" style={{ fontSize: 11 }}>
                <i className="bi bi-check-circle text-success me-1"></i>Generated Structure
              </h6>
              <div className="d-flex flex-column gap-1 mb-2">
                {generatedEvents.map((evt, i) => {
                  const existing = miniSections.find(ms => ms.mini_section_type === evt.type);
                  return (
                    <div
                      key={evt.type}
                      className="d-flex align-items-start gap-2 border rounded px-2 py-1"
                      style={{ fontSize: 10, borderLeft: `3px solid ${TYPE_COLORS[evt.type] || '#718096'} !important` }}
                    >
                      <span className="badge bg-light text-muted border mt-1" style={{ fontSize: 9, minWidth: 18 }}>{i + 1}</span>
                      <i className={`bi ${TYPE_ICONS[evt.type] || 'bi-circle'} mt-1`} style={{ color: TYPE_COLORS[evt.type], fontSize: 12 }}></i>
                      <div className="flex-grow-1" style={{ minWidth: 0 }}>
                        <div className="fw-semibold">{evt.title}</div>
                        <div className="text-muted text-truncate">{evt.description}</div>
                        <div className="text-muted fst-italic text-truncate" style={{ fontSize: 9 }}>Goal: {evt.learning_goal}</div>
                      </div>
                      {existing && (
                        <span className="badge bg-warning-subtle text-dark border" style={{ fontSize: 8 }} title={`Will update: ${existing.title}`}>
                          update
                        </span>
                      )}
                      {!existing && (
                        <span className="badge bg-success-subtle text-success border" style={{ fontSize: 8 }}>
                          new
                        </span>
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

          {/* Current mini-section summary when no generation result */}
          {!generatedEvents && miniSections.length > 0 && (
            <div className="text-muted" style={{ fontSize: 9 }}>
              <i className="bi bi-info-circle me-1"></i>
              {miniSections.length} mini-section{miniSections.length !== 1 ? 's' : ''} exist — generate to preview updates
            </div>
          )}
        </div>
      )}
    </div>
  );
}
