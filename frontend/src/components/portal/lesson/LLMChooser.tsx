import React from 'react';
import { useMentorContext } from '../../../contexts/MentorContext';

export default function LLMChooser() {
  const { selectedLLM, setSelectedLLMById, llmOptions } = useMentorContext();

  return (
    <div className="d-inline-flex align-items-center gap-2">
      <span className="small" style={{ color: '#64748b', fontSize: 11 }}>AI Workspace:</span>
      <select
        className="form-select form-select-sm"
        style={{
          fontSize: 12,
          padding: '3px 28px 3px 10px',
          height: 28,
          borderRadius: 14,
          borderColor: '#c7d2fe',
          color: '#4338ca',
          fontWeight: 600,
          maxWidth: 150,
          background: '#eef2ff',
        }}
        value={selectedLLM.id}
        onChange={(e) => setSelectedLLMById(e.target.value)}
      >
        {llmOptions.map(llm => (
          <option key={llm.id} value={llm.id}>{llm.name}</option>
        ))}
      </select>
    </div>
  );
}
