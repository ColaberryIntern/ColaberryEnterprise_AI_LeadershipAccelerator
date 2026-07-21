/**
 * useBlogReadGate — client half of the blog "2 continuous minutes" read gate.
 *
 * Blogs open in a new tab (external link), so "reading" is measured as continuous
 * time with the post engaged. The gate is armed by start() (called when the
 * student clicks "Read the post"), then a heartbeat posts the wall-clock delta
 * since the last beat every ~10s. Each beat carries the real elapsed time, so a
 * backgrounded tab (throttled to ~1 beat/min) still accrues correctly, while the
 * server resets the window if the gap gets too large (they left). On unmount the
 * heartbeat stops; the server's gap detection handles the reset.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { runtimeApi } from '../../pages/portal/runtime/runtimeApi';

export interface BlogReadState { read_s: number; required_s: number; met: boolean; }

export function useBlogReadGate(blogId: string | null) {
  const [state, setState] = useState<BlogReadState | null>(null);
  const [started, setStarted] = useState(false);
  const lastBeatRef = useRef<number>(0);

  const start = useCallback(() => setStarted(true), []);

  useEffect(() => {
    if (!blogId || !started) return;
    let alive = true;
    lastBeatRef.current = Date.now();
    const beat = () => {
      const now = Date.now();
      const delta = Math.max(0, Math.round((now - lastBeatRef.current) / 1000));
      lastBeatRef.current = now;
      if (delta <= 0) return;
      runtimeApi.blogRead(blogId, { delta_s: delta })
        .then((s) => { if (alive) setState(s); })
        .catch(() => { /* best-effort heartbeat */ });
    };
    const id = window.setInterval(beat, 10000);
    return () => { alive = false; window.clearInterval(id); };
  }, [blogId, started]);

  return { state, started, start };
}
