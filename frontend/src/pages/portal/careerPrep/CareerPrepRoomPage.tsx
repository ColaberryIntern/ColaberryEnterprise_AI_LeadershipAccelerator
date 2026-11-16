import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CareerPrepRoom, type RoomTab } from '../../../components/careerPrep/CareerPrepRoom';
import { CareerPrepFloor } from '../../../components/careerPrep/CareerPrepFloor';
import { CoraChat } from '../../../components/careerPrep/CoraChat';
import { InterviewForm } from '../../../components/careerPrep/InterviewForm';
import { useCareerPrep } from '../../../components/careerPrep/useCareerPrep';
import { ProgressDashboard } from '../../../components/careerPrep/ProgressDashboard';
import { useCareerPrepFlag } from '../../../components/careerPrep/careerPrepFlag';
import { careerPrepFloorNum } from '../../../components/careerPrep/careerPrepFloorNum';
import { careerPrepDoorsFor } from '../../../components/campus/hq/careerPrepDoors';
import type { HqFloor } from '../../../components/campus/hq/hqModel';

/**
 * /portal/career/room (Career Prep v27, CP3.1 + CP3.3). The room over the Career Prep floor: on a direct
 * load the floor is drawn behind it, so closing is instant. Career Prep off for this student (or unknown)
 * = the page does not exist for them. `?anchor=<interviewId>` preselects an interview. The tabs are
 * filled by CP3.5 (progress) and CP4 (plan, session); until then each says plainly what is coming.
 */
export interface CareerPrepRoomPageProps {
  tabs?: Partial<Record<RoomTab, React.ReactNode>>;
}

const Pending = ({ text }: { text: string }) => <p className="cp-pending">{text}</p>;

function Room({ tabs, onClose }: { tabs?: CareerPrepRoomPageProps['tabs']; onClose: () => void }): React.ReactElement {
  const [params] = useSearchParams();
  const [tab, setTab] = useState<RoomTab>('progress');
  const room = useCareerPrep(params.get('anchor'), { onTab: setTab });
  const anchor = room.dashboard?.interviews.find((i) => i.id === room.anchorId) ?? null;
  return (
    <CareerPrepRoom
      anchor={anchor}
      onChangeAnchor={room.changeAnchor}
      onClose={onClose}
      tab={tab}
      onTabChange={setTab}
      cora={(
        <>
          {room.error && <p role="alert" className="cp-form-problem">{room.error}</p>}
          <CoraChat log={room.log} busy={room.busy} onPick={room.pick} onAsk={room.ask} />
          {room.form && <InterviewForm form={room.form} busy={room.busy} onSubmit={(b) => { void room.submitForm(b); }} onCancel={room.cancelForm} />}
        </>
      )}
      tabs={{
        progress: tabs?.progress ?? (room.dashboard
          ? <ProgressDashboard d={room.dashboard} onAnchor={room.chooseAnchor} onSkill={(s) => room.focusSkill(s.key)} />
          : <Pending text="Loading your progress..." />),
        plan: tabs?.plan ?? <Pending text="Pick a plan with Cora and it appears here." />,
        session: tabs?.session ?? <Pending text="Start a session from your plan." />,
      }}
    />
  );
}

const CareerPrepRoomPage: React.FC<CareerPrepRoomPageProps> = ({ tabs }) => {
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
      <Room tabs={tabs} onClose={close} />
    </>
  );
};

export default CareerPrepRoomPage;
