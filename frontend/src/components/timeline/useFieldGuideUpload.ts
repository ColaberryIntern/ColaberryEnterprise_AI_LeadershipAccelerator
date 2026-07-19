import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, RefObject } from 'react';
import { runtimeApi } from '../../pages/portal/runtime/runtimeApi';

/**
 * useFieldGuideUpload — bridges a Deep Dive Field Guide iframe (opaque-origin, so
 * it can only talk to the parent via postMessage) to the real upload flow, which
 * MUST live in the host page (the iframe has no auth/API access).
 *
 * Protocol (guide ⇄ host):
 *  - guide → host `{source:'deepdive', action:'ready'}`  : the guide's JS has attached
 *    its listener; the host (re)sends the current upload status so the checkbox restores.
 *  - guide → host `{source:'deepdive', action:'upload'}` : the student clicked "Choose
 *    HTML file"; the host opens the real file picker.
 *  - host → guide `{source:'deepdive-host', type:'uploaded', points_awarded}` : the
 *    upload succeeded (or a prior upload exists); the guide ticks its upload step.
 *
 * The guide's own "read + copy + upload" gate then reports `complete:true` only after a
 * REAL upload — and the server enforces it too (assertFieldGuideRequirement). Render the
 * returned `fileInputRef` on a hidden <input type="file"> and pass `iframeRef` to the guide iframe.
 */
export interface FieldGuideUploadState {
  uploaded: boolean;
  /** A short status line to show near the complete gate (uploading / success / error). */
  message: string | null;
  busy: boolean;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: RefObject<HTMLInputElement>;
}

export function useFieldGuideUpload(
  cardId: string,
  enabled: boolean,
  iframeRef: RefObject<HTMLIFrameElement>,
): FieldGuideUploadState {
  const [uploaded, setUploaded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const postToGuide = useCallback((payload: Record<string, unknown>) => {
    try { iframeRef.current?.contentWindow?.postMessage({ source: 'deepdive-host', ...payload }, '*'); } catch { /* iframe not ready */ }
  }, [iframeRef]);

  // Fetch any prior upload on open so a returning student keeps their credit + gate.
  useEffect(() => {
    setUploaded(false); setMessage(null); setBusy(false); setReady(false);
    if (!enabled || !cardId) return;
    let alive = true;
    runtimeApi.fieldGuideStatus(cardId).then((s) => { if (alive && s.uploaded) setUploaded(true); }).catch(() => { /* default: not uploaded */ });
    return () => { alive = false; };
  }, [cardId, enabled]);

  // Once the guide is ready AND we know it's uploaded, restore its upload step.
  useEffect(() => { if (enabled && uploaded && ready) postToGuide({ type: 'uploaded', restore: true }); }, [enabled, uploaded, ready, postToGuide]);

  // Listen for the guide's picker request + ready handshake.
  useEffect(() => {
    if (!enabled || !cardId) return;
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { source?: string; action?: string } | null;
      if (!d || d.source !== 'deepdive') return;
      if (d.action === 'upload') fileInputRef.current?.click();
      else if (d.action === 'ready') setReady(true);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [cardId, enabled]);

  const onFileChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';   // allow re-selecting the same filename
    if (!file || !cardId) return;
    setBusy(true); setMessage('Uploading your Field Guide…');
    try {
      const r = await runtimeApi.uploadFieldGuide(cardId, file);
      setUploaded(true);
      setMessage(r.already_awarded ? 'Field Guide updated — your 100 points are already banked.' : 'Field Guide uploaded — 100 points earned! 🎉');
      postToGuide({ type: 'uploaded', points_awarded: r.points_awarded });
    } catch (err: any) {
      setMessage(err?.response?.data?.error || 'Upload failed — upload the .html file Claude Code built for you.');
    } finally { setBusy(false); }
  }, [cardId, postToGuide]);

  return { uploaded, message, busy, onFileChange, fileInputRef };
}
