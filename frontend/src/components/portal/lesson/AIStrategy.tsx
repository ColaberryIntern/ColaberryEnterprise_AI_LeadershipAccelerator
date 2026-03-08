import React, { useState } from 'react';
import { useMentorContext } from '../../../contexts/MentorContext';

interface AIStrategyProps {
  data: {
    // New v2 shape
    description?: string;
    when_to_use_ai?: string[];
    human_responsibilities?: string[];
    suggested_prompt?: string;
    // Legacy shape (backwards compat)
    approach?: string;
    tools?: string[];
    expected_outcome?: string;
    risk_considerations?: string;
  };
}

export default function AIStrategy({ data }: AIStrategyProps) {
  const { selectedLLM, openLLMWithPrompt, learnerProfile, buildPersonalizedPrompt } = useMentorContext();
  const [copied, setCopied] = useState(false);

  const isNewShape = !!data.when_to_use_ai;
  const description = data.description || data.approach || '';
  const delegateItems = data.when_to_use_ai || [];
  const humanItems = data.human_responsibilities || [];
  const rawPrompt = data.suggested_prompt || '';

  // Build a personalized prompt with learner's actual details
  const suggestedPrompt = React.useMemo(() => {
    if (!rawPrompt || !learnerProfile) return rawPrompt;
    const parts: string[] = [];
    if (learnerProfile.role && learnerProfile.company_name) {
      parts.push(`As the ${learnerProfile.role} at ${learnerProfile.company_name}`);
    }
    if (learnerProfile.industry) {
      parts.push(`in the ${learnerProfile.industry} industry`);
    }
    if (parts.length > 0) {
      return `${parts.join(' ')}, ${rawPrompt.charAt(0).toLowerCase()}${rawPrompt.slice(1)}`;
    }
    return rawPrompt;
  }, [rawPrompt, learnerProfile]);

  const handleCopy = () => {
    navigator.clipboard.writeText(suggestedPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRunInLLM = () => openLLMWithPrompt(suggestedPrompt);

  // Legacy layout for old data shape
  if (!isNewShape) {
    return (
      <div className="card border-0 shadow-sm mb-4" style={{ borderLeft: '4px solid #6366f1' }}>
        <div className="card-header bg-white border-bottom d-flex align-items-center gap-2" style={{ padding: '14px 20px' }}>
          <div className="d-flex align-items-center justify-content-center rounded" style={{ width: 28, height: 28, background: '#eef2ff' }}>
            <i className="bi bi-robot" style={{ color: '#6366f1', fontSize: 14 }}></i>
          </div>
          <span className="fw-semibold" style={{ color: '#1e293b', fontSize: 14 }}>🤖 AI Strategy</span>
        </div>
        <div className="card-body" style={{ padding: 20 }}>
          <div className="mb-3" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, color: '#334155', fontSize: 14 }}>
            {data.approach}
          </div>
          {data.tools && data.tools.length > 0 && (
            <div className="mb-3">
              <div className="fw-semibold small mb-2" style={{ color: '#475569' }}>Recommended Tools</div>
              <div className="d-flex flex-wrap gap-2">
                {data.tools.map((tool, i) => (
                  <span key={i} className="badge" style={{ background: '#f1f5f9', color: '#475569', fontSize: 12, fontWeight: 500, padding: '6px 12px' }}>
                    <i className="bi bi-cpu me-1"></i>{tool}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="row g-3">
            <div className="col-md-6">
              <div className="p-3 rounded" style={{ background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                <div className="d-flex align-items-center gap-2 mb-2">
                  <i className="bi bi-target" style={{ color: '#10b981', fontSize: 14 }}></i>
                  <span className="fw-semibold small" style={{ color: '#065f46' }}>Expected Outcome</span>
                </div>
                <span style={{ fontSize: 13, color: '#047857' }}>{data.expected_outcome}</span>
              </div>
            </div>
            <div className="col-md-6">
              <div className="p-3 rounded" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                <div className="d-flex align-items-center gap-2 mb-2">
                  <i className="bi bi-shield-exclamation" style={{ color: '#ef4444', fontSize: 14 }}></i>
                  <span className="fw-semibold small" style={{ color: '#991b1b' }}>Risk Considerations</span>
                </div>
                <span style={{ fontSize: 13, color: '#b91c1c' }}>{data.risk_considerations}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // New two-column layout
  return (
    <div className="card border-0 shadow-sm mb-4" style={{ border: '2px solid #7dd3fc' }}>
      <div className="card-header bg-white border-bottom d-flex align-items-center gap-2" style={{ padding: '14px 20px' }}>
        <div className="d-flex align-items-center justify-content-center rounded" style={{ width: 28, height: 28, background: '#e0f2fe' }}>
          <i className="bi bi-cpu" style={{ color: '#0284c7', fontSize: 14 }}></i>
        </div>
        <span className="fw-semibold" style={{ color: '#1e293b', fontSize: 14 }}>🤖 AI Strategy</span>
        <span className="badge" style={{ background: '#e0f2fe', color: '#0284c7', fontSize: 10 }}>Personalized</span>
      </div>
      <div className="card-body" style={{ padding: 20 }}>
        {/* Description */}
        {description && (
          <p className="mb-3" style={{ lineHeight: 1.7, color: '#334155', fontSize: 14 }}>
            {description}
          </p>
        )}

        {/* Two-column: Delegate to AI vs Keep Human */}
        <div className="row g-3 mb-3">
          <div className="col-md-6">
            <div className="p-3 rounded h-100" style={{ background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <i className="bi bi-arrow-right-circle" style={{ color: '#10b981', fontSize: 14 }}></i>
                <span className="fw-semibold small" style={{ color: '#065f46' }}>Delegate to AI</span>
              </div>
              {delegateItems.map((item, i) => (
                <div key={i} className="d-flex align-items-start gap-2 mb-1">
                  <i className="bi bi-arrow-right" style={{ color: '#10b981', fontSize: 11, marginTop: 3, flexShrink: 0 }}></i>
                  <span style={{ fontSize: 13, color: '#047857' }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="col-md-6">
            <div className="p-3 rounded h-100" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <i className="bi bi-person-check" style={{ color: '#f59e0b', fontSize: 14 }}></i>
                <span className="fw-semibold small" style={{ color: '#92400e' }}>Keep Human</span>
              </div>
              {humanItems.map((item, i) => (
                <div key={i} className="d-flex align-items-start gap-2 mb-1">
                  <i className="bi bi-check-circle" style={{ color: '#f59e0b', fontSize: 11, marginTop: 3, flexShrink: 0 }}></i>
                  <span style={{ fontSize: 13, color: '#78350f' }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Suggested Prompt */}
        {suggestedPrompt && (
          <div>
            <div className="fw-semibold small mb-2" style={{ color: '#475569' }}>Suggested Prompt</div>
            <div className="p-3 rounded mb-2" style={{ background: '#1e293b', color: '#e2e8f0', fontSize: 13, lineHeight: 1.8, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
              {suggestedPrompt}
            </div>
            <div className="d-flex gap-2">
              <button
                className="btn btn-sm d-flex align-items-center gap-1"
                style={{ background: '#10b981', color: '#fff', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none' }}
                onClick={handleRunInLLM}
              >
                <i className={`bi ${selectedLLM.icon}`}></i>
                Run in {selectedLLM.name}
              </button>
              <button
                className="btn btn-sm d-flex align-items-center gap-1"
                style={{ background: '#f1f5f9', color: '#475569', borderRadius: 6, fontSize: 12, fontWeight: 600, border: '1px solid #e2e8f0' }}
                onClick={handleCopy}
              >
                <i className={`bi ${copied ? 'bi-check-lg' : 'bi-clipboard'}`}></i>
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
