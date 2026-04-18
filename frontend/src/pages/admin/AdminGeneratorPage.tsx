import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../utils/api';
import Breadcrumb from '../../components/ui/Breadcrumb';

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
    <div className="container-fluid py-4">
      <Breadcrumb items={[
        { label: 'Admin', to: '/admin/dashboard' },
        { label: 'Lead Sources', to: '/admin/sources' },
        { label: `${data.source.name} / ${data.entry_point.slug}` },
      ]} />

      <div className="mb-4">
        <h1 className="h3 mb-1">Webhook + Embed Generator</h1>
        <p className="text-muted mb-0 small">
          Copy a ready-to-paste integration for <strong>{data.source.name}</strong> / <code>{data.entry_point.slug}</code>.
        </p>
      </div>

      <div className="row g-4">
        <div className="col-lg-4">
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white fw-semibold">Configuration</div>
            <div className="card-body">
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
                    <dd className="mb-0">
                      {(data.form_definition.required_fields || []).map((r) => (
                        <span key={r} className="badge bg-secondary me-1">{r}</span>
                      ))}
                    </dd>
                  </>
                )}
              </dl>
            </div>
          </div>
        </div>

        <div className="col-lg-8">
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white fw-semibold">Integration Snippets</div>
            <div className="card-body">
              <CopyBlock label="Webhook URL" value={data.webhook_url} />
              <CopyBlock label="Sample Payload (JSON)" value={JSON.stringify(data.sample_payload, null, 2)} lang="json" />
              <CopyBlock label="cURL" value={data.curl} lang="bash" />
              <CopyBlock label="JavaScript Embed" value={data.js_embed} lang="html" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
