/**
 * ScanButton — 2026-05-21.
 *
 * Captures the iframe contents to a data URL via html2canvas-style DOM
 * snapshot, sends to the backend Visual Scan endpoint, and the parent
 * refreshes the session to surface the new suggestions.
 *
 * Includes a preset dropdown (Addition B): comprehensive / accessibility /
 * executive_polish / data_density / mobile.
 *
 * Important constraint: the iframe content is cross-origin only if the
 * preview origin differs from the portal origin. When same-origin (the
 * default for /admin/* etc.), we can dom-to-image the iframe document.
 * Cross-origin scans fall back to a notice + manual upload option.
 */
import React, { useCallback, useState } from 'react';

export type ScanPreset = 'comprehensive' | 'accessibility' | 'executive_polish' | 'data_density' | 'mobile';

const PRESET_LABELS: Record<ScanPreset, string> = {
  comprehensive: 'Comprehensive',
  accessibility: 'Accessibility only',
  executive_polish: 'Executive polish',
  data_density: 'Data density',
  mobile: 'Mobile view',
};

interface Props {
  iframeRef?: React.RefObject<HTMLIFrameElement | null>;
  pageRoute: string;
  onScanComplete: (result: { created_count: number; cache_hit: boolean; scan_summary?: string }) => void;
  /** Performs the actual POST to /scan with the captured data URL. */
  onScan: (input: { screenshot_data_url: string; preset: ScanPreset }) => Promise<{ created_count: number; cache_hit: boolean; scan_summary?: string }>;
  disabled?: boolean;
}

const ScanButton: React.FC<Props> = ({ pageRoute, onScanComplete, onScan, disabled }) => {
  const [preset, setPreset] = useState<ScanPreset>('comprehensive');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const captureViewport = useCallback(async (): Promise<string | null> => {
    // We can't easily capture cross-origin iframes from JS. Two paths:
    //   1) Same-origin: use html2canvas dynamically loaded — too heavy
    //      and adds a 100KB+ runtime cost.
    //   2) Capture the WHOLE BROWSER VIEWPORT (the iframe is part of it)
    //      via the simpler trick: html2canvas on the visible workspace.
    //      Works for both same-origin and cross-origin since the iframe
    //      pixels are already painted on screen.
    //
    // Tradeoff: includes our chrome (sidebar, action bar). Acceptable —
    // the LLM is told the page route + cap context and can disregard
    // workspace chrome. We could clip in a follow-up, but the simpler
    // path ships value today.
    try {
      // Dynamic import keeps the bundle lean — html2canvas only loads
      // when the operator clicks Scan.
      const html2canvas = (await import('html2canvas')).default;
      const stageEl = document.querySelector('.vw-canvas') as HTMLElement | null;
      const target = stageEl || document.body;
      const canvas = await html2canvas(target, {
        useCORS: true,
        allowTaint: true,
        scale: 1,
        logging: false,
        width: target.clientWidth,
        height: target.clientHeight,
        windowWidth: target.clientWidth,
        windowHeight: target.clientHeight,
      });
      return canvas.toDataURL('image/png');
    } catch (err: any) {
      console.error('[ScanButton] capture failed', err);
      setError(`Capture failed: ${err?.message || 'unknown'}. The iframe may be cross-origin. Try same-origin preview or upload manually.`);
      return null;
    }
  }, []);

  const runScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const dataUrl = await captureViewport();
      if (!dataUrl) { setScanning(false); return; }
      const result = await onScan({ screenshot_data_url: dataUrl, preset });
      onScanComplete(result);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Scan failed');
    } finally {
      setScanning(false);
    }
  }, [captureViewport, onScan, onScanComplete, preset]);

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <select
        value={preset}
        onChange={(e) => setPreset(e.target.value as ScanPreset)}
        disabled={scanning || disabled}
        title="Choose what the scan focuses on"
        style={{
          fontSize: 11, padding: '4px 6px',
          border: '1px solid var(--color-border)',
          borderRadius: 3, background: 'white', color: 'var(--color-text)',
          cursor: scanning || disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {(Object.keys(PRESET_LABELS) as ScanPreset[]).map(p => (
          <option key={p} value={p}>{PRESET_LABELS[p]}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={runScan}
        disabled={scanning || disabled || !pageRoute}
        title="Run a one-shot AI scan of this page; results land in the sidebar as suggestions"
        style={{
          fontSize: 12, fontWeight: 600,
          padding: '5px 10px',
          background: scanning ? 'var(--color-bg-alt)' : '#FB2832',
          color: scanning ? 'var(--color-text-light)' : 'white',
          border: 'none', borderRadius: 3,
          cursor: scanning || disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <i className={`bi ${scanning ? 'bi-arrow-clockwise' : 'bi-stars'} me-1`} style={scanning ? { animation: 'vw-spin 1s linear infinite' } : undefined}></i>
        {scanning ? 'Scanning…' : 'Scan this page'}
      </button>
      {error && (
        <span style={{ fontSize: 11, color: 'var(--color-secondary)', marginLeft: 6 }} title={error}>
          <i className="bi bi-exclamation-triangle me-1"></i>scan error
        </span>
      )}
      <style>{`@keyframes vw-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default ScanButton;
