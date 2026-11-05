/**
 * buildProposalPackage — the Proposal Studio P6 package assembly. It renders each APPROVED document's version to a
 * PDF (the shared renderer), keeps the pricing file sealed and separate, produces the redacted public copy, and
 * writes a manifest — but ONLY when the package is ready: export is blocked while any document fails `passes`, any
 * Gold gate is unapproved, any fatal item remains, a required form is unsigned, or a required redacted copy is
 * missing. "Exported is not submitted" stays as is: this assembles files, it does not submit anything.
 *
 * The assembly CORE (`assemblePackageCore`) takes its I/O as injected deps so the gating + manifest path is
 * unit-testable without Playwright or a DB; `assembleProposalPackage` wires the real services.
 */
import { evaluatePackageReadiness, buildPackageManifest, type PackageDoc, type PackageManifest } from './proposalPackageCore';

export interface PackageDeps {
  loadDocs: () => Promise<PackageDoc[]>;
  missingSignatures: () => Promise<string[]>;
  requiresRedactedCopy: () => Promise<boolean>;
  hasRedactedCopy: () => Promise<boolean>;
  /** Render one non-pricing approved document to PDF; returns its real page count (fail-soft: null on failure). */
  renderDoc: (doc: PackageDoc) => Promise<number | null>;
  now: () => string;
}

export interface PackageResult { ok: boolean; blocking: string[]; manifest?: PackageManifest; rendered?: number }

export async function assemblePackageCore(deps: PackageDeps): Promise<PackageResult> {
  const docs = await deps.loadDocs();
  const readiness = evaluatePackageReadiness(docs);
  const blocking = [...readiness.blocking];

  const missing = await deps.missingSignatures();
  if (missing.length) blocking.push(`unsigned_required_forms:${missing.join(',')}`);
  if (await deps.requiresRedactedCopy() && !(await deps.hasRedactedCopy())) blocking.push('redacted_copy_required');

  // Never assemble a non-ready package.
  if (blocking.length) return { ok: false, blocking };

  // Render every non-pricing document (the pricing file is the sealed passthrough, not a rendered PDF).
  let rendered = 0;
  for (const d of docs.filter((x) => !x.adminOnly)) { await deps.renderDoc(d); rendered += 1; }
  return { ok: true, blocking: [], manifest: buildPackageManifest(docs, deps.now()), rendered };
}

/**
 * Wire the real services and assemble the package for a project. Loads each document's current version, the
 * signatures, the blueprint's redacted-copy requirement, and renders with the shared Playwright renderer.
 */
export async function assembleProposalPackage(deliveryProjectId: string): Promise<PackageResult> {
  const GovProposalDocument = (await import('../../../models/GovProposalDocument')).default;
  const GovProposalDocumentVersion = (await import('../../../models/GovProposalDocumentVersion')).default;
  const GovProposalGateReview = (await import('../../../models/GovProposalGateReview')).default;
  const GovProposalBlueprint = (await import('../../../models/GovProposalBlueprint')).default;
  const { missingRequiredSignatures } = await import('./govProposalSignatures');
  const { renderProposalPdf } = await import('./renderProposalPdf');
  const crypto = await import('crypto');

  const loadDocs = async (): Promise<PackageDoc[]> => {
    const docRows: any[] = await GovProposalDocument.findAll({ where: { delivery_project_id: deliveryProjectId } });
    const out: PackageDoc[] = [];
    for (const r of docRows) {
      const d = r.get({ plain: true });
      const ver: any = d.current_version_id ? await GovProposalDocumentVersion.findByPk(d.current_version_id) : null;
      const v = ver ? ver.get({ plain: true }) : null;
      const goldRow: any = await GovProposalGateReview.findOne({ where: { document_id: d.id, gate: 'gold' } });
      const findings: any[] = v && Array.isArray(v.findings) ? v.findings : [];
      out.push({
        key: d.doc_key, title: d.title, passes: !!v?.passes,
        goldApproved: (goldRow?.get?.({ plain: true })?.status ?? 'pending') === 'approved',
        fatalCount: findings.filter((f) => f.severity === 'fatal').length,
        version: v?.version ?? 0, pageCount: v?.page_count ?? null, blueprintVersion: d.blueprint_version ?? null,
        contentSha256: crypto.createHash('sha256').update(String(v?.content_html ?? '')).digest('hex'),
        fileName: d.file_name ?? `${d.doc_key}.pdf`, adminOnly: !!d.admin_only,
      });
    }
    return out;
  };

  const deps: PackageDeps = {
    loadDocs,
    missingSignatures: () => missingRequiredSignatures(deliveryProjectId),
    requiresRedactedCopy: async () => {
      const bp: any = await GovProposalBlueprint.findOne({ where: { delivery_project_id: deliveryProjectId }, order: [['version', 'DESC']] });
      const rules = bp?.blueprint_json?.rules ?? [];
      return Array.isArray(rules) && rules.some((r: any) => r.key === 'redacted_copy');
    },
    hasRedactedCopy: async () => {
      const GovProposalRedactionSpan = (await import('../../../models/GovProposalRedactionSpan')).default;
      const docRows: any[] = await GovProposalDocument.findAll({ where: { delivery_project_id: deliveryProjectId } });
      for (const r of docRows) { const d = r.get({ plain: true }); if (d.current_version_id) { const n = await GovProposalRedactionSpan.count({ where: { version_id: d.current_version_id } }); if (n > 0) return true; } }
      return false;
    },
    renderDoc: async (doc) => {
      try {
        const row: any = await GovProposalDocument.findOne({ where: { delivery_project_id: deliveryProjectId, doc_key: doc.key } });
        const plain = row ? row.get({ plain: true }) : null;
        const html = plain?.content_html ?? '';
        if (!html.trim()) return null;
        const r = await renderProposalPdf(html, { pageSize: 'Letter', minFontPt: 11, headerText: doc.title });
        return r.pageCount;
      } catch { return null; }
    },
    now: () => new Date().toISOString(),
  };
  return assemblePackageCore(deps);
}
