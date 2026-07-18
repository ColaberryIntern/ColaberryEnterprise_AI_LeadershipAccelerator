import React, { useState } from 'react';

/**
 * GatingRuleEditor — authors a list of unlock predicates (prerequisites) for a
 * timeline card or a whole section. Mirrors the backend UnlockPredicate model
 * (timelineGatingService): a card/section stays LOCKED for the student until
 * every predicate here is met. AND semantics — order doesn't matter.
 *
 * Used in two places (TimelineEditorTab): the card Edit drawer (per-card rules,
 * `unlock_rules`) and the per-section gating modal (section rules).
 */

export type UnlockPredicate =
  | { kind: 'card_complete'; card_id: string; label?: string }
  | { kind: 'section_complete'; bucket: string; scope?: 'week' | 'all'; label?: string }
  | { kind: 'type_complete'; type: string; scope?: 'week' | 'all'; label?: string };

export interface GatingCard { id: string; title: string; bucket: string; week: number | null; type: string }

const BUCKET_LABEL: Record<string, string> = {
  pre_class: 'Pre-Class', learn: 'Learn', practice: 'Practice', build: 'Build',
  reflect: 'Reflect', share: 'Share', advance: 'Advance',
};
const BUCKETS = ['pre_class', 'learn', 'practice', 'build', 'reflect', 'share', 'advance'];
const bucketLabel = (b: string) => BUCKET_LABEL[b] || b;

const sel: React.CSSProperties = { padding: '7px 9px', border: '1px solid #D8D8D8', borderRadius: 7, fontSize: 12.5, background: '#fff', color: '#1A1A1A' };

/** A human sentence for one predicate (also stored as its `label` for the student). */
export function describePredicate(p: UnlockPredicate, cards: GatingCard[]): string {
  if (p.kind === 'section_complete') return `Finish the ${bucketLabel(p.bucket)} section first`;
  if (p.kind === 'type_complete') return `Finish the ${p.type.replace(/_/g, ' ')} activities first`;
  const c = cards.find((x) => x.id === p.card_id);
  return c ? `Finish “${c.title}” first` : 'Finish the required activity first';
}

const GatingRuleEditor: React.FC<{
  rules: UnlockPredicate[];
  onChange: (rules: UnlockPredicate[]) => void;
  cards: GatingCard[];
  excludeCardId?: string;   // don't offer this card as its own prerequisite
}> = ({ rules, onChange, cards, excludeCardId }) => {
  const [addKind, setAddKind] = useState<'section_complete' | 'card_complete'>('section_complete');
  const [addBucket, setAddBucket] = useState<string>('learn');
  const [addCardId, setAddCardId] = useState<string>('');

  const pickableCards = cards
    .filter((c) => c.id !== excludeCardId)
    .sort((a, b) => (a.week ?? 99) - (b.week ?? 99) || BUCKETS.indexOf(a.bucket) - BUCKETS.indexOf(b.bucket));

  const add = () => {
    let pred: UnlockPredicate | null = null;
    if (addKind === 'section_complete') {
      pred = { kind: 'section_complete', bucket: addBucket, scope: 'week' };
    } else if (addCardId) {
      pred = { kind: 'card_complete', card_id: addCardId };
    }
    if (!pred) return;
    // Avoid duplicates.
    const dup = rules.some((r) =>
      (r.kind === 'section_complete' && pred!.kind === 'section_complete' && r.bucket === pred!.bucket)
      || (r.kind === 'card_complete' && pred!.kind === 'card_complete' && r.card_id === pred!.card_id));
    if (dup) return;
    pred.label = describePredicate(pred, cards);
    onChange([...rules, pred]);
    setAddCardId('');
  };

  const remove = (i: number) => onChange(rules.filter((_, idx) => idx !== i));

  return (
    <div>
      {rules.length === 0 ? (
        <div style={{ fontSize: 12, color: '#8A8A8A', padding: '2px 0 8px' }}>No prerequisites — always available.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {rules.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F5FAFB', border: '1px solid #D4E3E8', borderRadius: 8, padding: '7px 10px' }}>
              <span aria-hidden>🔒</span>
              <span style={{ flex: 1, fontSize: 12.5, color: '#1F5266', fontWeight: 600 }}>{describePredicate(r, cards)}</span>
              <button type="button" onClick={() => remove(i)} aria-label="Remove prerequisite"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8A8A8A', fontSize: 16, lineHeight: 1, padding: '0 2px' }}>×</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#6A6A6A' }}>Add: locked until</span>
        <select style={sel} value={addKind} onChange={(e) => setAddKind(e.target.value as any)}>
          <option value="section_complete">a section is completed</option>
          <option value="card_complete">a specific card is completed</option>
        </select>
        {addKind === 'section_complete' ? (
          <select style={sel} value={addBucket} onChange={(e) => setAddBucket(e.target.value)}>
            {BUCKETS.map((b) => <option key={b} value={b}>{bucketLabel(b)}</option>)}
          </select>
        ) : (
          <select style={{ ...sel, maxWidth: 260 }} value={addCardId} onChange={(e) => setAddCardId(e.target.value)}>
            <option value="">Choose a card…</option>
            {pickableCards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.week != null ? `Wk${c.week} · ` : ''}{bucketLabel(c.bucket)} · {c.title}
              </option>
            ))}
          </select>
        )}
        <button type="button" className="te-act" style={{ padding: '7px 12px' }}
          disabled={addKind === 'card_complete' && !addCardId} onClick={add}>+ Add</button>
      </div>
    </div>
  );
};

export default GatingRuleEditor;

/**
 * SectionGatingModal — a centered modal to author a whole SECTION's (bucket's)
 * gating rules. Every card in the section stays locked for the student until the
 * predicates are met. Holds a local rules buffer; commits on Save.
 */
export const SectionGatingModal: React.FC<{
  bucket: string;
  initialRules: UnlockPredicate[];
  cards: GatingCard[];
  saving: boolean;
  onSave: (rules: UnlockPredicate[]) => void;
  onClose: () => void;
}> = ({ bucket, initialRules, cards, saving, onSave, onClose }) => {
  const [rules, setRules] = useState<UnlockPredicate[]>(initialRules);
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 560, maxWidth: '96vw', background: '#fff', borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,.22)', padding: '18px 20px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 16 }}>🔒</span>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A' }}>Gate the {bucketLabel(bucket)} section</div>
          <button onClick={onClose} aria-label="Close" style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#8A8A8A', fontSize: 22, lineHeight: 1 }}>×</button>
        </div>
        <p style={{ fontSize: 12.5, color: '#6A6A6A', margin: '0 0 14px' }}>
          Every card in this section stays <b>locked</b> for the student until these prerequisites are met (evaluated within the same week). Per-card overrides are set on each card.
        </p>
        <GatingRuleEditor rules={rules} onChange={setRules} cards={cards} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button className="tl-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="tl-btn-primary" disabled={saving} onClick={() => onSave(rules)}>{saving ? 'Saving…' : 'Save section rules'}</button>
        </div>
      </div>
    </div>
  );
};
