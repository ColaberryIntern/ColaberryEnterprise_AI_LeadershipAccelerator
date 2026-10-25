import React, { useState } from 'react';
import PortalShell from '../today/PortalShell';
import CabinetHost from '../../../components/campus/games/CabinetModal';
import Leaderboards from '../../../components/campus/games/Leaderboards';
import { GameRoomHero, SideCards, GameGrid, RecentHighs, RoomRail, useGameRoomData } from '../../../components/campus/games/GameRoomSections';
import { challengeFriend } from '../../../components/campus/games/gameRoomApi';
import { gameInfo } from '../../../components/campus/games/gameCatalog';
import type { GameId } from '../../../components/campus/games/engine/gameRules';
import '../../../components/campus/games/gameRoom.css';
import '../../../components/campus/games/cabinet.css';
import '../../../components/campus/games/gameRoomPage.css';
import { useCampus } from '../../../components/campus/CampusContext';
import { CAMPUS_BUILDINGS, buildingName } from '../../../components/campus/campusMap';

// C11: the page's name follows Workplace names, like every other campus surface (Game Room / Break Room).
const ARCADE = CAMPUS_BUILDINGS.find((b) => b.id === 'arcade')!;

/**
 * The Game Room (Campus v8 G1, Basecamp C34) at /portal/game-room, laid out like the other campus pages: the kicker, title and lead;
 * the hero (break left today and the featured game); Your week and Champions this week; Pick a game (five cards); Leaderboards; Recent
 * highs; and a side column with Playing now and Challenge a friend. Every Play opens the cabinet modal (CabinetModal), which keeps the
 * server-timed 15 minutes. Not behind PageGate (the arcade has no gate); the Game Room API answers only for campus pilot learners, and
 * the page says so for everyone else. Games never change learning points.
 */
export default function GameRoomPage(): React.ReactElement {
  const roomName = buildingName(ARCADE, useCampus().settings.workplaceNames);
  const d = useGameRoomData(true);
  const [note, setNote] = useState('');
  const pilotOff = d.error;
  const challenge = async (to: string, name: string, game: GameId) => {
    try { const r = await challengeFriend(to, game, d.bests[game] ?? 0); setNote(r.sent ? `Challenge sent to ${name} in ${gameInfo(game).name}.` : `You already challenged ${name} in ${gameInfo(game).name} today.`); }
    catch { setNote('That challenge could not be sent.'); }
  };
  return (
    <PortalShell>
      <div className="te-page-h gr-page-h">
        <div className="crumb">Take a real break</div>
        <h1>{roomName}</h1>
        <div className="sub">Five quick games, fifteen minutes a day. Your break resets at midnight Central, and games never change your learning points.</div>
      </div>
      {pilotOff ? (
        <section className="te-card gr-note" data-testid="gr-pilot-off"><p>The {roomName} opens with the campus.</p></section>
      ) : (
        <div className="gr-page">
          <div className="gr-main-col">
            <GameRoomHero d={d} />
            <SideCards d={d} />
            <GameGrid d={d} />
            <Leaderboards />
            <RecentHighs d={d} onChallenge={(to, name, game) => { void challenge(to, name, game); }} />
            {note && <p className="gr-muted" role="status" data-testid="gr-note">{note}</p>}
          </div>
          <RoomRail d={d} />
        </div>
      )}
      <CabinetHost />
    </PortalShell>
  );
}
