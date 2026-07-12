import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../utils/api';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../components/admin/shell';
import { TrustSignal, TrustLevel } from '../../components/admin/shell/trust';

interface GeneratorResponse {
  source: { id: string; slug: string; name: string; domain: string };
  entry_point: { id: string; slug: string; name: string | null; page: string | null; form_name: string | null };
  form_definition: { field_map: Record<string, string>; required_fields: string[]; version: number } | null;
  webhook_url: string;
  sample_payload: Record<string, any>;
  curl: string;
  js_embed: string;
}

function CopyBlock({ label, value, lang }: { label: string; value: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };
  return (
    <div className="mb-4">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <label className="form-label small fw-medium mb-0">{label}</label>
        <button className="btn btn-sm btn-outline-secondary" onClick={copy}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="bg-light border rounded p-3 small mb-0" style={{ whiteSpace: 'pre-wrap', maxHeight: '300px', overflow: 'auto' }}>
        <code className={lang ? `language-${lang}` : ''}>{value}</code>
      </pre>
    </div>
  );
}

export default function AdminGeneratorPage() {
  const { sourceSlug, entrySlug } = useParams<{ sourceSlug: string; entrySlug: string }>();
  const [data, setData] = useState<GeneratorResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/api/admin/generator/${sourceSlug}/${entrySlug}`);
        if (!cancelled) setData(res.data);
      } catch (err: any) {
        if (!cancelled) setError(err?.response?.data?.error || 'Failed to load generator');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sourceSlug, entrySlug]);

  // Per-page trust signal (Basecamp todo 10027085963) derived from generator readiness.
  // Declared before any early return so hook order stays stable.
  const trust: TrustSignal = useMemo(() => {
    const ready = Boolean(data);
    const required = data?.form_definition?.required_fields?.length ?? 0;
    const level: TrustLevel = ready ? 'live' : 'stale';
    return {
      level,
      score: ready ? 100 : 0,
      source: 'content generator',
      updatedAt: new Date().toISOString(),
      summary: data
        ? `Webhook + embed snippets ready for ${data.source.name} / ${data.entry_point.slug}.`
        : 'Generator configuration not loaded.',
      href: '/admin/trust',
      pillars: [
        {
          name: 'Integration',
          status: ready ? 'live' : 'error',
          score: ready ? 100 : 0,
          evidence: [
            { label: 'Webhook', value: ready ? 'ready' : '—' },
            { label: 'Required fields', value: String(required) },
          ],
        },
      ],
    };
  }, [data]);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container-fluid py-4">
        <div className="alert alert-danger">{error || 'Not found'}</div>
        <Link to="/admin/sources" className="btn btn-sm btn-outline-secondary">Back to Sources</Link>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Generator"
        icon="magic-line"
        subtitle={`Copy a ready-to-paste integration for ${data.source.name} / ${data.entry_point.slug}.`}
        breadcrumb={[
          { label: 'Admin', to: '/admin/dashboard' },
          { label: 'Sources', to: '/admin/sources' },
          { label: 'Generator' },
        ]}
        trust={trust}
        actions={
          <Link to="/admin/sources" className="btn btn-outline-secondary btn-sm">
            <i className="ri-arrow-left-line" aria-hidden="true" /> Back to Sources
          </Link>
        }
      >
        <div className="row g-3">
          <div className="col-6 col-lg-3">
            <StatCard label="Source" value={data.source.name} icon="global-line" tone="primary" />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="Entry Point" value={data.entry_point.slug} icon="links-line" tone="info" />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard
              label="Field Map"
              value={data.form_definition ? `v${data.form_definition.version}` : '—'}
              icon="braces-line"
              tone={data.form_definition ? 'success' : 'neutral'}
            />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard
              label="Required Fields"
              value={data.form_definition?.required_fields?.length ?? 0}
              icon="checkbox-circle-line"
              tone="info"
            />
          </div>
        </div>
      </PageHeader>

      <div className="row g-4">
        <div className="col-lg-4">
          <SectionCard title="Configuration" icon="settings-3-line">
            <dl className="mb-0 small">
              <dt className="text-muted">Source</dt>
              <dd className="mb-2">{data.source.name} <span className="text-muted">({data.source.slug})</span></dd>
              <dt className="text-muted">Domain</dt>
              <dd className="mb-2">{data.source.domain}</dd>
              <dt className="text-muted">Entry point</dt>
              <dd className="mb-2"><code>{data.entry_point.slug}</code></dd>
              <dt className="text-muted">Page</dt>
              <dd className="mb-2">{data.entry_point.page || '-'}</dd>
              <dt className="text-muted">Form name</dt>
              <dd className="mb-2">{data.entry_point.form_name || '-'}</dd>
              {data.form_definition && (
                <>
                  <dt className="text-muted">Field map (v{data.form_definition.version})</dt>
                  <dd className="mb-2">
                    <pre className="small mb-0 bg-light border rounded p-2">{JSON.stringify(data.form_definition.field_map, null, 2)}</pre>
                  </dd>
                  <dt className="text-muted">Required fields</dt>
                  <dd className="mb-0 d-flex flex-wrap gap-1">
                    {(data.form_definition.required_fields || []).map((r) => (
                      <StatusBadge key={r} label={r} tone="info" />
                    ))}
                  </dd>
                </>
              )}
            </dl>
          </SectionCard>
        </div>

        <div className="col-lg-8">
          <SectionCard title="Integration Snippets" icon="code-s-slash-line">
            <CopyBlock label="Webhook URL" value={data.webhook_url} />
            <CopyBlock label="Sample Payload (JSON)" value={JSON.stringify(data.sample_payload, null, 2)} lang="json" />
            <CopyBlock label="cURL" value={data.curl} lang="bash" />
            <CopyBlock label="JavaScript Embed" value={data.js_embed} lang="html" />
          </SectionCard>
        </div>
      </div>
    </>
  );
}
