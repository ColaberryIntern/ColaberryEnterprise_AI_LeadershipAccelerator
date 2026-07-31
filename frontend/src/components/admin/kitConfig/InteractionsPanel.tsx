import React from 'react';
import { InteractionOverride, InteractionSlot, blankInteraction } from './types';
import { StatusBadge, EmptyDefaultsNote } from './shared';

interface SlotSpec { key: 'mondayPoll' | 'mondayTrivia' | 'thursdayTrivia'; label: string; kind: InteractionOverride['kind']; showTheater: boolean; }

interface Props {
  interactions: { mondayPoll: InteractionSlot; mondayTrivia: InteractionSlot; thursdayTrivia: InteractionSlot };
  defaults: { mondayPoll: InteractionOverride | null; mondayTrivia: InteractionOverride | null; thursdayTrivia: InteractionOverride | null };
  theaterEnabled: boolean;
  dayKind: 'orientation' | 'architecture' | 'build';
  onChange: (next: Props['interactions']) => void;
  onToggleTheater: (v: boolean) => void;
}

const ALL_SLOTS: SlotSpec[] = [
  { key: 'mondayPoll', label: 'Monday design-choice poll (asked at check-in, revealed at the architecture challenge)', kind: 'poll', showTheater: true },
  { key: 'mondayTrivia', label: 'Monday knowledge-check trivia', kind: 'trivia', showTheater: false },
  { key: 'thursdayTrivia', label: 'Thursday warm-up trivia', kind: 'trivia', showTheater: false },
];

const SlotEditor: React.FC<{
  spec: SlotSpec; slot: InteractionSlot; def: InteractionOverride | null; theaterEnabled: boolean;
  onChangeSlot: (next: InteractionSlot) => void; onToggleTheater: (v: boolean) => void;
}> = ({ spec, slot, def, theaterEnabled, onChangeSlot, onToggleTheater }) => {
  const usingCustom = slot.override != null;
  const status = !slot.enabled ? 'off' : usingCustom ? 'custom' : 'default';
  const opt = slot.override ?? def ?? blankInteraction(spec.kind);

  const patch = (p: Partial<InteractionOverride>) => onChangeSlot({ ...slot, override: { ...opt, ...p } });
  const updateOption = (idx: number, v: string) => patch({ options: opt.options.map((o, i) => (i === idx ? v : o)) });
  const addOption = () => patch({ options: [...opt.options, ''] });
  const removeOption = (idx: number) => patch({ options: opt.options.filter((_, i) => i !== idx) });

  return (
    <div className="rounded-3 border bg-white p-3 mb-3">
      <div className="d-flex justify-content-between align-items-start mb-2">
        <div className="form-check form-switch mb-0">
          <input className="form-check-input" type="checkbox" id={`cfg-${spec.key}-on`} checked={slot.enabled}
            onChange={(e) => onChangeSlot({ ...slot, enabled: e.target.checked })} />
          <label className="form-check-label fw-semibold" htmlFor={`cfg-${spec.key}-on`}>{spec.label}</label>
        </div>
        <StatusBadge status={status} />
      </div>
      {spec.showTheater && (
        <div className="form-check form-switch mb-2 ms-1">
          <input className="form-check-input" type="checkbox" id="cfg-theater-on" checked={theaterEnabled} onChange={(e) => onToggleTheater(e.target.checked)} />
          <label className="form-check-label small" htmlFor="cfg-theater-on">Live Decision Theater (full-screen poll moment) for this question</label>
        </div>
      )}
      {slot.enabled && (
        <>
          <div className="form-check form-switch mb-2 ms-1">
            <input className="form-check-input" type="checkbox" id={`cfg-${spec.key}-custom`} checked={usingCustom}
              onChange={(e) => onChangeSlot({ ...slot, override: e.target.checked ? { ...(def ?? blankInteraction(spec.kind)) } : null })} />
            <label className="form-check-label small" htmlFor={`cfg-${spec.key}-custom`}>Use my own question instead of the authored default</label>
          </div>
          {!usingCustom ? (
            def ? (
              <div className="ms-1">
                <div className="fw-medium small mb-1">{def.q}</div>
                <ul className="small text-muted mb-1 ps-3">
                  {def.options.map((o, i) => <li key={i} className={def.answer === i ? 'fw-semibold text-success' : ''}>{o}{def.answer === i ? ' ✓' : ''}</li>)}
                </ul>
                {def.reveal && <div className="small fst-italic text-muted">"{def.reveal}"</div>}
              </div>
            ) : (
              <EmptyDefaultsNote>No question authored for this slot yet.</EmptyDefaultsNote>
            )
          ) : (
            <div className="ms-1">
              <label className="form-label small">Question</label>
              <input className="form-control form-control-sm mb-2" value={opt.q} onChange={(e) => patch({ q: e.target.value })} />
              <label className="form-label small">Options</label>
              {opt.options.map((o, i) => (
                <div className="d-flex gap-2 mb-1" key={i}>
                  {spec.kind === 'trivia' && (
                    <div className="form-check pt-1">
                      <input className="form-check-input" type="radio" name={`${spec.key}-answer`} checked={opt.answer === i} onChange={() => patch({ answer: i })} title="Correct answer" />
                    </div>
                  )}
                  <input className="form-control form-control-sm" value={o} onChange={(e) => updateOption(i, e.target.value)} />
                  <button className="btn btn-outline-danger btn-sm" onClick={() => removeOption(i)}>×</button>
                </div>
              ))}
              <button className="btn btn-outline-secondary btn-sm mb-2" onClick={addOption}>+ Add option</button>
              <label className="form-label small">Reveal line</label>
              <input className="form-control form-control-sm" value={opt.reveal} onChange={(e) => patch({ reveal: e.target.value })} />
            </div>
          )}
        </>
      )}
    </div>
  );
};

const InteractionsPanel: React.FC<Props> = ({ interactions, defaults, theaterEnabled, dayKind, onChange, onToggleTheater }) => {
  const slots = ALL_SLOTS.filter((s) => (dayKind === 'architecture' ? s.key !== 'thursdayTrivia' : dayKind === 'build' ? s.key === 'thursdayTrivia' : true));
  if (dayKind === 'orientation') {
    return <EmptyDefaultsNote>Survey questions for Orientation are hand-authored and not yet configurable here.</EmptyDefaultsNote>;
  }
  return (
    <>
      <p className="text-muted small">The poll and knowledge-check moments for this class — how many show, and what they ask.</p>
      {slots.map((spec) => (
        <SlotEditor key={spec.key} spec={spec} slot={interactions[spec.key]} def={defaults[spec.key]} theaterEnabled={theaterEnabled}
          onChangeSlot={(next) => onChange({ ...interactions, [spec.key]: next })} onToggleTheater={onToggleTheater} />
      ))}
    </>
  );
};

export default InteractionsPanel;
