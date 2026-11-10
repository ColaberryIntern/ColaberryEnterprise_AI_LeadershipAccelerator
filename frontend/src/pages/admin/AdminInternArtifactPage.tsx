import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageHeader } from '../../components/admin/shell';
import { fetchInternArtifact, type InternArtifactView } from '../../services/internArtifactApi';

/**
 * One published intern artifact, opened from the Internship Report (Ali, 9 Nov 2026: "open any
 * artifacts they have published directly in the report").
 *
 * The artifact's HTML is intern-authored, so it renders in a sandboxed iframe WITHOUT
 * `allow-same-origin`: its scripts (field guides toggle their own theme) can run, but it cannot read
 * this page, the admin token, or cookies. Everything else renders as text through React, which
 * escapes it.
 */

function DataBlock({ value, depth = 0 }: { value: unknown; depth?: number }): React.ReactElement | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return <p className="mb-2" style={{ whiteSpace: 'pre-wrap' }}>{String(value)}</p>;
  }
  if (Array.isArray(value)) {
    return <ul className="mb-2">{value.map((v, i) => <li key={i}><DataBlock value={v} depth={depth + 1} /></li>)}</ul>;
  }
  if (typeof value === 'object') {
    return (
      <div className={depth ? 'ps-3 border-start' : ''}>
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k} className="mb-2">
            <div className="small text-uppercase text-muted fw-semibold">{k.replace(/_/g, ' ')}</div>
            <DataBlock value={v} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }
  return null;
}

export default function AdminInternArtifactPage(): React.ReactElement {
  const { id = '' } = useParams<{ id: string }>();
  const [artifact, setArtifact] = useState<InternArtifactView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchInternArtifact(id)
      .then((a) => { if (live) setArtifact(a); })
      .catch((e: { response?: { data?: { error?: string } } }) => { if (live) setError(e?.response?.data?.error ?? 'Could not load this artifact.'); });
    return () => { live = false; };
  }, [id]);

  if (error) return <div className="container py-4"><div className="alert alert-warning" role="alert">{error}</div></div>;
  if (!artifact) return <div className="container py-4" aria-busy="true">Loading artifact...</div>;

  const when = new Date(artifact.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <div className="container-fluid py-3">
      <PageHeader title={artifact.title} subtitle={`${artifact.intern} · ${artifact.kind.replace(/_/g, ' ')} · published ${when}`} icon="file-text-line" />
      {artifact.externalUrl && (
        <p><a className="btn btn-primary btn-sm" href={artifact.externalUrl} target="_blank" rel="noopener noreferrer">Open on claude.ai</a></p>
      )}
      {artifact.html && (
        <iframe
          title={artifact.title}
          srcDoc={artifact.html}
          sandbox="allow-scripts allow-popups"
          style={{ width: '100%', height: '80vh', border: '1px solid var(--bs-border-color)', borderRadius: 6, background: '#fff' }}
        />
      )}
      {artifact.file && (
        <div className="card mb-3">
          <div className="card-header small fw-semibold">{artifact.file.name}</div>
          <div className="card-body">
            {artifact.file.text !== null
              ? <pre className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>{artifact.file.text}</pre>
              : <span className="text-muted">{artifact.file.note}</span>}
          </div>
        </div>
      )}
      {Object.keys(artifact.data).length > 0 && (
        <div className="card"><div className="card-body"><DataBlock value={artifact.data} /></div></div>
      )}
    </div>
  );
}
