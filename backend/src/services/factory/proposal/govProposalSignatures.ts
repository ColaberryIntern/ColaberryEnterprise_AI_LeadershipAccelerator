/**
 * govProposalSignatures — per-form, per-signer signature tracking for the proposal package (Proposal Studio P6).
 * Required forms from the blueprint are seeded as `unsigned`; the admin uploads the signed copy to mark one
 * `signed`. An UNSIGNED REQUIRED form is fatal to export (missingRequiredSignatures feeds the package gate). Prefill
 * draws from the approved company library where a template is available; otherwise the blank is attached and the
 * signed copy uploaded. I/O over the GovProposalFormSignature model; tenant/project scoped by the caller.
 */
import GovProposalFormSignature from '../../../models/GovProposalFormSignature';

const DEFAULT_SIGNER_ROLE = 'Authorized signatory';

export interface RequiredFormSeed { key: string; signerRole?: string }

/** Ensure an unsigned signature row exists for each required form (idempotent; never clears a signed row). */
export async function syncRequiredSignatures(deliveryProjectId: string, forms: RequiredFormSeed[]): Promise<void> {
  for (const f of Array.isArray(forms) ? forms : []) {
    if (!f?.key) continue;
    const signerRole = f.signerRole || DEFAULT_SIGNER_ROLE;
    await GovProposalFormSignature.findOrCreate({
      where: { delivery_project_id: deliveryProjectId, form_key: f.key, signer_role: signerRole },
      defaults: { delivery_project_id: deliveryProjectId, form_key: f.key, signer_role: signerRole, status: 'unsigned', required: true } as any,
    });
  }
}

export interface SignatureView { formKey: string; signerRole: string; status: string; required: boolean; hasFile: boolean }
export async function listSignatures(deliveryProjectId: string): Promise<SignatureView[]> {
  const rows: any[] = await GovProposalFormSignature.findAll({ where: { delivery_project_id: deliveryProjectId }, order: [['form_key', 'ASC']] });
  return rows.map((r) => { const p = r.get({ plain: true }); return { formKey: p.form_key, signerRole: p.signer_role, status: p.status, required: !!p.required, hasFile: !!p.signed_file_path }; });
}

/** Mark a form's signed copy on file (status → signed). Upserts so a signer not pre-seeded can still be recorded. */
export async function recordSignature(deliveryProjectId: string, formKey: string, signerRole: string, signedFilePath: string, identityId: string | null): Promise<void> {
  const [row]: any = await GovProposalFormSignature.findOrCreate({
    where: { delivery_project_id: deliveryProjectId, form_key: formKey, signer_role: signerRole || DEFAULT_SIGNER_ROLE },
    defaults: { delivery_project_id: deliveryProjectId, form_key: formKey, signer_role: signerRole || DEFAULT_SIGNER_ROLE, status: 'unsigned', required: true } as any,
  });
  await row.update({ status: 'signed', signed_file_path: signedFilePath, updated_by_identity_id: identityId, updated_at: new Date() });
}

/** The form keys that are REQUIRED but not yet signed — the fatal set for export. */
export async function missingRequiredSignatures(deliveryProjectId: string): Promise<string[]> {
  const rows: any[] = await GovProposalFormSignature.findAll({ where: { delivery_project_id: deliveryProjectId, required: true, status: 'unsigned' } });
  return rows.map((r) => r.get({ plain: true }).form_key);
}
