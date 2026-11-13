import React, { useEffect, useState } from 'react';
import { INTRO_QUESTIONS, saveHireIntro, type HireIntro, type IntroQuestionKey, type WorkSetup } from '../../../../services/hireStudioApi';
import { toggleIn, type Loaded } from './hireStudioModel';
import { sectionState } from './HireSectionState';

/**
 * About you (kit §3.3): headline, three questions, roles and work setup, city, earliest start and
 * work authorization. Work authorization is INTERNAL: it is never sent to Hire. A changed
 * headline goes back through review (the frozen-at-approval rule), so it is saved as a draft.
 */

const SETUPS: ReadonlyArray<{ value: WorkSetup; label: string }> = [
  { value: 'remote', label: 'Remote' }, { value: 'hybrid', label: 'Hybrid' }, { value: 'onsite', label: 'Onsite' },
];
const SUGGESTED_ROLES = ['AI Systems Architect', 'Forward Deployed Engineer', 'AI Engineer', 'Data Engineer', 'Solutions Architect', 'Analytics Engineer'];
const WORK_AUTH = ['Authorized, no sponsorship needed', 'Will need sponsorship'];
const MAX_ROLES = 5;

interface Props {
  loaded: Loaded<HireIntro>;
  onSaved: (v: HireIntro) => void;
  onRetry: () => void;
}

const HireAboutYou: React.FC<Props> = ({ loaded, onSaved, onRetry }) => {
  const [draft, setDraft] = useState<HireIntro | null>(loaded.value);
  const [roleInput, setRoleInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setDraft(loaded.value); }, [loaded.value]);

  const state = sectionState(loaded, onRetry, 'answers');
  if (state || !draft) return state;

  const answer = (key: IntroQuestionKey) => draft.answers.find((a) => a.key === key)?.text ?? '';
  const setAnswer = (key: IntroQuestionKey, text: string) => setDraft({
    ...draft,
    answers: [...draft.answers.filter((a) => a.key !== key), { key, text }]
      .sort((a, b) => INTRO_QUESTIONS.findIndex((q) => q.key === a.key) - INTRO_QUESTIONS.findIndex((q) => q.key === b.key)),
  });
  const toggleRole = (role: string) => {
    const r = role.trim();
    if (!r) return;
    if (!draft.roles.includes(r) && draft.roles.length >= MAX_ROLES) { setMessage({ ok: false, text: `Pick up to ${MAX_ROLES} roles.` }); return; }
    setDraft({ ...draft, roles: toggleIn(draft.roles, r) });
  };

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const clean: HireIntro = {
        ...draft,
        headlineDraft: draft.headlineDraft?.trim() || null,
        answers: draft.answers.map((a) => ({ ...a, text: a.text.trim() })).filter((a) => a.text),
        location: draft.location?.trim() || null,
        workAuth: draft.workAuth || null,
        earliestStart: draft.earliestStart || null,
      };
      onSaved(await saveHireIntro(clean));
      setMessage({ ok: true, text: 'Saved. Your answers show on Hire within two minutes.' });
    } catch (e: any) {
      setMessage({ ok: false, text: e?.response?.data?.error || 'That did not save. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const allRoles = [...new Set([...SUGGESTED_ROLES, ...draft.roles])];

  return (
    <section className="cp-card" aria-labelledby="hs-about-h" data-testid="hs-about">
      <h3 className="cp-card-h" id="hs-about-h">About you</h3>

      <label className="hs-field">
        <span>Headline</span>
        <input maxLength={90} value={draft.headlineDraft ?? ''} onChange={(e) => setDraft({ ...draft, headlineDraft: e.target.value })} data-testid="hs-headline" />
        <small className="cp-muted">One line under your name. Saved as a draft: your live headline stays as it is until the Colaberry team approves a change.</small>
      </label>

      {INTRO_QUESTIONS.map((q) => (
        <label className="hs-field" key={q.key}>
          <span>{q.text}</span>
          <textarea rows={3} maxLength={400} value={answer(q.key)} onChange={(e) => setAnswer(q.key, e.target.value)} data-testid={`hs-q-${q.key}`} />
          <small className="cp-muted">{answer(q.key).length} / 400</small>
        </label>
      ))}

      <fieldset className="hs-fieldset">
        <legend>Roles you want (up to {MAX_ROLES})</legend>
        <div className="hs-chips">
          {allRoles.map((r) => (
            <button key={r} type="button" className="hs-chip" aria-pressed={draft.roles.includes(r)} onClick={() => toggleRole(r)} data-testid="hs-role">{r}</button>
          ))}
        </div>
        <div className="hs-inline">
          <label className="hs-field" style={{ flex: 1 }}>
            <span className="cp-sr">Another role</span>
            <input value={roleInput} maxLength={80} placeholder="Another role" onChange={(e) => setRoleInput(e.target.value)} data-testid="hs-role-input" />
          </label>
          <button type="button" className="cp-btn" onClick={() => { toggleRole(roleInput); setRoleInput(''); }} data-testid="hs-role-add">Add</button>
        </div>
      </fieldset>

      <fieldset className="hs-fieldset">
        <legend>Work setup</legend>
        <div className="hs-chips">
          {SETUPS.map((s) => (
            <button key={s.value} type="button" className="hs-chip" aria-pressed={draft.setups.includes(s.value)}
              onClick={() => setDraft({ ...draft, setups: toggleIn(draft.setups, s.value) })} data-testid={`hs-setup-${s.value}`}>{s.label}</button>
          ))}
        </div>
      </fieldset>

      <div className="hs-grid3">
        <label className="hs-field">
          <span>City, state</span>
          <input autoComplete="address-level2" maxLength={120} value={draft.location ?? ''} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
        </label>
        <label className="hs-field">
          <span>Earliest start</span>
          <input type="date" value={draft.earliestStart ?? ''} onChange={(e) => setDraft({ ...draft, earliestStart: e.target.value || null })} data-testid="hs-start" />
        </label>
        <label className="hs-field">
          <span>Work authorization</span>
          <select value={draft.workAuth ?? ''} onChange={(e) => setDraft({ ...draft, workAuth: e.target.value || null })} data-testid="hs-auth">
            <option value="">Choose one</option>
            {WORK_AUTH.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
          <small className="cp-muted">Only the Colaberry team sees this. It is never shown on Hire.</small>
        </label>
      </div>

      <div className="hs-actions">
        <button type="button" className="cp-btn cp-btn-primary" disabled={busy} onClick={save} data-testid="hs-about-save">Save</button>
        {message && <p className={message.ok ? 'cp-ok' : 'hs-error'} role={message.ok ? 'status' : 'alert'} data-testid="hs-about-msg">{message.text}</p>}
      </div>
    </section>
  );
};

export default HireAboutYou;
