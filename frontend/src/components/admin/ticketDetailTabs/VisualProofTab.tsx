import React, { useState, useEffect } from 'react';

// ProofDesk Milestone 2 — Visual Proof tab (spec §11, §15.3). Renders evidence_artifacts
// linked to this ticket. This milestone has no object-storage/binary-serving pipeline
// (see execution-contract.md Assumption 2) — `storage_ref` is a filesystem path from
// the existing screenshot capture pipeline (screenshotCaptureService.ts), not
// guaranteed to be web-servable. This tab therefore renders defensively: it attempts
// an <img> only for a reference that looks like a servable web path/URL, falls back to
// a plain reference line on load failure (onError), and never fabricates a preview for
// a reference it can't render.

interface EvidenceArtifact {
  id: string;
  artifact_type: string;
  storage_ref: string | null;
  title: string | null;
  captured_at: string | null;
  created_at: string;
}

interface Props {
  ticketId: string;
  token: string | null;
}

function looksWebServable(ref: string | null): boolean {
  if (!ref) return false;
  return ref.startsWith('http://') || ref.startsWith('https://') || ref.startsWith('/');
}

function EvidenceCard({ item }: { item: EvidenceArtifact }) {
  const [imgFailed, setImgFailed] = useState(false);
  const canAttemptImage = item.artifact_type === 'screenshot' && looksWebServable(item.storage_ref) && !imgFailed;

  return (
    <div className="border rounded p-2 mb-2 small">
      <div className="d-flex justify-content-between align-items-center mb-1">
        <span className="badge bg-secondary">{item.artifact_type}</span>
        <span className="text-muted" style={{ fontSize: '0.7rem' }}>
          {(item.captured_at || item.created_at || '').slice(0, 16).replace('T', ' ')}
        </span>
      </div>
      {item.title && <div className="fw-medium mb-1">{item.title}</div>}
      {canAttemptImage ? (
        <img
          src={item.storage_ref as string}
          alt={item.title || `${item.artifact_type} evidence`}
          style={{ maxWidth: '100%', border: '1px solid #e2e8f0', borderRadius: 4 }}
          onError={() => setImgFailed(true)}
        />
      ) : (
        item.storage_ref && (
          <div className="text-muted font-monospace" style={{ fontSize: '0.7rem', wordBreak: 'break-all' }}>
            {item.storage_ref}
          </div>
        )
      )}
    </div>
  );
}

export default function VisualProofTab({ ticketId, token }: Props) {
  const [evidence, setEvidence] = useState<EvidenceArtifact[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(`/api/admin/tickets/${ticketId}/evidence`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error(`Evidence request failed: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setEvidence(data.evidence || []);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticketId, token]);

  if (loading) {
    return <div className="text-muted small py-4">Loading evidence...</div>;
  }

  if (error) {
    return <div className="text-muted small py-4">Evidence unavailable right now — try reopening this ticket.</div>;
  }

  if (!evidence || evidence.length === 0) {
    return <div className="text-muted small py-4">No visual evidence captured yet for this ticket.</div>;
  }

  return (
    <div>
      {evidence.map((item) => (
        <EvidenceCard key={item.id} item={item} />
      ))}
    </div>
  );
}
