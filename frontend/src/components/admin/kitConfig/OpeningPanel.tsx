import React from 'react';
import { HookCopy, KitConfig, KitConfigDefaults, OpeningCopy, Slot } from './types';
import { StatusBadge, EmptyDefaultsNote } from './shared';

interface Props {
  opening: KitConfig['opening'];
  defaults: KitConfigDefaults['opening'];
  dayKind: KitConfigDefaults['dayKind'];
  onChange: (next: KitConfig['opening']) => void;
}

/** Shared toggle/status chrome every opening slot editor wraps its own
 * fields in — kept as a render-prop component (not generic over the field
 * shape) since `OpeningCopy`/`HookCopy` are the only two shapes and a TS
 * generic constrained to "all-string-fields" doesn't play well with plain
 * interfaces (no index signature), so two small concrete editors below are
 * simpler than fighting that. */
function SlotShell({
  id, label, hint, hasContent, usingCustom, enabled, onToggleEnabled, onToggleCustom, children,
}: {
  id: string; label: string; hint: string; hasContent: boolean; usingCustom: boolean; enabled: boolean;
  onToggleEnabled: (v: boolean) => void; onToggleCustom: (v: boolean) => void; children: React.ReactNode;
}) {
  const status = !enabled ? 'off' : usingCustom ? 'custom' : 'default';
  return (
    <div className="rounded-3 border bg-white p-3 mb-3">
      <div className="d-flex justify-content-between align-items-start mb-2">
        <div className="form-check form-switch mb-0">
          <input className="form-check-input" type="checkbox" id={id} checked={enabled} onChange={(e) => onToggleEnabled(e.target.checked)} />
          <label className="form-check-label" htmlFor={id}>
            <span className="fw-semibold">{label}</span>
            <div className="text-muted small">{hint}</div>
          </label>
        </div>
        <StatusBadge status={status} />
      </div>
      {enabled && (
        <>
          {!hasContent && !usingCustom && (
            <EmptyDefaultsNote>Nothing authored here for this week — turn on "Write my own" below to add one.</EmptyDefaultsNote>
          )}
          <div className="form-check form-switch mb-2 ms-1 mt-2">
            <input className="form-check-input" type="checkbox" id={`${id}-custom`} checked={usingCustom} onChange={(e) => onToggleCustom(e.target.checked)} />
            <label className="form-check-label small" htmlFor={`${id}-custom`}>Write my own</label>
          </div>
          {children}
        </>
      )}
    </div>
  );
}

function ColdOpenEditor({ slot, def, onChangeSlot }: { slot: Slot<OpeningCopy>; def: OpeningCopy | null; onChangeSlot: (next: Slot<OpeningCopy>) => void }) {
  const usingCustom = slot.override != null;
  const current = slot.override ?? def ?? { title: '', body: '' };
  return (
    <SlotShell id="cfg-open-coldopen" label="Cold Open" hint='The "By Thursday, this will exist" framing that opens Architecture Day.'
      hasContent={def != null} usingCustom={usingCustom} enabled={slot.enabled}
      onToggleEnabled={(v) => onChangeSlot({ ...slot, enabled: v })}
      onToggleCustom={(v) => onChangeSlot({ ...slot, override: v ? { ...current } : null })}>
      {!usingCustom ? (
        def && <div className="ms-1"><div className="fw-medium small">{def.title}</div><div className="small text-muted">{def.body}</div></div>
      ) : (
        <div className="ms-1">
          <label className="form-label small">Title</label>
          <input className="form-control form-control-sm mb-2" value={current.title} onChange={(e) => onChangeSlot({ ...slot, override: { ...current, title: e.target.value } })} />
          <label className="form-label small">Body</label>
          <textarea className="form-control form-control-sm" rows={2} value={current.body} onChange={(e) => onChangeSlot({ ...slot, override: { ...current, body: e.target.value } })} />
        </div>
      )}
    </SlotShell>
  );
}

function HookEditor({ slot, def, onChangeSlot }: { slot: Slot<HookCopy>; def: HookCopy | null; onChangeSlot: (next: Slot<HookCopy>) => void }) {
  const usingCustom = slot.override != null;
  const current = slot.override ?? def ?? { headline: '', caption: '' };
  return (
    <SlotShell id="cfg-open-hook" label="Story Mode Hook" hint="An optional full-screen single-statement cold open, shown before the cold-open segment."
      hasContent={def != null} usingCustom={usingCustom} enabled={slot.enabled}
      onToggleEnabled={(v) => onChangeSlot({ ...slot, enabled: v })}
      onToggleCustom={(v) => onChangeSlot({ ...slot, override: v ? { ...current } : null })}>
      {!usingCustom ? (
        def && <div className="ms-1"><div className="fw-medium small">{def.headline}</div><div className="small text-muted">{def.caption}</div></div>
      ) : (
        <div className="ms-1">
          <label className="form-label small">Headline</label>
          <input className="form-control form-control-sm mb-2" value={current.headline} onChange={(e) => onChangeSlot({ ...slot, override: { ...current, headline: e.target.value } })} />
          <label className="form-label small">Caption</label>
          <textarea className="form-control form-control-sm" rows={2} value={current.caption} onChange={(e) => onChangeSlot({ ...slot, override: { ...current, caption: e.target.value } })} />
        </div>
      )}
    </SlotShell>
  );
}

function ResultPreviewEditor({ slot, def, onChangeSlot }: { slot: Slot<OpeningCopy>; def: OpeningCopy | null; onChangeSlot: (next: Slot<OpeningCopy>) => void }) {
  const usingCustom = slot.override != null;
  const current = slot.override ?? def ?? { title: '', body: '' };
  return (
    <SlotShell id="cfg-open-resultpreview" label="Result Preview" hint="Build Day's &quot;what you are producing today&quot; opening."
      hasContent={def != null} usingCustom={usingCustom} enabled={slot.enabled}
      onToggleEnabled={(v) => onChangeSlot({ ...slot, enabled: v })}
      onToggleCustom={(v) => onChangeSlot({ ...slot, override: v ? { ...current } : null })}>
      {!usingCustom ? (
        def && <div className="ms-1"><div className="fw-medium small">{def.title}</div><div className="small text-muted">{def.body}</div></div>
      ) : (
        <div className="ms-1">
          <label className="form-label small">Title</label>
          <input className="form-control form-control-sm mb-2" value={current.title} onChange={(e) => onChangeSlot({ ...slot, override: { ...current, title: e.target.value } })} />
          <label className="form-label small">Body</label>
          <textarea className="form-control form-control-sm" rows={2} value={current.body} onChange={(e) => onChangeSlot({ ...slot, override: { ...current, body: e.target.value } })} />
        </div>
      )}
    </SlotShell>
  );
}

const OpeningPanel: React.FC<Props> = ({ opening, defaults, dayKind, onChange }) => {
  // Only wired into Architecture Day (cold-open + hook) and Build Day
  // (result-preview) — Orientation's slide builder does not read
  // config.opening at all, so showing these controls there would be the
  // same "saves but never renders" gap Phase 1's checker review caught.
  if (dayKind === 'orientation') {
    return <EmptyDefaultsNote>Opening content for Orientation is hand-authored and not yet configurable here.</EmptyDefaultsNote>;
  }

  return (
    <>
      <p className="text-muted small">
        The recurring opening moments that repeat in similar shape across every week — tune the messaging pattern
        here without hand-editing each week's content.
      </p>
      {dayKind === 'architecture' && (
        <>
          <ColdOpenEditor slot={opening.coldOpen} def={defaults.coldOpen} onChangeSlot={(next) => onChange({ ...opening, coldOpen: next })} />
          <HookEditor slot={opening.hook} def={defaults.hook} onChangeSlot={(next) => onChange({ ...opening, hook: next })} />
        </>
      )}
      {dayKind === 'build' && (
        <ResultPreviewEditor slot={opening.resultPreview} def={defaults.resultPreview} onChangeSlot={(next) => onChange({ ...opening, resultPreview: next })} />
      )}
    </>
  );
};

export default OpeningPanel;
