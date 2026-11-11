import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTv, type TvList } from '../../../services/colaberryTvApi';
import { useCampus } from '../CampusContext';
import { buildingName, CAMPUS_BUILDINGS, type BuildingId } from '../campusMap';
import ColaberryTv from './ColaberryTv';
import NowStream from './NowStream';
import TvManager from './TvManager';
import { markTvSeen } from './tvNote';
import { applyOrder, readLastFirst, saveLastFirst, shuffleOrder } from './tvPlaylist';
import type { NowChip } from './nowModel';
import type { Happening } from './nowApi';
import './colaberryNow.css';

/**
 * Colaberry Now (Campus v20 N2, Basecamp C132 / C133; the prototype's #cboard .cork.now in docs/design/campus/colaberry-campus-v20.html):
 * one place for what is going on at Colaberry right now. A large dialog over the map, min(1440px,100%) x min(94vh,980px), in two
 * columns: Colaberry TV (42%, always on while this is open) and the stream (58%); on phones (<=900px) the TV sits on top at 52vh.
 *
 * Closing (✕, the scrim, Esc) unmounts the TV, which sends its frame to about:blank and clears its timers. Esc closes the thread
 * drawer first, then the manager, then Colaberry Now. The playlist is re-read every 30 s and after every change in the manager, and
 * the open TV follows it (a removed or off-air short moves on to the next).
 */
export const TV_POLL_MS = 30_000;

export function ColaberryNow({ me, compose = null, onClose }: { me: string; compose?: 'q' | 'post' | null; onClose: () => void }): React.ReactElement {
  const navigate = useNavigate();
  const { openMap, settings } = useCampus();
  const [tv, setTv] = useState<TvList>({ videos: [], can_manage: false });
  const [managing, setManaging] = useState(false);
  const [restart, setRestart] = useState(0);
  const [playing, setPlaying] = useState<string | null>(null);
  const escapeRef = useRef<(() => boolean) | null>(null);
  const openPostRef = useRef<((id: string) => void) | null>(null);

  // A failed re-read keeps what is playing (the TV never stops for a network blip) and is logged with its class.
  // C136: this opening's play order, shuffled once when the playlist first arrives (never starting on last time's first short),
  // then kept for the whole visit so the 30 s re-read never reshuffles what someone is watching.
  const order = useRef<string[] | null>(null);
  const refreshTv = useCallback(() => {
    getTv().then((d) => {
      if (!order.current && d.videos.length) {
        order.current = shuffleOrder(d.videos.map((v) => v.id), readLastFirst());
        saveLastFirst(order.current[0]);
      }
      setTv({ ...d, videos: order.current ? applyOrder(d.videos, order.current) : d.videos });
    }).catch((err: unknown) => {
      console.warn(JSON.stringify({ level: 'warn', service: 'campus', event: 'colaberry_tv_refresh_failed', outcome: 'failure',
        error_class: (err as { name?: string })?.name || 'Error' }));
    });
  }, []);
  useEffect(() => {
    markTvSeen();
    refreshTv();
    const id = window.setInterval(refreshTv, TV_POLL_MS);
    return () => window.clearInterval(id);
  }, [refreshTv]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (escapeRef.current?.()) return;
      if (managing) { setManaging(false); return; }
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [managing, onClose]);

  const nameOf = useMemo(() => (area: string): string | null => {
    const b = CAMPUS_BUILDINGS.find((x) => x.id === area);
    return b ? buildingName(b, settings.workplaceNames) : null;
  }, [settings.workplaceNames]);

  const onChip = (c: NowChip, h: Happening) => {
    if (c.kind === 'campus' && h.on_campus?.busiest && nameOf(h.on_campus.busiest)) { onClose(); openMap(h.on_campus.busiest as BuildingId); }
    else if (c.kind === 'event') { onClose(); openMap('amphi' as BuildingId); }
    else if (c.kind === 'win' && h.latest_win) openPostRef.current?.(h.latest_win.id);
    else if (c.kind === 'shorts') setRestart((n) => n + 1);
  };
  const toFeed = () => { onClose(); navigate('/portal/community'); };

  return (
    <div className="cn-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cn-now-dlg" role="dialog" aria-modal="true" aria-label="Colaberry Now" data-testid="cm-cnow">
        <ColaberryTv videos={tv.videos} canManage={tv.can_manage} onManage={() => setManaging(true)} restart={restart} onPlaying={setPlaying} />
        <NowStream me={me} compose={compose}onClose={onClose} onFeed={toFeed} nameOf={nameOf} onChip={onChip} escapeRef={escapeRef} openPostRef={openPostRef} />
        {managing && tv.can_manage && <TvManager playingId={playing} onChanged={refreshTv} onClose={() => setManaging(false)} />}
      </div>
    </div>
  );
}
