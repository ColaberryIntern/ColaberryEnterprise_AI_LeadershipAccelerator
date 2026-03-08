import React from 'react';
import { MiniSection } from './types';
import MultiSelect from './MultiSelect';

interface Props {
  editing: Partial<MiniSection>;
  skillOptions: { value: string; label: string; sub?: string }[];
  onUpdate: (updates: Partial<MiniSection>) => void;
  onCreateSkill: () => void;
}

export default function SkillSection({ editing, skillOptions, onUpdate, onCreateSkill }: Props) {
  return (
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
  );
}
