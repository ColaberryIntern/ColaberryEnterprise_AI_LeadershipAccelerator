/**
 * AnnotationPin — single numbered pin overlaid on the iframe stage.
 *
 * Coordinates are normalized 0..1 over the stage wrapper; the pin
 * positions itself with absolute CSS so it stays anchored as the
 * stage resizes.
 */
import React from 'react';
import type { PinCoordinate, CritiqueSeverity } from '../types';

interface Props {
  index: number;
  pin: PinCoordinate;
  severity: CritiqueSeverity;
  active: boolean;
  resolved?: boolean;
  onClick: () => void;
}

const SEVERITY_COLOR: Record<CritiqueSeverity, string> = {
  high: 'var(--color-danger)',
  medium: 'var(--color-warning)',
  low: 'var(--color-info)',
};

const AnnotationPin: React.FC<Props> = ({ index, pin, severity, active, resolved, onClick }) => {
  const color = resolved ? 'var(--color-success)' : SEVERITY_COLOR[severity];
  return (
    <button
      type="button"
      className="vw-pin"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        position: 'absolute',
        left: `${pin.x * 100}%`,
        top: `${pin.y * 100}%`,
        transform: 'translate(-50%, -50%)',
        width: 24,
        height: 24,
        borderRadius: '50%',
        background: color,
        color: 'white',
        fontSize: 11,
        fontWeight: 600,
        border: active ? '2px solid var(--color-primary)' : '2px solid white',
        boxShadow: active
          ? '0 0 0 3px rgba(43, 108, 176, 0.25), 0 2px 6px rgba(0,0,0,0.18)'
          : '0 2px 6px rgba(0,0,0,0.18)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        padding: 0,
        zIndex: active ? 30 : 20,
      }}
      aria-label={`Issue ${index} (${severity}${resolved ? ', resolved' : ''})`}
    >
      {resolved ? '✓' : index}
    </button>
  );
};

export default AnnotationPin;
