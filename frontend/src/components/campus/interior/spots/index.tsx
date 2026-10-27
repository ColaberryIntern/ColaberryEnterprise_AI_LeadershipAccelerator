import React from 'react';
import type { SpotKind } from '../roomSpots';
import DeskSpot from './DeskSpot';
import SeatSpot from './SeatSpot';
import CarrelSpot from './CarrelSpot';
import BoothSpot from './BoothSpot';
import CabinetSpot from './CabinetSpot';
import MeetSpot from './MeetSpot';
import CounterSpot from './CounterSpot';
import PlannerSpot from './PlannerSpot';

/** The art for a spot kind (v6 D1); `name` is the learner's first name in caps for the name card (the cabinet and the meeting
 *  table carry none). */
export function SpotArt({ kind, name }: { kind: SpotKind; name: string }): React.ReactElement {
  switch (kind) {
    case 'desk': return <DeskSpot name={name} />;
    case 'seat': return <SeatSpot name={name} />;
    case 'carrel': return <CarrelSpot name={name} />;
    case 'booth': return <BoothSpot name={name} />;
    case 'cabinet': return <CabinetSpot />;
    case 'counter': return <CounterSpot />;
    case 'planner': return <PlannerSpot name={name} />;
    default: return <MeetSpot />;
  }
}
