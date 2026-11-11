import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageHeader } from '../../components/admin/shell';
import { ArtifactFileViewer } from '../../components/artifactViewer/ArtifactFileViewers';
import { DataBlock } from '../../components/artifactViewer/DataBlock';
import { adminArtifactSource, fetchInternArtifact, type InternArtifactView } from '../../services/internArtifactApi';

/**
 * One published intern artifact, opened from the Internship Report (Ali, 9 Nov 2026: "open any
 * artifacts they have published directly in the report").
 *
 * The artifact's HTML is intern-authored, so it renders in a sandboxed iframe WITHOUT
 * `allow-same-origin`: its scripts (field guides toggle their own theme) can run, but it cannot read
 * this page, the admin token, or cookies. Everything else renders as text through React, which
 * escapes it. The viewers are shared with the learner's own work page (C128).
 */
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
      {artifact.file && <ArtifactFileViewer id={artifact.id} file={artifact.file} source={adminArtifactSource} />}
      {Object.keys(artifact.data).length > 0 && (
        <div className="card"><div className="card-body"><DataBlock value={artifact.data} /></div></div>
      )}
    </div>
  );
}
