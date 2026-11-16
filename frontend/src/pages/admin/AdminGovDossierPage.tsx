import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader, SectionCard } from '../../components/admin/shell';
import {
  getDossier, addDossierItem, approveDossierItem, FACT_CATEGORIES,
  listCompanyDocs, uploadCompanyDoc, approveCompanyDoc, deleteCompanyDoc,
  type DossierLibrary, type DossierKind, type NewItem, type CompanyDoc,
} from '../../services/adminGovDossierApi';

/**
 * AdminGovDossierPage - "Gov Company Dossier", the tenant-wide fill-and-approve portal for the reusable company
 * library the Proposal Studio agent grounds on (Dossier Phase 2a). Facts (grouped by proposal-demand category),
 * past-performance references, and key personnel. Only APPROVED rows reach the drafter, so each row carries an
 * approve action. Hunt once here, reuse on every bid.
 */

type AddState = { kind: DossierKind } | null;
const CAT_LABEL = new Map(FACT_CATEGORIES.map((c) => [c.id, c.label]));

function Badge({ approved }: { approved: boolean }): React.ReactElement {
  return approved
    ? <span className="badge rounded-pill bg-success-subtle text-success-emphasis">Approved</span>
    : <span className="badge rounded-pill bg-warning-subtle text-warning-emphasis">Draft, not used yet</span>;
}

export default function AdminGovDossierPage(): React.ReactElement {
  const [lib, setLib] = useState<DossierLibrary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState<AddState>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setLib(await getDossier()); }
    catch { setError('Could not load the dossier. Retry below.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const approve = useCallback(async (kind: DossierKind, id: string) => {
    setBusyId(id);
    try { await approveDossierItem(kind, id); setNotice('Approved. The agent can now cite it.'); await load(); }
    catch { setError('Could not approve that item.'); }
    finally { setBusyId(null); }
  }, [load]);

  const save = useCallback(async (kind: DossierKind, input: NewItem) => {
    try { await addDossierItem(kind, input); setAdding(null); setNotice('Saved to the dossier.'); await load(); }
    catch { setError('Could not save that item.'); }
  }, [load]);

  const factsByCat = useMemo(() => {
    const groups = new Map<string, DossierLibrary['facts']>();
    for (const f of lib?.facts ?? []) {
      const key = f.category && CAT_LABEL.has(f.category) ? f.category : 'general';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(f);
    }
    return groups;
  }, [lib]);

  const counts = {
    facts: lib?.facts.length ?? 0,
    references: lib?.references.length ?? 0,
    personnel: lib?.personnel.length ?? 0,
  };
  const pending = (lib?.facts.filter((f) => !f.approved).length ?? 0)
    + (lib?.references.filter((r) => !r.approved).length ?? 0)
    + (lib?.personnel.filter((p) => !p.approved).length ?? 0);

  return (
    <div>
      <PageHeader
        title="Gov Company Dossier"
        subtitle="The reusable proof the proposal agent draws on. Only approved items are used; hunt it once here and every bid reuses it."
        icon="archive-2-line"
      >
        <p className="small text-secondary mb-0">
          {counts.facts} facts, {counts.references} references, {counts.personnel} people.
          {pending > 0 ? ` ${pending} waiting for approval.` : ' All approved.'}
        </p>
      </PageHeader>

      {error && (
        <div className="alert alert-danger d-flex justify-content-between align-items-center" role="alert">
          <span>{error}</span>
          <span className="d-flex gap-2">
            <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => void load()}>Retry</button>
            <button type="button" className="btn-close" aria-label="Dismiss" onClick={() => setError(null)} />
          </span>
        </div>
      )}
      {notice && (
        <div className="alert alert-success d-flex justify-content-between align-items-center" role="status">
          <span>{notice}</span>
          <button type="button" className="btn-close" aria-label="Dismiss" onClick={() => setNotice(null)} />
        </div>
      )}

      {loading ? (
        <p className="text-secondary" role="status">Loading the dossier...</p>
      ) : (
        <>
          <SectionCard className="mb-4" title="Company facts" icon="file-list-3-line"
            subtitle="Registrations, certifications, financials and other specifics the agent may assert. Grouped by what proposals ask for."
            actions={<button type="button" className="btn btn-primary btn-sm" data-testid="add-fact" onClick={() => setAdding({ kind: 'fact' })}><i className="ri-add-line me-1" aria-hidden="true" />Add fact</button>}>
            {counts.facts === 0 ? (
              <p className="text-secondary mb-0">No facts yet. Add your SAM, UEI, CAGE and DUNS, your reps and certs answers, and any quality certifications.</p>
            ) : (
              FACT_CATEGORIES.filter((c) => (factsByCat.get(c.id)?.length ?? 0) > 0).map((c) => (
                <div key={c.id} className="mb-3">
                  <h6 className="text-secondary small text-uppercase">{c.label}</h6>
                  <ul className="list-group">
                    {(factsByCat.get(c.id) ?? []).map((f) => (
                      <li key={f.id} className="list-group-item d-flex justify-content-between align-items-start gap-2" data-testid="fact-row">
                        <span><strong>{f.key}:</strong> {f.value}</span>
                        <span className="d-flex align-items-center gap-2 flex-shrink-0">
                          <Badge approved={f.approved} />
                          {!f.approved && <button type="button" className="btn btn-outline-success btn-sm" disabled={busyId === f.id} onClick={() => void approve('fact', f.id)}>Approve</button>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </SectionCard>

          <SectionCard className="mb-4" title="Past-performance references" icon="government-line"
            subtitle="Named clients with contract value, dates, scope and a reference contact. These are the assertable, real clients a proposal needs."
            actions={<button type="button" className="btn btn-primary btn-sm" data-testid="add-reference" onClick={() => setAdding({ kind: 'reference' })}><i className="ri-add-line me-1" aria-hidden="true" />Add reference</button>}>
            {counts.references === 0 ? (
              <p className="text-secondary mb-0">No references yet. Add three to five past contracts with a named client, value, period of performance and a contact.</p>
            ) : (
              <ul className="list-group">
                {lib!.references.map((r) => (
                  <li key={r.id} className="list-group-item d-flex justify-content-between align-items-start gap-2" data-testid="reference-row">
                    <span>
                      <strong>{r.client}</strong>
                      {r.contractValue ? `, ${r.contractValue}` : ''}{r.dates ? `, ${r.dates}` : ''}
                      {r.scope ? <div className="small text-secondary">{r.scope}</div> : null}
                      {(r.contact || r.phone || r.email) ? <div className="small text-secondary">{[r.contact, r.phone, r.email].filter(Boolean).join(', ')}</div> : null}
                    </span>
                    <span className="d-flex align-items-center gap-2 flex-shrink-0">
                      <Badge approved={r.approved} />
                      {!r.approved && <button type="button" className="btn btn-outline-success btn-sm" disabled={busyId === r.id} onClick={() => void approve('reference', r.id)}>Approve</button>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard className="mb-4" title="Key personnel" icon="team-line"
            subtitle="The people a management and staffing plan names. A short bio is enough; the agent summarizes it."
            actions={<button type="button" className="btn btn-primary btn-sm" data-testid="add-personnel" onClick={() => setAdding({ kind: 'personnel' })}><i className="ri-add-line me-1" aria-hidden="true" />Add person</button>}>
            {counts.personnel === 0 ? (
              <p className="text-secondary mb-0">No personnel yet. Add your project manager, technical lead and QA lead with a one-paragraph bio each.</p>
            ) : (
              <ul className="list-group">
                {lib!.personnel.map((p) => (
                  <li key={p.id} className="list-group-item d-flex justify-content-between align-items-start gap-2" data-testid="personnel-row">
                    <span><strong>{p.name}</strong>{p.role ? `, ${p.role}` : ''}</span>
                    <span className="d-flex align-items-center gap-2 flex-shrink-0">
                      <Badge approved={p.approved} />
                      {!p.approved && <button type="button" className="btn btn-outline-success btn-sm" disabled={busyId === p.id} onClick={() => void approve('personnel', p.id)}>Approve</button>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          <DocumentsSection />
        </>
      )}

      {adding && <AddModal kind={adding.kind} onCancel={() => setAdding(null)} onSave={save} />}
    </div>
  );
}

function DocumentsSection(): React.ReactElement {
  const [docs, setDocs] = useState<CompanyDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setDocs((await listCompanyDocs()).documents); setErr(null); }
    catch { setErr('Could not load documents.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const onFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try { await uploadCompanyDoc(file); await load(); }
    catch { setErr('Upload failed. Allowed types: pdf, docx, txt, md, up to 20MB.'); }
    finally { setUploading(false); }
  }, [load]);

  const act = useCallback(async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    try { await fn(); await load(); } catch { setErr('That action failed.'); } finally { setBusyId(null); }
  }, [load]);

  return (
    <SectionCard className="mb-4" title="Company documents" icon="file-text-line"
      subtitle="Upload a capability statement, a past proposal or a cert. Approved documents are searched and cited on every bid."
      actions={
        <label className={`btn btn-primary btn-sm mb-0 ${uploading ? 'disabled' : ''}`}>
          <i className="ri-upload-2-line me-1" aria-hidden="true" />{uploading ? 'Uploading...' : 'Upload document'}
          <input type="file" accept=".pdf,.docx,.txt,.md" className="d-none" data-testid="doc-upload" disabled={uploading} onChange={onFile} />
        </label>
      }>
      {err && <div className="alert alert-warning py-2" role="alert">{err}</div>}
      {loading ? (
        <p className="text-secondary mb-0" role="status">Loading documents...</p>
      ) : docs.length === 0 ? (
        <p className="text-secondary mb-0">No documents yet. A capability statement and one or two strong past proposals give the agent the most to work with.</p>
      ) : (
        <ul className="list-group">
          {docs.map((d) => (
            <li key={d.id} className="list-group-item d-flex justify-content-between align-items-center gap-2" data-testid="doc-row">
              <span>
                <strong>{d.name}</strong>
                <span className="small text-secondary ms-2">{d.embeddedCount}/{d.chunkCount} chunks{d.status === 'embedding_pending' ? ', embedding pending' : ''}{d.truncated ? ', truncated' : ''}</span>
              </span>
              <span className="d-flex align-items-center gap-2 flex-shrink-0">
                <Badge approved={d.approved} />
                {!d.approved && <button type="button" className="btn btn-outline-success btn-sm" disabled={busyId === d.id} onClick={() => void act(d.id, () => approveCompanyDoc(d.id, true))}>Approve</button>}
                <button type="button" className="btn btn-outline-danger btn-sm" disabled={busyId === d.id} onClick={() => void act(d.id, () => deleteCompanyDoc(d.id))}>Delete</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function AddModal({ kind, onCancel, onSave }: { kind: DossierKind; onCancel: () => void; onSave: (kind: DossierKind, input: NewItem) => Promise<void> }): React.ReactElement {
  const [form, setForm] = useState<Record<string, string>>({ category: 'general' });
  const [approved, setApproved] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const valid = kind === 'fact' ? !!(form.key && form.value) : kind === 'reference' ? !!form.client : !!form.name;
  const title = kind === 'fact' ? 'Add a company fact' : kind === 'reference' ? 'Add a past-performance reference' : 'Add a key person';

  const submit = async () => {
    setSaving(true);
    const input: any = { approved };
    if (kind === 'fact') Object.assign(input, { key: form.key, value: form.value, source: form.source || undefined, category: form.category || 'general' });
    else if (kind === 'reference') Object.assign(input, { client: form.client, contractValue: form.contractValue || undefined, dates: form.dates || undefined, scope: form.scope || undefined, contact: form.contact || undefined, phone: form.phone || undefined, email: form.email || undefined });
    else Object.assign(input, { name: form.name, role: form.role || undefined, resumeHtml: form.resumeHtml || undefined });
    await onSave(kind, input);
    setSaving(false);
  };

  return (
    <div className="modal d-block" tabIndex={-1} role="dialog" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="modal-dialog modal-dialog-centered" role="document">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{title}</h5>
            <button type="button" className="btn-close" aria-label="Close" onClick={onCancel} />
          </div>
          <div className="modal-body">
            {kind === 'fact' && (<>
              <label className="form-label">Category</label>
              <select className="form-select mb-2" value={form.category} onChange={set('category')}>
                {FACT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <label className="form-label">Name</label>
              <input className="form-control mb-2" data-testid="fact-key" placeholder="e.g. UEI" value={form.key ?? ''} onChange={set('key')} />
              <label className="form-label">Value</label>
              <input className="form-control mb-2" data-testid="fact-value" placeholder="e.g. ABC123DEF456" value={form.value ?? ''} onChange={set('value')} />
              <label className="form-label">Source (optional)</label>
              <input className="form-control" placeholder="Where this came from" value={form.source ?? ''} onChange={set('source')} />
            </>)}
            {kind === 'reference' && (<>
              <label className="form-label">Client</label>
              <input className="form-control mb-2" placeholder="e.g. City of Plano" value={form.client ?? ''} onChange={set('client')} />
              <div className="row g-2">
                <div className="col"><label className="form-label">Contract value</label><input className="form-control" value={form.contractValue ?? ''} onChange={set('contractValue')} /></div>
                <div className="col"><label className="form-label">Dates</label><input className="form-control" placeholder="2023-2025" value={form.dates ?? ''} onChange={set('dates')} /></div>
              </div>
              <label className="form-label mt-2">Scope</label>
              <textarea className="form-control mb-2" rows={2} value={form.scope ?? ''} onChange={set('scope')} />
              <div className="row g-2">
                <div className="col"><label className="form-label">Contact</label><input className="form-control" value={form.contact ?? ''} onChange={set('contact')} /></div>
                <div className="col"><label className="form-label">Phone</label><input className="form-control" value={form.phone ?? ''} onChange={set('phone')} /></div>
                <div className="col"><label className="form-label">Email</label><input className="form-control" value={form.email ?? ''} onChange={set('email')} /></div>
              </div>
            </>)}
            {kind === 'personnel' && (<>
              <label className="form-label">Name</label>
              <input className="form-control mb-2" placeholder="e.g. Ada Lovelace" value={form.name ?? ''} onChange={set('name')} />
              <label className="form-label">Role</label>
              <input className="form-control mb-2" placeholder="e.g. Technical Lead" value={form.role ?? ''} onChange={set('role')} />
              <label className="form-label">Bio</label>
              <textarea className="form-control" rows={4} placeholder="A short paragraph of relevant experience" value={form.resumeHtml ?? ''} onChange={set('resumeHtml')} />
            </>)}
            <div className="form-check mt-3">
              <input className="form-check-input" type="checkbox" id="approve-now" checked={approved} onChange={(e) => setApproved(e.target.checked)} />
              <label className="form-check-label" htmlFor="approve-now">Approve now, so the agent can use it right away</label>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline-secondary" onClick={onCancel}>Cancel</button>
            <button type="button" className="btn btn-primary" data-testid="save-item" disabled={!valid || saving} onClick={() => void submit()}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
