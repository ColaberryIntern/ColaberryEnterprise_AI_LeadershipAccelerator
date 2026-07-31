import React from 'react';
import { CountAndOverride, StoryBeatOverride, TONES, SEGMENT_OPTIONS, blankBeat } from './types';
import { CategoryToggleRow, ContentModeSwitch, DefaultPreviewCard, OverrideCard, EmptyDefaultsNote } from './shared';

interface Props {
  config: CountAndOverride<StoryBeatOverride>;
  defaults: StoryBeatOverride[];
  onChange: (next: CountAndOverride<StoryBeatOverride>) => void;
}

const segmentLabel = (value: string) => {
  for (const g of SEGMENT_OPTIONS) {
    const hit = g.options.find((o) => o.value === value);
    if (hit) return hit.label;
  }
  return value;
};

const StoryBeatsPanel: React.FC<Props> = ({ config, defaults, onChange }) => {
  const usingCustom = config.overrides != null;
  const beats = config.overrides ?? [];

  const update = (i: number, patch: Partial<StoryBeatOverride>) => onChange({ ...config, overrides: beats.map((b, idx) => (idx === i ? { ...b, ...patch } : b)) });
  const add = () => onChange({ ...config, overrides: [...beats, blankBeat()] });
  const remove = (i: number) => onChange({ ...config, overrides: beats.filter((_, idx) => idx !== i) });

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
          <ContentModeSwitch id="cfg-story-custom" usingCustom={usingCustom} itemNoun="story beats"
            onSwitch={(custom) => onChange({ ...config, overrides: custom ? [blankBeat()] : null })} />
          {!usingCustom ? (
            defaults.length === 0 ? (
              <EmptyDefaultsNote>No story beats are authored for this class yet — flip to "Write my own" to add some.</EmptyDefaultsNote>
            ) : (
              defaults.map((b, i) => (
                <DefaultPreviewCard key={i} tone={b.tone} eyebrow={`${b.icon} ${b.eyebrow} · after "${segmentLabel(b.segment)}"`} title={b.title}
                  body={b.body} footer={b.punch ? <div className="small fst-italic mt-1">"{b.punch}"</div> : undefined} />
              ))
            )
          ) : (
            <>
              {beats.map((b, i) => (
                <OverrideCard key={i} index={i} onRemove={() => remove(i)}>
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
                  <textarea className="form-control form-control-sm mb-2" rows={3} value={b.body} onChange={(e) => update(i, { body: e.target.value })} />
                  <label className="form-label small">Punch line (optional)</label>
                  <input className="form-control form-control-sm" value={b.punch} onChange={(e) => update(i, { punch: e.target.value })} />
                </OverrideCard>
              ))}
              <button className="btn btn-outline-secondary btn-sm" onClick={add}>+ Add story beat</button>
            </>
          )}
        </>
      )}
    </>
  );
};

export default StoryBeatsPanel;
