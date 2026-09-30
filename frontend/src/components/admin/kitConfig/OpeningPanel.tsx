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
 * simpler than fighting that.
 *
 * No "write my own" toggle — the fields are always shown, pre-filled with
 * the resolved value (`override ?? default`), and directly editable; the
 * first real edit is what populates `override` (mirrors `resolveSlot`'s
 * own `override ?? defaultValue` read semantics, just applied to the write
 * side too). There's exactly one of each slot, so no add/delete/reorder. */
function SlotShell({
  id, label, hint, hasContent, isCustom, enabled, onToggleEnabled, children,
}: {
  id: string; label: string; hint: string; hasContent: boolean; isCustom: boolean; enabled: boolean;
  onToggleEnabled: (v: boolean) => void; children: React.ReactNode;
}) {
  const status = !enabled ? 'off' : isCustom ? 'custom' : 'default';
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
          {!hasContent && <EmptyDefaultsNote>Nothing authored here for this week yet — fill it in below.</EmptyDefaultsNote>}
          {children}
        </>
      )}
    </div>
  );
}

function ColdOpenEditor({ slot, def, onChangeSlot }: { slot: Slot<OpeningCopy>; def: OpeningCopy | null; onChangeSlot: (next: Slot<OpeningCopy>) => void }) {
  const current = slot.override ?? def ?? { title: '', body: '' };
  const setField = (patch: Partial<OpeningCopy>) => onChangeSlot({ ...slot, override: { ...current, ...patch } });
  return (
    <SlotShell id="cfg-open-coldopen" label="Cold Open" hint='The "By Thursday, this will exist" framing that opens Architecture Day.'
      hasContent={def != null} isCustom={slot.override != null} enabled={slot.enabled}
      onToggleEnabled={(v) => onChangeSlot({ ...slot, enabled: v })}>
      <div className="ms-1">
        <label className="form-label small">Title</label>
        <input className="form-control form-control-sm mb-2" value={current.title} onChange={(e) => setField({ title: e.target.value })} />
        <label className="form-label small">Body</label>
        <textarea className="form-control form-control-sm" rows={2} value={current.body} onChange={(e) => setField({ body: e.target.value })} />
      </div>
    </SlotShell>
  );
}

function HookEditor({ slot, def, onChangeSlot }: { slot: Slot<HookCopy>; def: HookCopy | null; onChangeSlot: (next: Slot<HookCopy>) => void }) {
  const current = slot.override ?? def ?? { headline: '', caption: '' };
  const setField = (patch: Partial<HookCopy>) => onChangeSlot({ ...slot, override: { ...current, ...patch } });
  return (
    <SlotShell id="cfg-open-hook" label="Story Mode Hook" hint="An optional full-screen single-statement cold open, shown before the cold-open segment."
      hasContent={def != null} isCustom={slot.override != null} enabled={slot.enabled}
      onToggleEnabled={(v) => onChangeSlot({ ...slot, enabled: v })}>
      <div className="ms-1">
        <label className="form-label small">Headline</label>
        <input className="form-control form-control-sm mb-2" value={current.headline} onChange={(e) => setField({ headline: e.target.value })} />
        <label className="form-label small">Caption</label>
        <textarea className="form-control form-control-sm" rows={2} value={current.caption} onChange={(e) => setField({ caption: e.target.value })} />
      </div>
    </SlotShell>
  );
}

function ResultPreviewEditor({ slot, def, onChangeSlot }: { slot: Slot<OpeningCopy>; def: OpeningCopy | null; onChangeSlot: (next: Slot<OpeningCopy>) => void }) {
  const current = slot.override ?? def ?? { title: '', body: '' };
  const setField = (patch: Partial<OpeningCopy>) => onChangeSlot({ ...slot, override: { ...current, ...patch } });
  return (
    <SlotShell id="cfg-open-resultpreview" label="Result Preview" hint="Build Day's &quot;what you are producing today&quot; opening."
      hasContent={def != null} isCustom={slot.override != null} enabled={slot.enabled}
      onToggleEnabled={(v) => onChangeSlot({ ...slot, enabled: v })}>
      <div className="ms-1">
        <label className="form-label small">Title</label>
        <input className="form-control form-control-sm mb-2" value={current.title} onChange={(e) => setField({ title: e.target.value })} />
        <label className="form-label small">Body</label>
        <textarea className="form-control form-control-sm" rows={2} value={current.body} onChange={(e) => setField({ body: e.target.value })} />
      </div>
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
