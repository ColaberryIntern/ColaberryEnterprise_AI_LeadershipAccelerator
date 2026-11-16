import React, { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CareerPrepRoom } from '../../../components/careerPrep/CareerPrepRoom';
import { CareerPrepFloor } from '../../../components/careerPrep/CareerPrepFloor';
import { useCareerPrepFlag } from '../../../components/careerPrep/careerPrepFlag';
import { careerPrepFloorNum } from '../../../components/careerPrep/careerPrepFloorNum';
import { careerPrepDoorsFor } from '../../../components/campus/hq/careerPrepDoors';
import type { HqFloor } from '../../../components/campus/hq/hqModel';

/**
 * /portal/career/room (Career Prep v27, CP3.1). The room over the Career Prep floor: on a direct load
 * the floor is drawn behind it, so closing is instant and lands on the floor. Career Prep off for this
 * student (or unknown) = the page does not exist for them. The Cora column and the three tabs are
 * filled by CP3.2 to CP4; until then each says plainly what is coming.
 */
export interface CareerPrepRoomPageProps {
  cora?: React.ReactNode;
  tabs?: Partial<Record<'progress' | 'plan' | 'session', React.ReactNode>>;
}

const Pending = ({ text }: { text: string }) => <p className="cp-pending">{text}</p>;

const CareerPrepRoomPage: React.FC<CareerPrepRoomPageProps> = ({ cora, tabs }) => {
  const on = useCareerPrepFlag();
  const navigate = useNavigate();
  const close = useCallback(() => navigate('/portal'), [navigate]);
  const floor = useMemo<HqFloor>(() => {
    const rooms = careerPrepDoorsFor('member', { on: true });
    return { key: 'career-prep', num: careerPrepFloorNum() ?? '', label: 'Career Prep', rooms, openCount: rooms.length, access: 'all', own: true };
  }, []);

  if (on === null) return <p className="text-muted p-3" aria-live="polite">Loading Career Prep...</p>;
  if (!on) return <div className="p-4" data-testid="cp-not-found"><h1 className="h4">Page not found</h1><p>This page does not exist or is not open for your account.</p></div>;

  return (
    <>
      <CareerPrepFloor f={floor} onElevator={close} onLobby={close} />
      <CareerPrepRoom
        anchor={null}
        onChangeAnchor={() => undefined}
        onClose={close}
        cora={cora ?? <Pending text="Cora is getting ready." />}
        tabs={{
          progress: tabs?.progress ?? <Pending text="Your progress appears here as you practice." />,
          plan: tabs?.plan ?? <Pending text="Pick a plan with Cora and it appears here." />,
          session: tabs?.session ?? <Pending text="Start a session from your plan." />,
        }}
      />
    </>
  );
};

export default CareerPrepRoomPage;
