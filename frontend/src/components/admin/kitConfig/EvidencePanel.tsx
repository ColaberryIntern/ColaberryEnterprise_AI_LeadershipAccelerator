import React, { useState } from 'react';
import { EvidenceOverride, SOURCE_TYPES, blankEvidence } from './types';
import { CollapsibleOverrideCard, EmptyDefaultsNote, moveItem } from './shared';

interface Props {
  overrides: EvidenceOverride[] | null;
  defaults: EvidenceOverride[];
  onChange: (next: EvidenceOverride[] | null) => void;
}

/** Always shows the real, resolved sourced-claims ledger (authored defaults,
 * or the instructor's own overrides once they've touched anything) directly
 * editable in place — no separate "authored defaults preview" vs. "write my
 * own" switch. The first edit/add/delete/move commits `overrides`. */
const EvidencePanel: React.FC<Props> = ({ overrides, defaults, onChange }) => {
  const evidence = overrides ?? defaults;
  const [justAddedIndex, setJustAddedIndex] = useState<number | null>(null);

  const update = (i: number, patch: Partial<EvidenceOverride>) => onChange(evidence.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  const add = () => {
    const next = [...evidence, blankEvidence()];
    onChange(next);
    setJustAddedIndex(next.length - 1);
  };
  const remove = (i: number) => onChange(evidence.filter((_, idx) => idx !== i));
  const move = (i: number, direction: 'up' | 'down') => onChange(moveItem(evidence, i, direction));

  return (
    <>
      <p className="text-muted small">
        The readiness report's source/evidence ledger — the "what am I teaching as fact" review. Does not change the
        small source footer already baked into individual teaching slides.
      </p>
      {evidence.length === 0 ? (
        <EmptyDefaultsNote>No sourced claims are authored for this class yet — add one below.</EmptyDefaultsNote>
      ) : (
        evidence.map((e, i) => (
          <CollapsibleOverrideCard key={i} index={i} total={evidence.length}
            summary={<><strong>{e.claim || '(untitled claim)'}</strong> {e.publisher && <span className="text-muted">· {e.publisher}</span>}</>}
            summaryText={`${e.claim || '(untitled claim)'}${e.publisher ? ' · ' + e.publisher : ''}`}
            defaultExpanded={i === justAddedIndex}
            onRemove={() => remove(i)} onMoveUp={() => move(i, 'up')} onMoveDown={() => move(i, 'down')}>
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
          </CollapsibleOverrideCard>
        ))
      )}
      <button className="btn btn-outline-secondary btn-sm" onClick={add}>+ Add source</button>
    </>
  );
};

export default EvidencePanel;
