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
import { buildFinalPrompt } from '../../../services/promptBuilder';

/* Human-friendly labels for known placeholder names */
const FRIENDLY_LABELS: Record<string, string> = {
  ai_maturity_level: 'AI Maturity Level',
  company_size: 'Company Size',
  company_name: 'Company Name',
  company: 'Company Name',
  industry: 'Industry',
  sector: 'Industry',
  role: 'Your Role',
  goal: 'Primary Goal',
  identified_use_case: 'AI Use Case',
  use_case: 'AI Use Case',
  full_name: 'Full Name',
  email: 'Email Address',
  title: 'Job Title',
};

/* Dropdown options for fields that should use selects (matches registration) */
const DROPDOWN_OPTIONS: Record<string, { value: string; label: string }[]> = {
  ai_maturity_level: [
    { value: 'exploring', label: 'Exploring — No AI in production' },
    { value: 'piloting', label: 'Piloting — Running initial experiments' },
    { value: 'scaling', label: 'Scaling — Deploying AI across teams' },
    { value: 'embedded', label: 'Embedded — AI is core to operations' },
  ],
  company_size: [
    { value: '1-49', label: '1-49 employees' },
    { value: '50-249', label: '50-249 employees' },
    { value: '250-999', label: '250-999 employees' },
    { value: '1000-4999', label: '1,000-4,999 employees' },
    { value: '5000+', label: '5,000+ employees' },
  ],
  industry: [
    { value: 'Technology', label: 'Technology' },
    { value: 'Finance & Banking', label: 'Finance & Banking' },
    { value: 'Healthcare & Life Sciences', label: 'Healthcare & Life Sciences' },
    { value: 'Manufacturing', label: 'Manufacturing' },
    { value: 'Energy & Utilities', label: 'Energy & Utilities' },
    { value: 'Retail & eCommerce', label: 'Retail & eCommerce' },
    { value: 'Government & Public Sector', label: 'Government & Public Sector' },
    { value: 'Logistics & Supply Chain', label: 'Logistics & Supply Chain' },
    { value: 'Other', label: 'Other' },
  ],
};

interface PromptTemplateProps {
  data: PromptTemplateData;
  onPromptGenerated?: () => void;
  conceptSnapshot?: any;
  aiStrategy?: any;
  implementationTask?: any;
}

export default function PromptTemplate({ data, onPromptGenerated, conceptSnapshot, aiStrategy, implementationTask }: PromptTemplateProps) {
  const { learnerProfile, updateLearnerProfile, selectedLLM, lessonContext, openLLMWithPrompt } = useMentorContext();
  const [copied, setCopied] = useState(false);
  const [fillValues, setFillValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalValues, setModalValues] = useState<Record<string, string>>({});
  const [hasGenerated, setHasGenerated] = useState(false);

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
    onPromptGenerated?.();
    setTimeout(() => setCopied(false), 2000);
  };

  // Open modal — only show placeholders that don't already have values
  const openRunModal = () => {
    const values: Record<string, string> = {};
    for (const ph of placeholders) {
      values[ph.name] = getEffectiveValue(ph.name);
    }
    setModalValues(values);
    // If all values are filled, skip modal and go straight to LLM
    const allFilled = placeholders.every(ph => values[ph.name]?.trim());
    if (allFilled) {
      runWithValues(values);
      return;
    }
    setShowModal(true);
  };

  const runWithValues = async (values: Record<string, string>) => {
    // Save new values to profile
    const newValues: Record<string, string> = {};
    for (const ph of placeholders) {
      const val = values[ph.name]?.trim();
      if (val) newValues[ph.name] = val;
    }
    if (Object.keys(newValues).length > 0) {
      setSaving(true);
      const merged = { ...(learnerProfile?.personalization_context_json || {}), ...newValues };
      await updateLearnerProfile({ personalization_context_json: merged });
      // Also save as variables for workspace prompt inclusion
      const tok = localStorage.getItem('participant_token');
      if (tok) {
        fetch('/api/portal/curriculum/variables', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tok}` },
          body: JSON.stringify({ variables: newValues }),
        }).catch(() => {});
      }
      setSaving(false);
    }
    setFillValues(prev => ({ ...prev, ...values }));
    setHasGenerated(true);
    const filled = buildFilledTemplate(values);

    // Build unified prompt via single source of truth
    const promptToSend = buildFinalPrompt({
      learnerContext: {
        company: learnerProfile?.company_name,
        industry: learnerProfile?.industry,
        role: learnerProfile?.role,
        goal: learnerProfile?.goal,
        ai_maturity: learnerProfile?.ai_maturity_level != null ? String(learnerProfile.ai_maturity_level) : undefined,
        use_case: learnerProfile?.identified_use_case,
      },
      promptTemplate: filled,
      lessonTitle: lessonContext.lessonTitle,
      conceptSnapshot: conceptSnapshot ? { title: conceptSnapshot.title, definition: conceptSnapshot.definition || conceptSnapshot.executive_summary } : undefined,
      aiStrategy: aiStrategy ? { description: aiStrategy.strategy_name || aiStrategy.description } : undefined,
      implementationTask: implementationTask ? {
        title: implementationTask.title,
        description: implementationTask.description,
        deliverable: implementationTask.deliverable,
        requirements: implementationTask.requirements || [],
        artifacts: (implementationTask.required_artifacts || []).map((a: any) => ({ name: a.name, description: a.description, file_types: a.file_types })),
      } : undefined,
    });

    onPromptGenerated?.();
    // Use MentorContext's openLLMWithPrompt for consistent URL-length handling
    openLLMWithPrompt(promptToSend);
  };

  // Confirm from modal: save values + open LLM
  const handleModalConfirm = async () => {
    await runWithValues(modalValues);
    setShowModal(false);
  };

  // Open edit modal — always opens with ALL placeholders regardless of fill state
  const openEditModal = () => {
    const values: Record<string, string> = {};
    for (const ph of placeholders) {
      values[ph.name] = getEffectiveValue(ph.name);
    }
    setModalValues(values);
    setShowModal(true);
  };

  // Only show placeholders in the modal that don't already have auto-fill values
  const unfilledPlaceholders = placeholders.filter(ph => {
    const autoVal = autoFillMap[ph.name] || autoFillMap[ph.name.toLowerCase()];
    return !autoVal;
  });
  // When editing after generation, show all placeholders; otherwise show only unfilled
  const displayPlaceholders = hasGenerated ? placeholders : unfilledPlaceholders;
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
          {/* Editability hint */}
          {hasGenerated && (
            <div className="d-flex align-items-center gap-2 mb-2" style={{ fontSize: 11, color: '#64748b' }}>
              <i className="bi bi-info-circle"></i>
              <span>Based on your inputs — you can update and regenerate at any time</span>
            </div>
          )}

          {/* Template preview */}
          <div
            className="p-3 rounded mb-3"
            style={{ background: '#1e293b', color: '#e2e8f0', fontSize: 13, lineHeight: 1.8, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}
            dangerouslySetInnerHTML={{ __html: getDisplayHtml() }}
          />

          {/* Action buttons */}
          <div className="d-flex gap-2 flex-wrap">
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
            {hasGenerated && (
              <button
                className="btn d-flex align-items-center gap-2 px-3 py-2"
                style={{
                  background: '#fff',
                  color: '#6366f1',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  border: '1px solid #c7d2fe',
                }}
                onClick={openEditModal}
              >
                <i className="bi bi-pencil-square"></i> Edit Inputs
              </button>
            )}
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
              {displayPlaceholders.length > 0 ? (
                <>
                  <p className="small mb-3" style={{ color: '#64748b' }}>
                    {hasGenerated ? 'Update your inputs and regenerate your prompt.' : 'Please fill in the missing details to personalize your prompt.'}
                  </p>
                  {displayPlaceholders.map((ph, i) => {
                    const label = FRIENDLY_LABELS[ph.name] || FRIENDLY_LABELS[ph.name.toLowerCase()] || ph.description || ph.name.replace(/_/g, ' ');
                    const dropdownKey = Object.keys(DROPDOWN_OPTIONS).find(k => k === ph.name || k === ph.name.toLowerCase());
                    const options = dropdownKey ? DROPDOWN_OPTIONS[dropdownKey] : null;

                    return (
                      <div key={i} className="mb-3">
                        <label className="form-label small fw-medium mb-1" style={{ color: '#1e293b', fontSize: 12 }}>
                          {label}
                        </label>
                        {options ? (
                          <select
                            className="form-select form-select-sm"
                            value={modalValues[ph.name] || ''}
                            onChange={(e) => setModalValues(prev => ({ ...prev, [ph.name]: e.target.value }))}
                            style={{ fontSize: 12, borderColor: '#c4b5fd' }}
                          >
                            <option value="">Select {label.toLowerCase()}...</option>
                            {options.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            placeholder={ph.example || `Enter ${label.toLowerCase()}...`}
                            value={modalValues[ph.name] || ''}
                            onChange={(e) => setModalValues(prev => ({ ...prev, [ph.name]: e.target.value }))}
                            style={{ fontSize: 12, borderColor: '#c4b5fd' }}
                          />
                        )}
                      </div>
                    );
                  })}
                </>
              ) : (
                <p className="small mb-0" style={{ color: '#64748b' }}>
                  All parameters are filled from your profile. Ready to run!
                </p>
              )}
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
