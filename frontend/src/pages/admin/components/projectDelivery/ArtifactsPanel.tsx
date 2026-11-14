import React, { useCallback, useState } from 'react';
import { FileCards, FileViewer, type FileCardItem } from '../../../../components/fileCards/FileCards';
import { fetchProjectDocumentFile, fetchProjectDocumentPreview, type AdminProjectDocument } from '../../../../services/adminProjectDocumentsApi';

/**
 * ArtifactsPanel — the DOCUMENTS and video a student produced for this project, as portfolio-style typed
 * cards with per-type viewers (the same treatment as the gov Build Evidence cards).
 *
 * The content is the student's own body of work, resolved by the project's enrollment and filtered to
 * STRUCTURED DOCUMENTS + VIDEO (PDF, Word, Excel, PowerPoint, RTF, CSV, video). Written work, field
 * guides, Claude Studio links and plain text are intentionally excluded (Ali, 2026-11-14). It replaces
 * the old build-pipeline `project_artifacts` read, which was empty for most projects even when the
 * student had a full body of work. Each file is fetched live through the admin project-documents route;
 * nothing is stored here. pdf/video render inline, csv as a table, Office/RTF download.
 */

interface Props {
  documents: AdminProjectDocument[] | null;
  projectId: string;
  loading?: boolean;
}

export default function ArtifactsPanel({ documents, projectId, loading = false }: Props) {
  const [open, setOpen] = useState<FileCardItem | null>(null);
  const fetchFile = useCallback(
    (id: string, opts?: { download?: boolean }) => fetchProjectDocumentFile(projectId, id, opts),
    [projectId],
  );
  const fetchPreview = useCallback(
    (id: string) => fetchProjectDocumentPreview(projectId, id),
    [projectId],
  );

  if (loading) {
    return <div className="text-muted small py-2" data-testid="artifacts-loading">Loading documents…</div>;
  }

  if (!documents || documents.length === 0) {
    return (
      <div className="border rounded p-3" data-testid="artifacts-empty">
        <div className="fw-semibold small mb-1">No documents for this project yet.</div>
        <p className="text-muted small mb-0">
          This shows the student&apos;s structured documents and video: PDFs, Word, Excel, PowerPoint, and video.
          None have been produced for this project yet.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="artifacts-list">
      <FileCards items={documents} onOpen={setOpen} />
      {open && <FileViewer item={open} fetchFile={fetchFile} fetchPreview={fetchPreview} onClose={() => setOpen(null)} />}
    </div>
  );
}
