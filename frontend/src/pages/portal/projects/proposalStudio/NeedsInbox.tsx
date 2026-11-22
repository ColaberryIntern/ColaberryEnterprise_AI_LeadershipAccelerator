import React, { useCallback, useEffect, useState } from 'react';
import type { GovProposalDocument, GovStudioApi, GovProjectNeed } from '../../../../services/govProjectPortalApi';
import type { StudioView } from './StageRail';
import { needControl, needKindLabel, unblockLabel, submissionFor, recordTypeLabel, recordFieldsFor, recordPrimaryField, recordFieldLabel, recordSubmission, type NeedControl } from './needsHelpers';

/**
 * NeedsInbox — the v3 "Needs you" view (T15), replacing Open items. The ONE list of exactly what a person must supply
 * before the proposal can ship: each typed need as a card with its ask, why, the documents it unblocks, the expected
 * format, and an inline control by kind. Resolving a need calls the resolve route and reloads; the agent auto-resumes
 * the documents it unblocked. Grouped Blocking-export (fatal) first, then Holding-score. Pricing + ungivable approvals
 * are already dropped server-side for interns, so the view renders whatever the needs route returns.
 */
export default function NeedsInbox(
  { projectId, docs, studioApi, onReload, onNavigate, onToast, onOpenDossier }:
  { projectId: string; docs: GovProposalDocument[]; studioApi: GovStudioApi; onReload: () => void; onNavigate: (v: StudioView) => void; onToast: (m: string) => void; onOpenDossier?: () => void },
): React.ReactElement {
  const [needs, setNeeds] = useState<GovProjectNeed[] | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(() => {
    studioApi.listNeeds(projectId).then((g) => setNeeds(g.needs)).catch(() => setNeeds([]));
  }, [projectId, studioApi]);
  useEffect(() => { load(); }, [load]);

  const titleFor = (docKey: string): string => docs.find((d) => d.key === docKey)?.title ?? docKey;

  const submitResolve = useCallback(async (need: GovProjectNeed, submission: Parameters<typeof studioApi.resolveNeed>[2]) => {
    setBusyKey(need.key);
    try {
      const r = await studioApi.resolveNeed(projectId, need.key, submission);
      onToast(r.unblocked.length ? `Answered — the agent is resuming ${r.unblocked.length} document${r.unblocked.length === 1 ? '' : 's'}.` : 'Answered.');
      load();
      onReload();
    } catch {
      onToast('That could not be saved. Please try again.');
    } finally {
      setBusyKey(null);
    }
  }, [projectId, studioApi, onReload, onToast, load]);

  const resolve = useCallback((need: GovProjectNeed, control: NeedControl, value: string) => submitResolve(need, submissionFor(control, value)), [submitResolve]);
  const resolveRecord = useCallback((need: GovProjectNeed, fields: Record<string, string>) => submitResolve(need, recordSubmission(fields)), [submitResolve]);

  if (needs === null) return <div className="gps-view"><div className="gps-panel"><p className="gps-muted" style={{ margin: 0 }}>Loading what needs you…</p></div></div>;

  const blocking = needs.filter((n) => n.blocking === 'fatal');
  const holding = needs.filter((n) => n.blocking !== 'fatal');

  return (
    <div className="gps-view" data-tour="needs">
      <div className="gps-vh"><div>
        <h2>Needs you <button type="button" data-testid="help" className="gps-help" title="About this view" onClick={() => onToast('Needs you: everything only a person can supply before this proposal ships. Answer one and the agent resumes the documents it unblocks.')}>i</button></h2>
        <p>Everything only a person can supply before this proposal ships. Answer one and the agent picks the document back up automatically.</p>
        <p className="gps-small gps-muted" style={{ marginTop: 2 }}>Your answer is not pasted in word for word. The agent rewrites the section to work it in so it reads in context, and reuses it on the next bid that asks the same thing.</p>
      </div></div>

      {needs.length === 0 ? (
        <div className="gps-panel"><p className="gps-muted" style={{ margin: 0 }}>Nothing needs you right now. The agent has what it needs — follow progress in Where we are, or review the gates.</p></div>
      ) : (
        <>
          <NeedGroup testid="needs-group-fatal" label="Blocking export" tone="bad" needs={blocking} busyKey={busyKey} titleFor={titleFor} onResolve={resolve} onResolveRecord={resolveRecord} onNavigate={onNavigate} onOpenDossier={onOpenDossier} />
          <NeedGroup testid="needs-group-score" label="Holding a score under 95" tone="warn" needs={holding} busyKey={busyKey} titleFor={titleFor} onResolve={resolve} onResolveRecord={resolveRecord} onNavigate={onNavigate} onOpenDossier={onOpenDossier} />
        </>
      )}
    </div>
  );
}

function NeedGroup(
  { testid, label, tone, needs, busyKey, titleFor, onResolve, onResolveRecord, onNavigate, onOpenDossier }:
  { testid: string; label: string; tone: string; needs: GovProjectNeed[]; busyKey: string | null; titleFor: (k: string) => string; onResolve: (n: GovProjectNeed, c: NeedControl, v: string) => void; onResolveRecord: (n: GovProjectNeed, fields: Record<string, string>) => void; onNavigate: (v: StudioView) => void; onOpenDossier?: () => void },
): React.ReactElement {
  return (
    <div className="gps-panel" data-testid={testid} style={{ marginTop: 14 }}>
      <h3><span className={`gps-tag ${tone}`}>{label}</span> <span className="gps-muted gps-small">{needs.length}</span></h3>
      <div className="gps-needs">
        {needs.length === 0 && <div className="gps-muted gps-small">None.</div>}
        {needs.map((n) => (
          <NeedCard key={n.key} need={n} busy={busyKey === n.key} titleFor={titleFor} onResolve={onResolve} onResolveRecord={onResolveRecord} onNavigate={onNavigate} onOpenDossier={onOpenDossier} />
        ))}
      </div>
    </div>
  );
}

function NeedCard(
  { need, busy, titleFor, onResolve, onResolveRecord, onNavigate, onOpenDossier }:
  { need: GovProjectNeed; busy: boolean; titleFor: (k: string) => string; onResolve: (n: GovProjectNeed, c: NeedControl, v: string) => void; onResolveRecord: (n: GovProjectNeed, fields: Record<string, string>) => void; onNavigate: (v: StudioView) => void; onOpenDossier?: () => void },
): React.ReactElement {
  const control = needControl(need);
  const [value, setValue] = useState('');
  const docKeys = [...new Set((need.usedIn || []).map((u) => u.docKey).filter(Boolean))];
  const border = need.blocking === 'fatal' ? 'var(--gps-bad)' : 'var(--gps-warn)';
  const blockLabel = need.blocking === 'fatal' ? 'blocks export' : 'holds a score under 95';
  const typeChip = control === 'record' ? recordTypeLabel(need.recordType) : needKindLabel(need.kind);
  // Global = a reusable company-dossier asset (one answer serves every bid); local = specific to this solicitation.
  const isGlobal = (need.scope ?? 'local') === 'global';

  return (
    <div className="gps-need-card gps-need-2col" data-testid="need-card" data-key={need.key} data-kind={need.kind} data-blocking={need.blocking} data-done="false" style={{ borderLeft: `3px solid ${border}` }}>
      <div className="gps-need-left" style={{ minWidth: 0 }}>
        <div className="gps-need-head">
          <span className="gps-tag">{typeChip}</span>
          <span className={`gps-tag ${need.blocking === 'fatal' ? 'bad' : 'warn'}`}>{blockLabel}</span>
          <span className={`gps-tag ${isGlobal ? 'ok' : ''}`} data-testid="need-scope" data-scope={isGlobal ? 'global' : 'local'} title={isGlobal ? 'Reusable company fact — one answer serves every bid. Add it in the Company Dossier.' : 'Specific to this solicitation — used only on this bid.'}>{isGlobal ? 'Company dossier' : 'This bid only'}</span>
          {(need.usedIn || []).some((u) => u.docKey === 'pricing') && <span className="gps-tag gold">admin only</span>}
        </div>
        <b style={{ display: 'block', marginTop: 4 }}>{need.ask}</b>
        {need.why && <div className="gps-small gps-muted" style={{ marginTop: 2 }}>{need.why}</div>}
        <div className="gps-small" data-testid="need-where" style={{ marginTop: 3 }}>
          {isGlobal ? (
            onOpenDossier
              ? <button type="button" className="gps-chip-btn gps-tag" data-testid="need-add-global" onClick={onOpenDossier}>Add in the Company Dossier &rarr;</button>
              : <span className="gps-muted">Add once in the Company Dossier &mdash; it is reused on every bid.</span>
          ) : (
            <span className="gps-muted" data-testid="need-add-local">Add it here &mdash; used only on this bid.</span>
          )}
        </div>
        {need.source && (
          <div className="gps-quote" data-testid="need-quote">&ldquo;{need.source.quote}&rdquo; <span className="gps-small gps-muted">— {need.source.file}{need.source.page ? `, p.${need.source.page}` : ''}</span></div>
        )}
        {(need.suggestions || []).some((s) => s && s.trim()) && (
          <div className="gps-small" data-testid="need-example" style={{ marginTop: 4, color: 'var(--gps-ok)' }}>Example of a good answer: {(need.suggestions || []).find((s) => s && s.trim())}</div>
        )}
        {docKeys.length > 0 && (
          <div className="gps-choice-row" style={{ marginTop: 4, alignItems: 'baseline' }}>
            <span className="gps-small gps-muted">Answering this unblocks:</span>
            {docKeys.map((k) => (
              <button key={k} type="button" data-testid="need-used" className="gps-tag gps-chip-btn" onClick={() => onNavigate('editor')}>{titleFor(k)}</button>
            ))}
          </div>
        )}
        <div className="gps-small gps-muted" data-testid="need-format" style={{ marginTop: 4 }}>Format: {need.format}</div>
      </div>

      <div className="gps-need-control" data-testid="need-control" data-control={control}>
        {control === 'record' ? (
          <RecordForm need={need} busy={busy} onResolveRecord={onResolveRecord} />
        ) : control === 'approve' ? (
          <button className="gps-btn sm" onClick={() => onNavigate('gates')}>Review &amp; decide at the Gold gate</button>
        ) : control === 'confirm' ? (
          <button className="gps-btn sm primary" disabled={busy} onClick={() => onResolve(need, control, 'yes')}>Confirm</button>
        ) : control === 'choice' ? (
          <div className="gps-choice-row">
            {(need.options || []).map((opt) => (
              <button key={opt} className="gps-btn sm" disabled={busy} onClick={() => onResolve(need, control, opt)}>{opt}</button>
            ))}
          </div>
        ) : control === 'file' ? (
          <label className="gps-file-drop">
            <input type="file" data-control="file" style={{ display: 'none' }} disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) onResolve(need, control, f.name); }} />
            <span className="gps-btn sm">Choose file</span>
          </label>
        ) : (
          <div className="gps-inline-field">
            <input className="gps-input" type={control === 'url' ? 'url' : 'text'} placeholder={control === 'url' ? 'https://…' : 'Type the answer'} value={value} onChange={(e) => setValue(e.target.value)} disabled={busy} />
            <button className="gps-btn sm primary" disabled={busy || !value.trim()} onClick={() => onResolve(need, control, value.trim())}>Save</button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * RecordForm — the grouped resolve control for a `record` need. One labeled field per `recordFields` (client, scope,
 * period, outcome for a reference; name, role, experience for a person), answered and saved as ONE record rather than
 * split into separate facts. The primary field (client / name) is required; the rest are optional. The answer is not
 * pasted in verbatim — the agent rewrites the section to work it in, and the record is reusable on the next bid.
 */
function RecordForm(
  { need, busy, onResolveRecord }:
  { need: GovProjectNeed; busy: boolean; onResolveRecord: (n: GovProjectNeed, fields: Record<string, string>) => void },
): React.ReactElement {
  const fields = (need.recordFields && need.recordFields.length ? need.recordFields : recordFieldsFor(need.recordType));
  const primary = recordPrimaryField(need.recordType);
  const [vals, setVals] = useState<Record<string, string>>({});
  const set = (k: string, v: string) => setVals((cur) => ({ ...cur, [k]: v }));
  const canSave = !!(vals[primary] && vals[primary].trim());
  const multiline = (k: string) => k === 'scope' || k === 'summary';

  return (
    <div className="gps-record-form" data-control="record" data-record-type={need.recordType || 'reference'}>
      {fields.map((f) => (
        <label key={f} className="gps-record-field" style={{ display: 'block', marginBottom: 6 }}>
          <span className="gps-small gps-muted">{recordFieldLabel(f)}{f === primary ? ' (required)' : ''}</span>
          {multiline(f) ? (
            <textarea className="gps-input" data-record-field={f} rows={2} value={vals[f] ?? ''} disabled={busy} onChange={(e) => set(f, e.target.value)} />
          ) : (
            <input className="gps-input" type="text" data-record-field={f} value={vals[f] ?? ''} disabled={busy} onChange={(e) => set(f, e.target.value)} />
          )}
        </label>
      ))}
      <button className="gps-btn sm primary" data-testid="need-record-save" disabled={busy || !canSave} onClick={() => onResolveRecord(need, vals)}>Save record</button>
    </div>
  );
}
