import React from 'react';
import { MiniSection } from './types';

interface Props {
  editing: Partial<MiniSection>;
  onUpdate: (updates: Partial<MiniSection>) => void;
}

export default function KnowledgeCheckSection({ editing, onUpdate }: Props) {
  if (editing.mini_section_type !== 'knowledge_check') return null;

  const kc = editing.knowledge_check_config || { enabled: false, question_count: 3, pass_score: 70 };

  return (
    <div>
      <div className="d-flex gap-3 align-items-center flex-wrap">
        <div className="form-check">
          <input
            className="form-check-input"
            type="checkbox"
            checked={kc.enabled}
            onChange={e => onUpdate({ knowledge_check_config: { ...kc, enabled: e.target.checked } })}
            id="kc-enabled"
          />
          <label className="form-check-label small" htmlFor="kc-enabled">Enabled</label>
        </div>
        <div>
          <label className="form-label small mb-0" htmlFor="kc-count">Questions</label>
          <input
            className="form-control form-control-sm"
            type="number"
            id="kc-count"
            style={{ width: 65 }}
            value={kc.question_count}
            onChange={e => onUpdate({ knowledge_check_config: { ...kc, question_count: parseInt(e.target.value) || 3 } })}
          />
        </div>
        <div>
          <label className="form-label small mb-0" htmlFor="kc-pass">Pass %</label>
          <input
            className="form-control form-control-sm"
            type="number"
            id="kc-pass"
            style={{ width: 65 }}
            value={kc.pass_score}
            onChange={e => onUpdate({ knowledge_check_config: { ...kc, pass_score: parseInt(e.target.value) || 70 } })}
          />
        </div>
      </div>
      <div className="text-muted mt-1" style={{ fontSize: 10 }}>
        Knowledge checks assess skills and influence gating. Reflection questions are auto-generated.
      </div>
    </div>
  );
}
