import React, { useState } from 'react';
import { CountAndOverride, InteractionPlacement, SEGMENT_OPTIONS, blankInteraction } from './types';
import { CategoryToggleRow, ContentModeSwitch, DefaultPreviewCard, OverrideCard, EmptyDefaultsNote } from './shared';

interface Props {
  config: CountAndOverride<InteractionPlacement>;
  defaults: InteractionPlacement[];
  theaterEnabled: boolean;
  onToggleTheater: (v: boolean) => void;
  /** Calls the backend's AI-generate-a-question endpoint; the parent owns the
   * sessionId and the actual API call. Always resolves to a usable question
   * (the backend falls back to a deterministic scaffold on any failure). */
  onGenerateQuestion: (segment: string, instruction?: string) => Promise<InteractionPlacement>;
  onChange: (next: CountAndOverride<InteractionPlacement>) => void;
}

const segmentLabel = (value: string) => {
  for (const g of SEGMENT_OPTIONS) {
    const hit = g.options.find((o) => o.value === value);
    if (hit) return hit.label;
  }
  return value;
};

const InteractionsPanel: React.FC<Props> = ({ config, defaults, theaterEnabled, onToggleTheater, onGenerateQuestion, onChange }) => {
  const usingCustom = config.overrides != null;
  const questions = config.overrides ?? [];
  const [generatingFor, setGeneratingFor] = useState<number | null>(null);
  const [instruction, setInstruction] = useState('');
  const [addSegment, setAddSegment] = useState(SEGMENT_OPTIONS[1].options[0].value);

  const update = (i: number, patch: Partial<InteractionPlacement>) => onChange({ ...config, overrides: questions.map((q, idx) => (idx === i ? { ...q, ...patch } : q)) });
  const remove = (i: number) => onChange({ ...config, overrides: questions.filter((_, idx) => idx !== i) });

  const addGenerated = async () => {
    setGeneratingFor(questions.length);
    try {
      const q = await onGenerateQuestion(addSegment, instruction.trim() || undefined);
      onChange({ ...config, overrides: [...questions, q] });
      setInstruction('');
    } finally {
      setGeneratingFor(null);
    }
  };
  const addBlank = () => onChange({ ...config, overrides: [...questions, blankInteraction(addSegment)] });

  const regenerate = async (i: number) => {
    setGeneratingFor(i);
    try {
      const q = await onGenerateQuestion(questions[i].segment, instruction.trim() || undefined);
      update(i, q);
    } finally {
      setGeneratingFor(null);
    }
  };

  return (
    <>
      <p className="text-muted small">
        The poll and knowledge-check moments for this class — how many show, and what they ask. Add as many as you
        like and place each one at whichever point in the class fits best.
      </p>
      <CategoryToggleRow
        id="cfg-interactions-on" label="Survey Questions" hint="Turn off every poll/trivia question for this class."
        enabled={config.enabled} onToggle={(v) => onChange({ ...config, enabled: v })}
        max={config.max} onMaxChange={(v) => onChange({ ...config, max: v })}
        defaultCount={defaults.length}
      />
      {config.enabled && (
        <>
          <div className="rounded-3 border bg-white p-3 mb-3">
            <div className="form-check form-switch mb-0">
              <input className="form-check-input" type="checkbox" id="cfg-theater-on" checked={theaterEnabled} onChange={(e) => onToggleTheater(e.target.checked)} />
              <label className="form-check-label" htmlFor="cfg-theater-on">
                <span className="fw-semibold">Live Decision Theater</span>
                <div className="text-muted small">Full-screen treatment for questions flagged as a big moment.</div>
              </label>
            </div>
          </div>

          <ContentModeSwitch id="cfg-interactions-custom" usingCustom={usingCustom} itemNoun="survey questions"
            onSwitch={(custom) => onChange({ ...config, overrides: custom ? defaults.map((q) => ({ ...q })) : null })} />

          {!usingCustom ? (
            defaults.length === 0 ? (
              <EmptyDefaultsNote>No survey questions are authored for this class yet — flip to "Write my own" to add some.</EmptyDefaultsNote>
            ) : (
              defaults.map((q, i) => (
                <DefaultPreviewCard key={i} eyebrow={`${q.eyebrow} · ${segmentLabel(q.segment)}`} title={q.q}
                  footer={
                    <ul className="small text-muted mb-0 ps-3 mt-1">
                      {q.options.map((o, oi) => <li key={oi} className={q.answer === oi ? 'fw-semibold text-success' : ''}>{o}{q.answer === oi ? ' ✓' : ''}</li>)}
                    </ul>
                  } />
              ))
            )
          ) : (
            <>
              {questions.map((q, i) => (
                <OverrideCard key={i} index={i} onRemove={() => remove(i)}>
                  <div className="row g-2 mb-2">
                    <div className="col-4">
                      <label className="form-label small">Segment (where it shows)</label>
                      <select className="form-select form-select-sm" value={q.segment} onChange={(e) => update(i, { segment: e.target.value })}>
                        {SEGMENT_OPTIONS.map((g) => (
                          <optgroup key={g.group} label={g.group}>
                            {g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    <div className="col-3">
                      <label className="form-label small">Kind</label>
                      <select className="form-select form-select-sm" value={q.kind} onChange={(e) => update(i, { kind: e.target.value as InteractionPlacement['kind'] })}>
                        <option value="trivia">Trivia</option>
                        <option value="poll">Poll</option>
                        <option value="prediction">Prediction</option>
                      </select>
                    </div>
                    <div className="col-3">
                      <label className="form-label small">Eyebrow</label>
                      <input className="form-control form-control-sm" value={q.eyebrow} onChange={(e) => update(i, { eyebrow: e.target.value })} />
                    </div>
                    <div className="col-2 d-flex align-items-end">
                      <button className="btn btn-outline-secondary btn-sm w-100" disabled={generatingFor === i} onClick={() => regenerate(i)}>
                        {generatingFor === i ? '…' : '✨ AI'}
                      </button>
                    </div>
                  </div>
                  <label className="form-label small">Title</label>
                  <input className="form-control form-control-sm mb-2" value={q.title} onChange={(e) => update(i, { title: e.target.value })} />
                  <label className="form-label small">Question</label>
                  <input className="form-control form-control-sm mb-2" value={q.q} onChange={(e) => update(i, { q: e.target.value })} />
                  <label className="form-label small">Options</label>
                  {q.options.map((o, oi) => (
                    <div className="d-flex gap-2 mb-1" key={oi}>
                      {q.kind === 'trivia' && (
                        <div className="form-check pt-1">
                          <input className="form-check-input" type="radio" name={`q${i}-answer`} checked={q.answer === oi} onChange={() => update(i, { answer: oi })} title="Correct answer" />
                        </div>
                      )}
                      <input className="form-control form-control-sm" value={o} onChange={(e) => update(i, { options: q.options.map((x, xi) => (xi === oi ? e.target.value : x)) })} />
                      <button className="btn btn-outline-danger btn-sm" onClick={() => update(i, { options: q.options.filter((_, xi) => xi !== oi) })}>×</button>
                    </div>
                  ))}
                  <button className="btn btn-outline-secondary btn-sm mb-2" onClick={() => update(i, { options: [...q.options, ''] })}>+ Add option</button>
                  <label className="form-label small">Reveal line</label>
                  <input className="form-control form-control-sm mb-2" value={q.reveal} onChange={(e) => update(i, { reveal: e.target.value })} />
                  <div className="form-check form-switch">
                    <input className="form-check-input" type="checkbox" id={`q${i}-theater`} checked={q.theater} onChange={(e) => update(i, { theater: e.target.checked })} />
                    <label className="form-check-label small" htmlFor={`q${i}-theater`}>Live Decision Theater moment</label>
                  </div>
                </OverrideCard>
              ))}

              <div className="rounded-3 border bg-light p-3 mt-2">
                <div className="row g-2 align-items-end">
                  <div className="col-5">
                    <label className="form-label small">New question's segment</label>
                    <select className="form-select form-select-sm" value={addSegment} onChange={(e) => setAddSegment(e.target.value)}>
                      {SEGMENT_OPTIONS.map((g) => (
                        <optgroup key={g.group} label={g.group}>
                          {g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div className="col-7">
                    <label className="form-label small">Steer the AI (optional)</label>
                    <input className="form-control form-control-sm" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="e.g. focus on the failure-recovery part" />
                  </div>
                </div>
                <div className="d-flex gap-2 mt-2">
                  <button className="btn btn-primary btn-sm" disabled={generatingFor === questions.length} onClick={addGenerated}>
                    {generatingFor === questions.length ? 'Generating…' : '✨ AI-generate a question'}
                  </button>
                  <button className="btn btn-outline-secondary btn-sm" onClick={addBlank}>+ Add blank question</button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
};

export default InteractionsPanel;
