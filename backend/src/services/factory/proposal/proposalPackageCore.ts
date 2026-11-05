/**
 * proposalPackageCore — the PURE core of the Proposal Studio P6 package assembly: the export-readiness gate, the
 * manifest shape, and the redacted-copy transform. No I/O; buildProposalPackage wraps these with the real PDF
 * render, the exceljs pricing passthrough, and the file writes.
 *
 * EXPORT GATE: a package is blocked while any document fails `passes`, any required gate is unapproved, or any fatal
 * item remains — "exported is not submitted" stays as is, and a non-ready proposal can never be assembled.
 */

export interface PackageDoc {
  key: string;
  title: string;
  passes: boolean;
  /** The go-to-submit gate (Gold) approval. */
  goldApproved: boolean;
  fatalCount: number;
  version: number;
  pageCount: number | null;
  blueprintVersion: number | null;
  contentSha256: string;
  fileName: string | null;
  /** Pricing documents are packaged as the sealed, separate file, never merged into the main PDFs. */
  adminOnly: boolean;
}

export interface PackageReadiness { ok: boolean; blocking: string[] }

/** PURE: can the package be exported? Blocked on any failing document, any unapproved Gold gate, or any fatal item. */
export function evaluatePackageReadiness(docs: PackageDoc[]): PackageReadiness {
  const rows = Array.isArray(docs) ? docs : [];
  const blocking: string[] = [];
  if (rows.length === 0) { blocking.push('no_documents'); return { ok: false, blocking }; }
  const failing = rows.filter((d) => !d.passes).map((d) => d.key);
  if (failing.length) blocking.push(`documents_not_passing:${failing.join(',')}`);
  const ungated = rows.filter((d) => !d.goldApproved).map((d) => d.key);
  if (ungated.length) blocking.push(`gold_gate_unapproved:${ungated.join(',')}`);
  const fatal = rows.filter((d) => (d.fatalCount ?? 0) > 0).map((d) => d.key);
  if (fatal.length) blocking.push(`fatal_items:${fatal.join(',')}`);
  return { ok: blocking.length === 0, blocking };
}

export interface PackageManifestItem { docKey: string; title: string; fileName: string; version: number; pageCount: number | null; sha256: string; blueprintVersion: number | null; sealed: boolean }
export interface PackageManifest { exportedAt: string; blueprintVersion: number | null; fileCount: number; items: PackageManifestItem[] }

/** PURE: the manifest — one entry per document in blueprint file-name order, each citing its version, page count,
 *  sha256 and blueprint version; the pricing document is flagged `sealed` (its own separate file). */
export function buildPackageManifest(docs: PackageDoc[], exportedAt: string): PackageManifest {
  const rows = (Array.isArray(docs) ? docs : []).slice().sort((a, b) => (a.fileName ?? a.key).localeCompare(b.fileName ?? b.key));
  const items: PackageManifestItem[] = rows.map((d) => ({
    docKey: d.key, title: d.title, fileName: d.fileName ?? `${d.key}.pdf`, version: d.version,
    pageCount: d.pageCount, sha256: d.contentSha256, blueprintVersion: d.blueprintVersion, sealed: !!d.adminOnly,
  }));
  const blueprintVersion = rows.find((d) => d.blueprintVersion != null)?.blueprintVersion ?? null;
  return { exportedAt, blueprintVersion, fileCount: items.length, items };
}

export interface RedactionSpan { span_start: number; span_end: number; label?: string | null }

/**
 * PURE: produce the redacted public copy by replacing each marked span with [REDACTED] (or [REDACTED: label]).
 * Spans are character offsets into the (immutable) version content, applied right-to-left so earlier offsets stay
 * valid. Out-of-range or inverted spans are ignored. Total: garbage in ⇒ the input unchanged.
 */
export function redactHtml(content: string, spans: RedactionSpan[]): string {
  const text = String(content ?? '');
  const valid = (Array.isArray(spans) ? spans : [])
    .filter((s) => Number.isInteger(s?.span_start) && Number.isInteger(s?.span_end) && s.span_start >= 0 && s.span_end > s.span_start && s.span_end <= text.length)
    .sort((a, b) => b.span_start - a.span_start);
  let out = text;
  for (const s of valid) {
    const token = s.label ? `[REDACTED: ${s.label}]` : '[REDACTED]';
    out = out.slice(0, s.span_start) + token + out.slice(s.span_end);
  }
  return out;
}
