import React, { useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
// CareerPrepFloor BEFORE LevelTrail: the same CSS order as the HQ building (hq.css, careerPrepFloor.css, levelTrail.css).
// The other order is a mini-css-extract "Conflicting order" warning, which fails the CI build (warnings are errors there).
import { CareerPrepFloor } from '../../../components/careerPrep/CareerPrepFloor';
import { LevelTrail } from '../../../components/careerPrep/LevelTrail';
import { useCareerPrepFlag } from '../../../components/careerPrep/careerPrepFlag';
import { careerPrepFloorNum } from '../../../components/careerPrep/careerPrepFloorNum';
import { careerPrepDoorsFor } from '../../../components/campus/hq/careerPrepDoors';
import type { HqFloor } from '../../../components/campus/hq/hqModel';

/**
 * /portal/career (Career Prep v27, CP5.2): the deep link to the Career Prep floor (kit P1 section 6), and where the
 * room closes to (‹ Floor n, or Esc): focus then lands on the floor's door, so the student is back where they walked
 * in. Career Prep off for this student (or unknown) = the page does not exist for them. The elevator and the lobby
 * buttons go back to the campus.
 */
export const CAREER_FLOOR_PATH = '/portal/career';

/** The student's Career Prep floor: one door, numbered from the built floors (never a constant). */
export function useCareerPrepFloorModel(): HqFloor {
  return useMemo<HqFloor>(() => {
    const rooms = careerPrepDoorsFor('member', { on: true });
    return { key: 'career-prep', num: careerPrepFloorNum() ?? '', label: 'Career Prep', rooms, openCount: rooms.length, access: 'all', own: true };
  }, []);
}

export function NotOpen(): React.ReactElement {
  return <div className="p-4" data-testid="cp-not-found"><h1 className="h4">Page not found</h1><p>This page does not exist or is not open for your account.</p></div>;
}

const CareerPrepFloorPage: React.FC = () => {
  const on = useCareerPrepFlag();
  const navigate = useNavigate();
  const loc = useLocation();
  const floor = useCareerPrepFloorModel();
  const fromRoom = (loc.state as { from?: string } | null)?.from === 'room';
  useEffect(() => {
    if (on && fromRoom) document.querySelector<HTMLElement>('[data-testid="cp-door"]')?.focus();
  }, [on, fromRoom]);
  if (on === null) return <p className="text-muted p-3" aria-live="polite">Loading Career Prep...</p>;
  if (!on) return <NotOpen />;
  return (
    <div className="cp-floor-page" data-testid="cp-floor-page">
      <LevelTrail step={2} floorNum={floor.num || null} />
      {/* The tower's frame: the floor is laid out to fill a .cm-hq scene, as it does inside the HQ building. */}
      <div className="cp-floor-stage">
        <div className="cm-hq" data-scene="floor">
          <CareerPrepFloor f={floor} onElevator={() => navigate('/portal')} onLobby={() => navigate('/portal')} />
        </div>
      </div>
    </div>
  );
};

export default CareerPrepFloorPage;
