/**
 * insertArtifactFigure — Proposal Studio P4. Insert a captured build-evidence screenshot into a proposal document as
 * a NUMBERED figure. The figure block is `<figure data-artifact="<id>"><img src="<app artifact route>"><figcaption>
 * Figure N. <caption>, captured from the verified build on <date> (story <id>, commit <sha7>)</figcaption></figure>`,
 * appended to the document and saved as a NEW version via the normal draft path (so it is sanitized by
 * sanitizeProposalHtml — which now admits this exact figure/img shape — and recorded as an immutable version).
 *
 * Figure numbering is DETERMINISTIC per document: it counts the figures already in the content. Pure helpers are
 * exported for unit testing; the service does the I/O (load artifact + doc, draft the new version).
 */
import GovBuildArtifact from '../../../models/GovBuildArtifact';
import { artifactImagePath } from './captureStoryArtifact';
import { draftProposalDocument } from './govProposalDocumentActions';
import { listProposalDocuments, type ProposalDocumentView, ProposalDocumentError } from './govProposalDocumentStore';

/** The next figure number for a document = (figures already present) + 1. Pure. */
export function nextFigureNumber(contentHtml: string | null): number {
  const n = typeof contentHtml === 'string' ? (contentHtml.match(/<figure\b/gi) || []).length : 0;
  return n + 1;
}

/** Build the deterministic, traceable figure caption. Pure. */
export function figureCaption(num: number, caption: string, storyId: string, commitSha: string | null, capturedAt: Date | string | null): string {
  const date = capturedAt ? new Date(capturedAt).toISOString().slice(0, 10) : 'unknown date';
  const sha = commitSha ? `, commit ${String(commitSha).slice(0, 7)}` : '';
  return `Figure ${num}. ${caption || 'Build screenshot'}, captured from the verified build on ${date} (story ${storyId}${sha}).`;
}

/** Build the figure HTML block. Pure. */
export function figureBlock(artifactId: string, imgSrc: string, captionText: string): string {
  return `<figure data-artifact="${artifactId}"><img src="${imgSrc}"><figcaption>${captionText}</figcaption></figure>`;
}

/**
 * Insert the artifact as the next figure in the document and save a new (human-authored) version. Throws
 * ProposalDocumentError('not_found') if the artifact is missing, not this project's, or not captured.
 */
export async function insertArtifactFigure(deliveryProjectId: string, docKey: string, artifactId: string, identityId: string | null): Promise<ProposalDocumentView> {
  const artifact: any = await GovBuildArtifact.findByPk(artifactId);
  if (!artifact || artifact.delivery_project_id !== deliveryProjectId || artifact.status !== 'captured' || !artifact.file_path) {
    throw new ProposalDocumentError('That build artifact is not available to insert.', 'not_found');
  }
  const doc = (await listProposalDocuments(deliveryProjectId)).find((d) => d.key === docKey);
  if (!doc) throw new ProposalDocumentError('Document not found.', 'not_found');

  const num = nextFigureNumber(doc.contentHtml);
  const caption = figureCaption(num, artifact.caption ?? '', artifact.story_id, artifact.commit_sha ?? null, artifact.captured_at ?? null);
  const block = figureBlock(artifactId, artifactImagePath(deliveryProjectId, artifactId), caption);
  const newContent = `${doc.contentHtml ?? ''}${block}`;

  // Reuse the draft path: it sanitizes (keeping this figure/img shape) and records a new human version.
  return draftProposalDocument({ deliveryProjectId, docKey, identityId, canVerify: true, manualHtml: newContent });
}
