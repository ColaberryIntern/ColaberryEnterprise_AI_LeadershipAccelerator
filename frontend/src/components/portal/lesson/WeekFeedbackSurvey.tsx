import React, { useState } from 'react';

interface SurveyQuestion {
  key: string;
  type: 'likert' | 'open_text';
  question: string;
}

interface WeekFeedbackSurveyProps {
  questions: SurveyQuestion[];
  lessonId: string;
  weekNumber: number;
  isCompleted: boolean;
  initialResponses?: Record<string, number | string>;
  onComplete?: () => void;
}

const LIKERT_LABELS: Record<number, string> = {
  1: 'Not at all',
  2: 'Slightly',
  3: 'Moderately',
  4: 'Very',
  5: 'Extremely',
};

export default function WeekFeedbackSurvey({
  questions,
  lessonId,
  weekNumber,
  isCompleted,
  initialResponses = {},
  onComplete,
}: WeekFeedbackSurveyProps) {
  const [responses, setResponses] = useState<Record<string, number | string>>(initialResponses);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(isCompleted || Object.keys(initialResponses).length >= questions.length);
  const [error, setError] = useState<string | null>(null);

  const allAnswered = questions.every((q) => responses[q.key] !== undefined && responses[q.key] !== '');

  const handleLikert = (key: string, value: number) => {
    if (submitted) return;
    setResponses((prev) => ({ ...prev, [key]: value }));
  };

  const handleText = (key: string, value: string) => {
    if (submitted) return;
    setResponses((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!allAnswered || submitting || submitted) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = localStorage.getItem('participant_token');
      const res = await fetch(`/api/portal/curriculum/lessons/${lessonId}/survey`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(responses),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error ${res.status}`);
      }
      setSubmitted(true);
      onComplete?.();
    } catch (err: any) {
      setError(err.message || 'Failed to submit survey. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="card border-0 shadow-sm mb-4">
        <div
          className="card-header bg-white border-bottom d-flex align-items-center gap-2"
          style={{ padding: '14px 20px' }}
        >
          <div
            className="d-flex align-items-center justify-content-center rounded"
            style={{ width: 28, height: 28, background: '#ecfdf5' }}
          >
            <i className="bi bi-check2-circle" style={{ color: '#10b981', fontSize: 14 }}></i>
          </div>
          <span className="fw-semibold" style={{ color: '#1e293b', fontSize: 14 }}>
            Week {weekNumber} Feedback
          </span>
        </div>
        <div className="card-body text-center py-5">
          <div
            className="d-inline-flex align-items-center justify-content-center rounded-circle mb-3"
            style={{ width: 64, height: 64, background: '#ecfdf5', border: '2px solid #10b981' }}
          >
            <i className="bi bi-check-lg" style={{ color: '#10b981', fontSize: 28 }}></i>
          </div>
          <h5 className="fw-bold mb-1" style={{ color: '#1e293b' }}>
            Thank you for your feedback!
          </h5>
          <p className="small" style={{ color: '#64748b' }}>
            Your responses help us improve the program week over week.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card border-0 shadow-sm mb-4">
      <div
        className="card-header bg-white border-bottom d-flex align-items-center gap-2"
        style={{ padding: '14px 20px' }}
      >
        <div
          className="d-flex align-items-center justify-content-center rounded"
          style={{ width: 28, height: 28, background: '#eff6ff' }}
        >
          <i className="bi bi-chat-square-text" style={{ color: '#3b82f6', fontSize: 14 }}></i>
        </div>
        <span className="fw-semibold" style={{ color: '#1e293b', fontSize: 14 }}>
          Week {weekNumber} Feedback Survey
        </span>
        <span className="ms-auto small" style={{ color: '#64748b' }}>
          {Object.keys(responses).length} / {questions.length} answered
        </span>
      </div>

      <div className="card-body" style={{ padding: 20 }}>
        <div className="d-flex flex-column gap-4">
          {questions.map((q, idx) => (
            <div key={q.key}>
              <p className="fw-semibold mb-2" style={{ fontSize: 14, color: '#1e293b' }}>
                <span
                  className="d-inline-flex align-items-center justify-content-center rounded-circle me-2"
                  style={{
                    width: 22,
                    height: 22,
                    background: 'rgba(59,130,246,0.10)',
                    color: '#3b82f6',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {idx + 1}
                </span>
                {q.question}
              </p>

              {q.type === 'likert' ? (
                <div className="d-flex gap-2 ps-4 flex-wrap">
                  {[1, 2, 3, 4, 5].map((val) => {
                    const selected = responses[q.key] === val;
                    return (
                      <button
                        key={val}
                        className="btn d-flex flex-column align-items-center"
                        style={{
                          minWidth: 64,
                          padding: '8px 10px',
                          borderRadius: 10,
                          border: `2px solid ${selected ? '#3b82f6' : '#e2e8f0'}`,
                          background: selected ? '#eff6ff' : '#fff',
                          color: selected ? '#1d4ed8' : '#64748b',
                          fontWeight: selected ? 700 : 400,
                          fontSize: 12,
                          transition: 'all 0.15s',
                        }}
                        onClick={() => handleLikert(q.key, val)}
                      >
                        <span style={{ fontSize: 18, lineHeight: 1.2 }}>{val}</span>
                        <span style={{ fontSize: 10, marginTop: 2 }}>{LIKERT_LABELS[val]}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <textarea
                  className="form-control ps-4"
                  style={{
                    fontSize: 13,
                    color: '#334155',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: 8,
                    resize: 'vertical',
                    minHeight: 72,
                  }}
                  placeholder="Your response..."
                  value={(responses[q.key] as string) || ''}
                  onChange={(e) => handleText(q.key, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>

        {error && (
          <div className="mt-3 p-3 rounded" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
            <span className="small" style={{ color: '#991b1b' }}>
              <i className="bi bi-exclamation-circle me-1"></i>
              {error}
            </span>
          </div>
        )}

        <div className="d-flex justify-content-end mt-4">
          <button
            className="btn px-4 py-2"
            style={{
              background: allAnswered ? '#3b82f6' : '#e2e8f0',
              color: allAnswered ? '#fff' : '#94a3b8',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              cursor: allAnswered ? 'pointer' : 'not-allowed',
            }}
            onClick={handleSubmit}
            disabled={!allAnswered || submitting}
          >
            {submitting ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                Submitting...
              </>
            ) : (
              <>
                Submit Feedback <i className="bi bi-send ms-1"></i>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
