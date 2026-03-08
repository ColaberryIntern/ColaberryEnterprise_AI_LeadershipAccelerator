import React from 'react';

interface ConceptSnapshotProps {
  data: {
    title: string;
    definition: string;
    why_it_matters: string;
    visual_metaphor: string;
  };
}

export default function ConceptSnapshot({ data }: ConceptSnapshotProps) {
  return (
    <div className="card border-0 shadow-sm mb-4">
      <div className="card-header bg-white border-bottom d-flex align-items-center gap-2" style={{ padding: '14px 20px' }}>
        <div className="d-flex align-items-center justify-content-center rounded" style={{ width: 28, height: 28, background: '#eff6ff' }}>
          <i className="bi bi-lightbulb" style={{ color: '#3b82f6', fontSize: 14 }}></i>
        </div>
        <span className="fw-semibold" style={{ color: '#1e293b', fontSize: 14 }}>Executive Reality Check</span>
      </div>
      <div className="card-body" style={{ padding: 20 }}>
        <h5 className="fw-bold mb-3" style={{ color: '#1e293b' }}>{data.title}</h5>
        <div className="mb-3" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8, color: '#334155', fontSize: 14 }}>
          {data.definition}
        </div>
        {data.why_it_matters && (
          <div className="d-flex align-items-start gap-2 p-3 rounded mb-3" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
            <i className="bi bi-star-fill flex-shrink-0" style={{ color: '#3b82f6', fontSize: 14, marginTop: 2 }}></i>
            <div>
              <div className="fw-semibold small mb-1" style={{ color: '#1e40af' }}>Why It Matters</div>
              <span style={{ fontSize: 13, color: '#1e3a5f' }}>{data.why_it_matters}</span>
            </div>
          </div>
        )}
        {data.visual_metaphor && (
          <div className="d-flex align-items-start gap-2 p-3 rounded" style={{ background: '#fefce8', border: '1px solid #fde68a' }}>
            <i className="bi bi-palette flex-shrink-0" style={{ color: '#ca8a04', fontSize: 14, marginTop: 2 }}></i>
            <div>
              <div className="fw-semibold small mb-1" style={{ color: '#854d0e' }}>Think of it like...</div>
              <span style={{ fontSize: 13, color: '#713f12' }}>{data.visual_metaphor}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
