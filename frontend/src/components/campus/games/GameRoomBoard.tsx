import React from 'react';
import type { Board } from './gameRoomApi';

/** This week's cohort leaderboard for one game (Colaberry Campus C10): top 10, your row marked. Read-only display. */
export default function GameRoomBoard({ title, board, error }: { title: string; board: Board | null; error: boolean }): React.ReactElement {
  return (
    <aside className="te-card gr-board" aria-label="Leaderboard this week">
      <h2 className="gr-board-h">This week · {title}</h2>
      {error && <p className="gr-muted">The leaderboard is not available right now.</p>}
      {board && board.rows.length === 0 && <p className="gr-muted">No scores yet this week.</p>}
      {board && board.rows.length > 0 && (
        <ol className="gr-rows" data-testid="gr-board">
          {board.rows.slice(0, 10).map((r, i) => (
            <li key={`${r.rank}-${r.name}-${i}`} className={r.you ? 'is-you' : ''}>
              <span className="gr-rank">{r.rank}</span><span className="gr-name">{r.you ? `${r.name} (you)` : r.name}</span><span className="gr-score">{r.score}</span>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
