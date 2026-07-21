import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchRooms, fetchRoomsHome, RoomListItem, RoomsHome } from '../../../services/roomsApi';
import { fmtCentralDateTime } from './shellUtils';

// "Happening now" — a Today-sidebar card that makes the community feel alive:
// rooms people are in right now (live "here" counts) + live/upcoming sessions.
// Self-hides when nothing is live and no-ops if the Rooms feature is off (API 404).
const CAT_EMOJI: Record<string, string> = {
  start_here: '👋', your_cohort: '🎓', build_together: '🛠️', career_cert: '💼',
  demos_events: '🎤', social: '🎉', live_now: '🔴', private_rooms: '🔒',
};

const dot = { width: 7, height: 7, borderRadius: '50%', background: 'var(--leaf)', display: 'inline-block', flex: 'none' } as React.CSSProperties;
const row = { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', textDecoration: 'none', color: 'inherit', borderTop: '1px solid var(--border-subtle)' } as React.CSSProperties;
const nameStyle = { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13.5, fontWeight: 600, color: 'var(--strong)' } as React.CSSProperties;

const CommunityPulse: React.FC = () => {
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [home, setHome] = useState<RoomsHome | null>(null);

  useEffect(() => {
    const load = () => {
      fetchRooms().then(setRooms).catch(() => {});
      fetchRoomsHome().then(setHome).catch(() => {});
    };
    load();
    const id = window.setInterval(load, 20000);
    return () => window.clearInterval(id);
  }, []);

  const liveRooms = rooms.filter((r) => r.visibility === 'full' && (r.here_count ?? 0) > 0).slice(0, 4);
  const happening = home?.happening_now || [];
  const upNext = home?.up_next || [];
  if (liveRooms.length === 0 && happening.length === 0 && upNext.length === 0) return null;

  return (
    <div className="te-card te-scard">
      <h3><span style={dot} /> Live in the community</h3>

      {liveRooms.map(({ room, here_count }) => (
        <Link key={room.id} to={`/portal/rooms/${room.id}`} style={row}>
          <span style={{ fontSize: 18 }}>{room.metadata?.emoji || CAT_EMOJI[room.category] || '💬'}</span>
          <span style={nameStyle}>{room.name}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--leaf-text)' }}><span style={dot} />{here_count}</span>
        </Link>
      ))}

      {happening.map((b) => (
        <Link key={b.id} to="/portal/rooms" style={row}>
          <span style={{ fontSize: 18 }}>{b.emoji || '🔴'}</span>
          <span style={nameStyle}>{b.title}</span>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: '#fff', background: 'var(--cherry)', padding: '2px 7px', borderRadius: 999 }}>LIVE</span>
        </Link>
      ))}

      {liveRooms.length === 0 && happening.length === 0 && upNext.slice(0, 2).map((b) => (
        <Link key={b.id} to="/portal/rooms" style={row}>
          <span style={{ fontSize: 18 }}>{b.emoji || '📅'}</span>
          <span style={nameStyle}>{b.title}</span>
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{b.start_at ? fmtCentralDateTime(b.start_at) : ''}</span>
        </Link>
      ))}

      <Link className="te-btn ghost sm" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} to="/portal/rooms">Open Rooms →</Link>
    </div>
  );
};

export default CommunityPulse;
