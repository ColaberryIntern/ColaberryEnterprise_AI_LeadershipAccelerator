import React, { useState } from 'react';
import { ASK_CORY_RESPONSES, DEFAULT_CORY_RESPONSE } from './demoData';
import { STANDARD_CTAS } from '../../config/programSchedule';

interface AskCoryInputProps {
  onNavigate: () => void;
}

export default function AskCoryInput({ onNavigate }: AskCoryInputProps) {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState('');

  const handleAsk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    const lower = query.toLowerCase();
    const match = ASK_CORY_RESPONSES.find((r) =>
      r.keywords.some((kw) => lower.includes(kw)),
    );
    setResponse(match ? match.response : DEFAULT_CORY_RESPONSE);
  };

  return (
    <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
      <form onSubmit={handleAsk} className="d-flex gap-2 mb-3">
        <label htmlFor="ask-cory-input" className="visually-hidden">
          Ask Cory a question
        </label>
        <input
          id="ask-cory-input"
          type="text"
          className="form-control form-control-sm"
          placeholder="Ask Cory about this organization..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="btn btn-sm btn-outline-primary flex-shrink-0">
          Ask
        </button>
      </form>

      {response && (
        <div className="p-3 rounded small" style={{ background: 'var(--color-bg-alt)' }}>
          <p className="mb-2">{response}</p>
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            onClick={onNavigate}
          >
            {STANDARD_CTAS.primary}
          </button>
        </div>
      )}
    </div>
  );
}
