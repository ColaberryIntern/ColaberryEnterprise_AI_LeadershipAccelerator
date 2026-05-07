/**
 * VisualHealthOverlay — renders the highlight regions from a multimodal
 * vision analysis as a tinted overlay on top of an image.
 *
 * Cognition hotspots / friction zones / weak CTA indicators / overloaded
 * sections each get a distinct tone. Hovering a region shows its label.
 *
 * Phase 7 §12.
 */
import React, { useState } from 'react';
import type { MultimodalVisionAnalysis } from '../../hooks/useMultimodalVision';

interface Props {
  analysis: MultimodalVisionAnalysis | null;
  imageWidth: number;
  imageHeight: number;
  className?: string;
}

const KIND_TONE: Record<string, { fill: string; stroke: string; icon: string }> = {
  cta_weakness: { fill: 'rgba(229, 62, 62, 0.18)', stroke: '#e53e3e', icon: 'bi-bullseye' },
  hierarchy_failure: { fill: 'rgba(217, 119, 6, 0.18)', stroke: '#d97706', icon: 'bi-bar-chart-steps' },
  overload: { fill: 'rgba(229, 62, 62, 0.20)', stroke: '#e53e3e', icon: 'bi-exclamation-octagon' },
  accessibility_gap: { fill: 'rgba(124, 58, 237, 0.18)', stroke: '#7c3aed', icon: 'bi-universal-access' },
  alignment_break: { fill: 'rgba(245, 158, 11, 0.18)', stroke: '#f59e0b', icon: 'bi-grid-3x2-gap' },
  contrast_issue: { fill: 'rgba(56, 189, 248, 0.18)', stroke: '#0ea5e9', icon: 'bi-droplet-half' },
};

export const VisualHealthOverlay: React.FC<Props> = ({ analysis, imageWidth, imageHeight, className }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!analysis || !analysis.highlight_regions || analysis.highlight_regions.length === 0) return null;

  return (
    <div
      className={className}
      role="region"
      aria-label="Visual health overlay"
      style={{
        position: 'absolute',
        top: 0, left: 0,
        width: imageWidth, height: imageHeight,
        pointerEvents: 'none',
      }}
    >
      {analysis.highlight_regions.map((r, i) => {
        const tone = KIND_TONE[r.kind] || { fill: 'rgba(74, 85, 104, 0.18)', stroke: '#4a5568', icon: 'bi-circle' };
        const x = (r.x_pct / 100) * imageWidth;
        const y = (r.y_pct / 100) * imageHeight;
        const w = (r.width_pct / 100) * imageWidth;
        const h = (r.height_pct / 100) * imageHeight;
        const isHovered = hoverIdx === i;
        return (
          <div
            key={i}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(prev => (prev === i ? null : prev))}
            style={{
              position: 'absolute',
              left: x, top: y, width: w, height: h,
              border: `2px solid ${tone.stroke}`,
              background: isHovered ? tone.fill : 'transparent',
              borderRadius: 4,
              pointerEvents: 'auto',
              cursor: 'help',
              transition: 'background 120ms',
            }}
            title={`${r.kind}: ${r.label}`}
          >
            <span
              style={{
                position: 'absolute',
                top: -10, left: -10,
                width: 22, height: 22,
                borderRadius: '50%',
                background: tone.stroke,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
              }}
              aria-hidden
            >
              <i className={`bi ${tone.icon}`}></i>
            </span>
            {isHovered && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 6px)',
                  left: 0,
                  background: 'rgba(26,54,93,0.95)',
                  color: '#fff',
                  padding: '6px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  maxWidth: 320,
                  whiteSpace: 'pre-wrap',
                  pointerEvents: 'none',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  zIndex: 10,
                }}
              >
                <strong className="text-uppercase" style={{ fontSize: 10, opacity: 0.8 }}>{r.kind.replace(/_/g, ' ')}</strong>
                <div>{r.label}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default VisualHealthOverlay;
