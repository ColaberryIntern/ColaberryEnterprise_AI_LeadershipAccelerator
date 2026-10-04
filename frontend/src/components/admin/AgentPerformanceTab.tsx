import React, { useEffect, useState, useCallback } from 'react';
import { timeAgo } from './shell/trust';
import { adv2PillClass } from './agentDetailV2/adv2PillTone';
import { AgentGoal, GoalMetricKey, GoalComparison, listGoals, createGoal, archiveGoal } from '../../services/agentGoalApi';
import { AgentOneOnOne, listOneOnOnes, createOneOnOne, completeOneOnOne } from '../../services/agentOneOnOneApi';

// AI Agent Dashboard redesign, Checkpoint D, Performance slice (2026-09-02)
// — real goals (now honestly UNMEASURED rather than vacuously "met" when
// there's no underlying data — see agentGoalService.ts's own fix, landed
// this same checkpoint after being caught live) and real 1:1 check-ins
// (only agenda + outcome notes exist today — no separate wins/challenges/
// mistakes/lessons/commitments fields, so none are fabricated here).
//
// Track A2 (2026-09-22) — reflowed from SectionCard/StatusBadge/Bootstrap to
// this page's adv2-* visual language. Zero change to any API call or the
// honest null-handling above — restyle only.

interface Props {
  agentId: string;
}

const METRIC_KEYS: GoalMetricKey[] = ['monthly_cost_usd', 'open_ticket_count'];
const COMPARISONS: GoalComparison[] = ['at_most', 'at_least'];

function metricLabel(key: GoalMetricKey): string {
  return key === 'monthly_cost_usd' ? 'Monthly cost (USD)' : 'Open ticket count';
}

function goalStatusBadge(goal: AgentGoal) {
  if (goal.met === null) return <span className={adv2PillClass('neutral')}>Unmeasured</span>;
  return goal.met ? <span className={adv2PillClass('success')}>Met</span> : <span className={adv2PillClass('warning')}>Not met</span>;
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
      <div className="adv2-card" style={{ marginTop: 22 }}>
        <h2>Goals</h2>
        <div>
          {goalsError && <p className="adv2-body" style={{ color: 'var(--adv2-bad)' }}>{goalsError}</p>}
          {goalsLoading && <p className="adv2-body adv2-muted">Loading…</p>}
          {!goalsLoading && goals.length === 0 && (
            <p className="adv2-body adv2-muted">No goals set for this agent yet.</p>
          )}
          {!goalsLoading && goals.map((goal) => (
            <div key={goal.id} className="adv2-task">
              <div>
                {goalStatusBadge(goal)}
                <span style={{ marginLeft: 8, fontWeight: 600 }}>{metricLabel(goal.metricKey)} {goal.comparison === 'at_most' ? '≤' : '≥'} {goal.targetValue}</span>
                <p className="adv2-muted" style={{ marginTop: 4 }}>
                  Current: {goal.currentValue === null ? 'No underlying data to evaluate' : goal.currentValue} · Set by {goal.createdByEmail}, {timeAgo(goal.createdAt)}
                </p>
              </div>
              <button className="adv2-btn" disabled={archivingId === goal.id} onClick={() => handleArchive(goal.id)}>
                {archivingId === goal.id ? 'Working…' : 'Archive'}
              </button>
            </div>
          ))}

          <div className="adv2-body" style={{ borderTop: '1px solid var(--adv2-rule)' }}>
            {goalCreateError && <p style={{ color: 'var(--adv2-bad)' }}>{goalCreateError}</p>}
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <label className="adv2-muted" style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Metric</label>
                <select value={goalMetric} onChange={(e) => setGoalMetric(e.target.value as GoalMetricKey)}>
                  {METRIC_KEYS.map((k) => <option key={k} value={k}>{metricLabel(k)}</option>)}
                </select>
              </div>
              <div>
                <label className="adv2-muted" style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Comparison</label>
                <select value={goalComparison} onChange={(e) => setGoalComparison(e.target.value as GoalComparison)}>
                  {COMPARISONS.map((c) => <option key={c} value={c}>{c === 'at_most' ? 'At most' : 'At least'}</option>)}
                </select>
              </div>
              <div>
                <label className="adv2-muted" style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Target</label>
                <input type="number" min={0} style={{ width: '7rem' }} value={goalTarget} onChange={(e) => setGoalTarget(Number(e.target.value))} />
              </div>
              <button className="adv2-btn adv2-primary" disabled={creatingGoal} onClick={handleCreateGoal}>
                {creatingGoal ? 'Setting…' : 'Set Goal'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="adv2-card" style={{ marginTop: 22 }}>
        <h2>1:1 Check-ins<span className="adv2-hint">Only agenda and outcome notes exist today — no separate wins/challenges/lessons/commitments fields.</span></h2>
        <div>
          {oneOnOnesError && <p className="adv2-body" style={{ color: 'var(--adv2-bad)' }}>{oneOnOnesError}</p>}
          {oneOnOnesLoading && <p className="adv2-body adv2-muted">Loading…</p>}
          {!oneOnOnesLoading && oneOnOnes.length === 0 && (
            <p className="adv2-body adv2-muted">No 1:1 check-ins scheduled or held yet.</p>
          )}
          {!oneOnOnesLoading && oneOnOnes.map((item) => (
            <div key={item.id} className="adv2-body" style={{ borderTop: '1px solid var(--adv2-rule)' }}>
              <span className={adv2PillClass(item.status === 'completed' ? 'success' : 'info')}>{item.status}</span>
              <span style={{ marginLeft: 8, fontWeight: 600 }}>{item.agenda}</span>
              <p className="adv2-muted" style={{ marginTop: 4 }}>Set by {item.createdByEmail}, {timeAgo(item.createdAt)}{item.heldAt ? ` · Held ${timeAgo(item.heldAt)}` : ''}</p>
              {item.status === 'completed' ? (
                <p style={{ marginTop: 8, marginBottom: 0 }}><strong>Outcome:</strong> {item.outcomeNotes}</p>
              ) : (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input
                    placeholder="Outcome notes to complete this 1:1…"
                    style={{ flex: 1 }}
                    value={outcomeDrafts[item.id] || ''}
                    onChange={(e) => setOutcomeDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  />
                  <button className="adv2-btn" disabled={completingId === item.id || !(outcomeDrafts[item.id] || '').trim()} onClick={() => handleComplete(item.id)}>
                    {completingId === item.id ? 'Working…' : 'Complete'}
                  </button>
                </div>
              )}
            </div>
          ))}

          <div className="adv2-body" style={{ borderTop: '1px solid var(--adv2-rule)' }}>
            <label className="adv2-muted" style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Agenda</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input placeholder="What should this 1:1 cover?" style={{ flex: 1 }} value={agendaText} onChange={(e) => setAgendaText(e.target.value)} />
              <button className="adv2-btn adv2-primary" disabled={creatingOneOnOne || !agendaText.trim()} onClick={handleScheduleOneOnOne}>
                {creatingOneOnOne ? 'Scheduling…' : 'Schedule'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
