import React, { useEffect, useMemo, useState } from 'react';
import api from '../../utils/api';
import { CategoryKey, CategoryStatus, InteractionPlacement, KitConfig, KitConfigDefaults, PromptOverride, StoryBeatOverride, TeachSlideOverride, statusForCountAndOverride } from './kitConfig/types';
import { StatusBadge } from './kitConfig/shared';
import TimelineBuilderPanel from './kitConfig/TimelineBuilderPanel';
import StoryBeatsPanel from './kitConfig/StoryBeatsPanel';
import TeachPanel from './kitConfig/TeachPanel';
import PromptsPanel from './kitConfig/PromptsPanel';
import InteractionsPanel from './kitConfig/InteractionsPanel';
import OpeningPanel from './kitConfig/OpeningPanel';
import EvidencePanel from './kitConfig/EvidencePanel';

/**
 * KitConfigModal — the instructor's "control panel" for one session's Class
 * Kit: story beats, deep-teaching Lessons, Claude Code Examples, survey
 * questions (polls/trivia), and the readiness report's evidence ledger. Opens
 * from Present ▾ → Customize. Saving takes effect the next time the deck/
 * outline/readiness is opened — there is no separate "rebuild" step, the spec
 * is built fresh every time it renders.
 *
 * Left-rail tabs, each carrying a live status badge (Default / Capped /
 * Custom / Off) so it doubles as a running record of how this class differs
 * from the authored default — every future tweak becomes a visible, tunable
 * setting instead of a silent code edit.
 */

interface Props {
  sessionId: string;
  sessionTitle: string;
  onClose: () => void;
  showToast: (msg: string, kind?: 'success' | 'error') => void;
}

interface CategoryDef { key: CategoryKey; icon: string; label: string; }
// 'timeline' is deliberately first and has no status badge — it's a map of
// the other categories, not a customizable setting of its own.
const CATEGORIES: CategoryDef[] = [
  { key: 'timeline', icon: '🗓️', label: 'Timeline' },
  { key: 'storyBeats', icon: '🎭', label: 'Story Beats' },
  { key: 'teach', icon: '📖', label: 'Lessons' },
  { key: 'prompts', icon: '⌨️', label: 'Claude Code Examples' },
  { key: 'interactions', icon: '🗳️', label: 'Survey Questions' },
  { key: 'opening', icon: '🎬', label: 'Opening' },
  { key: 'evidence', icon: '📎', label: 'Sources' },
];

const DAY_LABEL: Record<KitConfigDefaults['dayKind'], string> = {
  orientation: 'Orientation', architecture: 'Architecture Day (Monday)', build: 'Build Day (Thursday)',
};

const KitConfigModal: React.FC<Props> = ({ sessionId, sessionTitle, onClose, showToast }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<KitConfig | null>(null);
  const [defaults, setDefaults] = useState<KitConfigDefaults | null>(null);
  const [active, setActive] = useState<CategoryKey>('timeline');

  useEffect(() => {
    let alive = true;
    api.get(`/api/admin/accelerator/sessions/${sessionId}/kit-config`)
      .then((res) => { if (alive) { setConfig(res.data.config); setDefaults(res.data.defaults); } })
      .catch(() => { if (alive) showToast('Could not load the current configuration — showing defaults', 'error'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [sessionId, showToast]);

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await api.put(`/api/admin/accelerator/sessions/${sessionId}/kit-config`, { config });
      showToast('Saved — the deck, outline, and readiness report will use this next time you open them', 'success');
      onClose();
    } catch { showToast('Failed to save', 'error'); }
    finally { setSaving(false); }
  };

  const statuses: Record<Exclude<CategoryKey, 'timeline'>, CategoryStatus> | null = useMemo(() => {
    if (!config || !defaults) return null;
    const openingSlots = defaults.dayKind === 'architecture' ? [config.opening.coldOpen, config.opening.hook]
      : defaults.dayKind === 'build' ? [config.opening.resultPreview] : [];
    const openingStatus: CategoryStatus = openingSlots.length === 0 ? 'default'
      : openingSlots.every((s) => !s.enabled) ? 'off'
        : openingSlots.some((s) => s.override != null) ? 'custom' : 'default';
    return {
      storyBeats: statusForCountAndOverride(config.storyBeats),
      teach: statusForCountAndOverride(config.teach),
      prompts: statusForCountAndOverride(config.prompts),
      interactions: statusForCountAndOverride(config.interactions),
      opening: openingStatus,
      evidence: config.evidenceOverrides != null ? 'custom' : 'default',
    };
  }, [config, defaults]);

  const generateQuestion = async (segment: string, instruction?: string): Promise<InteractionPlacement> => {
    const res = await api.post(`/api/admin/accelerator/sessions/${sessionId}/kit-config/generate-question`, { segment, instruction });
    return res.data.question;
  };

  async function rewriteCategory<T>(category: 'teach' | 'storyBeats' | 'prompts', currentItems: T[], instruction: string): Promise<T[]> {
    try {
      const res = await api.post(`/api/admin/accelerator/sessions/${sessionId}/kit-config/rewrite`, { category, currentItems, instruction });
      if (res.data.source === 'scaffold') showToast('No change — AI rewrite unavailable right now, kept your current list', 'error');
      return res.data.items;
    } catch {
      showToast('AI rewrite failed — kept your current list', 'error');
      return currentItems;
    }
  }
  const rewriteTeach = (items: TeachSlideOverride[], instruction: string) => rewriteCategory('teach', items, instruction);
  const rewriteStoryBeats = (items: StoryBeatOverride[], instruction: string) => rewriteCategory('storyBeats', items, instruction);
  const rewritePrompts = (items: PromptOverride[], instruction: string) => rewriteCategory('prompts', items, instruction);

  const customizedCount = statuses ? Object.values(statuses).filter((s) => s !== 'default').length : 0;

  if (loading || !config || !defaults || !statuses) {
    return (
      <>
        <div className="modal-backdrop show" />
        <div className="modal show d-block" role="dialog" aria-modal="true">
          <div className="modal-dialog"><div className="modal-content p-4 text-center text-muted">Loading configuration…</div></div>
        </div>
      </>
    );
  }

  const promptsApplyHere = defaults.dayKind === 'build' && defaults.teach.length === 0;

  return (
    <>
      <div className="modal-backdrop show" />
      <div className="modal show d-block" role="dialog" aria-modal="true">
        <div className="modal-dialog modal-xl modal-dialog-scrollable">
          <div className="modal-content">
            <div className="modal-header">
              <div>
                <h5 className="modal-title mb-1">⚙️ Customize — {sessionTitle}</h5>
                <span className="badge bg-light text-dark border small">
                  {DAY_LABEL[defaults.dayKind]}{defaults.week != null ? ` · Week ${defaults.week}` : ''}
                </span>
              </div>
              <button type="button" className="btn-close" onClick={onClose} />
            </div>
            <div className="modal-body p-0">
              <div className="d-flex flex-column flex-md-row" style={{ minHeight: 480 }}>
                <div className="border-end bg-light" style={{ flex: '0 0 240px' }}>
                  <p className="text-muted small px-3 pt-3 mb-2">
                    Controls how this session's deck, outline, and readiness report build. Saves apply the next
                    time you open the deck — nothing to rebuild separately.
                  </p>
                  <div className="nav flex-column nav-pills p-2 gap-1">
                    {CATEGORIES.map((c) => (
                      <button key={c.key} type="button"
                        className={`nav-link text-start d-flex justify-content-between align-items-center ${active === c.key ? 'active' : ''}`}
                        onClick={() => setActive(c.key)}>
                        <span>{c.icon} {c.label}</span>
                        {c.key !== 'timeline' && <StatusBadge status={statuses[c.key]} />}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-grow-1 p-3" style={{ overflowY: 'auto' }}>
                  {active === 'timeline' && (
                    <TimelineBuilderPanel
                      dayKind={defaults.dayKind} segments={defaults.segments}
                      checkpoints={defaults.checkpoints} breakSegment={defaults.breakSegment}
                      storyBeats={{ config: config.storyBeats, defaults: defaults.storyBeats }}
                      teach={{ config: config.teach, defaults: defaults.teach }}
                      prompts={{ config: config.prompts, defaults: defaults.prompts }}
                      interactions={{ config: config.interactions, defaults: defaults.interactions }}
                      onChangeStoryBeats={(next) => setConfig({ ...config, storyBeats: next })}
                      onChangeTeach={(next) => setConfig({ ...config, teach: next })}
                      onChangePrompts={(next) => setConfig({ ...config, prompts: next })}
                      onChangeInteractions={(next) => setConfig({ ...config, interactions: next })}
                      onJumpToCategory={setActive}
                      onGenerateQuestion={generateQuestion} />
                  )}
                  {active === 'storyBeats' && (
                    <StoryBeatsPanel config={config.storyBeats} defaults={defaults.storyBeats}
                      onRewrite={rewriteStoryBeats}
                      onChange={(next) => setConfig({ ...config, storyBeats: next })} />
                  )}
                  {active === 'teach' && (
                    <TeachPanel config={config.teach} defaults={defaults.teach} dayLabel={DAY_LABEL[defaults.dayKind]}
                      onRewrite={rewriteTeach}
                      onChange={(next) => setConfig({ ...config, teach: next })} />
                  )}
                  {active === 'prompts' && (
                    <PromptsPanel config={config.prompts} defaults={defaults.prompts} dayKind={defaults.dayKind}
                      appliesToThisSession={promptsApplyHere}
                      buildBayDetail={config.buildBayDetail} onToggleDetail={(v) => setConfig({ ...config, buildBayDetail: v })}
                      onRewrite={rewritePrompts}
                      onChange={(next) => setConfig({ ...config, prompts: next })} />
                  )}
                  {active === 'interactions' && (
                    <InteractionsPanel config={config.interactions} defaults={defaults.interactions}
                      theaterEnabled={config.theaterEnabled} dayKind={defaults.dayKind}
                      onChange={(next) => setConfig({ ...config, interactions: next })}
                      onToggleTheater={(v) => setConfig({ ...config, theaterEnabled: v })}
                      onGenerateQuestion={generateQuestion} />
                  )}
                  {active === 'opening' && (
                    <OpeningPanel opening={config.opening} defaults={defaults.opening} dayKind={defaults.dayKind}
                      onChange={(next) => setConfig({ ...config, opening: next })} />
                  )}
                  {active === 'evidence' && (
                    <EvidencePanel overrides={config.evidenceOverrides} defaults={defaults.evidence}
                      onChange={(next) => setConfig({ ...config, evidenceOverrides: next })} />
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <span className="text-muted small me-auto">
                {customizedCount === 0 ? 'Running fully on authored defaults' : `${customizedCount} of ${CATEGORIES.length - 1} categories customized`}
              </span>
              <button className="btn btn-outline-secondary btn-sm" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default KitConfigModal;
