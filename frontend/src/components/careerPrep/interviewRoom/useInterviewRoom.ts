import { useCallback, useEffect, useRef, useState } from 'react';
import { decideRoomApi, fetchRoomApi, type RoomAnswer } from './interviewRoomApi';

/**
 * The candidate room's state (CP9.1). Loads the room; a decision is sent ONCE (a second click while one is in flight
 * does nothing, and the server keeps the first decision anyway). While the recording is being turned on
 * (join.status 'starting') it re-reads every POLL_MS, at most MAX_POLLS times, then stops and offers Try again (no
 * endless loop). A room not open yet re-reads once when it opens (if that is within OPEN_WAIT_MAX_MS).
 */
export const POLL_MS = 3000;
export const MAX_POLLS = 10;
export const OPEN_WAIT_MAX_MS = 6 * 60 * 60 * 1000;

export interface InterviewRoomState {
  answer: RoomAnswer | null;
  busy: boolean;
  stalled: boolean;
  decide: (d: 'consent' | 'decline') => void;
  retry: () => void;
}

export function useInterviewRoom(id: string): InterviewRoomState {
  const [answer, setAnswer] = useState<RoomAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [polls, setPolls] = useState(0);
  const inFlight = useRef(false);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);

  const load = useCallback(async () => {
    const a = await fetchRoomApi(id);
    if (live.current) setAnswer(a);
  }, [id]);

  useEffect(() => { setAnswer(null); setPolls(0); load(); }, [load]);

  const decide = useCallback((d: 'consent' | 'decline') => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    decideRoomApi(id, d).then((a) => { if (live.current) { setAnswer(a); setPolls(0); } }).finally(() => { inFlight.current = false; if (live.current) setBusy(false); });
  }, [id]);

  const starting = answer?.kind === 'ok' && answer.room.join.status === 'starting';
  useEffect(() => {
    if (!starting || polls >= MAX_POLLS) return undefined;
    const t = window.setTimeout(() => { setPolls((n) => n + 1); load(); }, POLL_MS);
    return () => window.clearTimeout(t);
  }, [starting, polls, load]);

  const opensAt = answer?.kind === 'not_open' ? answer.opensAt : null;
  useEffect(() => {
    if (!opensAt) return undefined;
    const wait = Date.parse(opensAt) - Date.now() + 500;
    if (!(wait > 0 && wait <= OPEN_WAIT_MAX_MS)) return undefined;
    const t = window.setTimeout(() => { load(); }, wait);
    return () => window.clearTimeout(t);
  }, [opensAt, load]);

  const retry = useCallback(() => { setPolls(0); load(); }, [load]);
  return { answer, busy, stalled: starting && polls >= MAX_POLLS, decide, retry };
}
