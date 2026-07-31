import React from 'react';
import { CountAndOverride, TeachSlideOverride, SEGMENT_OPTIONS, blankTeach } from './types';
import { CategoryToggleRow, ContentModeSwitch, DefaultPreviewCard, OverrideCard, EmptyDefaultsNote } from './shared';

interface Props {
  config: CountAndOverride<TeachSlideOverride>;
  defaults: TeachSlideOverride[];
  dayLabel: string;
  onChange: (next: CountAndOverride<TeachSlideOverride>) => void;
}

const TeachPanel: React.FC<Props> = ({ config, defaults, dayLabel, onChange }) => {
  const usingCustom = config.overrides != null;
  const slides = config.overrides ?? [];

  const update = (i: number, patch: Partial<TeachSlideOverride>) => onChange({ ...config, overrides: slides.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  const add = () => onChange({ ...config, overrides: [...slides, blankTeach()] });
  const remove = (i: number) => onChange({ ...config, overrides: slides.filter((_, idx) => idx !== i) });

  return (
    <>
      <p className="text-muted small">
        The deep-teaching substance for {dayLabel} — the multi-slide "lessons" (body, bullets, a copy-ready Claude Code
        example, and the instructor's script) spliced into each segment.
      </p>
      <CategoryToggleRow
        id="cfg-teach-on" label="Lessons" hint="Turn off every teaching slide for this class (the base segment content still shows)."
        enabled={config.enabled} onToggle={(v) => onChange({ ...config, enabled: v })}
        max={config.max} onMaxChange={(v) => onChange({ ...config, max: v })}
        defaultCount={defaults.length}
      />
      {config.enabled && (
        <>
          <ContentModeSwitch id="cfg-teach-custom" usingCustom={usingCustom} itemNoun="lessons"
            onSwitch={(custom) => onChange({ ...config, overrides: custom ? [blankTeach()] : null })} />
          {!usingCustom ? (
            defaults.length === 0 ? (
              <EmptyDefaultsNote>No deep-teaching content is authored for {dayLabel} yet.</EmptyDefaultsNote>
            ) : (
              defaults.map((s, i) => (
                <DefaultPreviewCard key={i} eyebrow={`${s.eyebrow} · ${s.segment}`} title={s.title} body={s.body}
                  footer={s.code ? <div className="small mt-2"><span className="badge bg-dark-subtle text-dark-emphasis">⌨️ {s.code.label}</span></div> : undefined} />
              ))
            )
          ) : (
            <>
              {slides.map((s, i) => (
                <OverrideCard key={i} index={i} onRemove={() => remove(i)}>
                  <div className="row g-2 mb-2">
                    <div className="col-8">
                      <label className="form-label small">Segment</label>
                      <select className="form-select form-select-sm" value={s.segment} onChange={(e) => update(i, { segment: e.target.value })}>
                        {SEGMENT_OPTIONS.map((g) => (
                          <optgroup key={g.group} label={g.group}>
                            {g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    <div className="col-4">
                      <label className="form-label small">Eyebrow</label>
                      <input className="form-control form-control-sm" value={s.eyebrow} onChange={(e) => update(i, { eyebrow: e.target.value })} placeholder="🧭 Emoji + label" />
                    </div>
                  </div>
                  <label className="form-label small">Title</label>
                  <input className="form-control form-control-sm mb-2" value={s.title} onChange={(e) => update(i, { title: e.target.value })} />
                  <label className="form-label small">Body</label>
                  <textarea className="form-control form-control-sm mb-2" rows={3} value={s.body} onChange={(e) => update(i, { body: e.target.value })} />
                  <label className="form-label small">Bullets (one per line, optional)</label>
                  <textarea className="form-control form-control-sm mb-2" rows={2} value={s.bullets.join('\n')}
                    onChange={(e) => update(i, { bullets: e.target.value.split('\n').filter((l) => l.trim().length > 0) })} />
                  <div className="row g-2 mb-2">
                    <div className="col-4">
                      <label className="form-label small">Code label (optional)</label>
                      <input className="form-control form-control-sm" value={s.code?.label ?? ''}
                        onChange={(e) => update(i, { code: e.target.value || s.code?.code ? { label: e.target.value, code: s.code?.code ?? '' } : null })} />
                    </div>
                    <div className="col-8">
                      <label className="form-label small">Claude Code prompt / snippet</label>
                      <textarea className="form-control form-control-sm" rows={2} value={s.code?.code ?? ''}
                        onChange={(e) => update(i, { code: e.target.value || s.code?.label ? { label: s.code?.label ?? '', code: e.target.value } : null })} />
                    </div>
                  </div>
                  <label className="form-label small">Instructor script (optional — what to say/do)</label>
                  <input className="form-control form-control-sm" value={s.script} onChange={(e) => update(i, { script: e.target.value })} />
                </OverrideCard>
              ))}
              <button className="btn btn-outline-secondary btn-sm" onClick={add}>+ Add lesson slide</button>
            </>
          )}
        </>
      )}
    </>
  );
};

export default TeachPanel;
