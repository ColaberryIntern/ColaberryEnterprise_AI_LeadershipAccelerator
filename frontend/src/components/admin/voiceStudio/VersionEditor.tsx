import React, { useMemo, useState } from 'react';
import { SectionCard } from '../shell';
import { saveDraft, studioErrorMessage, validateContent, type AgentVersion, type ValidateResult, type VersionContent } from '../../../services/voiceStudioApi';
import { lineDiff } from './voiceStudioFormat';

/**
 * Draft editor (VS3.3). Edits never change an existing version: Save creates a new DRAFT (the same
 * content twice returns the same draft). Validate is a dry run on the server: schema, the rendered
 * call (system prompt + greeting) and the tools the call would actually get. The diff is against the
 * agent's active (published) version.
 */
export const KNOWN_TOOLS = ['next_open_strategy_slots', 'admissions_knowledge', 'transfer_to_human'] as const;

export function contentOf(v: AgentVersion): VersionContent {
  return {
    prompt: v.prompt, first_message: v.first_message, disclosure: v.disclosure, kb_refs: v.kb_refs, tool_permissions: v.tool_permissions,
    engine: v.engine, engine_config: v.engine_config, voice_id: v.voice_id, language: v.language, safety_policy: v.safety_policy, max_call_seconds: v.max_call_seconds,
  };
}

interface Props {
  profileId: string;
  base: AgentVersion;
  active: AgentVersion | null;
  onSaved: () => void;
}

export default function VersionEditor({ profileId, base, active, onSaved }: Props): React.ReactElement {
  const [draft, setDraft] = useState<VersionContent>(() => contentOf(base));
  const [result, setResult] = useState<ValidateResult | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const diff = useMemo(() => (active ? lineDiff(active.prompt, draft.prompt) : []), [active, draft.prompt]);
  const changed = diff.filter((d) => d.kind !== 'same').length;

  const set = <K extends keyof VersionContent>(k: K, v: VersionContent[K]) => { setDraft((d) => ({ ...d, [k]: v })); setResult(null); };
  const toggleTool = (t: string) => set('tool_permissions', draft.tool_permissions.includes(t) ? draft.tool_permissions.filter((x) => x !== t) : [...draft.tool_permissions, t]);

  const run = async (fn: () => Promise<void>) => { setBusy(true); setMessage(null); try { await fn(); } finally { setBusy(false); } };
  const validate = () => run(async () => {
    try { setResult(await validateContent(profileId, draft)); } catch (e) { setMessage({ tone: 'danger', text: studioErrorMessage(e, 'Validation could not run. Try again.') }); }
  });
  const save = () => run(async () => {
    try {
      const r = await saveDraft(profileId, draft);
      setMessage({ tone: 'success', text: r.created ? `Saved as draft version ${r.version.version}. It needs a second person to approve it.` : `No change: this content is already version ${r.version.version}.` });
      onSaved();
    } catch (e) { setMessage({ tone: 'danger', text: studioErrorMessage(e, 'The draft was not saved. Try again.') }); }
  });

  return (
    <SectionCard title={`Edit, starting from version ${base.version}`} icon="edit-2-line">
      <div className="mb-3">
        <label className="form-label small fw-semibold" htmlFor="vs-prompt">Prompt</label>
        <textarea id="vs-prompt" className="form-control form-control-sm font-monospace" rows={8} value={draft.prompt} onChange={(e) => set('prompt', e.target.value)} />
        {draft.engine_config.promptShell && <div className="form-text">This agent is a prompt-only shell: {'{prompt}'} is replaced by each call's own script, and a call without one is refused.</div>}
      </div>
      <div className="row g-3 mb-3">
        <div className="col-md-6">
          <label className="form-label small fw-semibold" htmlFor="vs-first">First message</label>
          <input id="vs-first" className="form-control form-control-sm" value={draft.first_message ?? ''} onChange={(e) => set('first_message', e.target.value || null)} />
        </div>
        <div className="col-md-6">
          <label className="form-label small fw-semibold" htmlFor="vs-disclosure">AI disclosure (required)</label>
          <input id="vs-disclosure" className="form-control form-control-sm" value={draft.disclosure} onChange={(e) => set('disclosure', e.target.value)} />
        </div>
      </div>
      <fieldset className="mb-3">
        <legend className="form-label small fw-semibold">Tools this version may use</legend>
        <div className="d-flex flex-wrap gap-3">
          {KNOWN_TOOLS.map((t) => (
            <div className="form-check" key={t}>
              <input className="form-check-input" type="checkbox" id={`vs-tool-${t}`} checked={draft.tool_permissions.includes(t)} onChange={() => toggleTool(t)} />
              <label className="form-check-label small font-monospace" htmlFor={`vs-tool-${t}`}>{t}</label>
            </div>
          ))}
        </div>
        <div className="form-text">A tool also needs a grant for this agent and must be read-only; Validate shows what a call would really get.</div>
      </fieldset>

      {active && (
        <details className="mb-3" data-testid="diff">
          <summary className="small">Changes to the prompt against the active version {active.version}: {changed === 0 ? 'none' : `${changed} line${changed === 1 ? '' : 's'}`}</summary>
          <pre className="small bg-light border rounded p-2 mt-2 mb-0" style={{ maxHeight: 240, overflow: 'auto' }}>
            {diff.map((d, i) => <div key={i} className={d.kind === 'added' ? 'text-success' : d.kind === 'removed' ? 'text-danger' : 'text-muted'}>{d.kind === 'added' ? '+ ' : d.kind === 'removed' ? '- ' : '  '}{d.text}</div>)}
          </pre>
        </details>
      )}

      <div className="d-flex flex-wrap gap-2 mb-2">
        <button type="button" className="btn btn-sm btn-outline-primary" disabled={busy} onClick={() => { void validate(); }}>Validate</button>
        <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => { void save(); }}>Save as draft</button>
      </div>
      <div role="status" aria-live="polite">
        {message && <div className={`alert alert-${message.tone} small mb-2`}>{message.text}</div>}
        {result && !result.valid && (
          <div className="alert alert-warning small mb-0" data-testid="validate-issues"><strong>Not valid yet:</strong><ul className="mb-0">{result.issues.map((x) => <li key={x}>{x}</li>)}</ul></div>
        )}
        {result && result.valid && (
          <div className="small" data-testid="validate-ok">
            <p className="mb-1"><strong>Valid.</strong> Content hash <code>{result.hash.slice(0, 12)}</code>.</p>
            <p className="mb-1">Tools a call would get: {result.tools.allowed.length ? result.tools.allowed.map((t) => <code key={t} className="me-1">{t}</code>) : 'none'}</p>
            {result.tools.denied.length > 0 && <p className="mb-1 text-muted">Not available: {result.tools.denied.map((d) => `${d.name} (${d.reason.replace(/_/g, ' ')})`).join(', ')}</p>}
            {result.preview.ok ? <p className="mb-0">The call opens with: <em>{result.preview.greeting}</em></p> : <p className="mb-0 text-warning">Preview: {result.preview.reason.replace(/_/g, ' ')}</p>}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
