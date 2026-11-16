import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CareerPrepRoom, type RoomTab } from '../../../components/careerPrep/CareerPrepRoom';
import { CareerPrepFloor } from '../../../components/careerPrep/CareerPrepFloor';
import { CoraChat } from '../../../components/careerPrep/CoraChat';
import { InterviewForm } from '../../../components/careerPrep/InterviewForm';
import { useCareerPrep } from '../../../components/careerPrep/useCareerPrep';
import { ProgressDashboard } from '../../../components/careerPrep/ProgressDashboard';
import { PlanView } from '../../../components/careerPrep/PlanView';
import { SessionRunner } from '../../../components/careerPrep/SessionRunner';
import { useRoomSession } from '../../../components/careerPrep/useRoomSession';
import { useCareerPrepFlag } from '../../../components/careerPrep/careerPrepFlag';
import { careerPrepFloorNum } from '../../../components/careerPrep/careerPrepFloorNum';
import { careerPrepDoorsFor } from '../../../components/campus/hq/careerPrepDoors';
import type { HqFloor } from '../../../components/campus/hq/hqModel';

/**
 * /portal/career/room (Career Prep v27, CP3.1 + CP3.3 + CP4.5). The room over the Career Prep floor: on a direct
 * load the floor is drawn behind it, so closing is instant. Career Prep off for this student (or unknown)
 * = the page does not exist for them. `?anchor=<interviewId>` preselects an interview. Tabs: Your progress
 * (CP3.5), Your plan (CP4.2) and the Session (CP4.4), which ends in the recap (CP4.5).
 */
export interface CareerPrepRoomPageProps {
  tabs?: Partial<Record<RoomTab, React.ReactNode>>;
}

const Pending = ({ text }: { text: string }) => <p className="cp-pending">{text}</p>;

function Room({ tabs, onClose }: { tabs?: CareerPrepRoomPageProps['tabs']; onClose: () => void }): React.ReactElement {
  const [params] = useSearchParams();
  const [tab, setTab] = useState<RoomTab>('progress');
  // Cora's "Start today's session" card opens the Session tab and starts it; "Same time tomorrow" needs the
  // session's id. The session hook is made after the room's, so both are reached through a ref.
  const live = useRef<{ start: () => void; sessionId: () => string | null }>({ start: () => undefined, sessionId: () => null });
  const room = useCareerPrep(params.get('anchor'), { onTab: setTab, onStart: () => { setTab('session'); live.current.start(); }, sessionId: () => live.current.sessionId() });
  const anchor = room.dashboard?.interviews.find((i) => i.id === room.anchorId) ?? null;
  const { session, newKeys, sessionId } = useRoomSession(room);
  live.current = { start: () => { if (session.state.status === 'idle') void session.start(); }, sessionId };
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
          ? <ProgressDashboard d={room.dashboard} onAnchor={room.chooseAnchor} onSkill={(s) => room.focusSkill(s.key)} newKeys={newKeys} />
          : <Pending text="Loading your progress..." />),
        plan: tabs?.plan ?? <PlanView plan={room.plan?.plan ?? null} company={anchor?.company} skillLabels={Object.fromEntries((room.dashboard?.skills ?? []).map((s) => [s.key, s.label]))} onStart={() => setTab('session')} />,
        session: tabs?.session ?? <SessionRunner s={session} type={anchor?.type ?? 'recruiter'} questions={anchor?.questions} hasPlan={!!room.plan} onTab={setTab} />,
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
