import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader, SectionCard } from '../../../../components/admin/shell';
import { listBrands, type Brand } from '../../../../services/adminBrandApi';
import api from '../../../../utils/api';
import * as composer from '../../../../services/contentComposerApi';
import type { ComposerAction, ConfirmationSummary, ContentItem, ContentVariant, ExternalPublication, ItemLink, ProviderKey, ProviderSummary, PublishingJob, VariantProblem } from '../../../../services/contentComposerApi';
import ComposerSetup, { type CampaignOption, type SetupValues } from './ComposerSetup';
import ComposerVariants from './ComposerVariants';
import ComposerPreview from './ComposerPreview';
import ComposerConfirmation from './ComposerConfirmation';
import ComposerPublishing from './ComposerPublishing';

/**
 * The marketing composer (spec 8.1). One page, five sections, in the order the work happens:
 *
 *   1. Setup      - brand, campaign, title, landing page, canonical message   (steps 1, 3, 4)
 *   2. Channels   - pick providers, generate variants, edit, links, validate  (steps 2, 5-7)
 *   3. Preview    - desktop / mobile per network                              (step 8)
 *   4. Confirm    - the server-built summary and the four actions             (steps 9-10)
 *   5. Publishing - the queue, handoff packages and receipts                  (section 9)
 *
 * The page owns the item id and the loaded state; every mutation goes to the server and the
 * page re-reads what it needs. Nothing about the content is computed here - variants, limits,
 * links, validation and the confirmation all come back from the API, so what the operator
 * confirms is what the server will act on, not a client-side approximation of it.
 */

const EMPTY_SETUP: SetupValues = { brand_id: '', campaign_id: '', title: '', destination_url: '', canonical_body: '', content_type: 'text', is_paid: false, has_offer: false };

export default function AdminContentComposerPage() {
  const { id: routeId } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const [brands, setBrands] = useState<Brand[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [setup, setSetup] = useState<SetupValues>(EMPTY_SETUP);
  const [item, setItem] = useState<ContentItem | null>(null);
  const [variants, setVariants] = useState<ContentVariant[]>([]);
  const [links, setLinks] = useState<ItemLink[]>([]);
  const [selected, setSelected] = useState<ProviderKey[]>([]);
  const [problems, setProblems] = useState<Record<string, VariantProblem[]>>({});
  const [confirmation, setConfirmation] = useState<ConfirmationSummary | null>(null);
  const [jobs, setJobs] = useState<PublishingJob[]>([]);
  const [publications, setPublications] = useState<ExternalPublication[]>([]);
  const [scheduledFor, setScheduledFor] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger' | 'info'; text: string } | null>(null);

  const say = (tone: 'success' | 'danger' | 'info', text: string) => setNotice({ tone, text });
  const fail = (err: unknown, fallback: string) => say('danger', composer.errorMessage(err, fallback));

  // ── Reference data ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    listBrands().then((r) => setBrands(r.brands)).catch(() => setBrands([]));
    composer.listProviders().then(setProviders).catch(() => setProviders([]));
    api.get('/api/admin/campaigns', { params: { limit: 200 } })
      .then((r) => setCampaigns((r.data.campaigns ?? []).map((c: Record<string, unknown>) => ({
        id: String(c.id), name: String(c.name), brand_id: (c.brand_id as string | null) ?? null, utm_campaign_slug: (c.utm_campaign_slug as string | null) ?? null,
      }))))
      .catch(() => setCampaigns([]));
  }, []);

  // ── Load an existing item ───────────────────────────────────────────────────────────────
  const reload = useCallback(async (id: string) => {
    const { item: it, variants: vs } = await composer.getItem(id);
    setItem(it);
    setVariants(vs);
    setSelected(vs.map((v) => v.provider));
    setSetup((s) => ({
      ...s,
      brand_id: it.brand_id ?? '',
      campaign_id: it.campaign_id ?? '',
      title: it.title,
      canonical_body: it.canonical_body ?? '',
      content_type: it.content_type,
      is_paid: Boolean(it.metadata?.isPaid),
      has_offer: Boolean(it.metadata?.hasOffer),
    }));
    if (it.scheduled_for) setScheduledFor(it.scheduled_for.slice(0, 16));
    const problemMap: Record<string, VariantProblem[]> = {};
    for (const v of vs) problemMap[v.provider] = Array.isArray(v.validation_errors) ? v.validation_errors : [];
    setProblems(problemMap);
    const [conf, js, pubs] = await Promise.all([composer.getConfirmation(id), composer.listJobs(id), composer.listPublications(id)]);
    setConfirmation(conf);
    setJobs(js);
    setPublications(pubs);
    setLinks(conf.links.map((l) => ({ provider: l.provider, trackedLinkId: '', shortUrl: l.shortUrl, finalUrl: l.finalUrl, utm: l.utm, reused: true })));
  }, []);

  useEffect(() => {
    if (!routeId) return;
    reload(routeId).catch((err) => fail(err, 'The item could not be loaded.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  const brand = useMemo(() => brands.find((b) => b.id === setup.brand_id) ?? null, [brands, setup.brand_id]);

  // ── Step 1/4: create or update the draft ────────────────────────────────────────────────
  const saveSetup = async () => {
    setBusy(true);
    try {
      if (!item) {
        const created = await composer.createDraft({
          brand_id: setup.brand_id, campaign_id: setup.campaign_id || null, title: setup.title,
          canonical_body: setup.canonical_body, content_type: setup.content_type, is_paid: setup.is_paid, has_offer: setup.has_offer,
        });
        say('success', 'Draft created.');
        navigate(`/admin/marketing/composer/${created.id}`, { replace: true });
      } else {
        await composer.updateItem(item.id, { title: setup.title, canonical_body: setup.canonical_body, content_type: setup.content_type });
        await reload(item.id);
        say('success', 'Draft saved. Regenerate variants if the message changed.');
      }
    } catch (err) { fail(err, 'The draft could not be saved.'); } finally { setBusy(false); }
  };

  // ── Steps 5-7 ───────────────────────────────────────────────────────────────────────────
  const withItem = (fn: (id: string) => Promise<void>, fallback: string) => async () => {
    if (!item) return;
    setBusy(true);
    try { await fn(item.id); } catch (err) { fail(err, fallback); } finally { setBusy(false); }
  };

  const generate = withItem(async (id) => {
    await composer.generateVariants(id, selected);
    await reload(id);
    say('info', 'Variants generated. Hand-edited copy was kept.');
  }, 'Variants could not be generated.');

  const saveVariant = (provider: ProviderKey, text: string) => withItem(async (id) => {
    await composer.editVariant(id, provider, text);
    await reload(id);
  }, 'The edit could not be saved.')();

  const revertVariant = (provider: ProviderKey) => withItem(async (id) => {
    await composer.revertVariant(id, provider);
    await reload(id);
  }, 'The variant could not be reverted.')();

  const makeLinks = withItem(async (id) => {
    const ls = await composer.generateLinks(id, setup.destination_url);
    setLinks(ls);
    await reload(id);
    say('success', `${ls.length} tracked link${ls.length === 1 ? '' : 's'} ready.`);
  }, 'Tracked links could not be generated.');

  const validate = withItem(async (id) => {
    const r = await composer.validateItem(id);
    await reload(id);
    say(r.ok ? 'success' : 'danger', r.ok ? 'Every platform passed.' : `${r.providers.blockers.length} blocker(s) - see each variant.`);
  }, 'Validation could not run.');

  // ── Steps 9-10 ──────────────────────────────────────────────────────────────────────────
  const setTime = withItem(async (id) => {
    await composer.updateItem(id, { scheduled_for: scheduledFor ? new Date(scheduledFor).toISOString() : null });
    await reload(id);
  }, 'The time could not be saved.');

  const act = (action: ComposerAction) => withItem(async (id) => {
    const r = await composer.runAction(id, action, action === 'schedule' && scheduledFor ? new Date(scheduledFor).toISOString() : undefined);
    await reload(id);
    const jobs = r.jobs.length ? ` ${r.jobs.filter((j) => j.created).length} job(s) queued.` : '';
    say('success', `${action.replace(/_/g, ' ')}: item is now ${r.item.status.replace(/_/g, ' ')}.${jobs}`);
  }, 'The action was refused.')();

  // ── Reviewer ────────────────────────────────────────────────────────────────────────────
  const decide = (decision: 'approved' | 'changes_requested' | 'rejected') => withItem(async (id) => {
    const r = await composer.decideApproval(id, decision, null);
    await reload(id);
    say('success', `Decision recorded: ${decision.replace(/_/g, ' ')}. Item is now ${r.item.status.replace(/_/g, ' ')}.`);
  }, 'The decision was refused.')();

  // ── Queue ───────────────────────────────────────────────────────────────────────────────
  const retry = (jobId: string) => withItem(async (id) => { await composer.retryJob(jobId); await reload(id); }, 'Retry was refused.')();
  const cancel = (jobId: string) => withItem(async (id) => { await composer.cancelJob(jobId, null); await reload(id); }, 'Cancel was refused.')();
  const complete = (pubId: string, externalId: string, permalink: string | null) => withItem(async (id) => {
    await composer.completeHandoff(pubId, externalId, permalink);
    await reload(id);
    say('success', 'Handoff completed; the post is recorded as live.');
  }, 'The handoff could not be completed.')();
  const runNow = withItem(async (id) => {
    const r = await composer.runQueueNow();
    await reload(id);
    say(r.halted ? 'danger' : 'info', r.halted ? `Queue halted: ${r.haltReason}.` : `Queue ran: ${r.published} published, ${r.retried} retrying, ${r.failed + r.deadLettered} failed.`);
  }, 'The queue could not be run.');

  return (
    <div className="admin-page">
      <PageHeader
        title={item ? `Composer: ${item.title}` : 'New post'}
        subtitle="Draft once, publish per network - with tracked links, validation and a confirmation you can read."
        icon="quill-pen-line"
        breadcrumb={[{ label: 'Marketing', to: '/admin/marketing' }, { label: 'Composer' }]}
        trust={{ level: item ? 'live' : 'unverified', source: 'content', updatedAt: item?.updated_at ?? null, summary: item ? `Revision ${item.revision}, ${item.status.replace(/_/g, ' ')}` : 'Not saved yet' }}
      />

      {notice && (
        <div className={`alert alert-${notice.tone} py-2 small`} role="status">{notice.text}</div>
      )}

      <SectionCard title="1. Setup" subtitle="Brand, campaign, landing page and the canonical message." icon="settings-3-line">
        <ComposerSetup values={setup} brands={brands} campaigns={campaigns} locked={Boolean(item)} busy={busy} onChange={setSetup} onSubmit={saveSetup} />
      </SectionCard>

      <SectionCard title="2. Channels and variants" subtitle="Pick networks, generate, edit, add tracked links, validate." icon="share-line">
        <div className="d-flex flex-wrap gap-3 mb-3">
          {providers.map((p) => (
            <label key={p.provider} className="form-check small">
              <input className="form-check-input" type="checkbox" disabled={!item || busy}
                checked={selected.includes(p.provider)}
                onChange={(e) => setSelected((s) => e.target.checked ? [...s, p.provider] : s.filter((x) => x !== p.provider))} />
              <span className="form-check-label ms-1">{p.displayName}{p.mode === 'handoff' ? ' (handoff)' : ''}</span>
            </label>
          ))}
        </div>
        <div className="d-flex flex-wrap gap-2 mb-3">
          <button type="button" className="btn btn-sm btn-primary" disabled={!item || busy || selected.length === 0} onClick={generate}>Generate variants</button>
          <button type="button" className="btn btn-sm btn-outline-primary" disabled={!item || busy || variants.length === 0 || !setup.destination_url} onClick={makeLinks}>Generate tracked links</button>
          <button type="button" className="btn btn-sm btn-outline-dark" disabled={!item || busy || variants.length === 0} onClick={validate}>Validate</button>
        </div>
        <ComposerVariants variants={variants} providers={providers} links={links} problems={problems} busy={busy} onSave={saveVariant} onRevert={revertVariant} />
      </SectionCard>

      <SectionCard title="3. Preview" subtitle="Desktop and mobile, per network." icon="eye-line">
        <ComposerPreview variants={variants} providers={providers} links={links} mediaCount={confirmation?.assets.length ?? 0} brandName={brand?.name ?? 'Brand'} />
      </SectionCard>

      <SectionCard title="4. Confirm" subtitle="What will go out, where, and when - in the brand's time and in UTC." icon="checkbox-circle-line">
        {item && (
          <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
            <div>
              <label className="form-label small mb-1" htmlFor="composer-scheduled-for">Scheduled time (your local clock; shown below in brand time and UTC)</label>
              <input id="composer-scheduled-for" type="datetime-local" className="form-control form-control-sm" value={scheduledFor} disabled={busy} onChange={(e) => setScheduledFor(e.target.value)} />
            </div>
            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={setTime}>Set time</button>
          </div>
        )}
        {confirmation
          ? <ComposerConfirmation summary={confirmation} busy={busy} onAction={act} />
          : <p className="text-muted mb-0">Create the draft to see the confirmation.</p>}
        {item?.status === 'ready_for_review' && (
          <div className="d-flex flex-wrap gap-2 align-items-center mt-3 pt-3 border-top" data-testid="reviewer-actions">
            <span className="small text-muted">Reviewer:</span>
            <button type="button" className="btn btn-sm btn-success" disabled={busy} onClick={() => decide('approved')}>Approve</button>
            <button type="button" className="btn btn-sm btn-outline-warning" disabled={busy} onClick={() => decide('changes_requested')}>Request changes</button>
            <button type="button" className="btn btn-sm btn-outline-danger" disabled={busy} onClick={() => decide('rejected')}>Reject</button>
          </div>
        )}
      </SectionCard>

      <SectionCard title="5. Publishing" subtitle="The queue per network, handoff packages to post by hand, and receipts." icon="send-plane-line">
        <ComposerPublishing jobs={jobs} publications={publications} busy={busy} onRetry={retry} onCancel={cancel} onCompleteHandoff={complete} onRunNow={runNow} />
      </SectionCard>
    </div>
  );
}
