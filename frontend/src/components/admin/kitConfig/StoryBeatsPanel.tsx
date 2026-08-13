import React, { useState } from 'react';
import { CountAndOverride, StoryBeatOverride, TONES, SEGMENT_OPTIONS, blankBeat } from './types';
import { CategoryToggleRow, CollapsibleOverrideCard, EmptyDefaultsNote, AiRewriteBar, moveItem } from './shared';

interface Props {
  config: CountAndOverride<StoryBeatOverride>;
  defaults: StoryBeatOverride[];
  onRewrite: (currentItems: StoryBeatOverride[], instruction: string) => Promise<StoryBeatOverride[]>;
  onChange: (next: CountAndOverride<StoryBeatOverride>) => void;
}

const segmentLabel = (value: string) => {
  for (const g of SEGMENT_OPTIONS) {
    const hit = g.options.find((o) => o.value === value);
    if (hit) return hit.label;
  }
  return value;
};

/** Always shows the real, resolved story beats (authored defaults, or the
 * instructor's own overrides once they've touched anything) directly editable
 * in place — no separate "authored defaults preview" vs. "write my own"
 * switch. The first edit/add/delete/move commits `overrides`; until then the
 * resolved list IS the authored defaults, so nothing is lost by just looking. */
const StoryBeatsPanel: React.FC<Props> = ({ config, defaults, onRewrite, onChange }) => {
  const beats = config.overrides ?? defaults;
  const [justAddedIndex, setJustAddedIndex] = useState<number | null>(null);

  const update = (i: number, patch: Partial<StoryBeatOverride>) => onChange({ ...config, overrides: beats.map((b, idx) => (idx === i ? { ...b, ...patch } : b)) });
  const add = () => {
    const next = [...beats, blankBeat()];
    onChange({ ...config, overrides: next });
    setJustAddedIndex(next.length - 1);
  };
  const remove = (i: number) => onChange({ ...config, overrides: beats.filter((_, idx) => idx !== i) });
  const move = (i: number, direction: 'up' | 'down') => onChange({ ...config, overrides: moveItem(beats, i, direction) });
  const rewrite = async (instruction: string) => onChange({ ...config, overrides: await onRewrite(beats, instruction) });

  return (
    <>
      <p className="text-muted small">
        "Change of pace" story/metaphor moments spliced in after a segment's own content — the storyline of the class.
      </p>
      <CategoryToggleRow
        id="cfg-story-on" label="Story Beats" hint="Turn every story beat off for this class."
        enabled={config.enabled} onToggle={(v) => onChange({ ...config, enabled: v })}
        max={config.max} onMaxChange={(v) => onChange({ ...config, max: v })}
        defaultCount={defaults.length}
      />
      {config.enabled && (
        <>
          <AiRewriteBar itemNoun="story beats" onRewrite={rewrite} />
          {beats.length === 0 ? (
            <EmptyDefaultsNote>No story beats yet — add one below, or ask the AI rewrite above for a starting draft.</EmptyDefaultsNote>
          ) : (
            beats.map((b, i) => (
              <CollapsibleOverrideCard key={i} index={i} total={beats.length}
                summary={<>{b.icon} <strong>{b.title || '(untitled beat)'}</strong> <span className="text-muted">· {segmentLabel(b.segment)}</span></>}
                summaryText={`${b.icon} ${b.title || '(untitled beat)'} · ${segmentLabel(b.segment)}`}
                defaultExpanded={i === justAddedIndex}
                onRemove={() => remove(i)} onMoveUp={() => move(i, 'up')} onMoveDown={() => move(i, 'down')}>
                <div className="row g-2 mb-2">
                  <div className="col-3">
                    <label className="form-label small">Icon</label>
                    <input className="form-control form-control-sm" value={b.icon} onChange={(e) => update(i, { icon: e.target.value })} />
                  </div>
                  <div className="col-5">
                    <label className="form-label small">Segment</label>
                    <select className="form-select form-select-sm" value={b.segment} onChange={(e) => update(i, { segment: e.target.value })}>
                      {SEGMENT_OPTIONS.map((g) => (
                        <optgroup key={g.group} label={g.group}>
                          {g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div className="col-4">
                    <label className="form-label small">Tone</label>
                    <select className="form-select form-select-sm" value={b.tone} onChange={(e) => update(i, { tone: e.target.value as StoryBeatOverride['tone'] })}>
                      {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <label className="form-label small">Eyebrow</label>
                <input className="form-control form-control-sm mb-2" value={b.eyebrow} onChange={(e) => update(i, { eyebrow: e.target.value })} placeholder="Change of pace — …" />
                <label className="form-label small">Title</label>
                <input className="form-control form-control-sm mb-2" value={b.title} onChange={(e) => update(i, { title: e.target.value })} />
                <label className="form-label small">Story (body)</label>
                <textarea className="form-control form-control-sm mb-2" rows={3} value={b.body ?? ''} onChange={(e) => update(i, { body: e.target.value })} />
                <label className="form-label small">Punch line (optional)</label>
                <input className="form-control form-control-sm" value={b.punch ?? ''} onChange={(e) => update(i, { punch: e.target.value })} />
              </CollapsibleOverrideCard>
            ))
          )}
          <button className="btn btn-outline-secondary btn-sm" onClick={add}>+ Add story beat</button>
        </>
      )}
    </>
  );
};

export default StoryBeatsPanel;
