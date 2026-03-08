import React, { useState, useMemo } from 'react';
import ConceptSnapshot from '../../../../components/portal/lesson/ConceptSnapshot';
import AIStrategy from '../../../../components/portal/lesson/AIStrategy';
import PromptTemplate from '../../../../components/portal/lesson/PromptTemplate';
import ImplementationTask from '../../../../components/portal/lesson/ImplementationTask';
import KnowledgeChecks from '../../../../components/portal/lesson/KnowledgeChecks';
import ReflectionQuestions from '../../../../components/portal/lesson/ReflectionQuestions';
import { generateMockV2Content, MockV2Content } from './mockDataGenerator';

interface MiniSectionInput {
  id: string;
  mini_section_type: string;
  title: string;
  description: string;
  mini_section_order: number;
  associated_skill_ids?: string[];
  associated_variable_keys?: string[];
  creates_variable_keys?: string[];
  creates_artifact_ids?: string[];
  knowledge_check_config?: { enabled: boolean; question_count: number; pass_score: number } | null;
}

interface Props {
  miniSections: MiniSectionInput[];
  lessonTitle: string;
  lessonId: string;
  externalContent?: MockV2Content | null; // From Test AI simulation (Phase 3)
}

type ViewMode = 'preview' | 'json';

export default function PreviewPanel({ miniSections, lessonTitle, lessonId, externalContent }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const mockContent = useMemo(
    () => generateMockV2Content(miniSections, lessonTitle),
    [miniSections, lessonTitle]
  );

  const content = externalContent || mockContent;
  const isExternal = !!externalContent;

  if (miniSections.length === 0) {
    return (
      <div className="text-center py-4">
        <i className="bi bi-eye-slash" style={{ fontSize: 32, color: 'var(--color-text-light)' }}></i>
        <p className="text-muted small mt-2">No mini-sections to preview. Create mini-sections first.</p>
      </div>
    );
  }

  const sections = [
    { key: 'concept_snapshot', label: 'Concept Snapshot', icon: 'bi-lightbulb', badge: 'bg-primary', data: content.concept_snapshot },
    { key: 'ai_strategy', label: 'AI Strategy', icon: 'bi-diagram-3', badge: 'bg-info', data: content.ai_strategy },
    { key: 'prompt_template', label: 'Prompt Template', icon: 'bi-code-square', badge: 'bg-success', data: content.prompt_template },
    { key: 'implementation_task', label: 'Implementation Task', icon: 'bi-clipboard-check', badge: 'bg-warning text-dark', data: content.implementation_task },
    { key: 'knowledge_checks', label: 'Knowledge Checks', icon: 'bi-question-circle', badge: 'bg-secondary', data: content.knowledge_checks },
    { key: 'reflection_questions', label: 'Reflection', icon: 'bi-chat-dots', badge: 'bg-dark', data: content.reflection_questions },
  ].filter(s => s.data !== null);

  const toggleSection = (key: string) => {
    setExpandedSection(expandedSection === key ? null : key);
  };

  return (
    <div>
      {/* Header bar */}
      <div className="d-flex justify-content-between align-items-center mb-2">
        <div className="d-flex align-items-center gap-2">
          <span className={`badge ${isExternal ? 'bg-success' : 'bg-secondary'}`} style={{ fontSize: 10 }}>
            {isExternal ? 'AI Generated' : 'Mock Data'}
          </span>
          <span className="text-muted" style={{ fontSize: 11 }}>{sections.length} sections</span>
        </div>
        <div className="btn-group btn-group-sm">
          <button className={`btn ${viewMode === 'preview' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setViewMode('preview')} style={{ fontSize: 11 }}>
            <i className="bi bi-eye me-1"></i>Preview
          </button>
          <button className={`btn ${viewMode === 'json' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setViewMode('json')} style={{ fontSize: 11 }}>
            <i className="bi bi-code me-1"></i>JSON
          </button>
        </div>
      </div>

      {viewMode === 'json' ? (
        <pre className="bg-dark text-light rounded p-3" style={{ fontSize: 11, maxHeight: 400, overflowY: 'auto' }}>
          {JSON.stringify(content, null, 2)}
        </pre>
      ) : (
        <div className="d-flex flex-column gap-2">
          {sections.map(section => (
            <div key={section.key} className="border rounded">
              <div
                className="d-flex align-items-center gap-2 px-2 py-1"
                style={{ cursor: 'pointer', backgroundColor: expandedSection === section.key ? 'var(--color-bg-alt, #f7fafc)' : 'transparent' }}
                onClick={() => toggleSection(section.key)}
              >
                <i className={`bi ${section.icon}`} style={{ fontSize: 14 }}></i>
                <span className={`badge ${section.badge}`} style={{ fontSize: 9 }}>{section.label}</span>
                <span style={{ fontSize: 11, marginLeft: 'auto' }}>
                  {expandedSection === section.key ? '\u25B2' : '\u25BC'}
                </span>
              </div>
              {expandedSection === section.key && (
                <div className="px-2 pb-2" style={{ borderTop: '1px solid var(--color-border, #e2e8f0)' }}>
                  <div className="mt-2" style={{ transform: 'scale(0.9)', transformOrigin: 'top left', maxWidth: '111%' }}>
                    {renderSection(section.key, content, lessonId)}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function renderSection(key: string, content: MockV2Content, lessonId: string): React.ReactNode {
  switch (key) {
    case 'concept_snapshot':
      return content.concept_snapshot ? <ConceptSnapshot data={content.concept_snapshot} /> : null;
    case 'ai_strategy':
      return content.ai_strategy ? <AIStrategy data={content.ai_strategy} /> : null;
    case 'prompt_template':
      return content.prompt_template ? <PromptTemplate data={content.prompt_template} /> : null;
    case 'implementation_task':
      return content.implementation_task ? (
        <ImplementationTask
          data={content.implementation_task}
          lessonId={lessonId}
          onSubmit={() => {}}
        />
      ) : null;
    case 'knowledge_checks':
      return content.knowledge_checks ? (
        <KnowledgeChecks
          data={content.knowledge_checks}
          lessonId={lessonId}
        />
      ) : null;
    case 'reflection_questions':
      return content.reflection_questions ? (
        <ReflectionQuestions
          data={content.reflection_questions}
          lessonId={lessonId}
        />
      ) : null;
    default:
      return null;
  }
}
