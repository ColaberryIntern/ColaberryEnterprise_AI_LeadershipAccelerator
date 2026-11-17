import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
// CareerPrepFloor BEFORE CareerPrepRoom: the HQ building's CSS order (hq.css, careerPrepFloor.css, then levelTrail.css
// via the room). The other order is a mini-css-extract "Conflicting order" warning, which fails the CI build.
import { CareerPrepFloor } from '../../../components/careerPrep/CareerPrepFloor';
import { CareerPrepRoom, type RoomTab } from '../../../components/careerPrep/CareerPrepRoom';
import { CoraChat } from '../../../components/careerPrep/CoraChat';
import { InterviewForm } from '../../../components/careerPrep/InterviewForm';
import { useCareerPrep } from '../../../components/careerPrep/useCareerPrep';
import { ProgressDashboard } from '../../../components/careerPrep/ProgressDashboard';
import { PlanView } from '../../../components/careerPrep/PlanView';
import { SessionRunner } from '../../../components/careerPrep/SessionRunner';
import { useRoomSession } from '../../../components/careerPrep/useRoomSession';
import { useSheet, type SheetApi } from '../../../components/careerPrep/useSheet';
import { PageSheet } from '../../../components/careerPrep/PageSheet';
import { SheetBody } from '../../../components/careerPrep/SheetBodies';
import { JumpBar } from '../../../components/careerPrep/JumpBar';
import { RoomRail } from '../../../components/careerPrep/RoomRail';
import type { PrepInterview } from '../../../components/careerPrep/careerPrepApi';
import type { JumpItem } from '../../../components/careerPrep/logic/sheets';
import { useCareerPrepFlag } from '../../../components/careerPrep/careerPrepFlag';
import { useCareerPrepSummary } from '../../../components/careerPrep/useCareerPrepSummary';
import { CAREER_FLOOR_PATH, NotOpen, useCareerPrepFloorModel } from './CareerPrepFloorPage';

/**
 * /portal/career/room (Career Prep v27, CP3.1 + CP3.3 + CP4.5). The room over the Career Prep floor: on a direct
 * load the floor is drawn behind it, so closing is instant. Career Prep off for this student (or unknown)
 * = the page does not exist for them. `?anchor=<interviewId>` preselects an interview. Tabs: Your progress
 * (CP3.5), Your plan (CP4.2) and the Session (CP4.4), which ends in the recap (CP4.5). The getting-hired pages
 * open as sheets over the room from the URL hash (#interviews, #inbox, #offers, #applications, #resume), from
 * Cora and from the jump bar (/ or Ctrl+K) (CP4.6).
 */
export interface CareerPrepRoomPageProps {
  tabs?: Partial<Record<RoomTab, React.ReactNode>>;
}

const Pending = ({ text }: { text: string }) => <p className="cp-pending">{text}</p>;

/** The jump bar and the open sheet (CP4.6). */
function RoomSheets({ sheets, prep, onTab, onStart }: { sheets: SheetApi; prep: PrepInterview[]; onTab: (t: RoomTab) => void; onStart: () => void }): React.ReactElement {
  const go = (i: JumpItem) => {
    if (i.go === 'sheet') { sheets.open(i.sheet); return; }
    sheets.close();
    if (i.go === 'tab') onTab(i.tab); else onStart();
  };
  return (
    <>
      <JumpBar onGo={go} />
      {sheets.sheet && <PageSheet sheet={sheets.sheet} onClose={sheets.close} onSwitch={sheets.open}><SheetBody sheet={sheets.sheet} prep={prep} /></PageSheet>}
    </>
  );
}

function Room({ tabs, onClose }: { tabs?: CareerPrepRoomPageProps['tabs']; onClose: () => void }): React.ReactElement {
  const [params] = useSearchParams();
  const [tab, setTab] = useState<RoomTab>('progress');
  // Cora's "Start today's session" card opens the Session tab and starts it; "Same time tomorrow" needs the
  // session's id. The session hook is made after the room's, so both are reached through a ref.
  const live = useRef<{ start: () => void; sessionId: () => string | null }>({ start: () => undefined, sessionId: () => null });
  const sheets = useSheet();
  const room = useCareerPrep(params.get('anchor'), { onTab: setTab, onStart: () => { setTab('session'); live.current.start(); }, sessionId: () => live.current.sessionId(), onSheet: sheets.open });
  const anchor = room.dashboard?.interviews.find((i) => i.id === room.anchorId) ?? null;
  const { session, newKeys, sessionId } = useRoomSession(room);
  live.current = { start: () => { if (session.state.status === 'idle') void session.start(); }, sessionId };
  const start = () => { setTab('session'); live.current.start(); };
  // The Try frame shows the student's initial while the camera is off (the summary is cached for the floor already).
  const firstName = useCareerPrepSummary()?.firstName;
  const initials = firstName ? firstName.trim().charAt(0).toUpperCase() : undefined;
  // R1.1: a skill picked in the left rail opens Your progress at that skill (outlined, scrolled to), never a plan.
  const [focusKey, setFocusKey] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!focusKey) return undefined;
    const t = window.setTimeout(() => setFocusKey(undefined), 2500);
    return () => window.clearTimeout(t);
  }, [focusKey]);
  const showSkill = (key: string) => { setTab('progress'); setFocusKey(undefined); window.setTimeout(() => setFocusKey(key), 0); };
  return (
    <CareerPrepRoom
      anchor={anchor}
      onChangeAnchor={room.changeAnchor}
      onClose={onClose}
      tab={tab}
      onTabChange={setTab}
      rail={<RoomRail tab={tab} onTab={setTab} onSheet={sheets.open} dashboard={room.dashboard} anchor={anchor} onSkill={showSkill} />}
      cora={(
        <>
          {room.error && <p role="alert" className="cp-form-problem">{room.error}</p>}
          <CoraChat log={room.log} busy={room.busy} onPick={room.pick} onAsk={room.ask}>
            {room.form && <InterviewForm form={room.form} busy={room.busy} onSubmit={(b) => { void room.submitForm(b); }} onCancel={room.cancelForm} />}
          </CoraChat>
        </>
      )}
      tabs={{
        progress: tabs?.progress ?? (room.dashboard
          ? <ProgressDashboard d={room.dashboard} onAnchor={room.chooseAnchor} onSkill={(s) => room.focusSkill(s.key)} newKeys={newKeys} focusKey={focusKey} planBusy={room.planBusy} />
          : <Pending text="Loading your progress..." />),
        plan: tabs?.plan ?? <PlanView plan={room.plan?.plan ?? null} focusSkill={room.plan?.focusSkill} company={anchor?.company} skillLabels={Object.fromEntries((room.dashboard?.skills ?? []).map((s) => [s.key, s.label]))} onStart={() => setTab('session')} />,
        session: tabs?.session ?? <SessionRunner s={session} type={anchor?.type ?? 'recruiter'} questions={anchor?.questions} hasPlan={!!room.plan} onTab={setTab} initials={initials} />,
      }}
      overlay={<RoomSheets sheets={sheets} prep={room.dashboard?.interviews ?? []} onTab={setTab} onStart={start} />}
    />
  );
}

const CareerPrepRoomPage: React.FC<CareerPrepRoomPageProps> = ({ tabs }) => {
  const on = useCareerPrepFlag();
  const navigate = useNavigate();
  // CP5.2: closing the room (‹ Floor n or Esc) lands on the Career Prep floor, with focus on its door.
  const close = useCallback(() => navigate(CAREER_FLOOR_PATH, { state: { from: 'room' } }), [navigate]);
  const toCampus = useCallback(() => navigate('/portal'), [navigate]);
  const floor = useCareerPrepFloorModel();

  if (on === null) return <p className="text-muted p-3" aria-live="polite">Loading Career Prep...</p>;
  if (!on) return <NotOpen />;

  return (
    <>
      <CareerPrepFloor f={floor} onElevator={toCampus} onLobby={toCampus} />
      <Room tabs={tabs} onClose={close} />
    </>
  );
};

export default CareerPrepRoomPage;
