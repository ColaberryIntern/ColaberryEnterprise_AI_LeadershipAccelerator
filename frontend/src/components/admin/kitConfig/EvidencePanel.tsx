import React from 'react';
import { EvidenceOverride, SOURCE_TYPES, blankEvidence } from './types';
import { ContentModeSwitch, DefaultPreviewCard, OverrideCard, EmptyDefaultsNote } from './shared';

interface Props {
  overrides: EvidenceOverride[] | null;
  defaults: EvidenceOverride[];
  onChange: (next: EvidenceOverride[] | null) => void;
}

const EvidencePanel: React.FC<Props> = ({ overrides, defaults, onChange }) => {
  const usingCustom = overrides != null;
  const evidence = overrides ?? [];

  const update = (i: number, patch: Partial<EvidenceOverride>) => onChange(evidence.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  const add = () => onChange([...evidence, blankEvidence()]);
  const remove = (i: number) => onChange(evidence.filter((_, idx) => idx !== i));

  return (
    <>
      <p className="text-muted small">
        The readiness report's source/evidence ledger — the "what am I teaching as fact" review. Does not change the
        small source footer already baked into individual teaching slides.
      </p>
      <ContentModeSwitch id="cfg-evidence-custom" usingCustom={usingCustom} itemNoun="sources"
        onSwitch={(custom) => onChange(custom ? [blankEvidence()] : null)} />
      {!usingCustom ? (
        defaults.length === 0 ? (
          <EmptyDefaultsNote>No sourced claims are authored for this class yet.</EmptyDefaultsNote>
        ) : (
          defaults.map((e, i) => (
            <DefaultPreviewCard key={i} title={e.claim} eyebrow={[e.publisher, e.sourceTitle].filter(Boolean).join(' · ')}
              body={[e.publicationDate, e.note].filter(Boolean).join(' — ') || undefined}
              footer={<span className="badge bg-light text-dark border small mt-1">{e.sourceType}</span>} />
          ))
        )
      ) : (
        <>
          {evidence.map((e, i) => (
            <OverrideCard key={i} index={i} onRemove={() => remove(i)}>
              <label className="form-label small">Claim / quote</label>
              <textarea className="form-control form-control-sm mb-2" rows={2} value={e.claim} onChange={(ev) => update(i, { claim: ev.target.value })} />
              <div className="row g-2 mb-2">
                <div className="col-6">
                  <label className="form-label small">Publisher</label>
                  <input className="form-control form-control-sm" value={e.publisher} onChange={(ev) => update(i, { publisher: ev.target.value })} />
                </div>
                <div className="col-6">
                  <label className="form-label small">Source title</label>
                  <input className="form-control form-control-sm" value={e.sourceTitle} onChange={(ev) => update(i, { sourceTitle: ev.target.value })} />
                </div>
              </div>
              <div className="row g-2 mb-2">
                <div className="col-4">
                  <label className="form-label small">Date</label>
                  <input className="form-control form-control-sm" value={e.publicationDate} onChange={(ev) => update(i, { publicationDate: ev.target.value })} placeholder="2026" />
                </div>
                <div className="col-8">
                  <label className="form-label small">Type</label>
                  <select className="form-select form-select-sm" value={e.sourceType} onChange={(ev) => update(i, { sourceType: ev.target.value })}>
                    {SOURCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <label className="form-label small">Note (optional — e.g. "projection", "reported paraphrase")</label>
              <input className="form-control form-control-sm" value={e.note} onChange={(ev) => update(i, { note: ev.target.value })} />
            </OverrideCard>
          ))}
          <button className="btn btn-outline-secondary btn-sm" onClick={add}>+ Add source</button>
        </>
      )}
    </>
  );
};

export default EvidencePanel;
