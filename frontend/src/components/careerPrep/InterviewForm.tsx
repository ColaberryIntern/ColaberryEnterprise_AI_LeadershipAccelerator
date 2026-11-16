import React, { useState } from 'react';
import type { NewInterview } from './careerPrepApi';
import type { PrepForm } from './useCareerPrep';
import { TYPE_CARDS } from './logic/anchorOptions';

/**
 * Career Prep v27 (CP3.3): "Add an interview" (company, role, type, date and time in Central, job
 * description) and "Create one for me" (the role; the type was picked from Cora's cards). The date is
 * entered in Central and sent as UTC ISO. The server validates everything again.
 */
/** "2026-11-19T14:00" typed in Central -> the UTC ISO instant. Handles CST and CDT. */
export function centralLocalToIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const asUtc = new Date(`${local}:00Z`);
  for (const offset of [6, 5]) {
    const guess = new Date(asUtc.getTime() + offset * 3_600_000);
    const shown = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .format(guess).replace(', ', 'T');
    if (shown === local) return guess.toISOString();
  }
  return null;
}

export function InterviewForm({ form, busy, onSubmit, onCancel }: { form: Exclude<PrepForm, null>; busy: boolean; onSubmit: (b: NewInterview) => void; onCancel: () => void }): React.ReactElement {
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [type, setType] = useState(form.mode === 'practice' ? form.type : 'technical');
  const [when, setWhen] = useState('');
  const [jd, setJd] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!role.trim() || (form.mode === 'add' && !company.trim())) { setProblem('Fill in the company and the role.'); return; }
    if (form.mode === 'practice') { onSubmit({ mode: 'practice', role: role.trim(), type: form.type }); return; }
    const startsAt = when ? centralLocalToIso(when) : null;
    if (when && !startsAt) { setProblem('That date and time does not exist in Central time.'); return; }
    onSubmit({ mode: 'add', company: company.trim(), role: role.trim(), type, startsAt, ...(jd.trim() ? { jdText: jd.trim() } : {}) });
  };

  return (
    <form className="cp-form" onSubmit={submit} aria-label={form.mode === 'add' ? 'Add an interview' : 'Create a practice interview'} data-testid="cp-form">
      {form.mode === 'add' && <label>Company<input value={company} onChange={(e) => setCompany(e.target.value)} maxLength={120} required /></label>}
      <label>Role<input value={role} onChange={(e) => setRole(e.target.value)} maxLength={120} required /></label>
      {form.mode === 'add' && (
        <>
          <label>Interview type
            <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              {TYPE_CARDS.map((t) => <option key={t.type} value={t.type}>{t.title}</option>)}
            </select>
          </label>
          <label>Date and time (Central)<input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></label>
          <label>Job description or invite (optional)<textarea rows={4} maxLength={20000} value={jd} onChange={(e) => setJd(e.target.value)} /></label>
        </>
      )}
      {problem && <p role="alert" className="cp-form-problem">{problem}</p>}
      <div className="cp-form-actions">
        <button type="submit" className="cp-send" disabled={busy}>{form.mode === 'add' ? 'Save interview' : 'Create practice interview'}</button>
        <button type="button" className="cp-chip" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}
