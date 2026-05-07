/**
 * AnnotationOverlay — transparent canvas overlay for click-to-pin and
 * draw-to-highlight annotations.
 *
 * Designed to layer on top of an iframe in `VisualReviewWorkspace`. Caller
 * controls visibility + receives annotation events via onCommit.
 *
 * Phase 6 §4.
 */
import React, { useRef, useState, useCallback } from 'react';

export interface AnnotationRegion {
  id: string;
  kind: 'pin' | 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}

interface Props {
  width: number;
  height: number;
  active: boolean;
  mode?: 'pin' | 'rect';
  regions: AnnotationRegion[];
  onCommit: (region: AnnotationRegion) => void;
  onSelect?: (id: string) => void;
}

export const AnnotationOverlay: React.FC<Props> = ({ width, height, active, mode = 'rect', regions, onCommit, onSelect }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState<AnnotationRegion | null>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (!active || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (mode === 'pin') {
      const region: AnnotationRegion = {
        id: `pin-${Date.now()}`,
        kind: 'pin',
        x, y, width: 18, height: 18,
      };
      onCommit(region);
      return;
    }
    setStart({ x, y });
    setDrawing({
      id: `rect-${Date.now()}`,
      kind: 'rect',
      x, y, width: 0, height: 0,
    });
  }, [active, mode, onCommit]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!active || !ref.current || !drawing || !start) return;
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDrawing({
      ...drawing,
      x: Math.min(start.x, x),
      y: Math.min(start.y, y),
      width: Math.abs(x - start.x),
      height: Math.abs(y - start.y),
    });
  }, [active, drawing, start]);

  const onMouseUp = useCallback(() => {
    if (!active || !drawing) return;
    if (drawing.width >= 6 && drawing.height >= 6) {
      onCommit(drawing);
    }
    setDrawing(null);
    setStart(null);
  }, [active, drawing, onCommit]);

  return (
    <div
      ref={ref}
      role="region"
      aria-label="Annotation overlay"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      style={{
        position: 'absolute',
        top: 0, left: 0,
        width, height,
        cursor: active ? (mode === 'pin' ? 'crosshair' : 'crosshair') : 'default',
        pointerEvents: active ? 'auto' : 'none',
      }}
    >
      {regions.map(r => (
        <div
          key={r.id}
          onClick={() => onSelect?.(r.id)}
          style={{
            position: 'absolute',
            left: r.x,
            top: r.y,
            width: r.width,
            height: r.height,
            border: '2px solid var(--color-secondary, #e53e3e)',
            borderRadius: r.kind === 'pin' ? '50%' : 4,
            background: r.kind === 'pin' ? 'rgba(229, 62, 62, 0.7)' : 'rgba(229, 62, 62, 0.18)',
            pointerEvents: 'auto',
            cursor: 'pointer',
          }}
          title={r.label || r.id}
        />
      ))}
      {drawing && drawing.width > 0 && drawing.height > 0 && (
        <div
          style={{
            position: 'absolute',
            left: drawing.x,
            top: drawing.y,
            width: drawing.width,
            height: drawing.height,
            border: '2px dashed var(--color-secondary, #e53e3e)',
            background: 'rgba(229, 62, 62, 0.1)',
          }}
        />
      )}
    </div>
  );
};

export default AnnotationOverlay;
