import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../utils/api';
import { EmptyState, PageHeader, SectionCard, StatusBadge } from '../../components/admin/shell';
import EnterpriseClientMeetingCard, { ClientPlan } from './EnterpriseClientMeetingCard';
import type { Tone } from '../../components/admin/shell/StatusBadge';

/**
 * Admin, Enterprise clients (W32, Phase 5). Every "Book a demo pilot" from form to signed.
 *
 *     "manage the client until they become an actual customer and then they get their own
 *      project"  (Ali, 2026-11-20)
 *
 * The list is the pipeline. One client shows what we know (form, interview write-up, research,
 * pilot options) and the steps only a person takes: send the options email, draft and send the
 * proposal (with the price Ali adds), mark signed (opens their Basecamp project) or lost.
 * Nothing on this page sends without a click.
 */

export interface ClientRow {
  id: string;
  company: string;
  fullName: string;
  role: string;
  email: string;
  stage: string;
  service: string;
  startTiming: string;
  peopleCount: number | null;
  hoursPerWeek: number | null;
  hoursPerYear: number | null;
  createdAt: string;
  interviewedAt: string | null;
  basecampUrl: string | null;
}

interface Message {
  subject: string | null;
  body: string | null;
  sentAt?: string | null;
  draftedAt?: string | null;
}

export interface ClientDetail extends ClientRow {
  phone: string;
  website: string;
  department: string;
  process: string;
  requiredReturn: string;
  otherDeciders: string;
  leadId: number | null;
  interviewedVia: string | null;
  writeup: Array<{ dimension: string; value: string }>;
  transcript: string | null;
  research: { summary?: string; industry?: string; size_signals?: string; systems?: string[]; open_questions?: string[]; site?: string | null } | null;
  pilotOptions: Array<{ title: string; service: string; what_it_does: string; success_measure: string; first_step: string; why_this_fits: string; roi?: { hours_low: number | null; hours_high: number | null; share_low: number; share_high: number } }> | null;
  plan?: ClientPlan | null;
  optionsEmail: Message;
  proposal: Message;
  signedAt: string | null;
  lostAt: string | null;
  lostReason: string | null;
  projectUrl: string | null;
  pricePlaceholder: string;
}

const STAGE_TONE: Record<string, Tone> = {
  Form: 'neutral',
  Interviewed: 'info',
  'Options drafted': 'info',
  'Options sent': 'violet',
  'Proposal sent': 'warning',
  Signed: 'success',
  Lost: 'danger',
};

export const STAGES = ['Form', 'Interviewed', 'Options drafted', 'Options sent', 'Proposal sent', 'Signed', 'Lost'];

const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' }) : '';

const errorOf = (e: any) => e?.response?.data?.error || e?.message || 'Something went wrong';

/** Subject and body, editable until sent. */
function MessageEditor(props: {
  label: string;
  message: Message;
  sendLabel: string;
  note?: React.ReactNode;
  onSend: (subject: string, body: string) => Promise<void>;
}): React.ReactElement {
  const { message } = props;
  const [subject, setSubject] = useState(message.subject || '');
  const [body, setBody] = useState(message.body || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setSubject(message.subject || '');
    setBody(message.body || '');
  }, [message.subject, message.body]);
  const sent = Boolean(message.sentAt);
  const id = props.label.toLowerCase().replace(/[^a-z]+/g, '-');
  return (
    <div className="mb-3" data-testid={`editor-${id}`}>
      {props.note}
      <label className="form-label small fw-semibold" htmlFor={`${id}-subject`}>
        Subject
      </label>
      <input id={`${id}-subject`} className="form-control form-control-sm mb-2" value={subject} disabled={sent} onChange={(e) => setSubject(e.target.value)} />
      <label className="form-label small fw-semibold" htmlFor={`${id}-body`}>
        Message (plain text; your signature is added)
      </label>
      <textarea id={`${id}-body`} className="form-control form-control-sm mb-2" rows={10} value={body} disabled={sent} onChange={(e) => setBody(e.target.value)} />
      {error ? (
        <div className="alert alert-danger py-1 px-2 small" role="alert">
          {error}
        </div>
      ) : null}
      {sent ? (
        <StatusBadge label={`Sent ${day(message.sentAt)}`} tone="success" />
      ) : (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy || !subject.trim() || !body.trim()}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await props.onSend(subject, body);
            } catch (e) {
              setError(errorOf(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Sending...' : props.sendLabel}
        </button>
      )}
    </div>
  );
}

function ClientView({ id }: { id: string }): React.ReactElement {
  const [c, setC] = useState<ClientDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [lostReason, setLostReason] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/api/admin/enterprise-clients/${id}`);
      setC(r.data.client);
    } catch (e) {
      setError(errorOf(e));
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (name: string, path: string, body: unknown = {}) => {
    setBusy(name);
    setError('');
    try {
      await api.post(`/api/admin/enterprise-clients/${id}/${path}`, body);
      await load();
    } catch (e) {
      setError(errorOf(e));
      throw e;
    } finally {
      setBusy('');
    }
  };

  if (error && !c) return <div className="alert alert-danger">{error}</div>;
  if (!c) return <div className="text-muted small">Loading...</div>;
  const closed = Boolean(c.signedAt || c.lostAt);

  return (
    <div data-testid="client-view">
      <PageHeader
        title={c.company}
        subtitle={`${c.fullName}${c.role ? `, ${c.role}` : ''} · ${c.email}`}
        icon="briefcase-line"
        breadcrumb={[{ label: 'Enterprise Clients', to: '/admin/enterprise-clients' }, { label: c.company }]}
        actions={
          <>
            <StatusBadge label={c.stage} tone={STAGE_TONE[c.stage]} />{' '}
            {c.basecampUrl ? (
              <a className="btn btn-outline-primary btn-sm ms-2" href={c.basecampUrl} target="_blank" rel="noreferrer">
                Basecamp list
              </a>
            ) : null}
            {c.projectUrl ? (
              <a className="btn btn-outline-success btn-sm ms-2" href={c.projectUrl} target="_blank" rel="noreferrer">
                Client project
              </a>
            ) : null}
          </>
        }
      />
      {error ? (
        <div className="alert alert-danger py-2" role="alert">
          {error}
        </div>
      ) : null}

      <div className="row g-3">
        <div className="col-lg-5">
          <EnterpriseClientMeetingCard plan={c.plan} interviewed={Boolean(c.interviewedAt)} />
          <SectionCard title="What they told us" icon="file-list-3-line">
            <dl className="row small mb-0">
              <dt className="col-5">Process</dt>
              <dd className="col-7">{c.process}</dd>
              <dt className="col-5">Today</dt>
              <dd className="col-7">
                {c.peopleCount ?? '?'} people, {c.hoursPerWeek ?? '?'} hrs/week
                {c.hoursPerYear ? ` (${c.hoursPerYear.toLocaleString('en-US')} hrs/year)` : ''}
              </dd>
              <dt className="col-5">AI must return</dt>
              <dd className="col-7">{c.requiredReturn || 'not stated'}</dd>
              <dt className="col-5">Service</dt>
              <dd className="col-7">{c.service || 'not stated'}</dd>
              <dt className="col-5">Start</dt>
              <dd className="col-7">{c.startTiming || 'not stated'}</dd>
              <dt className="col-5">Also decides</dt>
              <dd className="col-7">{c.otherDeciders || 'not stated'}</dd>
              <dt className="col-5">Website</dt>
              <dd className="col-7">{c.website || 'not stated'}</dd>
              <dt className="col-5">Phone</dt>
              <dd className="col-7">{c.phone}</dd>
              {c.leadId ? (
                <>
                  <dt className="col-5">Lead</dt>
                  <dd className="col-7">
                    <Link to={`/admin/leads/${c.leadId}`}>Lead {c.leadId}</Link>
                  </dd>
                </>
              ) : null}
            </dl>
          </SectionCard>

          <SectionCard title={`AI interview${c.interviewedVia ? ` (${c.interviewedVia === 'call' ? 'phone' : 'typed'})` : ''}`} icon="chat-voice-line">
            {c.writeup.length ? (
              <ul className="small mb-2" data-testid="writeup">
                {c.writeup.map((w, n) => (
                  <li key={n}>
                    <span className="text-muted">{w.dimension.replace(/_/g, ' ')}:</span> {w.value}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small text-muted mb-0">Not interviewed yet.</p>
            )}
            {c.transcript ? (
              <details className="small">
                <summary>Transcript</summary>
                <pre className="small mb-0" style={{ whiteSpace: 'pre-wrap' }}>
                  {c.transcript}
                </pre>
              </details>
            ) : null}
          </SectionCard>
        </div>

        <div className="col-lg-7">
          <SectionCard title="Research and pilot options (AI)" icon="search-eye-line">
            {c.research ? (
              <div className="small">
                <p className="mb-2">{c.research.summary}</p>
                {c.research.open_questions?.length ? (
                  <>
                    <div className="fw-semibold">Still to learn</div>
                    <ul>
                      {c.research.open_questions.map((q, n) => (
                        <li key={n}>{q}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
                <ol className="mb-0" data-testid="options">
                  {(c.pilotOptions || []).map((o, n) => (
                    <li key={n} className="mb-2">
                      <strong>{o.title}</strong> <StatusBadge label={o.service} tone="teal" />
                      <div>{o.what_it_does}</div>
                      <div className="text-muted">Success: {o.success_measure}</div>
                      {o.roi ? <div className="text-muted">Potential return (internal): {o.roi.hours_high !== null ? `about ${o.roi.hours_low} to ${o.roi.hours_high} hours a year` : 'no hours given'}, {o.roi.share_low}-{o.roi.share_high}%</div> : null}
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <p className="small text-muted mb-0">The AI researches the company a few minutes after the interview.</p>
            )}
          </SectionCard>

          {c.research ? (
            <SectionCard title="1. Options email" icon="mail-send-line">
              <MessageEditor
                label="options"
                message={c.optionsEmail}
                sendLabel="Send from Ali"
                note={<p className="small text-muted mb-2">The AI&apos;s draft. Edit it, then send. It goes from you, once.</p>}
                onSend={(subject, body) => act('options', 'options-email', { subject, body })}
              />
            </SectionCard>
          ) : null}

          {c.interviewedAt ? (
            <SectionCard title="2. Proposal" icon="file-paper-2-line">
              {c.proposal.draftedAt ? (
                <MessageEditor
                  label="proposal"
                  message={c.proposal}
                  sendLabel="Approve and send from Ali (Ali only)"
                  note={
                    <p className="small text-muted mb-2">
                      Replace <code>{c.pricePlaceholder}</code> with the investment. It will not send until you do.
                    </p>
                  }
                  onSend={(subject, body) => act('proposal', 'proposal/send', { subject, body })}
                />
              ) : null}
              {!c.proposal.sentAt && !closed ? (
                <button type="button" className="btn btn-outline-primary btn-sm" disabled={busy === 'draft'} onClick={() => act('draft', 'proposal/draft').catch(() => undefined)}>
                  {busy === 'draft' ? 'Drafting...' : c.proposal.draftedAt ? 'Draft again' : 'Draft the proposal (AI)'}
                </button>
              ) : null}
            </SectionCard>
          ) : null}

          <SectionCard title="3. Close" icon="flag-line">
            {c.signedAt ? (
              <p className="small mb-0">
                Signed {day(c.signedAt)}. {c.projectUrl ? <a href={c.projectUrl}>Their Basecamp project</a> : null}
              </p>
            ) : c.lostAt ? (
              <p className="small mb-0">
                Lost {day(c.lostAt)}. {c.lostReason}
              </p>
            ) : (
              <div className="d-flex flex-wrap gap-2 align-items-center">
                <button type="button" className="btn btn-success btn-sm" disabled={Boolean(busy)} onClick={() => act('signed', 'signed').catch(() => undefined)}>
                  {busy === 'signed' ? 'Opening their project...' : 'Mark signed: opens their Basecamp project (Ali only)'}
                </button>
                <input
                  aria-label="Why it was lost"
                  className="form-control form-control-sm"
                  style={{ maxWidth: 260 }}
                  placeholder="Why it was lost (optional)"
                  value={lostReason}
                  onChange={(e) => setLostReason(e.target.value)}
                />
                <button type="button" className="btn btn-outline-danger btn-sm" disabled={Boolean(busy)} onClick={() => act('lost', 'lost', { reason: lostReason }).catch(() => undefined)}>
                  Mark lost
                </button>
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function ClientList(): React.ReactElement {
  const [rows, setRows] = useState<ClientRow[] | null>(null);
  const [error, setError] = useState('');
  const [stage, setStage] = useState('');
  useEffect(() => {
    api
      .get('/api/admin/enterprise-clients')
      .then((r) => setRows(r.data.clients))
      .catch((e) => setError(errorOf(e)));
  }, []);

  const shown = (rows || []).filter((r) => !stage || r.stage === stage);
  const counts = STAGES.map((s) => [s, (rows || []).filter((r) => r.stage === s).length] as const);

  return (
    <div data-testid="client-list">
      <PageHeader
        title="Enterprise Clients"
        subtitle="Every Book a demo pilot, from the form to signed. Each one has its own Basecamp list."
        icon="briefcase-line"
      />
      {error ? <div className="alert alert-danger">{error}</div> : null}
      <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Filter by stage">
        <button type="button" className={`btn btn-sm ${stage ? 'btn-outline-secondary' : 'btn-secondary'}`} onClick={() => setStage('')}>
          All {rows ? rows.length : ''}
        </button>
        {counts.map(([s, n]) => (
          <button key={s} type="button" className={`btn btn-sm ${stage === s ? 'btn-secondary' : 'btn-outline-secondary'}`} onClick={() => setStage(s)}>
            {s} {n}
          </button>
        ))}
      </div>
      {rows && !shown.length ? (
        <EmptyState icon="briefcase-line" title="No clients here yet" description="A client appears the moment someone sends the Book a demo pilot form." />
      ) : (
        <SectionCard padded={false}>
          <div className="table-responsive">
            <table className="table table-sm table-hover mb-0 align-middle">
              <thead>
                <tr>
                  <th>Company</th>
                  <th className="d-none d-sm-table-cell">Person</th>
                  <th>Stage</th>
                  <th className="text-end text-nowrap">Hrs / year</th>
                  <th className="d-none d-md-table-cell">Start</th>
                  <th className="d-none d-md-table-cell">Asked</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/admin/enterprise-clients/${r.id}`}>{r.company}</Link>
                    </td>
                    <td className="small d-none d-sm-table-cell">
                      {r.fullName}
                      {r.role ? <span className="text-muted">, {r.role}</span> : null}
                    </td>
                    <td>
                      <StatusBadge label={r.stage} tone={STAGE_TONE[r.stage]} />
                    </td>
                    <td className="text-end small">{r.hoursPerYear ? r.hoursPerYear.toLocaleString('en-US') : ''}</td>
                    <td className="small d-none d-md-table-cell">{r.startTiming}</td>
                    <td className="small d-none d-md-table-cell">{day(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

export default function AdminEnterpriseClientsPage(): React.ReactElement {
  const { id } = useParams<{ id?: string }>();
  return id ? <ClientView id={id} /> : <ClientList />;
}
