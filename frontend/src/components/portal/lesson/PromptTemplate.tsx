import React, { useState } from 'react';
import { useMentorContext } from '../../../contexts/MentorContext';
import {
  Placeholder,
  PromptTemplateData,
  derivePlaceholders,
  buildAutoFillMap,
  getEffectiveValue as getEffVal,
  getEffectiveValues as getEffVals,
  buildFilledTemplate as buildFilled,
  findQuestions,
  extractKeywords,
  scoreMatch,
} from './promptTemplateUtils';

interface PromptTemplateProps {
  data: PromptTemplateData;
}

export default function PromptTemplate({ data }: PromptTemplateProps) {
  const { learnerProfile, updateLearnerProfile, selectedLLM } = useMentorContext();
  const [copied, setCopied] = useState(false);
  const [fillValues, setFillValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalValues, setModalValues] = useState<Record<string, string>>({});

  const placeholders = derivePlaceholders(data);
  const autoFillMap = React.useMemo(() => buildAutoFillMap(learnerProfile), [learnerProfile]);
  const unknownPhs = placeholders.filter(ph => !autoFillMap[ph.name] && !autoFillMap[ph.name.toLowerCase()]);

  const getEffectiveValue = (phName: string) => getEffVal(phName, fillValues, autoFillMap);
  const buildFilledTemplate = (values: Record<string, string>) => buildFilled(data.template, placeholders, values);

  const filledTemplate = buildFilledTemplate(getEffVals(placeholders, fillValues, autoFillMap));

  // Check if template has any {{markers}}
  const hasMarkers = placeholders.some(ph => {
    const regex = new RegExp(`\\{\\{${ph.name}\\}\\}|\\{${ph.name}\\}`, 'g');
    return regex.test(data.template);
  });

  // Template display: filled values shown inline, unfilled highlighted
  const getDisplayHtml = () => {
    let result = data.template;

    if (hasMarkers) {
      // Standard marker replacement
      for (const ph of placeholders) {
        const value = getEffectiveValue(ph.name);
        if (value) {
          result = result.replace(
            new RegExp(`\\{\\{${ph.name}\\}\\}|\\{${ph.name}\\}`, 'g'),
            `<span style="color:#4ade80;font-weight:600">${value}</span>`
          );
        } else {
          result = result.replace(
            new RegExp(`\\{\\{${ph.name}\\}\\}|\\{${ph.name}\\}`, 'g'),
            `<mark style="background:#bae6fd;color:#0369a1;padding:2px 6px;border-radius:3px;font-weight:600">{{${ph.name}}}</mark>`
          );
        }
      }
    } else {
      // No markers — show inline answers after matching questions
      const questions = findQuestions(result);
      const usedIndices = new Set<number>();

      for (const ph of placeholders) {
        const value = getEffectiveValue(ph.name);
        const desc = ph.description || ph.name.replace(/_/g, ' ');
        const descKeywords = extractKeywords(desc);

        let bestScore = 0;
        let bestIdx = -1;
        for (let i = 0; i < questions.length; i++) {
          if (usedIndices.has(i)) continue;
          const score = scoreMatch(descKeywords, questions[i].question);
          if (score > bestScore) { bestScore = score; bestIdx = i; }
        }

        if (bestScore >= 1 && bestIdx >= 0) {
          usedIndices.add(bestIdx);
          const q = questions[bestIdx];
          const insertPos = result.indexOf(q.question) + q.question.length;
          const tag = value
            ? `\n<span style="color:#4ade80;font-weight:600">Answer: ${value}</span>`
            : `\n<mark style="background:#bae6fd;color:#0369a1;padding:2px 6px;border-radius:3px;font-weight:600">Answer: [${desc}]</mark>`;
          result = result.slice(0, insertPos) + tag + result.slice(insertPos);
        }
      }
    }

    return result;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(filledTemplate);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Open modal with all placeholders pre-filled
  const openRunModal = () => {
    const values: Record<string, string> = {};
    for (const ph of placeholders) {
      values[ph.name] = getEffectiveValue(ph.name);
    }
    setModalValues(values);
    setShowModal(true);
  };

  // Confirm from modal: save values + open LLM
  const handleModalConfirm = async () => {
    // Save all values to profile
    const newValues: Record<string, string> = {};
    for (const ph of placeholders) {
      const val = modalValues[ph.name]?.trim();
      if (val) newValues[ph.name] = val;
    }
    if (Object.keys(newValues).length > 0) {
      setSaving(true);
      const merged = { ...(learnerProfile?.personalization_context_json || {}), ...newValues };
      await updateLearnerProfile({ personalization_context_json: merged });
      setSaving(false);
    }
    // Update inline fill values with any modal edits
    setFillValues(prev => ({ ...prev, ...modalValues }));
    // Build and open directly (skip buildPersonalizedPrompt to avoid duplicate context)
    const filled = buildFilledTemplate(modalValues);
    const encoded = encodeURIComponent(filled);
    if (selectedLLM.id === 'chatgpt') {
      window.open(`https://chat.openai.com/?q=${encoded}`, '_blank');
    } else if (selectedLLM.id === 'claude') {
      window.open(`https://claude.ai/new?q=${encoded}`, '_blank');
    } else {
      navigator.clipboard.writeText(filled).catch(() => {});
      window.open(selectedLLM.url, '_blank');
    }
    setShowModal(false);
  };

  const allModalFilled = placeholders.every(ph => modalValues[ph.name]?.trim());

  return (
    <>
      <div className="card border-0 shadow-sm mb-4" style={{ borderLeft: '4px solid #8b5cf6' }}>
        <div className="card-header bg-white border-bottom d-flex align-items-center justify-content-between" style={{ padding: '14px 20px' }}>
          <div className="d-flex align-items-center gap-2">
            <div className="d-flex align-items-center justify-content-center rounded" style={{ width: 28, height: 28, background: '#f5f3ff' }}>
              <i className="bi bi-terminal" style={{ color: '#8b5cf6', fontSize: 14 }}></i>
            </div>
            <span className="fw-semibold" style={{ color: '#1e293b', fontSize: 14 }}>Prompt Template</span>
            <span className="badge" style={{ background: '#f5f3ff', color: '#8b5cf6', fontSize: 10 }}>Interactive</span>
          </div>
          <button
            className="btn btn-sm"
            style={{ fontSize: 11, color: copied ? '#10b981' : '#6366f1', border: 'none', background: 'none' }}
            onClick={handleCopy}
          >
            <i className={`bi ${copied ? 'bi-check-lg' : 'bi-clipboard'} me-1`}></i>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <div className="card-body" style={{ padding: 20 }}>
          {/* Template preview */}
          <div
            className="p-3 rounded mb-3"
            style={{ background: '#1e293b', color: '#e2e8f0', fontSize: 13, lineHeight: 1.8, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}
            dangerouslySetInnerHTML={{ __html: getDisplayHtml() }}
          />

          {/* Action buttons */}
          <div className="d-flex gap-2">
            <button
              className="btn d-flex align-items-center gap-2 px-3 py-2"
              style={{
                background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                color: '#fff',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                border: 'none',
              }}
              onClick={openRunModal}
            >
              <i className="bi bi-magic"></i> Generate Prompt
            </button>
            <button
              className="btn d-flex align-items-center gap-2 px-3 py-2"
              style={{
                background: '#f1f5f9',
                color: '#475569',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                border: '1px solid #e2e8f0',
              }}
              onClick={handleCopy}
            >
              <i className={`bi ${copied ? 'bi-check-lg' : 'bi-clipboard'}`}></i>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      </div>

      {/* Review Parameters Modal */}
      {showModal && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1060 }}
            onClick={() => setShowModal(false)}
          />
          <div
            className="card shadow-lg"
            role="dialog"
            aria-modal="true"
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 1061,
              width: 480,
              maxWidth: '90vw',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            <div className="d-flex align-items-center justify-content-between px-4 py-3" style={{ borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-sliders" style={{ color: '#8b5cf6', fontSize: 16 }}></i>
                <span className="fw-semibold" style={{ fontSize: 14, color: '#1e293b' }}>Review Parameters</span>
              </div>
              <button
                className="btn btn-sm p-0"
                style={{ color: '#94a3b8', border: 'none', background: 'none', fontSize: 18 }}
                onClick={() => setShowModal(false)}
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>

            <div className="px-4 py-3" style={{ overflowY: 'auto', flex: 1 }}>
              <p className="small mb-3" style={{ color: '#64748b' }}>
                Review and adjust your prompt parameters before running.
              </p>
              {placeholders.map((ph, i) => {
                const isAutoFilled = !!(autoFillMap[ph.name] || autoFillMap[ph.name.toLowerCase()]);
                return (
                  <div key={i} className="mb-3">
                    <div className="d-flex align-items-center gap-2 mb-1">
                      <label className="form-label small fw-medium mb-0" style={{ color: '#1e293b', fontSize: 12 }}>
                        {ph.description || ph.name.replace(/_/g, ' ')}
                      </label>
                      {isAutoFilled && (
                        <span className="badge" style={{ background: '#ecfdf5', color: '#047857', fontSize: 9, fontWeight: 500 }}>
                          from profile
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder={ph.example || `Enter ${ph.name.replace(/_/g, ' ')}...`}
                      value={modalValues[ph.name] || ''}
                      onChange={(e) => setModalValues(prev => ({ ...prev, [ph.name]: e.target.value }))}
                      style={{ fontSize: 12, borderColor: isAutoFilled ? '#a7f3d0' : '#c4b5fd' }}
                    />
                  </div>
                );
              })}
            </div>

            <div className="d-flex gap-2 px-4 py-3" style={{ borderTop: '1px solid #e2e8f0', flexShrink: 0 }}>
              <button
                className="btn d-flex align-items-center gap-2 px-4 py-2"
                style={{
                  background: allModalFilled
                    ? 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)'
                    : '#94a3b8',
                  color: '#fff',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  border: 'none',
                }}
                disabled={!allModalFilled || saving}
                onClick={handleModalConfirm}
              >
                {saving ? (
                  <><span className="spinner-border spinner-border-sm" style={{ width: 14, height: 14 }}></span> Saving...</>
                ) : (
                  <><i className={`bi ${selectedLLM.icon}`}></i> Run in {selectedLLM.name}</>
                )}
              </button>
              <button
                className="btn px-3 py-2"
                style={{ background: '#f1f5f9', color: '#475569', borderRadius: 8, fontSize: 13, fontWeight: 600, border: '1px solid #e2e8f0' }}
                onClick={() => setShowModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
