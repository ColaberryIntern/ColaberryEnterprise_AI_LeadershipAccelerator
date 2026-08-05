/**
 * TodayPlanCard — CAPE Phase 5 (design doc §11 "Card treatment", §16 Phase
 * 5). Composes AROUND the existing `TimelineCard` — a chip row above (Why
 * this / Level / Proof) and a feedback-controls row below — WITHOUT
 * modifying `TimelineCard.tsx` itself (out of scope this phase; that file is
 * already 496 lines, near CLAUDE.md's 500-line hard ceiling).
 */
import React, { useState } from 'react';
import TimelineCard, { TimelineFeedCard } from '../../../components/timeline/TimelineCard';
import { adapt } from './TodayFeedV2';
import type { TodayFeedItem } from './todayFeedApi';
import type { TodayPlanItem, TodayPlanFeedbackAction } from '../../../services/capeApi';

const SLOT_LABELS: Record<TodayPlanItem['slot'], string> = {
  next_best: 'Next best action',
  foundation: 'Foundation',
  practice: 'Practice',
  ai_pulse: 'AI Pulse',
  review: 'Review',
};

const FEEDBACK_BUTTONS: Array<{ action: TodayPlanFeedbackAction; label: string }> = [
  { action: 'more_like_this', label: 'More like this' },
  { action: 'less_like_this', label: 'Less like this' },
  { action: 'already_know', label: 'Already know this' },
  { action: 'too_easy', label: 'Too easy' },
  { action: 'too_advanced', label: 'Too advanced' },
  { action: 'not_interested', label: 'Not interested' },
];

interface Props {
  item: TodayPlanItem;
  onOpen: (card: TimelineFeedCard) => void;
  onWorkspace: (card: TimelineFeedCard) => void;
  onComplete?: (card: TimelineFeedCard) => Promise<void> | void;
  onFeedback: (ref: string, action: TodayPlanFeedbackAction) => Promise<void>;
  onTestOut: (ref: string) => Promise<void>;
}

const TodayPlanCard: React.FC<Props> = ({ item, onOpen, onWorkspace, onComplete, onFeedback, onTestOut }) => {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const card = adapt(item as TodayFeedItem);

  const runFeedback = async (action: TodayPlanFeedbackAction) => {
    if (busyAction) return; // double-click guard — mirrors TodayShell.tsx's existing `busy` pattern
    setBusyAction(action);
    try { await onFeedback(item.ref, action); } finally { setBusyAction(null); }
  };
  const runTestOut = async () => {
    if (busyAction) return;
    setBusyAction('test_out');
    try { await onTestOut(item.ref); } finally { setBusyAction(null); }
  };

  return (
    <div className="today-plan-card" style={{ marginBottom: 14 }}>
      <div className="d-flex align-items-center gap-2 flex-wrap mb-2" aria-label={`${SLOT_LABELS[item.slot]} card treatment`}>
        <span className="badge rounded-pill text-bg-light border" title="Why this card is recommended">{item.chips.why_this}</span>
        <span className="badge rounded-pill text-bg-secondary" title="Difficulty level for you">{item.chips.level}</span>
        <span className="badge rounded-pill text-bg-info" title="What kind of proof this activity produces">{item.chips.proof}</span>
      </div>
      <TimelineCard card={card} onOpen={onOpen} onWorkspace={onWorkspace} onComplete={onComplete} />
      <div className="d-flex flex-wrap gap-2 mt-2" role="group" aria-label="Feedback controls">
        {FEEDBACK_BUTTONS.map((b) => (
          <button
            key={b.action}
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={busyAction !== null}
            onClick={() => void runFeedback(b.action)}
          >
            {busyAction === b.action ? '…' : b.label}
          </button>
        ))}
        <button
          type="button"
          className="btn btn-sm btn-outline-primary"
          disabled={busyAction !== null}
          onClick={() => void runTestOut()}
        >
          {busyAction === 'test_out' ? '…' : 'Test out'}
        </button>
      </div>
    </div>
  );
};

export default TodayPlanCard;
