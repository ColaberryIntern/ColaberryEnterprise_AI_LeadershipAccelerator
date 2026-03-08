import React from 'react';

interface ConceptV1Props {
  content: any;
}

export default function ConceptV1({ content }: ConceptV1Props) {
  if (!content.concept_explanation) return null;

  return (
    <>
      {/* Main Explanation */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white border-bottom d-flex align-items-center gap-2" style={{ padding: '14px 20px' }}>
          <div className="d-flex align-items-center justify-content-center rounded" style={{ width: 28, height: 28, background: '#eff6ff' }}>
            <i className="bi bi-book" style={{ color: '#3b82f6', fontSize: 14 }}></i>
          </div>
          <span className="fw-semibold" style={{ color: '#1e293b', fontSize: 14 }}>Concept</span>
        </div>
        <div className="card-body" style={{ padding: 20 }}>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8, color: '#334155', fontSize: 14 }}>
            {content.concept_explanation}
          </div>
        </div>
      </div>

      {/* Business Example */}
      {content.business_example && (
        <div className="card border-0 shadow-sm mb-4" style={{ borderLeft: '4px solid #6366f1' }}>
          <div className="card-header bg-white border-bottom d-flex align-items-center gap-2" style={{ padding: '14px 20px' }}>
            <div className="d-flex align-items-center justify-content-center rounded" style={{ width: 28, height: 28, background: '#eef2ff' }}>
              <i className="bi bi-building" style={{ color: '#6366f1', fontSize: 14 }}></i>
            </div>
            <span className="fw-semibold" style={{ color: '#1e293b', fontSize: 14 }}>Applied Example</span>
            <span className="badge" style={{ background: '#eef2ff', color: '#6366f1', fontSize: 10 }}>Personalized</span>
          </div>
          <div className="card-body" style={{ padding: 20 }}>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, color: '#334155', fontSize: 14 }}>
              {content.business_example}
            </div>
          </div>
        </div>
      )}

      {/* Industry Application */}
      {content.industry_application && (
        <div className="card border-0 shadow-sm mb-4" style={{ background: '#f8fafc' }}>
          <div className="card-header border-bottom d-flex align-items-center gap-2" style={{ padding: '14px 20px', background: '#f8fafc' }}>
            <div className="d-flex align-items-center justify-content-center rounded" style={{ width: 28, height: 28, background: '#ecfdf5' }}>
              <i className="bi bi-briefcase" style={{ color: '#10b981', fontSize: 14 }}></i>
            </div>
            <span className="fw-semibold" style={{ color: '#1e293b', fontSize: 14 }}>Industry Application</span>
          </div>
          <div className="card-body" style={{ padding: 20 }}>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, color: '#334155', fontSize: 14 }}>
              {content.industry_application}
            </div>
          </div>
        </div>
      )}

      {/* Key Takeaways */}
      {content.key_takeaways && content.key_takeaways.length > 0 && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white border-bottom d-flex align-items-center gap-2" style={{ padding: '14px 20px' }}>
            <div className="d-flex align-items-center justify-content-center rounded" style={{ width: 28, height: 28, background: '#fef3c7' }}>
              <i className="bi bi-lightbulb" style={{ color: '#f59e0b', fontSize: 14 }}></i>
            </div>
            <span className="fw-semibold" style={{ color: '#1e293b', fontSize: 14 }}>Key Takeaways</span>
          </div>
          <div className="card-body" style={{ padding: 20 }}>
            {content.key_takeaways.map((t: string, i: number) => (
              <div key={i} className="d-flex align-items-start gap-2 mb-2">
                <i className="bi bi-check-circle-fill flex-shrink-0" style={{ color: '#10b981', fontSize: 14, marginTop: 2 }}></i>
                <span style={{ fontSize: 13, color: '#334155' }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Discussion Questions */}
      {content.discussion_questions && content.discussion_questions.length > 0 && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white border-bottom d-flex align-items-center gap-2" style={{ padding: '14px 20px' }}>
            <div className="d-flex align-items-center justify-content-center rounded" style={{ width: 28, height: 28, background: '#fce7f3' }}>
              <i className="bi bi-chat-dots" style={{ color: '#ec4899', fontSize: 14 }}></i>
            </div>
            <span className="fw-semibold" style={{ color: '#1e293b', fontSize: 14 }}>Discussion Questions</span>
          </div>
          <div className="card-body" style={{ padding: 20 }}>
            {content.discussion_questions.map((q: string, i: number) => (
              <div key={i} className="d-flex align-items-start gap-2 mb-3">
                <span
                  className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
                  style={{ width: 22, height: 22, background: '#fce7f3', color: '#ec4899', fontSize: 11, fontWeight: 700 }}
                >
                  {i + 1}
                </span>
                <span style={{ fontSize: 13, color: '#334155' }}>{q}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
