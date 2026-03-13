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

  if (!sections.thinkOfIt && !sections.stepByStep.length && !sections.realWorld && !sections.misconceptions.length) {
    sections.thinkOfIt = raw;
  }

  return sections;
}

/** Build generic static recovery content (no LLM needed) */
function buildGenericSections(isLessonMode: boolean, props: ConfusionRecoveryDrawerProps): RecoverySections {
  if (isLessonMode) {
    const title = (props as LessonModeProps).lessonTitle;
    return {
      thinkOfIt: `It's completely normal to find "${title}" challenging at first. Complex topics often click after seeing them from a different angle. Take a moment to review the key points below, and remember — understanding builds in layers, not all at once.`,
      stepByStep: [
        'Re-read the concept snapshot section slowly, focusing on the bold key terms.',
        'Look at the AI Strategy section — it shows how this concept applies to real AI adoption.',
        'Review the prompt template to see the concept in action with a concrete example.',
        'Try the implementation task — hands-on practice often makes abstract ideas click.',
      ],
      realWorld: 'Think of learning this like learning to drive. Reading about steering and braking feels abstract, but once you sit behind the wheel and practice, the concepts become intuitive. The same applies here — the implementation task is your "behind the wheel" moment.',
      misconceptions: [
        'Feeling confused doesn\'t mean you\'re falling behind — it means you\'re engaging with challenging material.',
        'You don\'t need to understand everything perfectly before moving forward. Revisiting concepts later often deepens understanding.',
        'The AI Mentor is available to explain any specific part that\'s unclear — don\'t hesitate to ask.',
      ],
    };
  }

  // KC mode
  const kcProps = props as KCModeProps;
  const userOpt = kcProps.options.find(o => o.startsWith(kcProps.userAnswer)) || kcProps.userAnswer;
  const correctOpt = kcProps.options.find(o => o.startsWith(kcProps.correctAnswer)) || kcProps.correctAnswer;
  return {
    thinkOfIt: `The correct answer is "${correctOpt}". Your answer "${userOpt}" is a common choice — many learners initially lean that way. Let's break down why the correct answer fits better.`,
    stepByStep: [
      'Read the question again carefully, paying attention to key qualifying words like "most," "best," or "primary."',
      'Consider what each answer option is really saying — some may be partially true but not the best fit.',
      'Think about which option most directly and completely answers what\'s being asked.',
      'Review the related lesson section to reinforce the underlying concept.',
    ],
    realWorld: 'Knowledge check questions are designed to test precise understanding, not just general awareness. In business, the difference between a "good" answer and the "best" answer often determines strategy success. The same precision applies here.',
    misconceptions: [
      'Getting a question wrong doesn\'t mean you don\'t understand the topic — it often means you understood part of it but missed a nuance.',
      'Multiple options may seem correct, but the question asks for the most accurate or complete answer.',
      'Use the AI Mentor to explore the specific concept behind this question for a deeper explanation.',
    ],
  };
}

export default function ConfusionRecoveryDrawer(props: ConfusionRecoveryDrawerProps) {
  const { isOpen, onClose, lessonId } = props;
  const isLessonMode = props.mode === 'lesson';
  const { sendToMentor } = useMentorContext();
  const [sections, setSections] = useState<RecoverySections | null>(null);
  const [helpfulFeedback, setHelpfulFeedback] = useState<boolean | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [isAiEnhanced, setIsAiEnhanced] = useState(false);

  // Show generic content immediately on open
  useEffect(() => {
    if (!isOpen) return;
    setHelpfulFeedback(null);
    setIsAiEnhanced(false);
    setAiLoading(false);
    setSections(buildGenericSections(isLessonMode, props));
  }, [isOpen]); // eslint-disable-line

  const fetchAiRecovery = useCallback(() => {
    setAiLoading(true);

    let prompt: string;
    if (isLessonMode) {
      prompt = `The learner is confused about the lesson "${(props as LessonModeProps).lessonTitle}".

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
      setIsAiEnhanced(true);
    }).catch(() => {
      // Keep generic content, just stop loading
    }).finally(() => {
      setAiLoading(false);
    });
  }, [isLessonMode, lessonId, props]);

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
          {sections && (
            <div className="d-flex flex-column gap-3">
              {/* AI enhanced badge */}
              {isAiEnhanced && (
                <div className="d-flex align-items-center gap-1">
                  <span className="badge" style={{ background: '#eef2ff', color: '#6366f1', fontSize: 10 }}>
                    <i className="bi bi-stars me-1"></i>AI-Personalized
                  </span>
                </div>
              )}

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
          {/* Enhance with AI button — only show if not already AI-enhanced */}
          {!isAiEnhanced && (
            <button
              className="btn btn-sm d-flex align-items-center gap-2 w-100 justify-content-center mb-2"
              style={{
                background: aiLoading ? '#e2e8f0' : 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)',
                color: '#4f46e5',
                border: '1px solid #c7d2fe',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
              }}
              onClick={fetchAiRecovery}
              disabled={aiLoading}
            >
              {aiLoading ? (
                <>
                  <span className="spinner-border spinner-border-sm" role="status" style={{ width: 14, height: 14 }}>
                    <span className="visually-hidden">Loading...</span>
                  </span>
                  Generating personalized explanation...
                </>
              ) : (
                <>
                  <i className="bi bi-stars"></i>
                  Enhance with AI
                </>
              )}
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

          {sections && helpfulFeedback === null && (
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
