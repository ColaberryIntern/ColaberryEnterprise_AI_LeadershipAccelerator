import React from 'react';
import type { Poll } from '../../../../services/contentComposerApi';

/**
 * ComposerPollEditor — the question, two to four answers, and how long voting stays open.
 *
 * Presentational, like the rest of the composer. The limits printed here are the WIDEST any
 * network allows (the backend's PollSchema); the per-network ones (LinkedIn's 30-character
 * options, X's 25) are applied by Validate with the network's own number, the same way text
 * length is. Saying "25" here would be wrong for LinkedIn and saying nothing would surprise
 * X users two steps later, so the hint names both.
 */

export const EMPTY_POLL: Poll = { question: '', options: ['', ''], durationDays: 3 };

const DURATIONS: Array<{ days: number; label: string }> = [
  { days: 1, label: '1 day' },
  { days: 3, label: '3 days' },
  { days: 7, label: '7 days' },
  { days: 14, label: '14 days (LinkedIn only)' },
];

export interface ComposerPollEditorProps {
  value: Poll;
  busy: boolean;
  onChange: (next: Poll) => void;
}

export default function ComposerPollEditor({ value, busy, onChange }: ComposerPollEditorProps) {
  const setOption = (i: number, text: string) => onChange({ ...value, options: value.options.map((o, j) => (j === i ? text : o)) });
  const addOption = () => { if (value.options.length < 4) onChange({ ...value, options: [...value.options, ''] }); };
  const removeOption = (i: number) => { if (value.options.length > 2) onChange({ ...value, options: value.options.filter((_, j) => j !== i) }); };

  return (
    <div className="border rounded p-3 bg-light" data-testid="poll-editor">
      <div className="mb-2">
        <label className="form-label small mb-1" htmlFor="poll-question">Poll question</label>
        <input id="poll-question" className="form-control form-control-sm" value={value.question} maxLength={280} disabled={busy}
          placeholder="What should we cover next?" onChange={(e) => onChange({ ...value, question: e.target.value })} />
        <div className="form-text">Up to 140 characters on LinkedIn. The message above is the post; this is the question inside the poll.</div>
      </div>
      <div className="mb-2">
        <div className="small mb-1">Options ({value.options.length} of 4)</div>
        {value.options.map((option, i) => (
          <div key={i} className="d-flex gap-2 mb-1">
            <input className="form-control form-control-sm" aria-label={`Option ${i + 1}`} data-testid={`poll-option-${i + 1}`} value={option} maxLength={80} disabled={busy}
              placeholder={`Option ${i + 1}`} onChange={(e) => setOption(i, e.target.value)} />
            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={busy || value.options.length <= 2} onClick={() => removeOption(i)} aria-label={`Remove option ${i + 1}`}>×</button>
          </div>
        ))}
        <button type="button" className="btn btn-sm btn-link px-0" disabled={busy || value.options.length >= 4} onClick={addOption} data-testid="poll-add-option">+ Add option</button>
        <div className="form-text">Two to four. LinkedIn allows 30 characters per option, X allows 25.</div>
      </div>
      <div>
        <label className="form-label small mb-1" htmlFor="poll-duration">Voting open for</label>
        <select id="poll-duration" className="form-select form-select-sm w-auto" value={value.durationDays} disabled={busy} onChange={(e) => onChange({ ...value, durationDays: Number(e.target.value) })}>
          {DURATIONS.map((d) => <option key={d.days} value={d.days}>{d.label}</option>)}
        </select>
      </div>
    </div>
  );
}
