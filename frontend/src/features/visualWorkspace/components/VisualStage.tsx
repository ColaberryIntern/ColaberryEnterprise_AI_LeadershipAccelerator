/**
 * VisualStage — center area of the workspace.
 *
 * Renders the target page in an iframe with a click-capture overlay.
 * Clicks on the overlay drop a normalized (x,y) pin coordinate the
 * parent uses to open the AnnotationModal.
 *
 * V1 keeps the overlay TOGGLABLE — when "annotate mode" is off, the
 * iframe receives clicks normally so the user can interact with the
 * page (scroll, hover, navigate within iframe).
 */
import React, { useRef, useState } from 'react';
import AnnotationPin from './AnnotationPin';
import type { PinCoordinate, CritiqueSeverity } from '../types';

export interface StagePin {
  id: string;
  index: number;
  pin: PinCoordinate;
  severity: CritiqueSeverity;
  resolved?: boolean;
  active: boolean;
}

interface Props {
  src: string;
  annotateMode: boolean;
  pins: StagePin[];
  onPinClick: (id: string) => void;
  onStageClick: (pin: PinCoordinate) => void;
  iframeKey?: number;
  onIframeLoad?: () => void;
}

const VisualStage: React.FC<Props> = ({ src, annotateMode, pins, onPinClick, onStageClick, iframeKey, onIframeLoad }) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!annotateMode) return;
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    onStageClick({ x, y, width: 0, height: 0 });
  };

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!annotateMode) { setHoverPos(null); return; }
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHoverPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div
      ref={wrapperRef}
      className="vw-stage-wrapper"
      style={{
        position: 'relative',
        flex: 1,
        background: 'var(--color-bg-alt)',
        borderRadius: 6,
        border: '1px solid var(--color-border)',
        overflow: 'hidden',
        cursor: annotateMode ? 'crosshair' : 'default',
      }}
      onClick={handleClick}
      onMouseMove={handleMove}
      onMouseLeave={() => setHoverPos(null)}
    >
      <iframe
        key={iframeKey}
        title="Visual workspace stage"
        src={src}
        onLoad={onIframeLoad}
        style={{
          width: '100%',
          height: '100%',
          border: 0,
          // When annotate mode is on, swallow iframe pointer events so the
          // overlay can capture clicks instead.
          pointerEvents: annotateMode ? 'none' : 'auto',
        }}
      />

      {/* Annotate-mode hint */}
      {annotateMode && (
        <div style={{
          position: 'absolute',
          top: 12,
          left: 12,
          background: 'var(--color-primary)',
          color: 'white',
          fontSize: 11,
          fontWeight: 600,
          padding: '0.3rem 0.6rem',
          borderRadius: 3,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          pointerEvents: 'none',
          zIndex: 50,
          boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
        }}>
          <i className="bi bi-bullseye me-1"></i>Annotate mode · click to drop a pin
        </div>
      )}

      {/* Hover crosshair guide */}
      {annotateMode && hoverPos && (
        <>
          <div style={{
            position: 'absolute',
            left: hoverPos.x,
            top: 0,
            width: 1,
            height: '100%',
            background: 'rgba(43, 108, 176, 0.35)',
            pointerEvents: 'none',
            zIndex: 25,
          }} />
          <div style={{
            position: 'absolute',
            left: 0,
            top: hoverPos.y,
            width: '100%',
            height: 1,
            background: 'rgba(43, 108, 176, 0.35)',
            pointerEvents: 'none',
            zIndex: 25,
          }} />
        </>
      )}

      {/* Existing pins */}
      {pins.map(p => (
        <AnnotationPin
          key={p.id}
          index={p.index}
          pin={p.pin}
          severity={p.severity}
          active={p.active}
          resolved={p.resolved}
          onClick={() => onPinClick(p.id)}
        />
      ))}
    </div>
  );
};

export default VisualStage;
