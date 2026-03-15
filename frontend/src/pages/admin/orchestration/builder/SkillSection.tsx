import React from 'react';
import { MiniSection } from './types';

interface Props {
  editing: Partial<MiniSection>;
  skillOptions: { value: string; label: string; sub?: string }[];
  sectionSkillIds?: string[];
}

export default function SkillSection({ editing, skillOptions, sectionSkillIds }: Props) {
  return (
    <div>
      {/* Section-level skills (inherited, read-only) */}
      <div className="mb-2">
        <h6 className="small fw-semibold mb-1" style={{ fontSize: 11, color: '#553c9a' }}>
          <i className="bi bi-diagram-3 me-1"></i>Section Skills
          <span className="badge ms-1" style={{ fontSize: 8, background: 'rgba(128,90,213,0.12)', color: '#553c9a' }}>inherited</span>
        </h6>
        <div className="d-flex flex-wrap gap-1">
          {(sectionSkillIds || []).map(id => {
            const skill = skillOptions.find(s => s.value === id);
            return (
              <span key={id} className="badge" style={{ fontSize: 9, background: 'rgba(128,90,213,0.12)', color: '#553c9a', border: '1px solid rgba(128,90,213,0.2)' }}>
                {skill?.label || id.slice(0, 8)}
              </span>
            );
          })}
          {(!sectionSkillIds || sectionSkillIds.length === 0) && (
            <span className="text-muted" style={{ fontSize: 10 }}>None assigned</span>
          )}
        </div>
        <span className="text-muted" style={{ fontSize: 9 }}>
          <i className="bi bi-info-circle me-1"></i>Edit in Section Blueprint
        </span>
      </div>

      {/* Mini-section associated skills (read-only display) */}
      {(editing.associated_skill_ids || []).length > 0 && (
        <div className="mb-1">
          <span className="text-muted" style={{ fontSize: 10 }}>Mini-section skills:</span>
          <div className="d-flex flex-wrap gap-1 mt-1">
            {(editing.associated_skill_ids || []).map(id => {
              const skill = skillOptions.find(s => s.value === id);
              return (
                <span key={id} className="badge bg-light text-dark border" style={{ fontSize: 9 }}>
                  {skill?.label || id.slice(0, 8)}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
