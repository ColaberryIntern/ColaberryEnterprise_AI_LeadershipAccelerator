import React, { useState, useEffect } from 'react';
import { useMentorContext } from '../../../contexts/MentorContext';

interface ReflectionQuestion {
  question: string;
  prompt_for_deeper_thinking?: string;
  context?: string;
}

interface ReflectionQuestionsProps {
  data: ReflectionQuestion[];
  lessonId: string;
  onReflectionDone?: () => void;
}

export default function ReflectionQuestions({ data, lessonId, onReflectionDone }: ReflectionQuestionsProps) {
  const { sendToMentor, lessonContext } = useMentorContext();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (data && data.length > 0 && expanded.size >= data.length) {
      onReflectionDone?.();
    }
  }, [expanded.size, data, onReflectionDone]);

  if (!data || data.length === 0) return null;

  const toggle = (idx: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const askMentor = (idx: number, question: string, deeperPrompt: string) => {
    const prompt = `The learner is reflecting on this question:
"${question}"

${deeperPrompt ? `Deeper thinking prompt: ${deeperPrompt}` : ''}
${lessonContext.lessonTitle ? `Lesson: ${lessonContext.lessonTitle}` : ''}

Provide a thoughtful guided response (2-3 paragraphs):
1. Explore different perspectives on this question
2. Connect it to practical executive decision-making
3. Suggest frameworks for thinking about it
Do NOT give a direct answer \u2014 guide thinking with the Socratic method.`;

    sendToMentor(prompt, 'reflection_guide');
  };

  return (
    <div className="card border-0 shadow-sm mb-4" style={{ border: '2px solid #fbbf24' }}>
      <div className="card-header bg-white border-bottom d-flex align-items-center gap-2" style={{ padding: '14px 20px' }}>
        <div className="d-flex align-items-center justify-content-center rounded" style={{ width: 28, height: 28, background: '#fef3c7' }}>
          <i className="bi bi-chat-square-quote" style={{ color: '#f59e0b', fontSize: 14 }}></i>
        </div>
        <span className="fw-semibold" style={{ color: '#1e293b', fontSize: 14 }}>💭 Reflection</span>
      </div>
      <div className="card-body p-0">
        {data.map((r, i) => {
          const isExpanded = expanded.has(i);
          const deeperPrompt = r.prompt_for_deeper_thinking || r.context || '';
          return (
            <div key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <button
                className="btn w-100 text-start d-flex align-items-center justify-content-between py-3 px-4"
                onClick={() => toggle(i)}
                style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}
              >
                <div className="d-flex align-items-center gap-2">
                  <span
                    className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
                    style={{ width: 22, height: 22, background: '#fef3c7', color: '#f59e0b', fontSize: 11, fontWeight: 700 }}
                  >
                    {i + 1}
                  </span>
                  <span>{r.question}</span>
                </div>
                <i className={`bi ${isExpanded ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ color: '#94a3b8' }}></i>
              </button>
              {isExpanded && (
                <div className="px-4 pb-3">
                  {deeperPrompt && (
                    <div className="p-2 rounded mb-2" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                      <div className="d-flex align-items-center justify-content-between mb-1">
                        <div className="d-flex align-items-center gap-1">
                          <i className="bi bi-lightbulb" style={{ color: '#f59e0b', fontSize: 12 }}></i>
                          <span className="fw-semibold" style={{ color: '#92400e', fontSize: 11 }}>Go deeper:</span>
                        </div>
                        <button
                          className="btn btn-sm d-flex align-items-center gap-1"
                          style={{
                            background: '#eef2ff',
                            color: '#6366f1',
                            border: '1px solid #c7d2fe',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '2px 8px',
                          }}
                          onClick={() => askMentor(i, r.question, deeperPrompt)}
                        >
                          <i className="bi bi-robot"></i>
                          Ask AI Mentor
                        </button>
                      </div>
                      <span style={{ fontSize: 12, color: '#78350f' }}>{deeperPrompt}</span>
                    </div>
                  )}

                  {!deeperPrompt && (
                    <button
                      className="btn btn-sm d-flex align-items-center gap-1 mb-2"
                      style={{
                        background: '#eef2ff',
                        color: '#6366f1',
                        border: '1px solid #c7d2fe',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '2px 8px',
                      }}
                      onClick={() => askMentor(i, r.question, '')}
                    >
                      <i className="bi bi-robot"></i>
                      Ask AI Mentor
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
