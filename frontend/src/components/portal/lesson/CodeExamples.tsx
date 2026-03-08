import React, { useState } from 'react';

interface Snippet {
  title: string;
  language: string;
  code: string;
  explanation: string;
}

interface CodeExamplesProps {
  data: {
    snippets: Snippet[];
  };
}

export default function CodeExamples({ data }: CodeExamplesProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  if (!data.snippets || data.snippets.length === 0) return null;

  const handleCopy = (code: string, idx: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div className="card border-0 shadow-sm mb-4">
      <div className="card-header bg-white border-bottom d-flex align-items-center gap-2" style={{ padding: '14px 20px' }}>
        <div className="d-flex align-items-center justify-content-center rounded" style={{ width: 28, height: 28, background: '#ecfdf5' }}>
          <i className="bi bi-code-slash" style={{ color: '#10b981', fontSize: 14 }}></i>
        </div>
        <span className="fw-semibold" style={{ color: '#1e293b', fontSize: 14 }}>Code Examples</span>
      </div>
      <div className="card-body p-0">
        {/* Tabs */}
        {data.snippets.length > 1 && (
          <div className="d-flex border-bottom" style={{ padding: '0 20px' }}>
            {data.snippets.map((s, i) => (
              <button
                key={i}
                className="btn btn-sm px-3 py-2 border-0 rounded-0"
                style={{
                  fontSize: 12,
                  fontWeight: activeTab === i ? 600 : 400,
                  color: activeTab === i ? '#6366f1' : '#64748b',
                  borderBottom: activeTab === i ? '2px solid #6366f1' : '2px solid transparent',
                  background: 'none',
                }}
                onClick={() => setActiveTab(i)}
              >
                {s.title}
              </button>
            ))}
          </div>
        )}

        {/* Active snippet */}
        {data.snippets[activeTab] && (
          <div style={{ padding: 20 }}>
            <div className="position-relative mb-3">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <span className="badge" style={{ background: '#f1f5f9', color: '#475569', fontSize: 10 }}>
                  {data.snippets[activeTab].language}
                </span>
                <button
                  className="btn btn-sm"
                  style={{ fontSize: 11, color: copiedIdx === activeTab ? '#10b981' : '#64748b', border: 'none', background: 'none' }}
                  onClick={() => handleCopy(data.snippets[activeTab].code, activeTab)}
                >
                  <i className={`bi ${copiedIdx === activeTab ? 'bi-check-lg' : 'bi-clipboard'} me-1`}></i>
                  {copiedIdx === activeTab ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <pre
                className="p-3 rounded"
                style={{
                  background: '#1e293b',
                  color: '#e2e8f0',
                  fontSize: 12,
                  lineHeight: 1.7,
                  overflow: 'auto',
                  maxHeight: 400,
                  margin: 0,
                }}
              >
                <code>{data.snippets[activeTab].code}</code>
              </pre>
            </div>
            {data.snippets[activeTab].explanation && (
              <div className="d-flex align-items-start gap-2 p-3 rounded" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <i className="bi bi-info-circle flex-shrink-0" style={{ color: '#6366f1', fontSize: 14, marginTop: 2 }}></i>
                <span style={{ fontSize: 13, color: '#475569', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                  {data.snippets[activeTab].explanation}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
