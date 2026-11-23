// sessionCompanionState — what one signed-in student's phone shows right now,
// mirroring the instructor's deck. Split out of sessionLiveStateService.ts on
// 2026-11-23 (that file had reached the 500-line ceiling) when the companion view
// gained the per-slide follow-along card.
//
// The student-facing read WHITELISTS its fields: the broadcast row also carries
// instructor-only notes (presenter_tip, presenter_preface, next_title), and none
// of those may ever be copied here.
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { getBroadcast, BroadcastQuestion, BroadcastPrompt, PulseState } from './sessionLiveStateService';
import type { FollowAlong } from './liveFollowAlong';

export interface CompanionState {
  phase: 'status' | 'question' | 'broadcast' | 'prompt';
  title: string;
  question: (BroadcastQuestion & { my_choice: number | null }) | null;
  broadcast_prompts?: string[];
  prompt?: BroadcastPrompt | null;
  /** The slide's plain-words follow-along card, in every phase. Null when the deck sends none. */
  follow: FollowAlong | null;
  my_pulse: PulseState | null;
}

/** What one student's phone should show right now, mirroring the deck. */
export async function getCompanionState(sessionId: string, enrollmentId: string): Promise<CompanionState> {
  const bc = await getBroadcast(sessionId);

  const [pulseRow] = await sequelize.query<{ state: string }>(
    `SELECT state FROM session_pulse WHERE session_id = :sid AND enrollment_id = :eid`,
    { replacements: { sid: sessionId, eid: enrollmentId }, type: QueryTypes.SELECT },
  );
  const my_pulse = (pulseRow?.state as PulseState) || null;
  const follow = bc?.follow || null;

  if (!bc || bc.phase === 'status') {
    return { phase: 'status', title: bc?.title || '', question: null, follow, my_pulse };
  }
  if (bc.phase === 'broadcast') {
    return { phase: 'broadcast', title: bc.title, question: null, broadcast_prompts: bc.broadcast_prompts, follow, my_pulse };
  }
  if (bc.phase === 'prompt') {
    return { phase: 'prompt', title: bc.title, question: null, prompt: bc.prompt || null, follow, my_pulse };
  }
  // question phase — include this student's own answer
  let my_choice: number | null = null;
  if (bc.question) {
    const [ansRow] = await sequelize.query<{ choice: number }>(
      `SELECT choice FROM session_poll_responses WHERE session_id = :sid AND enrollment_id = :eid AND poll_key = :key`,
      { replacements: { sid: sessionId, eid: enrollmentId, key: bc.question.key }, type: QueryTypes.SELECT },
    );
    my_choice = ansRow ? ansRow.choice : null;
  }
  return {
    phase: 'question', title: bc.title,
    question: bc.question ? { ...bc.question, my_choice } : null,
    follow,
    my_pulse,
  };
}
