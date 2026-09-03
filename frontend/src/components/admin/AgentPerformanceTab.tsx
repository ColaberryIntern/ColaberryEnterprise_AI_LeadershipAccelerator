import React, { useEffect, useState, useCallback } from 'react';
import { SectionCard, StatusBadge } from './shell';
import { timeAgo } from './shell/trust';
import { AgentGoal, GoalMetricKey, GoalComparison, listGoals, createGoal, archiveGoal } from '../../services/agentGoalApi';
import { AgentOneOnOne, listOneOnOnes, createOneOnOne, completeOneOnOne } from '../../services/agentOneOnOneApi';

// AI Agent Dashboard redesign, Checkpoint D, Performance slice (2026-09-02)
// — real goals (now honestly UNMEASURED rather than vacuously "met" when
// there's no underlying data — see agentGoalService.ts's own fix, landed
// this same checkpoint after being caught live) and real 1:1 check-ins
// (only agenda + outcome notes exist today — no separate wins/challenges/
// mistakes/lessons/commitments fields, so none are fabricated here).

interface Props {
  agentId: string;
}

const METRIC_KEYS: GoalMetricKey[] = ['monthly_cost_usd', 'open_ticket_count'];
const COMPARISONS: GoalComparison[] = ['at_most', 'at_least'];

function metricLabel(key: GoalMetricKey): string {
  return key === 'monthly_cost_usd' ? 'Monthly cost (USD)' : 'Open ticket count';
}

function goalStatusBadge(goal: AgentGoal) {
  if (goal.met === null) return <StatusBadge label="Unmeasured" tone="neutral" icon="question-line" />;
  return goal.met ? <StatusBadge label="Met" tone="success" /> : <StatusBadge label="Not met" tone="warning" />;
}

export default function AgentPerformanceTab({ agentId }: Props) {
  const [goals, setGoals] = useState<AgentGoal[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [goalsError, setGoalsError] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const [goalMetric, setGoalMetric] = useState<GoalMetricKey>('monthly_cost_usd');
  const [goalComparison, setGoalComparison] = useState<GoalComparison>('at_most');
  const [goalTarget, setGoalTarget] = useState(50);
  const [creatingGoal, setCreatingGoal] = useState(false);
  const [goalCreateError, setGoalCreateError] = useState<string | null>(null);

  const [oneOnOnes, setOneOnOnes] = useState<AgentOneOnOne[]>([]);
  const [oneOnOnesLoading, setOneOnOnesLoading] = useState(true);
  const [oneOnOnesError, setOneOnOnesError] = useState<string | null>(null);
  const [agendaText, setAgendaText] = useState('');
  const [creatingOneOnOne, setCreatingOneOnOne] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [outcomeDrafts, setOutcomeDrafts] = useState<Record<string, string>>({});

  const fetchGoals = useCallback(async () => {
    setGoalsLoading(true);
    setGoalsError(null);
    try {
      setGoals(await listGoals(agentId));
    } catch (err: any) {
      setGoalsError(err?.response?.data?.error || 'Failed to load goals');
    } finally {
      setGoalsLoading(false);
    }
  }, [agentId]);

  const fetchOneOnOnes = useCallback(async () => {
    setOneOnOnesLoading(true);
    setOneOnOnesError(null);
    try {
      setOneOnOnes(await listOneOnOnes(agentId));
    } catch (err: any) {
      setOneOnOnesError(err?.response?.data?.error || 'Failed to load 1:1 check-ins');
    } finally {
      setOneOnOnesLoading(false);
    }
  }, [agentId]);

  useEffect(() => { fetchGoals(); }, [fetchGoals]);
  useEffect(() => { fetchOneOnOnes(); }, [fetchOneOnOnes]);

  const handleCreateGoal = useCallback(async () => {
    setCreatingGoal(true);
    setGoalCreateError(null);
    try {
      await createGoal(agentId, { metricKey: goalMetric, comparison: goalComparison, targetValue: goalTarget });
      await fetchGoals();
    } catch (err: any) {
      setGoalCreateError(err?.response?.data?.error || 'Failed to create goal');
    } finally {
      setCreatingGoal(false);
    }
  }, [agentId, goalMetric, goalComparison, goalTarget, fetchGoals]);

  const handleArchive = useCallback(async (goalId: string) => {
    setArchivingId(goalId);
    try {
      await archiveGoal(agentId, goalId);
      await fetchGoals();
    } catch (err: any) {
      setGoalsError(err?.response?.data?.error || 'Failed to archive goal');
    } finally {
      setArchivingId(null);
    }
  }, [agentId, fetchGoals]);

  const handleScheduleOneOnOne = useCallback(async () => {
    if (!agendaText.trim()) return;
    setCreatingOneOnOne(true);
    try {
      await createOneOnOne(agentId, agendaText.trim());
      setAgendaText('');
      await fetchOneOnOnes();
    } catch (err: any) {
      setOneOnOnesError(err?.response?.data?.error || 'Failed to schedule 1:1');
    } finally {
      setCreatingOneOnOne(false);
    }
  }, [agentId, agendaText, fetchOneOnOnes]);

  const handleComplete = useCallback(async (id: string) => {
    const notes = (outcomeDrafts[id] || '').trim();
    if (!notes) return;
    setCompletingId(id);
    try {
      await completeOneOnOne(agentId, id, notes);
      await fetchOneOnOnes();
    } catch (err: any) {
      setOneOnOnesError(err?.response?.data?.error || 'Failed to complete 1:1');
    } finally {
      setCompletingId(null);
    }
  }, [agentId, outcomeDrafts, fetchOneOnOnes]);

  return (
    <>
      <SectionCard title="Goals" icon="flag-2-line" padded={false}>
        {goalsError && <div className="p-3"><div className="alert alert-warning py-2 mb-0 small">{goalsError}</div></div>}
        {goalsLoading && <div className="p-3 text-muted small">Loading…</div>}
        {!goalsLoading && goals.length === 0 && (
          <p className="text-muted small text-center py-4 mb-0">No goals set for this agent yet.</p>
        )}
        {!goalsLoading && goals.map((goal, i) => (
          <div key={goal.id} className={`d-flex align-items-start justify-content-between gap-2 p-3 ${i < goals.length - 1 ? 'border-bottom' : ''}`}>
            <div>
              {goalStatusBadge(goal)}
              <span className="ms-2 fw-semibold">{metricLabel(goal.metricKey)} {goal.comparison === 'at_most' ? '≤' : '≥'} {goal.targetValue}</span>
              <div className="text-muted small mt-1">
                Current: {goal.currentValue === null ? 'No underlying data to evaluate' : goal.currentValue} · Set by {goal.createdByEmail}, {timeAgo(goal.createdAt)}
              </div>
            </div>
            <button className="btn btn-outline-secondary btn-sm flex-shrink-0" disabled={archivingId === goal.id} onClick={() => handleArchive(goal.id)}>
              {archivingId === goal.id ? 'Working…' : 'Archive'}
            </button>
          </div>
        ))}

        <div className="p-3 border-top">
          {goalCreateError && <div className="alert alert-danger py-2 small">{goalCreateError}</div>}
          <div className="row g-2 align-items-end">
            <div className="col-auto">
              <label className="form-label small fw-semibold">Metric</label>
              <select className="form-select form-select-sm" value={goalMetric} onChange={(e) => setGoalMetric(e.target.value as GoalMetricKey)}>
                {METRIC_KEYS.map((k) => <option key={k} value={k}>{metricLabel(k)}</option>)}
              </select>
            </div>
            <div className="col-auto">
              <label className="form-label small fw-semibold">Comparison</label>
              <select className="form-select form-select-sm" value={goalComparison} onChange={(e) => setGoalComparison(e.target.value as GoalComparison)}>
                {COMPARISONS.map((c) => <option key={c} value={c}>{c === 'at_most' ? 'At most' : 'At least'}</option>)}
              </select>
            </div>
            <div className="col-auto">
              <label className="form-label small fw-semibold">Target</label>
              <input type="number" min={0} className="form-control form-control-sm" style={{ width: '7rem' }} value={goalTarget} onChange={(e) => setGoalTarget(Number(e.target.value))} />
            </div>
            <div className="col-auto">
              <button className="btn btn-primary btn-sm" disabled={creatingGoal} onClick={handleCreateGoal}>
                {creatingGoal ? 'Setting…' : 'Set Goal'}
              </button>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="1:1 Check-ins" icon="user-voice-line" subtitle="Only agenda and outcome notes exist today — no separate wins/challenges/lessons/commitments fields." padded={false}>
        {oneOnOnesError && <div className="p-3"><div className="alert alert-warning py-2 mb-0 small">{oneOnOnesError}</div></div>}
        {oneOnOnesLoading && <div className="p-3 text-muted small">Loading…</div>}
        {!oneOnOnesLoading && oneOnOnes.length === 0 && (
          <p className="text-muted small text-center py-4 mb-0">No 1:1 check-ins scheduled or held yet.</p>
        )}
        {!oneOnOnesLoading && oneOnOnes.map((item, i) => (
          <div key={item.id} className={`p-3 ${i < oneOnOnes.length - 1 ? 'border-bottom' : ''}`}>
            <StatusBadge label={item.status} tone={item.status === 'completed' ? 'success' : 'info'} />
            <span className="ms-2 fw-semibold">{item.agenda}</span>
            <div className="text-muted small mt-1">Set by {item.createdByEmail}, {timeAgo(item.createdAt)}{item.heldAt ? ` · Held ${timeAgo(item.heldAt)}` : ''}</div>
            {item.status === 'completed' ? (
              <p className="small mt-2 mb-0"><strong>Outcome:</strong> {item.outcomeNotes}</p>
            ) : (
              <div className="d-flex gap-2 mt-2">
                <input
                  className="form-control form-control-sm"
                  placeholder="Outcome notes to complete this 1:1…"
                  value={outcomeDrafts[item.id] || ''}
                  onChange={(e) => setOutcomeDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                />
                <button className="btn btn-outline-primary btn-sm flex-shrink-0" disabled={completingId === item.id || !(outcomeDrafts[item.id] || '').trim()} onClick={() => handleComplete(item.id)}>
                  {completingId === item.id ? 'Working…' : 'Complete'}
                </button>
              </div>
            )}
          </div>
        ))}

        <div className="p-3 border-top">
          <label className="form-label small fw-semibold">Agenda</label>
          <div className="d-flex gap-2">
            <input className="form-control form-control-sm" placeholder="What should this 1:1 cover?" value={agendaText} onChange={(e) => setAgendaText(e.target.value)} />
            <button className="btn btn-primary btn-sm flex-shrink-0" disabled={creatingOneOnOne || !agendaText.trim()} onClick={handleScheduleOneOnOne}>
              {creatingOneOnOne ? 'Scheduling…' : 'Schedule'}
            </button>
          </div>
        </div>
      </SectionCard>
    </>
  );
}
