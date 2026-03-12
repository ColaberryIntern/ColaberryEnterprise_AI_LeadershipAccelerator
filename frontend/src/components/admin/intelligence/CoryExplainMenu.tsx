import React, { useState, useRef, useEffect } from 'react';
import { coryExplain, coryResearch, coryRecommend } from '../../../services/reportingApi';

interface CoryExplainMenuProps {
  chartData?: any;
  chartType?: string;
  chartTitle?: string;
  entityType?: string;
  entityId?: string;
  insightId?: string;
  onResult?: (result: string) => void;
  size?: number;
}

export default function CoryExplainMenu({
  chartData, chartType, chartTitle,
  entityType, entityId, insightId,
  onResult, size = 20,
}: CoryExplainMenuProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleExplain = async () => {
    setOpen(false);
    setLoading(true);
    try {
      const result = await coryExplain(chartData, chartType || 'unknown', chartTitle || 'Chart');
      onResult?.(result.explanation);
    } catch { onResult?.('Failed to generate explanation.'); }
    setLoading(false);
  };

  const handleResearch = async () => {
    setOpen(false);
    setLoading(true);
    try {
      const result = await coryResearch(entityType || 'system', entityId || 'global');
      onResult?.(result.research);
    } catch { onResult?.('Failed to perform research.'); }
    setLoading(false);
  };

  const handleRecommend = async () => {
    setOpen(false);
    setLoading(true);
    try {
      if (insightId) {
        const result = await coryRecommend(insightId);
        onResult?.(result.recommendations);
      } else {
        onResult?.('No insight selected for recommendations.');
      }
    } catch { onResult?.('Failed to generate recommendations.'); }
    setLoading(false);
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        className="btn btn-link p-0 border-0"
        onClick={() => setOpen(!open)}
        disabled={loading}
        title="Ask Cory"
        style={{
          width: size, height: size, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'var(--color-primary, #1a365d)', color: '#fff',
          fontSize: size * 0.55, fontWeight: 700, textDecoration: 'none',
          cursor: 'pointer', lineHeight: 1,
        }}
      >
        {loading ? (
          <span className="spinner-border spinner-border-sm" style={{ width: size * 0.5, height: size * 0.5 }} role="status">
            <span className="visually-hidden">Loading...</span>
          </span>
        ) : 'C'}
      </button>

      {open && (
        <div className="dropdown-menu show shadow" style={{ position: 'absolute', top: size + 4, right: 0, minWidth: 160, zIndex: 1050 }}>
          <button className="dropdown-item small" onClick={handleExplain}>
            <strong>Explain</strong>
            <div className="text-muted" style={{ fontSize: 11 }}>Describe this chart</div>
          </button>
          <button className="dropdown-item small" onClick={handleResearch}>
            <strong>Research</strong>
            <div className="text-muted" style={{ fontSize: 11 }}>Graph investigation</div>
          </button>
          <button className="dropdown-item small" onClick={handleRecommend}>
            <strong>Recommend</strong>
            <div className="text-muted" style={{ fontSize: 11 }}>Suggest actions</div>
          </button>
        </div>
      )}
    </div>
  );
}
