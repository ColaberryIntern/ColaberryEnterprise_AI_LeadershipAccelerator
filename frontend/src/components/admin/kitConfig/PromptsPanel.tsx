import React, { useState } from 'react';
import { CountAndOverride, PromptOverride, blankPrompt } from './types';
import { CategoryToggleRow, CollapsibleOverrideCard, EmptyDefaultsNote, AiRewriteBar, moveItem } from './shared';

interface Props {
  config: CountAndOverride<PromptOverride>;
  defaults: PromptOverride[];
  buildBayDetail: boolean;
  onToggleDetail: (v: boolean) => void;
  /** false when this week's guided-build already renders from Lessons (deep-
   * teaching content) — in that case these prompts exist but have no visible
   * effect, so we say so instead of leaving it a silent no-op. */
  appliesToThisSession: boolean;
  dayKind: 'orientation' | 'architecture' | 'build';
  onRewrite: (currentItems: PromptOverride[], instruction: string) => Promise<PromptOverride[]>;
  onChange: (next: CountAndOverride<PromptOverride>) => void;
}

/** Always shows the real, resolved Claude Code examples (authored defaults,
 * or the instructor's own overrides once they've touched anything) directly
 * editable in place — no separate "authored defaults preview" vs. "write my
 * own" switch. Day-kind gating and the Lessons-precedence alert are unchanged. */
const PromptsPanel: React.FC<Props> = ({ config, defaults, buildBayDetail, onToggleDetail, appliesToThisSession, dayKind, onRewrite, onChange }) => {
  const prompts = config.overrides ?? defaults;
  const [justAddedIndex, setJustAddedIndex] = useState<number | null>(null);

  const update = (i: number, patch: Partial<PromptOverride>) => onChange({ ...config, overrides: prompts.map((p, idx) => (idx === i ? { ...p, ...patch } : p)) });
  const add = () => {
    const next = [...prompts, blankPrompt()];
    onChange({ ...config, overrides: next });
    setJustAddedIndex(next.length - 1);
  };
  const remove = (i: number) => onChange({ ...config, overrides: prompts.filter((_, idx) => idx !== i) });
  const move = (i: number, direction: 'up' | 'down') => onChange({ ...config, overrides: moveItem(prompts, i, direction) });
  const rewrite = async (instruction: string) => onChange({ ...config, overrides: await onRewrite(prompts, instruction) });

  if (dayKind !== 'build') {
    return <EmptyDefaultsNote>Claude Code examples only apply to Build Day (Thursday) sessions.</EmptyDefaultsNote>;
  }

  return (
    <>
      <p className="text-muted small">
        The copy-ready Claude Code prompts driven live in the Build Bay.
      </p>
      {!appliesToThisSession && (
        <div className="alert alert-info small py-2 px-3 mb-3">
          This week's guided build already renders from <strong>Lessons</strong> (deep-teaching content) — its
          Claude Code examples live there instead. The settings below won't change what's on screen until Lessons
          is turned off for this class.
        </div>
      )}
      <div className="rounded-3 border bg-white p-3 mb-3">
        <div className="form-check form-switch mb-0">
          <input className="form-check-input" type="checkbox" id="cfg-buildbay-detail" checked={buildBayDetail} onChange={(e) => onToggleDetail(e.target.checked)} />
          <label className="form-check-label" htmlFor="cfg-buildbay-detail">
            <span className="fw-semibold">Build Bay detail rows</span>
            <div className="text-muted small">"You should see" / "stop when" rows under each prompt.</div>
          </label>
        </div>
      </div>
      <CategoryToggleRow
        id="cfg-prompts-on" label="Claude Code Examples" hint="Turn off the fallback prompt slides for this class."
        enabled={config.enabled} onToggle={(v) => onChange({ ...config, enabled: v })}
        max={config.max} onMaxChange={(v) => onChange({ ...config, max: v })}
        defaultCount={defaults.length}
      />
      {config.enabled && (
        <>
          <AiRewriteBar itemNoun="Claude Code examples" onRewrite={rewrite} />
          {prompts.length === 0 ? (
            <EmptyDefaultsNote>No fallback prompts are authored for this week — add one below, or ask the AI rewrite above for a starting draft.</EmptyDefaultsNote>
          ) : (
            prompts.map((p, i) => (
              <CollapsibleOverrideCard key={i} index={i} total={prompts.length}
                summary={<><strong>{p.label || '(untitled prompt)'}</strong> {p.ccMode && <span className="text-muted">· {p.ccMode}</span>}</>}
                defaultExpanded={i === justAddedIndex}
                onRemove={() => remove(i)} onMoveUp={() => move(i, 'up')} onMoveDown={() => move(i, 'down')}>
                <div className="row g-2 mb-2">
                  <div className="col-6">
                    <label className="form-label small">Label</label>
                    <input className="form-control form-control-sm" value={p.label} onChange={(e) => update(i, { label: e.target.value })} />
                  </div>
                  <div className="col-6">
                    <label className="form-label small">Claude Code mode</label>
                    <select className="form-select form-select-sm" value={p.ccMode ?? 'Plan Mode'} onChange={(e) => update(i, { ccMode: e.target.value })}>
                      <option>Manual</option><option>Plan Mode</option><option>Auto</option>
                    </select>
                  </div>
                </div>
                <label className="form-label small">Prompt</label>
                <textarea className="form-control form-control-sm mb-2" rows={3} value={p.prompt} onChange={(e) => update(i, { prompt: e.target.value })} />
                <label className="form-label small">You should see (optional)</label>
                <input className="form-control form-control-sm mb-2" value={p.expectedResult ?? ''} onChange={(e) => update(i, { expectedResult: e.target.value })} />
                <label className="form-label small">Stop when (optional)</label>
                <input className="form-control form-control-sm mb-2" value={p.stopCondition ?? ''} onChange={(e) => update(i, { stopCondition: e.target.value })} />
                <label className="form-label small">If stuck (optional)</label>
                <input className="form-control form-control-sm" value={p.rescue ?? ''} onChange={(e) => update(i, { rescue: e.target.value })} />
              </CollapsibleOverrideCard>
            ))
          )}
          <button className="btn btn-outline-secondary btn-sm" onClick={add}>+ Add prompt</button>
        </>
      )}
    </>
  );
};

export default PromptsPanel;
