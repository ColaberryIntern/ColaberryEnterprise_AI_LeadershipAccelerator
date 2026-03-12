import React, { useState } from 'react';
import { MiniSection } from './types';
import MultiSelect from './MultiSelect';

interface RecalcResult {
  matched: { id: string; name: string }[];
  created: { id: string; name: string }[];
  associated_skill_ids: string[];
}

interface Props {
  editing: Partial<MiniSection>;
  editType?: string;
  miniSectionId?: string;
  skillOptions: { value: string; label: string; sub?: string }[];
  onUpdate: (updates: Partial<MiniSection>) => void;
  onCreateSkill: () => void;
  token?: string;
  apiUrl?: string;
  onSkillsRecalculated?: () => void;
}

export default function SkillSection({ editing, editType, miniSectionId, skillOptions, onUpdate, onCreateSkill, token, apiUrl, onSkillsRecalculated }: Props) {
  const [recalculating, setRecalculating] = useState(false);
  const [recalcResult, setRecalcResult] = useState<RecalcResult | null>(null);
  const [recalcError, setRecalcError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);

  const isImplementationTask = editType === 'implementation_task';
  const hasBuildPrompt = !!(editing.build_prompt_system as string);

  const handleRecalculate = async () => {
    if (!miniSectionId || !token) return;
    setRecalculating(true);
    setRecalcError(null);
    setRecalcResult(null);
    try {
      const base = apiUrl || '';
      const resp = await fetch(`${base}/api/admin/orchestration/mini-sections/${miniSectionId}/recalculate-skills`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }
      const result: RecalcResult = await resp.json();
      setRecalcResult(result);
      onUpdate({ associated_skill_ids: result.associated_skill_ids });
      onSkillsRecalculated?.();
    } catch (err: any) {
      setRecalcError(err.message || 'Failed to recalculate skills');
    } finally {
      setRecalculating(false);
    }
  };

  return (
    <div>
      {isImplementationTask && (
        <div className="mb-2">
          <div className="d-flex align-items-center gap-2 mb-2">
            <span className="text-muted" style={{ fontSize: 10 }}>
              Skills are derived from the Task Requirements Prompt
            </span>
            <button
              className="btn btn-sm btn-outline-primary py-0 px-2 ms-auto"
              style={{ fontSize: 10 }}
              onClick={handleRecalculate}
              disabled={recalculating || !hasBuildPrompt || !miniSectionId}
              title={!hasBuildPrompt ? 'Add a Task Requirements Prompt first' : 'Analyze prompt and auto-link skills'}
            >
              {recalculating ? (
                <><span className="spinner-border spinner-border-sm me-1" style={{ width: 10, height: 10 }}></span>Analyzing...</>
              ) : (
                <><i className="bi bi-arrow-clockwise me-1"></i>Recalculate Skills</>
              )}
            </button>
          </div>

          {recalcError && (
            <div className="alert alert-danger py-1 px-2 mb-2" style={{ fontSize: 10 }}>
              {recalcError}
            </div>
          )}

          {recalcResult && (
            <div className="mb-2">
              {recalcResult.matched.length > 0 && (
                <div className="mb-1">
                  {recalcResult.matched.map(s => (
                    <span key={s.id} className="badge me-1 mb-1" style={{ fontSize: 9, background: 'rgba(56,161,105,0.15)', color: '#276749', border: '1px solid rgba(56,161,105,0.3)' }}>
                      {s.name} <span className="text-muted">matched</span>
                    </span>
                  ))}
                </div>
              )}
              {recalcResult.created.length > 0 && (
                <div className="mb-1">
                  {recalcResult.created.map(s => (
                    <span key={s.id} className="badge me-1 mb-1" style={{ fontSize: 9, background: 'rgba(236,201,75,0.15)', color: '#975a16', border: '1px solid rgba(236,201,75,0.3)' }}>
                      {s.name} <span className="text-muted">new</span>
                    </span>
                  ))}
                </div>
              )}
              <span className="text-muted" style={{ fontSize: 9 }}>
                {recalcResult.associated_skill_ids.length} skill{recalcResult.associated_skill_ids.length !== 1 ? 's' : ''} linked
              </span>
            </div>
          )}

          {/* Show current skills as badges if no fresh recalc result */}
          {!recalcResult && (editing.associated_skill_ids || []).length > 0 && (
            <div className="mb-1">
              {(editing.associated_skill_ids || []).map(id => {
                const skill = skillOptions.find(s => s.value === id);
                return (
                  <span key={id} className="badge bg-light text-dark border me-1 mb-1" style={{ fontSize: 9 }}>
                    {skill?.label || id.slice(0, 8)}
                  </span>
                );
              })}
            </div>
          )}

          <button
            className="btn btn-link p-0 text-muted"
            style={{ fontSize: 9 }}
            onClick={() => setShowManual(!showManual)}
          >
            <i className={`bi bi-chevron-${showManual ? 'down' : 'right'} me-1`}></i>
            Manual Override
          </button>
        </div>
      )}

      {/* Manual MultiSelect — always shown for non-implementation_task, collapsible for implementation_task */}
      {(!isImplementationTask || showManual) && (
        <div>
          <div className="d-flex justify-content-between align-items-center mb-1">
            <span></span>
            <button className="btn btn-link p-0" onClick={onCreateSkill} style={{ fontSize: 10 }}>+ Create Skill</button>
          </div>
          <MultiSelect
            label="Associated Skills"
            options={skillOptions}
            selected={editing.associated_skill_ids || []}
            onChange={vals => onUpdate({ associated_skill_ids: vals })}
          />
        </div>
      )}
    </div>
  );
}
