import React, { useState, useEffect } from 'react';
import { useMentorContext } from '../../../contexts/MentorContext';
import ConfusionRecoveryDrawer from './ConfusionRecoveryDrawer';

interface Check {
  question: string;
  options: string[];
  correct_answer?: string;
  ai_followup_prompt?: string;
  correct_index?: number;
  explanation: string;
}

interface SavedAnswer {
  answer: string;
  correct: boolean;
}

interface KnowledgeChecksProps {
  data: Check[];
  lessonId: string;
  onComplete?: (score: number) => void;
  initialAnswers?: Record<number, SavedAnswer>;
  onSaveProgress?: (questionIndex: number, answer: string, correct: boolean) => void;
}

const REACTIONS = [
  { id: 'helpful', emoji: '\uD83D\uDC4D', label: 'Helpful' },
  { id: 'interesting', emoji: '\uD83D\uDCA1', label: 'Interesting' },
  { id: 'mindblown', emoji: '\uD83E\uDD2F', label: 'Mind Blown' },
  { id: 'confused', emoji: '\uD83D\uDE15', label: 'Confused' },
];

function getCorrectAnswer(q: Check): string {
  if (q.correct_answer) return q.correct_answer;
  if (q.correct_index !== undefined && q.options[q.correct_index]) {
    return q.options[q.correct_index].charAt(0);
  }
  return 'A';
}

export default function KnowledgeChecks({ data, lessonId, onComplete, initialAnswers, onSaveProgress }: KnowledgeChecksProps) {
  const { sendToMentor } = useMentorContext();
  const [reactions, setReactions] = useState<Record<number, string>>({});
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Compute initial state from saved answers
  const savedCount = initialAnswers ? Object.keys(initialAnswers).length : 0;
  const savedScore = initialAnswers
    ? Object.values(initialAnswers).filter(a => a.correct).length
    : 0;
  const allSaved = savedCount >= (data?.length || 0) && savedCount > 0;

  const [currentIndex, setCurrentIndex] = useState(allSaved ? (data?.length || 1) - 1 : savedCount);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [score, setScore] = useState(savedScore);
  const [quizComplete, setQuizComplete] = useState(allSaved);
  const [answeredQuestions, setAnsweredQuestions] = useState<Record<number, SavedAnswer>>(initialAnswers || {});

  // If all questions were already answered, fire onComplete
  useEffect(() => {
    if (allSaved && onComplete) {
      const pct = Math.round((savedScore / data.length) * 100);
      onComplete(pct);
    }
  }, []);

  if (!data || data.length === 0) return null;

  const total = data.length;
  const q = data[currentIndex];
  const correctAnswer = getCorrectAnswer(q);

  // Check if current question was already answered (from saved state)
  const savedCurrent = answeredQuestions[currentIndex];
  const isCurrentAnswered = answered || !!savedCurrent;
  const currentAnswer = selectedAnswer || savedCurrent?.answer || null;

  const handleSelect = (letter: string) => {
    if (isCurrentAnswered) return;
    const isRight = letter === correctAnswer;
    setSelectedAnswer(letter);
    setAnswered(true);
    if (isRight) {
      setScore(prev => prev + 1);
    }
    // Save progress
    const savedAnswer: SavedAnswer = { answer: letter, correct: isRight };
    setAnsweredQuestions(prev => ({ ...prev, [currentIndex]: savedAnswer }));
    onSaveProgress?.(currentIndex, letter, isRight);
  };

  const handleNext = () => {
    if (currentIndex < total - 1) {
      setCurrentIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setAnswered(false);
    } else {
      const finalScore = Math.round((score / total) * 100);
      setQuizComplete(true);
      onComplete?.(finalScore);
    }
  };

  const handleReaction = (reactionId: string) => {
    setReactions(prev => ({ ...prev, [currentIndex]: reactionId }));
    if (reactionId === 'confused') {
      setDrawerOpen(true);
    }
  };

  const handleAIFollowup = () => {
    if (q.ai_followup_prompt) {
      sendToMentor(q.ai_followup_prompt, 'knowledge_explanation');
    }
  };

  // Final Score Screen
  if (quizComplete) {
    const pct = Math.round((score / total) * 100);
    const passed = pct >= 70;
    return (
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white border-bottom d-flex align-items-center gap-2" style={{ padding: '14px 20px' }}>
          <div className="d-flex align-items-center justify-content-center rounded" style={{ width: 28, height: 28, background: '#fef3c7' }}>
            <i className="bi bi-patch-question" style={{ color: '#f59e0b', fontSize: 14 }}></i>
          </div>
          <span className="fw-semibold" style={{ color: '#1e293b', fontSize: 14 }}>{'\u2705'} Knowledge Check Complete</span>
        </div>
        <div className="card-body text-center py-5" style={{ padding: 20 }}>
          <div
            className="d-inline-flex align-items-center justify-content-center rounded-circle mb-3"
            style={{
              width: 80,
              height: 80,
              background: passed ? '#ecfdf5' : '#fffbeb',
              border: `3px solid ${passed ? '#10b981' : '#f59e0b'}`,
            }}
          >
            <span className="fw-bold" style={{ fontSize: 28, color: passed ? '#10b981' : '#f59e0b' }}>
              {pct}%
            </span>
          </div>
          <h5 className="fw-bold mb-1" style={{ color: '#1e293b' }}>
            {passed ? 'Great work!' : 'Keep learning!'}
          </h5>
          <p className="small mb-3" style={{ color: '#64748b' }}>
            You got {score} out of {total} questions correct.
          </p>
          {!passed && (
            <div className="p-3 rounded mb-3 d-inline-block" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
              <span style={{ fontSize: 13, color: '#92400e' }}>
                <i className="bi bi-info-circle me-1"></i>
                70% is needed to pass. Review the material and try again.
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Sequential Quiz UI
  const displayAnswer = currentAnswer;
  const showAnswered = isCurrentAnswered;
  const isCorrect = displayAnswer === correctAnswer;

  return (
    <>
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white border-bottom d-flex align-items-center gap-2" style={{ padding: '14px 20px' }}>
          <div className="d-flex align-items-center justify-content-center rounded" style={{ width: 28, height: 28, background: '#fef3c7' }}>
            <i className="bi bi-patch-question" style={{ color: '#f59e0b', fontSize: 14 }}></i>
          </div>
          <span className="fw-semibold" style={{ color: '#1e293b', fontSize: 14 }}>{'\uD83E\uDDE0'} Knowledge Check</span>
          <span className="ms-auto small" style={{ color: '#64748b' }}>
            {currentIndex + 1} / {total}
          </span>
        </div>

        {/* Progress Bar */}
        <div style={{ height: 4, background: '#e2e8f0' }}>
          <div
            style={{
              height: '100%',
              width: `${((currentIndex + (showAnswered ? 1 : 0)) / total) * 100}%`,
              background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
              transition: 'width 0.3s ease',
            }}
          />
        </div>

        <div className="card-body" style={{ padding: 20 }}>
          {/* Question */}
          <p className="fw-semibold mb-3" style={{ fontSize: 14, color: '#1e293b' }}>
            <span
              className="d-inline-flex align-items-center justify-content-center rounded-circle me-2"
              style={{ width: 24, height: 24, background: '#eef2ff', color: '#6366f1', fontSize: 12, fontWeight: 700 }}
            >
              {currentIndex + 1}
            </span>
            {q.question}
          </p>

          {/* Options */}
          <div className="d-flex flex-column gap-2 ps-4">
            {q.options.map((opt, oi) => {
              const letter = opt.charAt(0);
              const isSelected = displayAnswer === letter;
              const isCorrectOpt = showAnswered && letter === correctAnswer;
              const isWrong = showAnswered && isSelected && letter !== correctAnswer;

              let borderColor = '#e2e8f0';
              let bg = '#fff';
              if (isSelected && !showAnswered) { borderColor = '#6366f1'; bg = '#eef2ff'; }
              if (isCorrectOpt) { borderColor = '#10b981'; bg = '#ecfdf5'; }
              if (isWrong) { borderColor = '#ef4444'; bg = '#fef2f2'; }

              return (
                <label
                  key={oi}
                  className="d-flex align-items-center gap-3 p-3 rounded"
                  style={{
                    border: `1.5px solid ${borderColor}`,
                    background: bg,
                    cursor: showAnswered ? 'default' : 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onClick={() => handleSelect(letter)}
                >
                  <input
                    type="radio"
                    name={`kc_seq_${currentIndex}`}
                    checked={isSelected}
                    readOnly
                    disabled={showAnswered}
                    style={{ accentColor: '#6366f1' }}
                  />
                  <span style={{ fontSize: 13, color: '#334155' }}>{opt}</span>
                  {isCorrectOpt && <i className="bi bi-check-circle-fill ms-auto" style={{ color: '#10b981' }}></i>}
                  {isWrong && <i className="bi bi-x-circle-fill ms-auto" style={{ color: '#ef4444' }}></i>}
                </label>
              );
            })}
          </div>

          {/* Feedback after answering */}
          {showAnswered && (
            <>
              {/* Explanation */}
              <div
                className="d-flex align-items-start gap-2 mt-3 p-3 rounded ms-4"
                style={{ background: isCorrect ? '#ecfdf5' : '#fef2f2', border: `1px solid ${isCorrect ? '#a7f3d0' : '#fecaca'}` }}
              >
                <i className={`bi ${isCorrect ? 'bi-check-circle' : 'bi-info-circle'}`} style={{ color: isCorrect ? '#10b981' : '#ef4444', fontSize: 14, marginTop: 1 }}></i>
                <span className="small" style={{ color: isCorrect ? '#047857' : '#991b1b' }}>{q.explanation}</span>
              </div>

              {/* AI Followup button */}
              {q.ai_followup_prompt && (
                <div className="ps-4 mt-2">
                  <button
                    className="btn btn-sm d-flex align-items-center gap-1"
                    style={{
                      background: '#eef2ff',
                      color: '#6366f1',
                      border: '1px solid #c7d2fe',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                    onClick={handleAIFollowup}
                  >
                    <i className="bi bi-robot"></i>
                    Explore Further with AI Mentor
                  </button>
                </div>
              )}

              {/* Reaction Buttons */}
              {!reactions[currentIndex] && (
                <div className="ps-4 mt-2 d-flex align-items-center gap-1">
                  <span style={{ fontSize: 11, color: '#94a3b8', marginRight: 4 }}>How was this?</span>
                  {REACTIONS.map(r => (
                    <button
                      key={r.id}
                      className="btn btn-sm"
                      style={{
                        fontSize: 16,
                        padding: '2px 8px',
                        borderRadius: 8,
                        border: '1px solid #e2e8f0',
                        background: '#fff',
                        lineHeight: 1,
                      }}
                      onClick={() => handleReaction(r.id)}
                      title={r.label}
                    >
                      {r.emoji}
                    </button>
                  ))}
                </div>
              )}

              {/* Reaction confirmation (non-confused) */}
              {reactions[currentIndex] && reactions[currentIndex] !== 'confused' && (
                <div className="ps-4 mt-1">
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>
                    {REACTIONS.find(r => r.id === reactions[currentIndex])?.emoji} Thanks for the feedback!
                  </span>
                </div>
              )}

              {/* Confused reaction confirmation */}
              {reactions[currentIndex] === 'confused' && (
                <div className="ps-4 mt-1">
                  <span style={{ fontSize: 11, color: '#f59e0b' }}>
                    {'\u2753'} Opening explanation panel...
                  </span>
                </div>
              )}

              {/* Next / Finish button */}
              <div className="d-flex justify-content-end mt-3">
                <button
                  className="btn px-4 py-2"
                  style={{
                    background: '#6366f1',
                    color: '#fff',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    border: 'none',
                  }}
                  onClick={handleNext}
                >
                  {currentIndex < total - 1 ? (
                    <>Next <i className="bi bi-arrow-right ms-1"></i></>
                  ) : (
                    <>Finish <i className="bi bi-check-lg ms-1"></i></>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Confusion Recovery Drawer */}
      <ConfusionRecoveryDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        question={q.question}
        userAnswer={currentAnswer || ''}
        correctAnswer={correctAnswer}
        options={q.options}
        lessonId={lessonId}
      />
    </>
  );
}
