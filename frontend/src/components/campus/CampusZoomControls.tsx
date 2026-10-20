import React from 'react';
import type { MutableRefObject } from 'react';
import type { CameraApi } from './useCampusCamera';

/**
 * Zoom in, zoom out and "whole campus" for the map camera (C11b). The wheel and a drag do the same with a pointer; these make it
 * possible with a keyboard or a single finger. Each press eases the camera (instantly with reduce motion, in the hook).
 */
export default function CampusZoomControls({ apiRef }: { apiRef: MutableRefObject<CameraApi | null> }): React.ReactElement {
  return (
    <div className="cm-zoom" role="group" aria-label="Map view" data-testid="cm-zoom">
      <button type="button" aria-label="Zoom in" onClick={() => apiRef.current?.zoom(0.8)} data-testid="cm-zoom-in">+</button>
      <button type="button" aria-label="Zoom out" onClick={() => apiRef.current?.zoom(1.25)} data-testid="cm-zoom-out">&minus;</button>
      <button type="button" aria-label="Show the whole campus" onClick={() => apiRef.current?.base()} data-testid="cm-zoom-reset">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
      </button>
    </div>
  );
}
