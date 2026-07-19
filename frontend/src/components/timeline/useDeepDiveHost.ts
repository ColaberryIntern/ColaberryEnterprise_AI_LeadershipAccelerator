import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, RefObject } from 'react';
import { runtimeApi } from '../../pages/portal/runtime/runtimeApi';

/**
 * useDeepDiveHost — the host-side bridge for a Deep Dive Field Guide iframe.
 *
 * The guide runs in a sandboxed iframe WITHOUT `allow-same-origin`, so it has an
 * opaque origin: it can neither reach the API nor use localStorage (both throw).
 * So the HOST owns two things the guide can't:
 *   1. PERSISTENCE — which sections are read + whether the build prompt was copied,
 *      stored in the host's real localStorage keyed by cardId. Restored into the
 *      guide on load so progress survives drawer↔workspace navigation + refreshes.
 *      (Mirrors useReaderProgress for Self Study — the guide's own localStorage is a
 *      no-op in the sandbox, which is why progress "reset" before.)
 *   2. UPLOAD — the real +100-point Field Guide upload (Week 1+), which needs auth.
 *
 * Message contract (guide ⇄ host):
 *   guide → host {source:'deepdive', action:'ready'}                      request restore
 *   guide → host {source:'deepdive', action:'upload'}                     open the file picker
 *   guide → host {source:'deepdive', done, total, complete, ids, copied}  progress tick
 *   host  → guide {source:'deepdive-host', type:'restore', seenIds, copied, uploaded}
 *   host  → guide {source:'deepdive-host', type:'uploaded', points_awarded}
 *
 * `complete` (from the guide) already folds read + copy + upload, so the host uses it
 * verbatim for the Mark-complete gate; the server enforces the upload too.
 * Render `fileInputRef` on a hidden <input type="file"> and pass `iframeRef` to the iframe.
 */
export interface DeepDiveHostState {
  done: number;
  total: number;
  complete: boolean;
  uploaded: boolean;
  /** A short status line to show near the complete gate (uploading / success / error). */
  message: string | null;
  busy: boolean;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: RefObject<HTMLInputElement>;
}

interface Stored { seenIds: string[]; copied: boolean }
const key = (cardId: string) => `dd:progress:${cardId}`;
function readStored(cardId: string): Stored {
  try {
    const raw = JSON.parse(window.localStorage.getItem(key(cardId)) || '{}');
    return { seenIds: Array.isArray(raw.seenIds) ? raw.seenIds.filter((x: unknown): x is string => typeof x === 'string') : [], copied: !!raw.copied };
  } catch { return { seenIds: [], copied: false }; }
}
function writeStored(cardId: string, s: Stored): void {
  try { window.localStorage.setItem(key(cardId), JSON.stringify(s)); } catch { /* storage blocked — won't persist */ }
}

export function useDeepDiveHost(
  cardId: string,
  enabled: boolean,
  iframeRef: RefObject<HTMLIFrameElement>,
): DeepDiveHostState {
  const [state, setState] = useState<{ done: number; total: number; complete: boolean }>({ done: 0, total: 0, complete: false });
  const [uploaded, setUploaded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Latest known state, read inside message handlers without re-subscribing.
  const copiedRef = useRef(false);
  const uploadedRef = useRef(false);
  useEffect(() => { uploadedRef.current = uploaded; }, [uploaded]);

  const postToGuide = useCallback((payload: Record<string, unknown>) => {
    try { iframeRef.current?.contentWindow?.postMessage({ source: 'deepdive-host', ...payload }, '*'); } catch { /* iframe not ready */ }
  }, [iframeRef]);

  const sendRestore = useCallback(() => {
    const s = readStored(cardId);
    copiedRef.current = s.copied;
    postToGuide({ type: 'restore', seenIds: s.seenIds, copied: s.copied, uploaded: uploadedRef.current });
  }, [cardId, postToGuide]);

  // Reset per card + fetch any prior upload so a returning student keeps their gate.
  useEffect(() => {
    setState({ done: 0, total: 0, complete: false }); setUploaded(false); setMessage(null); setBusy(false); setReady(false);
    copiedRef.current = false; uploadedRef.current = false;
    if (!enabled || !cardId) return;
    let alive = true;
    runtimeApi.fieldGuideStatus(cardId).then((s) => { if (alive && s.uploaded) { setUploaded(true); uploadedRef.current = true; sendRestore(); } }).catch(() => { /* not uploaded */ });
    return () => { alive = false; };
  }, [cardId, enabled, sendRestore]);

  // Listen for the guide: ready handshake, picker request, and progress ticks (persist them).
  useEffect(() => {
    if (!enabled || !cardId) return;
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { source?: string; action?: string; done?: number; total?: number; complete?: boolean; ids?: unknown[]; copied?: boolean } | null;
      if (!d || d.source !== 'deepdive') return;
      if (d.action === 'ready') { setReady(true); sendRestore(); return; }
      if (d.action === 'upload') { fileInputRef.current?.click(); return; }
      if (typeof d.total === 'number') {
        setState({ done: Number(d.done) || 0, total: Number(d.total) || 0, complete: !!d.complete });
        const ids = Array.isArray(d.ids) ? d.ids.filter((x): x is string => typeof x === 'string') : [];
        const copied = !!d.copied || copiedRef.current;
        copiedRef.current = copied;
        writeStored(cardId, { seenIds: ids, copied });
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [cardId, enabled, sendRestore]);

  // If we learn it's uploaded after the guide is already up, tick its upload step.
  useEffect(() => { if (enabled && uploaded && ready) postToGuide({ type: 'uploaded' }); }, [enabled, uploaded, ready, postToGuide]);

  const onFileChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';   // allow re-selecting the same filename
    if (!file || !cardId) return;
    setBusy(true); setMessage('Uploading your Field Guide…');
    try {
      const r = await runtimeApi.uploadFieldGuide(cardId, file);
      setUploaded(true); uploadedRef.current = true;
      setMessage(r.already_awarded ? 'Field Guide updated — your 100 points are already banked.' : 'Field Guide uploaded — 100 points earned.');
      postToGuide({ type: 'uploaded', points_awarded: r.points_awarded });
    } catch (err: any) {
      setMessage(err?.response?.data?.error || 'Upload failed — upload the .html file Claude Code built for you.');
    } finally { setBusy(false); }
  }, [cardId, postToGuide]);

  return { done: state.done, total: state.total, complete: state.complete, uploaded, message, busy, onFileChange, fileInputRef };
}
