import React, { useState } from 'react';
import { loadInboxes, loadPlacements, putForward, setInvoiceStatus, type DeskPlacements, type OfferLine } from './careerDeskApi';
import { DeskAnswerLine, DeskError, LearnerPicker, Pill, type Tone } from './DeskParts';
import { useDeskAction, useDeskData } from './useDesk';

/**
 * Placements and fees (kit F9), staff only: fees earned on accepted offers, fees pending on offers still out, the fee rate
 * (from the server's setting), every current offer with its pay, first-year salary, fee, status and invoice record (status
 * editable: invoice records only, nothing is charged), and the employer accounts a candidate can be put forward to.
 */
const INVOICE: Array<[string, string]> = [['not_invoiced', 'Not invoiced'], ['invoiced', 'Invoiced'], ['paid', 'Paid']];
const STATUS_TONE: Record<string, Tone> = { accepted: 'ok', sent: 'warn', talk_first: 'warn', declined: 'mute', withdrawn: 'mute' };
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

const Kpi: React.FC<{ label: string; value: string; sub: string; testId: string }> = ({ label, value, sub, testId }) => (
  <div className="cdesk-card cdesk-kpi" data-testid={testId}><div className="cdesk-eyebrow cdesk-faint">{label}</div><div className="cdesk-kpi-v">{value}</div><div className="cdesk-small cdesk-ok">{sub}</div></div>
);

const OfferRow: React.FC<{ o: OfferLine; busy: string | null; onInvoice: (o: OfferLine, s: string) => void }> = ({ o, busy, onInvoice }) => (
  <tr data-testid={`cdesk-fee-row-${o.offerId}`}>
    <td data-label="Candidate"><b>{o.learner || 'Unnamed learner'}</b><div className="cdesk-small cdesk-faint">{o.role}</div></td>
    <td data-label="Client">{o.client || o.company}</td>
    <td data-label="Pay" className="cdesk-small">{o.pay}</td>
    <td data-label="First-year salary" className="cdesk-num">{o.firstYear}</td>
    <td data-label="Fee" className="cdesk-num">{o.fee}<div className="cdesk-small cdesk-faint">{o.feeRate}</div></td>
    <td data-label="Status"><Pill tone={STATUS_TONE[o.status] ?? 'mute'}>{o.statusLabel}</Pill></td>
    <td data-label="Invoice" className="cdesk-small">
      {!o.invoice ? <span className="cdesk-muted">{['sent', 'talk_first'].includes(o.status) ? 'Fee applies on acceptance' : 'No invoice'}</span> : (
        <>
          <label className="visually-hidden" htmlFor={`cdesk-inv-${o.invoice.id}`}>Invoice status for {o.learner || 'this offer'}</label>
          <select id={`cdesk-inv-${o.invoice.id}`} className="cdesk-select-sm" value={o.invoice.status} disabled={busy !== null} onChange={(e) => onInvoice(o, e.target.value)} data-testid={`cdesk-inv-${o.invoice.id}`}>
            {INVOICE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </>
      )}
    </td>
  </tr>
);

const Kpis: React.FC<{ d: DeskPlacements }> = ({ d }) => (
  <div className="cdesk-g3">
    <Kpi testId="cdesk-kpi-earned" label="Accepted · fees earned" value={d.kpis.fees} sub={`${plural(d.kpis.accepted, 'placement')} · ${d.kpis.invoiced} invoiced · ${d.kpis.paid} paid`} />
    <Kpi testId="cdesk-kpi-pending" label="Offers out · fees pending" value={d.kpis.feesPending} sub={plural(d.kpis.openOffers, 'offer')} />
    <Kpi testId="cdesk-kpi-rate" label="Fee rate" value={d.feeRate.label} sub="of first-year salary" />
  </div>
);

const PutForward: React.FC<{ d: DeskPlacements; busy: string | null; onPut: (clientId: string, enrollmentId: string) => void }> = ({ d, busy, onPut }) => {
  const learners = useDeskData(loadInboxes, 'learners');
  const [pick, setPick] = useState<Record<string, string>>({});
  return (
    <section className="cdesk-card" aria-labelledby="cdesk-pf-h" data-testid="cdesk-pf">
      <h3 className="cdesk-h3" id="cdesk-pf-h">Put a candidate forward</h3>
      {d.clients.length === 0 ? <p className="cdesk-small" data-testid="cdesk-pf-empty">No employer account yet. Employer accounts are added by hand.</p> : d.clients.map((c) => (
        <div key={c.id} className="cdesk-pf-row" data-testid={`cdesk-pf-${c.id}`}>
          <div><b>{c.name}</b><div className="cdesk-small cdesk-muted">{plural(c.candidates, 'candidate')} put forward</div></div>
          <LearnerPicker id={`cdesk-pf-pick-${c.id}`} label={`Learner to put forward to ${c.name}`} learners={learners.data?.learners ?? null} error={learners.error} value={pick[c.id] ?? ''} onChange={(v) => setPick({ ...pick, [c.id]: v })} />
          <button type="button" className="cdesk-btn cdesk-ghost cdesk-sm" disabled={busy !== null || !pick[c.id]} onClick={() => onPut(c.id, pick[c.id])}>{busy === `pf:${c.id}` ? 'Working...' : 'Put forward'}</button>
        </div>
      ))}
    </section>
  );
};

const DeskFeesTab: React.FC = () => {
  const data = useDeskData(loadPlacements, 'placements and fees');
  const act = useDeskAction();
  if (data.error) return <DeskError text={data.error} onRetry={data.reload} testId="cdesk-fee-error" />;
  if (!data.data) return <p className="cdesk-muted">Loading placements and fees...</p>;
  const d = data.data;
  const onInvoice = (o: OfferLine, s: string) => o.invoice && act.run(`inv:${o.invoice.id}`, () => setInvoiceStatus(o.invoice!.id, s), data.reload);
  const onPut = (clientId: string, enrollmentId: string) => act.run(`pf:${clientId}`, () => putForward(clientId, enrollmentId), data.reload);
  return (
    <div className="cdesk-stackgap">
      <Kpis d={d} />
      <DeskAnswerLine result={act.result} testId="cdesk-fee-answer" />
      <div className="cdesk-card">
        {d.offers.length === 0 ? <p data-testid="cdesk-fee-empty">No offer has been made yet.</p> : (
          <table className="cdesk-tbl cdesk-stack">
            <thead><tr><th scope="col">Candidate</th><th scope="col">Client</th><th scope="col">Pay</th><th scope="col" className="cdesk-num">First-year salary</th><th scope="col" className="cdesk-num">Fee</th><th scope="col">Status</th><th scope="col">Invoice</th></tr></thead>
            <tbody>{d.offers.map((o) => <OfferRow key={o.offerId} o={o} busy={act.busy} onInvoice={onInvoice} />)}</tbody>
          </table>
        )}
        <p className="cdesk-small cdesk-faint cdesk-foot">Invoice records only: nothing here sends an invoice or charges anyone.</p>
      </div>
      <PutForward d={d} busy={act.busy} onPut={onPut} />
    </div>
  );
};

export default DeskFeesTab;
