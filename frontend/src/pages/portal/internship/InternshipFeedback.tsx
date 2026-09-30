import React, { useEffect, useState } from 'react';
import { StudentFeedbackItem, fetchInternshipFeedback } from '../../../services/internshipApi';

/**
 * Released mentor feedback on the intern's submissions.
 *
 * ── TWO HONESTY RULES IT ENFORCES IN THE UI ─────────────────────────────────
 *
 * 1. The feedback text is AI-generated. Every item says so. An item a mentor
 *    approved is additionally labelled "mentor reviewed"; an auto-released one is
 *    labelled "AI guidance" and never dressed up as a human review.
 * 2. Nothing unvetted or rejected reaches here — the server's release gate only
 *    ever sends auto_approved / approved items. This component renders what it is
 *    given and never asks for pending or dismissed feedback.
 *
 * Read-only: it displays feedback and mutates nothing. Resubmitting happens in the
 * normal assignment flow, not from a dashboard read.
 */

const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #e5e8ed', borderRadius: 12, padding: 18 };
const label: React.CSSProperties = { fontSize: 10, letterSpacing: '.09em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 700 };

function prettyType(t: string): string {
  return t ? t.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : 'Submission';
}

function FeedbackCard({ f }: { f: StudentFeedbackItem }) {
  const when = f.reviewed_at || f.created_at;
  return (
    <div style={{ ...cardStyle }}>
      <div className="d-flex justify-content-between align-items-start" style={{ gap: 10, flexWrap: 'wrap' }}>
        <div>
          <strong style={{ fontSize: 14.5 }}>{f.submission?.title || 'Your submission'}</strong>
          <div className="ip-muted" style={{ fontSize: 12, marginTop: 2 }}>
            {f.submission ? prettyType(f.submission.assignment_type) : 'Submission'}
            {f.submission && f.submission.version_number > 1 && <> · resubmission (v{f.submission.version_number})</>}
            {when && <> · {new Date(when).toLocaleDateString()}</>}
          </div>
        </div>
        {f.human_reviewed
          ? <span className="badge" style={{ background: '#e7f5ef', color: '#167b61', fontWeight: 600 }}>Mentor reviewed</span>
          : <span className="badge" style={{ background: '#f0f5fb', color: '#2b6cb0', fontWeight: 600 }}>AI guidance</span>}
      </div>

      {/* The AI-generated feedback, whitespace preserved (STRENGTHS / GAPS / NEXT STEPS). */}
      <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.55, marginTop: 10, color: '#2d3340' }}>
        {f.ai_feedback}
      </div>

      {f.human_reviewed && f.reviewer_notes && (
        <div style={{ marginTop: 12, padding: '10px 12px', background: '#f5faf7', borderLeft: '3px solid #167b61', borderRadius: 8 }}>
          <div style={{ ...label, color: '#167b61' }}>Your mentor added</div>
          <div style={{ fontSize: 13.5, marginTop: 3, whiteSpace: 'pre-wrap' }}>{f.reviewer_notes}</div>
        </div>
      )}

      <p className="ip-muted" style={{ fontSize: 11, margin: '10px 0 0' }}>
        {f.human_reviewed
          ? 'AI-generated guidance, reviewed and approved by a mentor.'
          : 'AI-generated guidance. A mentor has not separately reviewed this one.'}
      </p>
    </div>
  );
}

const InternshipFeedback: React.FC = () => {
  const [items, setItems] = useState<StudentFeedbackItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchInternshipFeedback()
      .then((v) => { if (alive) setItems(v.feedback); })
      .catch(() => { if (alive) setError('We could not load your feedback. Please refresh.'); });
    return () => { alive = false; };
  }, []);

  if (error) return <section style={cardStyle}><div className="ip-alert" role="alert">{error}</div></section>;
  if (!items) return <section style={cardStyle}><p className="ip-muted" style={{ margin: 0 }}>Loading your feedback…</p></section>;

  return (
    <section style={{ background: 'transparent', border: 0, padding: 0 }}>
      <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>Feedback on your work</h2>
      {items.length === 0 ? (
        <div style={cardStyle}>
          <p className="ip-muted" style={{ margin: 0, fontSize: 13.5 }}>
            No feedback yet. Once your submissions are reviewed, your mentor feedback shows up here.
          </p>
        </div>
      ) : (
        <div className="d-flex flex-column" style={{ gap: 12 }}>
          {items.map((f) => <FeedbackCard key={f.review_id} f={f} />)}
        </div>
      )}
    </section>
  );
};

export default InternshipFeedback;
