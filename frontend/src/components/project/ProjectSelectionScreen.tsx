import React, { useEffect, useState, useCallback } from 'react';
import portalApi from '../../utils/portalApi';

interface Suggestion {
  id: string;
  name: string;
  slug: string;
  description: string;
  why_this_fits: string;
  confidence: number;
  system_type: string;
  key_capabilities: string[];
}

const SYSTEM_TYPE_COLORS: Record<string, string> = {
  agent: 'bg-primary',
  dashboard: 'bg-info text-dark',
  automation: 'bg-success',
  analytics: 'bg-warning text-dark',
  assistant: 'bg-secondary',
};

function ProjectSelectionScreen({ onSelected }: { onSelected?: () => void }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await portalApi.post('/api/portal/project/suggestions/generate');
      setSuggestions(res.data.suggestions || []);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to generate suggestions');
    } finally { setGenerating(false); }
  }, []);

  const handleSelect = async () => {
    if (!selected) return;
    setSelecting(true);
    try {
      await portalApi.post('/api/portal/project/suggestions/select', {
        suggestion_id: selected,
        suggestions,
      });
      if (onSelected) onSelected();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to select project');
    } finally { setSelecting(false); }
  };

  // No suggestions yet — show generate button
  if (suggestions.length === 0) {
    return (
      <div className="card border-0 shadow-sm">
        <div className="card-body text-center py-5">
          <i className="bi bi-lightbulb fs-1 d-block mb-3" style={{ color: 'var(--color-primary)' }}></i>
          <h5 className="fw-bold mb-2" style={{ color: 'var(--color-primary)' }}>Discover Your AI Project</h5>
          <p className="text-muted small mb-3">
            Based on your Module 1 artifacts, we'll generate 5 personalized project suggestions tailored to your business context.
          </p>
          <button className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
            {generating ? (
              <><span className="spinner-border spinner-border-sm me-2"></span>Analyzing your artifacts...</>
            ) : (
              <><i className="bi bi-stars me-2"></i>Generate Project Suggestions</>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="mb-4">
        <h5 className="fw-bold" style={{ color: 'var(--color-primary)' }}>
          <i className="bi bi-lightbulb me-2"></i>Choose Your AI System
        </h5>
        <p className="text-muted small mb-0">
          Select the project that best matches your goals. Each suggestion is tailored to your business context.
        </p>
      </div>

      {/* Card Grid */}
      <div className="row g-3 mb-4">
        {suggestions.map((s) => {
          const isSelected = selected === s.id;
          return (
            <div key={s.id} className="col-md-6 col-lg-4">
              <div
                className={`card border-0 shadow-sm h-100`}
                style={{
                  cursor: 'pointer',
                  borderLeft: isSelected ? '4px solid var(--color-primary)' : '4px solid transparent',
                  background: isSelected ? 'var(--color-bg-alt)' : 'var(--color-bg)',
                  transition: 'all 0.15s ease',
                }}
                onClick={() => setSelected(s.id)}
              >
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <h6 className="fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>{s.name}</h6>
                    {isSelected && (
                      <i className="bi bi-check-circle-fill" style={{ color: 'var(--color-accent)', fontSize: '1.25rem' }}></i>
                    )}
                  </div>

                  <div className="d-flex gap-2 mb-2">
                    <span className={`badge ${SYSTEM_TYPE_COLORS[s.system_type] || 'bg-secondary'}`}>
                      {s.system_type}
                    </span>
                    <span className="badge bg-light text-dark border">
                      {Math.round(s.confidence * 100)}% match
                    </span>
                  </div>

                  <p className="small text-muted mb-2">{s.description}</p>

                  <div className="small mb-2" style={{ color: 'var(--color-primary-light)' }}>
                    <i className="bi bi-arrow-right-circle me-1"></i>
                    <em>{s.why_this_fits}</em>
                  </div>

                  {s.key_capabilities.length > 0 && (
                    <div className="d-flex flex-wrap gap-1">
                      {s.key_capabilities.map((cap, i) => (
                        <span key={i} className="badge bg-light text-dark border" style={{ fontSize: '0.7rem' }}>
                          {cap}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action Bar */}
      <div className="d-flex justify-content-between align-items-center">
        <button className="btn btn-sm btn-outline-secondary" onClick={handleGenerate} disabled={generating}>
          <i className="bi bi-arrow-clockwise me-1"></i>
          {generating ? 'Regenerating...' : 'Regenerate Suggestions'}
        </button>

        <button
          className="btn btn-primary"
          onClick={handleSelect}
          disabled={!selected || selecting}
        >
          {selecting ? (
            <><span className="spinner-border spinner-border-sm me-2"></span>Setting up project...</>
          ) : (
            <><i className="bi bi-rocket-takeoff me-2"></i>Continue with this Project</>
          )}
        </button>
      </div>
    </>
  );
}

export default ProjectSelectionScreen;
