import React, { useCallback, useEffect, useState } from 'react';
import SectionCard from '../admin/shell/SectionCard';
import StatusBadge from '../admin/shell/StatusBadge';
import {
  addAiFact, approveBrainItem, getBrainControl, listBrainItems, retireBrainItem, runBrainSample, saveBrainRules,
  type BrainControl, type BrainItemRow, type BrainSampleResult, type BrainShelf, type BrainSnapshot, type MayaBrainRules,
} from '../../services/explorerGrowthApi';

/**
 * OH1o: the Brain tab (Ali, 2026-11-18: "where will the rules for the brain be stored, what will that
 * look like and how do I program it" and "I need a place to control the brain and see what all it
 * has to choose from").
 *
 * 1. Rules      Maya's voice, never-say phrases, which shelves and in what order, how often, the
 *               Monday plan-your-week email. The hard rules and the Open House hold are shown, locked.
 * 2. Inventory  everything each shelf can choose from right now.
 * 3. Approvals  AI facts and build prompts waiting for a person.
 * 4. Given      which shelf and item each Explorer already got (masked).
 * 5. Sample     real drafts, three consecutive emails per person, nothing saved and nothing sent.
 */

export const SHELF_LABELS: Record<BrainShelf, string> = {
  builder_spotlight: 'A real builder (hire.refactored.ai)',
  build_prompt: 'Build prompt to try',
  ai_fact: 'One sourced AI fact',
  community_pulse: 'What the cohort is posting',
  live_event: 'Next live event',
};

const CADENCES = [24, 48, 72, 96, 120, 168];

function errorProblems(err: any): string[] {
  const p = err?.response?.data?.problems;
  if (Array.isArray(p) && p.length) return p.map(String);
  return [err?.response?.data?.error || err?.message || 'Something went wrong'];
}

export function RulesEditor({ initial, hardRules, onSaved, brandId = null }: { initial: MayaBrainRules; hardRules: string; onSaved?: (r: MayaBrainRules) => void; brandId?: string | null }) {
  const [rules, setRules] = useState<MayaBrainRules>(initial);
  const [neverSay, setNeverSay] = useState(initial.neverSay.join('\n'));
  const [problems, setProblems] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= rules.rotation.length) return;
    const rot = [...rules.rotation];
    [rot[i], rot[j]] = [rot[j], rot[i]];
    setRules({ ...rules, rotation: rot });
  };

  const save = async () => {
    setBusy(true); setProblems([]); setSaved(false);
    try {
      const next = { ...rules, neverSay: neverSay.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean) };
      const { rules: r } = await saveBrainRules(next, brandId);
      setRules(r); setNeverSay(r.neverSay.join('\n')); setSaved(true);
      onSaved?.(r);
    } catch (err) {
      setProblems(errorProblems(err));
    } finally { setBusy(false); }
  };

  return (
    <div>
      <label className="form-label small fw-semibold" htmlFor="brain-voice">Maya's voice for Explorers</label>
      <textarea id="brain-voice" className="form-control form-control-sm mb-1" rows={8}
        value={rules.explorerVoice} onChange={(e) => setRules({ ...rules, explorerVoice: e.target.value })} />
      <details className="small mb-3">
        <summary className="text-muted">Hard rules, always added after the voice (locked)</summary>
        <pre className="small bg-light p-2 mb-0" style={{ whiteSpace: 'pre-wrap' }}>{hardRules}</pre>
      </details>

      <div className="row g-3">
        <div className="col-md-6">
          <div className="small fw-semibold mb-1">Shelves, in rotation order</div>
          <table className="table table-sm small mb-2">
            <tbody>
              {rules.rotation.map((s, i) => (
                <tr key={s.piece}>
                  <td style={{ width: 30 }}>
                    <input type="checkbox" aria-label={`use ${SHELF_LABELS[s.piece] || s.piece}`} checked={s.enabled}
                      onChange={(e) => {
                        const rot = rules.rotation.map((x) => (x.piece === s.piece ? { ...x, enabled: e.target.checked } : x));
                        setRules({ ...rules, rotation: rot });
                      }} />
                  </td>
                  <td>{SHELF_LABELS[s.piece] || s.piece}</td>
                  <td className="text-end text-nowrap">
                    <button type="button" className="btn btn-link btn-sm p-0 me-2" aria-label="move up" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                    <button type="button" className="btn btn-link btn-sm p-0" aria-label="move down" onClick={() => move(i, 1)} disabled={i === rules.rotation.length - 1}>↓</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="small text-muted">A shelf used in either of a person's last two emails is skipped. A lesson decision leads with their own progress.</div>
        </div>
        <div className="col-md-6">
          <label className="form-label small fw-semibold" htmlFor="brain-cadence">How often</label>
          <select id="brain-cadence" className="form-select form-select-sm mb-2" value={rules.brainPickMinHours}
            onChange={(e) => setRules({ ...rules, brainPickMinHours: Number(e.target.value) })}>
            {CADENCES.map((h) => <option key={h} value={h}>One email every {h / 24} day{h === 24 ? '' : 's'}</option>)}
          </select>
          <div className="form-check small">
            <input id="brain-week" className="form-check-input" type="checkbox" checked={rules.weekAhead}
              onChange={(e) => setRules({ ...rules, weekAhead: e.target.checked })} />
            <label className="form-check-label" htmlFor="brain-week">Monday "plan your week" email (this week's real events + a plan from their progress)</label>
          </div>
          <div className="form-check small mb-2">
            <input id="brain-oh" className="form-check-input" type="checkbox" checked readOnly disabled />
            <label className="form-check-label" htmlFor="brain-oh">Hold Explorer Growth for anyone in an Open House countdown (locked on)</label>
          </div>
          <label className="form-label small fw-semibold" htmlFor="brain-never">Never say (one per line, added to the built-in list)</label>
          <textarea id="brain-never" className="form-control form-control-sm" rows={4} value={neverSay}
            onChange={(e) => setNeverSay(e.target.value)} placeholder="circle back" />
        </div>
      </div>

      {problems.length > 0 && (
        <div className="alert alert-warning py-2 px-3 small mt-3 mb-0" role="alert">
          Not saved:
          <ul className="mb-0">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
      {saved && <div className="alert alert-success py-2 px-3 small mt-3 mb-0">Saved. The next drafts use these rules.</div>}
      <button type="button" className="btn btn-primary btn-sm mt-3" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save rules'}</button>
    </div>
  );
}

export function InventoryBody({ c }: { c: BrainControl }) {
  const inv = c.inventory;
  if (!inv) return <div className="alert alert-warning py-2 px-3 small mb-0">The shelves could not be read. This is not the same as empty shelves.</div>;
  const block = (title: string, count: number, items: React.ReactNode[], failed: boolean) => (
    <details className="mb-2" open={count > 0 && count <= 5}>
      <summary className="small"><strong>{title}</strong> <StatusBadge label={failed ? 'unreadable' : `${count}`} tone={failed ? 'warning' : count ? 'neutral' : 'warning'} /></summary>
      {items.length ? <ul className="small mb-1">{items}</ul> : <div className="small text-muted ms-3">{failed ? 'could not be read' : 'nothing on this shelf'}</div>}
    </details>
  );
  const failed = (n: string) => inv.unavailable.includes(n);
  return (
    <div>
      {block('Builders (hire.refactored.ai)', inv.builders.length, inv.builders.map((b) => <li key={b.id || b.url}>{b.name}: {b.title} <a href={b.url} target="_blank" rel="noreferrer">case study</a></li>), failed('builders'))}
      {block('Live events (next 14 days)', inv.events.length, inv.events.map((e) => <li key={e.id}>{e.title}, {e.when}{e.openHouse ? ' (Open House)' : ''}</li>), failed('events'))}
      {block('Community themes (last 14 days)', inv.communityThemes.length, inv.communityThemes.map((t) => <li key={t.id}>{t.label}: {t.count}</li>), failed('community'))}
      {block('Approved AI facts', inv.aiFacts.length, inv.aiFacts.map((f) => <li key={f.id}>{f.title}{f.source ? ` (${f.source})` : ''}</li>), failed('ai_facts'))}
      {block('Approved build prompts', inv.buildPrompts.length, inv.buildPrompts.map((f) => <li key={f.id}>{f.title}</li>), failed('build_prompts'))}
      {block('This week (the Monday email)', inv.weekAhead.block ? 1 : 0, inv.weekAhead.block ? [<li key="w"><pre className="small mb-0" style={{ whiteSpace: 'pre-wrap' }}>{inv.weekAhead.block}</pre></li>] : [], failed('events'))}
    </div>
  );
}

export function GivenBody({ c }: { c: BrainControl }) {
  if (!c.given.length) return <div className="small text-muted">No Explorer has been given a brain piece yet.</div>;
  return (
    <div className="table-responsive">
      <table className="table table-sm small mb-0">
        <thead><tr><th>Explorer</th><th>Date</th><th>Shelf</th><th>Item</th><th>Status</th></tr></thead>
        <tbody>
          {c.given.map((g, i) => (
            <tr key={`${g.recipient_masked}-${g.date}-${i}`}>
              <td>{g.recipient_masked}</td><td>{g.date || ''}</td><td>{SHELF_LABELS[g.shelf as BrainShelf] || g.shelf}</td>
              <td className="text-muted">{g.item_id || ''}</td><td>{g.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** What the brain passed for one email: shown in the sample and in Outbound approvals. */
export function SnapshotDetails({ s }: { s: BrainSnapshot | null | undefined }) {
  if (!s) return <div className="small text-muted">No brain snapshot was recorded for this draft.</div>;
  return (
    <div className="small">
      <div className="mb-1">
        <StatusBadge label={s.screen?.passed ? 'passes the screen' : 'rejected'} tone={s.screen?.passed ? 'success' : 'danger'} />{' '}
        <span className="text-muted">overlap with earlier emails: {s.screen?.overlap_pct ?? 0}%</span>
        {s.piece && <span className="text-muted"> · shelf: {SHELF_LABELS[s.piece.shelf as BrainShelf] || s.piece.shelf}{s.piece.item_id ? ` (${s.piece.item_id})` : ''}</span>}
      </div>
      {!!s.screen?.issues?.length && <ul className="text-danger mb-1">{s.screen.issues.map((i) => <li key={i}>{i}</li>)}</ul>}
      <details><summary>Profile passed to the AI</summary><pre className="bg-light p-2 mb-1" style={{ whiteSpace: 'pre-wrap' }}>{s.profile || '(none on record)'}</pre></details>
      <details><summary>Content piece from the brain</summary><pre className="bg-light p-2 mb-1" style={{ whiteSpace: 'pre-wrap' }}>{s.piece?.block || '(no piece: written from the profile alone)'}</pre></details>
      <details><summary>The one memory (excerpt)</summary><pre className="bg-light p-2 mb-1" style={{ whiteSpace: 'pre-wrap' }}>{s.memory_excerpt || '(nothing on record)'}</pre></details>
      {!!s.earlier_emails?.length && (
        <details><summary>Earlier emails it built on</summary><ul className="mb-1">{s.earlier_emails.map((e, i) => <li key={i}>{e.date ? `${e.date}: ` : ''}{e.subject}</li>)}</ul></details>
      )}
    </div>
  );
}

export function SampleBody({ r }: { r: BrainSampleResult }) {
  if (!r.people.length) return <div className="small text-muted">No Explorer could be sampled right now.</div>;
  return (
    <div>
      <div className="small text-muted mb-2">{r.note}</div>
      {r.people.map((p) => (
        <div key={p.recipient_masked} className="border rounded p-2 mb-3">
          <div className="fw-semibold small mb-2">{p.recipient_masked} <span className="text-muted">({p.action})</span></div>
          {p.emails.map((e) => (
            <div key={e.date} className="border-top pt-2 mt-2">
              <div className="small mb-1"><strong>{e.date}</strong> · {e.subject || '(no draft)'} {e.reason ? <span className="text-muted">({e.reason})</span> : null}</div>
              <SnapshotDetails s={e.snapshot} />
              {e.html && (
                <iframe title={`email ${p.recipient_masked} ${e.date}`} srcDoc={e.html} sandbox="" style={{ width: '100%', height: 420, border: '1px solid #e2e8f0', borderRadius: 6 }} />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ApprovalShelf() {
  const [items, setItems] = useState<BrainItemRow[] | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [fact, setFact] = useState({ title: '', body: '', source_url: '', source_label: '' });
  const load = useCallback(() => {
    Promise.all([listBrainItems({ status: 'draft' }), listBrainItems({ status: 'approved' })])
      .then(([d, a]) => setItems([...d, ...a]))
      .catch((err) => setProblems(errorProblems(err)));
  }, []);
  useEffect(() => { load(); }, [load]);
  const act = async (fn: () => Promise<unknown>) => {
    setProblems([]);
    try { await fn(); load(); } catch (err) { setProblems(errorProblems(err)); }
  };
  return (
    <div>
      {problems.length > 0 && <div className="alert alert-warning py-2 px-3 small">{problems.join(' · ')}</div>}
      {items === null ? <div className="small text-muted">Loading…</div> : items.length === 0 ? (
        <div className="small text-muted mb-2">Nothing waiting and nothing approved yet.</div>
      ) : (
        <table className="table table-sm small">
          <thead><tr><th>Kind</th><th>Title</th><th>Source</th><th>Status</th><th /></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>{i.kind === 'ai_fact' ? 'AI fact' : 'Build prompt'}</td>
                <td>{i.title}</td>
                <td className="text-muted">{i.source_label || i.source_url || ''}</td>
                <td>{i.status}{i.kind === 'build_prompt' ? ` (test-build ${i.test_build_status})` : ''}</td>
                <td className="text-end text-nowrap">
                  {i.status === 'draft' && <button type="button" className="btn btn-outline-success btn-sm me-1" onClick={() => act(() => approveBrainItem(i.id))}>Approve</button>}
                  <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => act(() => retireBrainItem(i.id))}>Retire</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <details className="small">
        <summary>Add an AI fact (needs a CLM-nnn id or a public source to be approved)</summary>
        <div className="row g-2 mt-1">
          <div className="col-md-6"><input className="form-control form-control-sm" placeholder="Title" value={fact.title} onChange={(e) => setFact({ ...fact, title: e.target.value })} /></div>
          <div className="col-md-6"><input className="form-control form-control-sm" placeholder="Source (CLM-nnn or a label)" value={fact.source_label} onChange={(e) => setFact({ ...fact, source_label: e.target.value })} /></div>
          <div className="col-12"><textarea className="form-control form-control-sm" rows={2} placeholder="The fact, exactly as Maya should state it" value={fact.body} onChange={(e) => setFact({ ...fact, body: e.target.value })} /></div>
          <div className="col-md-8"><input className="form-control form-control-sm" placeholder="Public source link (https://...)" value={fact.source_url} onChange={(e) => setFact({ ...fact, source_url: e.target.value })} /></div>
          <div className="col-md-4"><button type="button" className="btn btn-outline-primary btn-sm w-100" onClick={() => act(async () => {
            await addAiFact({ title: fact.title, body: fact.body, source_url: fact.source_url || null, source_label: fact.source_label || null });
            setFact({ title: '', body: '', source_url: '', source_label: '' });
          })}>Add as draft</button></div>
        </div>
      </details>
    </div>
  );
}

/**
 * `brandId` is OPTIONAL and defaults to null, which reads and writes the shared
 * rule set. Explorer Growth's own page renders `<BrainTab />` with no props and
 * is therefore unchanged by the per-brand work - AD-1 holds without that page
 * being edited at all. The merged Growth Journey workspace passes the brand it
 * has selected.
 */
export default function BrainTab({ brandId = null }: { brandId?: string | null } = {}) {
  const [c, setC] = useState<BrainControl | null>(null);
  const [error, setError] = useState(false);
  const [sample, setSample] = useState<BrainSampleResult | null>(null);
  const [sampling, setSampling] = useState(false);
  const [sampleProblems, setSampleProblems] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    // Cleared first, so switching brand shows the loading state rather than the
    // PREVIOUS brand's rules sitting there looking like this brand's.
    setC(null);
    setError(false);
    getBrainControl(brandId).then((x) => { if (live) setC(x); }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [brandId]);

  const write = async () => {
    setSampling(true); setSampleProblems([]);
    try { setSample(await runBrainSample(3, 3)); } catch (err) { setSampleProblems(errorProblems(err)); } finally { setSampling(false); }
  };

  if (error) return <div className="alert alert-warning small">The brain could not be read.</div>;
  if (!c) return <div className="text-muted small">Loading…</div>;
  const send = c.send_enabled;
  return (
    <div className="d-flex flex-column gap-3">
      <div className="small">
        Explorer Growth sending:{' '}
        <StatusBadge label={send === null ? 'unreadable' : send ? 'ON: drafts wait in Outbound approvals' : 'off: shadow drafts only'} tone={send ? 'danger' : send === null ? 'warning' : 'neutral'} />
        {c.rules_problems.length > 0 && <div className="text-warning mt-1">{c.rules_problems.join(' · ')}</div>}
        {!c.rules_stored && <div className="text-muted mt-1">These are the built-in rules; saving makes them yours.</div>}
      </div>
      <SectionCard title="Rules" icon="settings-4-line">
        {/* Keyed on the source as well as the brand: when a brand falls back to
            the shared set and then saves its own, the editor must remount with
            the brand's rules rather than keep the fallback it was seeded with. */}
        <RulesEditor
          key={`${brandId ?? 'global'}:${c.rules_source}`}
          initial={c.rules}
          hardRules={c.hard_rules}
          brandId={brandId}
        />
      </SectionCard>
      <SectionCard title="What the brain can choose from" icon="stack-line"><InventoryBody c={c} /></SectionCard>
      <SectionCard title="Approval shelf (AI facts and build prompts)" icon="checkbox-circle-line"><ApprovalShelf /></SectionCard>
      <SectionCard title="What each Explorer already got" icon="history-line"><GivenBody c={c} /></SectionCard>
      <SectionCard title="Write a sample" icon="mail-send-line">
        <div className="small text-muted mb-2">Three real Explorers, three emails each, three days apart. Uses the live rules and shelves. Nothing is saved and nothing is sent.</div>
        <button type="button" className="btn btn-outline-primary btn-sm mb-3" onClick={write} disabled={sampling}>{sampling ? 'Writing (about a minute)…' : 'Write a sample'}</button>
        {sampleProblems.length > 0 && <div className="alert alert-warning py-2 px-3 small">{sampleProblems.join(' · ')}</div>}
        {sample && <SampleBody r={sample} />}
      </SectionCard>
    </div>
  );
}
