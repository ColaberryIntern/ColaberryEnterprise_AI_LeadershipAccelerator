import React, { useState, useEffect, useCallback } from 'react';
import portalApi from '../../../utils/portalApi';
import { useMentorContext } from '../../../contexts/MentorContext';

interface BaseProps {
  isOpen: boolean;
  onClose: () => void;
  lessonId: string;
}

interface KCModeProps extends BaseProps {
  mode?: 'knowledge_check';
  question: string;
  userAnswer: string;
  correctAnswer: string;
  options: string[];
  lessonTitle?: string;
}

interface LessonModeProps extends BaseProps {
  mode: 'lesson';
  lessonTitle: string;
  question?: never;
  userAnswer?: never;
  correctAnswer?: never;
  options?: never;
}

type ConfusionRecoveryDrawerProps = KCModeProps | LessonModeProps;

interface RecoverySections {
  thinkOfIt: string;
  stepByStep: string[];
  realWorld: string;
  misconceptions: string[];
}

function parseRecovery(raw: string): RecoverySections {
  const sections: RecoverySections = {
    thinkOfIt: '',
    stepByStep: [],
    realWorld: '',
    misconceptions: [],
  };

  // Split by section headers (numbered bold headers)
  const parts = raw.split(/\*\*\d+\.\s*/);

  if (parts[1]) {
    sections.thinkOfIt = parts[1].replace(/^[^*]*\*\*\s*/, '').replace(/\*\*/g, '').trim();
  }
  if (parts[2]) {
    const text = parts[2].replace(/^[^*]*\*\*\s*/, '').replace(/\*\*/g, '').trim();
    const steps = text.split(/\n/).filter(l => l.trim()).map(l => l.replace(/^\d+[\.)\]]\s*/, '').trim());
    sections.stepByStep = steps.length > 0 ? steps : [text];
  }
  if (parts[3]) {
    sections.realWorld = parts[3].replace(/^[^*]*\*\*\s*/, '').replace(/\*\*/g, '').trim();
  }
  if (parts[4]) {
    const text = parts[4].replace(/^[^*]*\*\*\s*/, '').replace(/\*\*/g, '').trim();
    const items = text.split(/\n/).filter(l => l.trim()).map(l => l.replace(/^[-•]\s*/, '').trim());
    sections.misconceptions = items.length > 0 ? items : [text];
  }

  // Fallback: if parsing produced nothing, put everything in thinkOfIt
  if (!sections.thinkOfIt && !sections.stepByStep.length && !sections.realWorld && !sections.misconceptions.length) {
    sections.thinkOfIt = raw;
  }

  return sections;
}

export default function ConfusionRecoveryDrawer(props: ConfusionRecoveryDrawerProps) {
  const { isOpen, onClose, lessonId } = props;
  const isLessonMode = props.mode === 'lesson';
  const { sendToMentor } = useMentorContext();
  const [loading, setLoading] = useState(false);
  const [sections, setSections] = useState<RecoverySections | null>(null);
  const [helpfulFeedback, setHelpfulFeedback] = useState<boolean | null>(null);
  const [hasError, setHasError] = useState(false);

  const fetchRecovery = useCallback(() => {
    setLoading(true);
    setHasError(false);
    setSections(null);

    let prompt: string;
    if (isLessonMode) {
      prompt = `The learner is confused about the lesson "${props.lessonTitle}".

Provide a confusion recovery response with these 4 sections:

1. **Simpler Explanation** — Explain the key concepts of this lesson in a completely different, simpler way. Use an analogy that would resonate with a business executive.

2. **Key Takeaways** — Break down the 3-4 most important points from this lesson in simple, numbered steps.

3. **Real-World Example** — Give a concrete business scenario that illustrates how these concepts apply in practice.

4. **Common Sticking Points** — Explain the parts of this topic that executives typically find confusing and why.`;
    } else {
      const kcProps = props as KCModeProps;
      const isCorrect = kcProps.userAnswer === kcProps.correctAnswer;
      prompt = `The learner is confused about this knowledge check question: "${kcProps.question}"
They answered: "${kcProps.options.find(o => o.startsWith(kcProps.userAnswer)) || kcProps.userAnswer}" (${isCorrect ? 'CORRECT' : 'INCORRECT'})
Correct answer: "${kcProps.options.find(o => o.startsWith(kcProps.correctAnswer)) || kcProps.correctAnswer}"

Provide a confusion recovery response with these 4 sections:

1. **Alternative Explanation** — Explain the concept in a completely different way, using simple language and an analogy.

2. **Step-by-Step Breakdown** — Break the reasoning into 3-4 simple numbered steps that lead to the correct answer.

3. **Real-World Example** — Give a concrete business scenario that illustrates this concept in action.

4. **Common Misconceptions** — Explain why people commonly get this wrong and what thinking trap leads to the incorrect answer.`;
    }

    portalApi.post('/api/portal/mentor/chat', {
      message: prompt,
      lesson_id: lessonId,
      context_type: 'knowledge_explanation',
    }).then(res => {
      setSections(parseRecovery(res.data.reply));
    }).catch(() => {
      setHasError(true);
      setSections({
        thinkOfIt: 'Unable to load explanation. Click "Try Again" below or ask the AI Mentor directly.',
        stepByStep: [],
        realWorld: '',
        misconceptions: [],
      });
    }).finally(() => {
      setLoading(false);
    });
  }, [isLessonMode, lessonId, props]);

  useEffect(() => {
    if (!isOpen) return;
    setHelpfulFeedback(null);
    fetchRecovery();
  }, [isOpen]); // Only trigger on open/close

  if (!isOpen) return null;

  const contextLabel = isLessonMode
    ? (props as LessonModeProps).lessonTitle
    : (props as KCModeProps).question;

  const handleAskMentor = () => {
    if (isLessonMode) {
      sendToMentor(
        `I'm confused about the lesson "${(props as LessonModeProps).lessonTitle}". Can you explain the key concepts in a simpler way?`,
        'lesson_confusion'
      );
    } else {
      const kcProps = props as KCModeProps;
      sendToMentor(
        `I'm confused about this question: "${kcProps.question}"\nI answered "${kcProps.userAnswer}" but the correct answer is "${kcProps.correctAnswer}". Can you help me understand this better?`,
        'knowledge_explanation'
      );
    }
    onClose();
  };

  const headerLabel = isLessonMode ? "Let's Break This Down" : "Let's Clear This Up";
  const loadingLabel = isLessonMode ? 'Getting a simpler explanation...' : 'Getting alternative explanation...';

  // Section labels differ by mode
  const section1Label = isLessonMode ? 'Simpler Explanation' : 'Think of it this way...';
  const section2Label = isLessonMode ? 'Key Takeaways' : 'Step by Step';
  const section4Label = isLessonMode ? 'Common Sticking Points' : 'Common Misconceptions';

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1040 }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '28rem',
          maxWidth: '90vw',
          zIndex: 1041,
          background: '#fff',
          boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          className="d-flex align-items-center justify-content-between px-4 py-3"
          style={{ background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)', flexShrink: 0 }}
        >
          <div className="d-flex align-items-center gap-2">
            <span style={{ fontSize: 20 }}>💡</span>
            <span className="fw-bold" style={{ color: '#78350f', fontSize: 16 }}>{headerLabel}</span>
          </div>
          <button
            className="btn btn-sm p-0"
            style={{ color: '#78350f', border: 'none', background: 'none', fontSize: 18 }}
            onClick={onClose}
          >
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        {/* Context banner */}
        <div className="px-4 py-3" style={{ background: '#fefce8', borderBottom: '1px solid #fde68a', flexShrink: 0 }}>
          <p className="small mb-0" style={{ color: '#92400e', fontWeight: 600 }}>{contextLabel}</p>
        </div>

        {/* Body */}
        <div className="px-4 py-3 flex-grow-1">
          {loading && (
            <div className="d-flex flex-column align-items-center justify-content-center py-5">
              <span className="spinner-border" role="status" style={{ width: 32, height: 32, color: '#f59e0b' }}>
                <span className="visually-hidden">Loading...</span>
              </span>
              <span className="mt-2 small" style={{ color: '#92400e' }}>{loadingLabel}</span>
            </div>
          )}

          {sections && (
            <div className="d-flex flex-column gap-3">
              {/* Section 1 */}
              {sections.thinkOfIt && (
                <div className="p-3 rounded" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <span style={{ fontSize: 16 }}>💡</span>
                    <span className="fw-bold small" style={{ color: '#92400e' }}>{section1Label}</span>
                  </div>
                  <p className="small mb-0" style={{ color: '#78350f', lineHeight: 1.7 }}>{sections.thinkOfIt}</p>
                </div>
              )}

              {/* Section 2 */}
              {sections.stepByStep.length > 0 && (
                <div>
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <span style={{ fontSize: 16 }}>📝</span>
                    <span className="fw-bold small" style={{ color: '#1e293b' }}>{section2Label}</span>
                  </div>
                  <div className="d-flex flex-column gap-2">
                    {sections.stepByStep.map((step, i) => (
                      <div key={i} className="d-flex align-items-start gap-2">
                        <span
                          className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
                          style={{
                            width: 22,
                            height: 22,
                            background: '#eef2ff',
                            color: '#6366f1',
                            fontSize: 11,
                            fontWeight: 700,
                            marginTop: 1,
                          }}
                        >
                          {i + 1}
                        </span>
                        <span className="small" style={{ color: '#334155', lineHeight: 1.6 }}>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Section 3: Real-World Example */}
              {sections.realWorld && (
                <div className="p-3 rounded" style={{ background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <span style={{ fontSize: 16 }}>🌍</span>
                    <span className="fw-bold small" style={{ color: '#047857' }}>Real-World Example</span>
                  </div>
                  <p className="small mb-0" style={{ color: '#065f46', lineHeight: 1.7 }}>{sections.realWorld}</p>
                </div>
              )}

              {/* Section 4 */}
              {sections.misconceptions.length > 0 && (
                <div>
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <i className="bi bi-info-circle" style={{ color: '#475569', fontSize: 14 }}></i>
                    <span className="fw-bold small" style={{ color: '#475569' }}>{section4Label}</span>
                  </div>
                  <div className="d-flex flex-column gap-1">
                    {sections.misconceptions.map((item, i) => (
                      <div key={i} className="d-flex align-items-start gap-2">
                        <i className="bi bi-dash flex-shrink-0" style={{ color: '#94a3b8', fontSize: 14, marginTop: 1 }}></i>
                        <span className="small" style={{ color: '#334155', lineHeight: 1.6 }}>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-top" style={{ flexShrink: 0 }}>
          {hasError && (
            <button
              className="btn btn-sm btn-outline-warning d-flex align-items-center gap-2 w-100 justify-content-center mb-2"
              onClick={fetchRecovery}
              disabled={loading}
            >
              <i className="bi bi-arrow-clockwise"></i>
              Try Again
            </button>
          )}

          <button
            className="btn d-flex align-items-center gap-2 px-4 py-2 w-100 justify-content-center"
            style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              color: '#fff',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
            }}
            onClick={handleAskMentor}
          >
            <i className="bi bi-robot"></i>
            Ask AI Mentor
          </button>

          {sections && !hasError && helpfulFeedback === null && (
            <div className="d-flex align-items-center justify-content-center gap-3 mt-3">
              <span className="small" style={{ color: '#64748b' }}>Did this help?</span>
              <button
                className="btn btn-sm"
                style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', borderRadius: 6, fontSize: 12, fontWeight: 600 }}
                onClick={() => setHelpfulFeedback(true)}
              >
                👍 Yes
              </button>
              <button
                className="btn btn-sm"
                style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, fontWeight: 600 }}
                onClick={() => setHelpfulFeedback(false)}
              >
                👎 No
              </button>
            </div>
          )}

          {helpfulFeedback !== null && (
            <div className="text-center mt-2">
              <span className="small" style={{ color: '#64748b' }}>
                {helpfulFeedback ? '✅ Glad it helped!' : '💬 Try asking the AI Mentor for a personalized explanation'}
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
