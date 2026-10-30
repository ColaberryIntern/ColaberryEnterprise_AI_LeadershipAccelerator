import React from 'react';
import { isWatchBlocked, watchGateLabel, type WatchVerdict } from '../../../components/timeline/useWatchVerdict';
import type { DwellState } from '../../../components/timeline/useDwellGate';

/**
 * RuntimeCompleteGate — the workspace's Mark-complete control, in one place so
 * every rule the server enforces is reflected BEFORE the student clicks.
 *
 * The rule (Ali, 2026-10-29): the button is dimmed until the task's requirement
 * is met — watch %, continuous dwell, every reader section, the Field Guide —
 * never "click, then get told no". The server still enforces every gate; if it
 * rejects anyway, `message` shows inline here instead of replacing the page.
 */
interface Progress { on: boolean; complete: boolean; done: number; total: number }

export interface CompleteGateProps {
  completed: boolean;
  busy: boolean;
  fill: boolean;                 // single-scroll layout uses the pill-shaped button
  evidenceRequired: boolean;
  reader: Progress;              // Self Study: every section read
  deepDive: Progress;            // Field Guide: read + copy + upload
  watchApplies: boolean;         // video band: the watch % gate applies
  watch: WatchVerdict | null;    // null = still checking → dimmed
  dwellApplies: boolean;         // passive-content band: continuous-dwell gate applies
  dwell: DwellState | null;
  lockedReason?: string | null;  // any other unmet requirement (e.g. a lab's copy step)
  message: string | null;        // a server rejection, shown inline
  onComplete: () => void;
}

/** The first unmet requirement as { hint beside the button, label on it }, or null when clear. */
function blocker(p: CompleteGateProps): { hint: string | null; label: string; why: string } | null {
  if (p.reader.on && !p.reader.complete) {
    const hint = p.reader.total > 0 ? `${p.reader.done} of ${p.reader.total} sections read — read all to finish` : 'Read the material to finish';
    return { hint, label: 'Mark complete', why: 'Read every section to finish' };
  }
  if (p.deepDive.on && !p.deepDive.complete) {
    const hint = `Finish the steps in the guide to complete${p.deepDive.total > 0 ? ` — ${p.deepDive.done} of ${p.deepDive.total} sections read` : ''}`;
    return { hint, label: 'Mark complete', why: 'Finish the steps in the guide to complete' };
  }
  if (p.watchApplies && isWatchBlocked(p.watch)) {
    const why = p.watch == null ? 'Checking how much you have watched' : `Reach ${p.watch.required_pct}% watched to collect your points`;
    return { hint: null, label: watchGateLabel(p.watch) || 'Keep watching', why };
  }
  if (p.dwellApplies && !p.dwell?.met) {
    const required = p.dwell?.required_s ?? 120;
    return { hint: null, label: `Keep reading · ${p.dwell?.dwell_s ?? 0}/${required}s`, why: `Stay with this for ${required} seconds to collect your points` };
  }
  if (p.lockedReason) return { hint: p.lockedReason, label: p.evidenceRequired ? 'Complete & generate evidence' : 'Mark complete', why: p.lockedReason };
  return null;
}

export const RuntimeCompleteGate: React.FC<CompleteGateProps> = (p) => {
  if (p.completed) return <span className="rt-pill done">✓ Completed — evidence generated</span>;
  const b = blocker(p);
  const label = p.busy ? 'Generating evidence…' : b ? b.label : p.evidenceRequired ? 'Complete & generate evidence' : 'Mark complete';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      {b?.hint && <span className="rt-muted">{b.hint}</span>}
      {p.message && <span className="rt-muted" role="status">{p.message}</span>}
      <button className={p.fill ? 'ss-complete-btn' : 'rt-btn cta'} disabled={p.busy || !!b} title={b?.why} onClick={p.onComplete}>{label}</button>
    </span>
  );
};

interface BlogGateProps {
  completed: boolean;
  busy: boolean;
  gate: { met: boolean; read_s: number; required_s: number } | null;
  learningPoints: number;
  message: string | null;
  onCollect: () => void;
}

/** Ambient blog: Collect stays dimmed until the 2-minute read gate is met (server re-enforces). */
export const RuntimeBlogCompleteGate: React.FC<BlogGateProps> = (p) => {
  if (p.completed) return <span className="rt-pill done">✓ Completed — points collected</span>;
  const required = p.gate?.required_s || 120;
  const readS = p.gate?.read_s ?? 0;
  const pct = Math.min(100, Math.round((readS / required) * 100));
  const met = !!p.gate?.met;
  // No `?? 10` here: a card that carries no learning points must not advertise ten
  // of them. When there are none to collect the action is a plain completion.
  const ready = p.learningPoints > 0 ? `Collect +${p.learningPoints} pts` : 'Mark complete';
  return (
    <span className="rt-muted" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      {!met && <>Read the post — {readS}s of {required}s to collect your points</>}
      {p.message && <span role="status">{p.message}</span>}
      <button className="rt-btn cta" disabled={p.busy || !met} title={met ? undefined : 'Read the post for ~2 minutes to collect your points'} onClick={p.onCollect}>
        {met ? ready : `Keep reading · ${readS}/${required}s`}
      </button>
      {!met && <span style={{ flexBasis: '100%', height: 6, borderRadius: 3, background: 'rgba(0,0,0,.12)', overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: `${pct}%`, background: '#367895', transition: 'width .5s ease' }} /></span>}
    </span>
  );
};
