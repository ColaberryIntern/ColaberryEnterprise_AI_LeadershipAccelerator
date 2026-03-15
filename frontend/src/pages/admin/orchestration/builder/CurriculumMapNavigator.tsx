import React, { useState, useEffect } from 'react';
import { Module, Lesson } from './types';

interface Props {
  modules: Module[];
  selectedLessonId: string;
  onSelectLesson: (id: string) => void;
}

export default function CurriculumMapNavigator({ modules, selectedLessonId, onSelectLesson }: Props) {
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  // Auto-expand module containing selected lesson
  useEffect(() => {
    if (!selectedLessonId) return;
    for (const mod of modules) {
      if ((mod.lessons || []).some(l => l.id === selectedLessonId)) {
        setExpandedModules(prev => {
          const next = new Set(prev);
          next.add(mod.id);
          return next;
        });
        break;
      }
    }
  }, [selectedLessonId, modules]);

  const toggleModule = (moduleId: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  };

  return (
    <div className="card border-0 shadow-sm mb-2">
      <div className="card-header bg-white py-2">
        <span className="fw-semibold small">
          <i className="bi bi-map me-1" style={{ color: 'var(--color-primary, #1a365d)' }}></i>
          Curriculum Map
        </span>
      </div>
      <div className="card-body p-0" style={{ maxHeight: 280, overflowY: 'auto' }}>
        {modules.length === 0 ? (
          <div className="text-center text-muted py-3" style={{ fontSize: 11 }}>No modules loaded</div>
        ) : (
          <div role="tree" aria-label="Curriculum structure">
            {modules.map(mod => {
              const isExpanded = expandedModules.has(mod.id);
              const lessons = mod.lessons || [];
              const hasSelected = lessons.some(l => l.id === selectedLessonId);

              return (
                <div key={mod.id} role="treeitem" aria-expanded={isExpanded}>
                  {/* Module header */}
                  <button
                    className="btn btn-link text-decoration-none d-flex align-items-center gap-1 w-100 py-1 px-2"
                    onClick={() => toggleModule(mod.id)}
                    style={{
                      fontSize: 11,
                      color: hasSelected ? 'var(--color-primary, #1a365d)' : 'var(--color-text, #2d3748)',
                      fontWeight: hasSelected ? 600 : 500,
                      borderRadius: 0,
                      borderLeft: hasSelected ? '3px solid var(--color-primary-light, #2b6cb0)' : '3px solid transparent',
                    }}
                  >
                    <i className={`bi bi-chevron-${isExpanded ? 'down' : 'right'}`} style={{ fontSize: 9, width: 12 }}></i>
                    <i className="bi bi-folder2" style={{ fontSize: 11 }}></i>
                    <span className="text-truncate flex-grow-1 text-start">M{mod.module_number}: {mod.title}</span>
                    <span className="badge bg-light text-muted border" style={{ fontSize: 8 }}>{lessons.length}</span>
                  </button>

                  {/* Lessons */}
                  {isExpanded && (
                    <div role="group" className="ms-3">
                      {lessons
                        .sort((a: Lesson, b: Lesson) => (a.lesson_number || 0) - (b.lesson_number || 0))
                        .map((lesson: Lesson) => {
                          const isActive = lesson.id === selectedLessonId;
                          return (
                            <button
                              key={lesson.id}
                              role="treeitem"
                              className="btn btn-link text-decoration-none d-flex align-items-center gap-1 w-100 py-1 px-2"
                              onClick={() => onSelectLesson(lesson.id)}
                              style={{
                                fontSize: 10,
                                color: isActive ? 'var(--color-primary, #1a365d)' : 'var(--color-text-light, #718096)',
                                fontWeight: isActive ? 600 : 400,
                                background: isActive ? 'rgba(43, 108, 176, 0.06)' : 'transparent',
                                borderRadius: 0,
                                borderLeft: isActive ? '3px solid var(--color-primary-light, #2b6cb0)' : '3px solid transparent',
                              }}
                            >
                              <i className="bi bi-file-earmark" style={{ fontSize: 10 }}></i>
                              <span className="text-truncate flex-grow-1 text-start">
                                S{lesson.lesson_number}: {lesson.title}
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
