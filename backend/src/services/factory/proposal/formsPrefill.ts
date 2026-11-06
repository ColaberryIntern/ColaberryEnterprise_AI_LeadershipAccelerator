/**
 * formsPrefill — v3 §V2, T10. The deterministic transforms behind "the agent fills the forms, and lists exactly what
 * only a human can give." Two pure cores, no I/O, no AI:
 *
 *  - buildFormPrefill: given a form's fields and the values known from the approved company library, it produces the
 *    blank-vs-prefill TABLE (one row per field, prefilled / needed / signature) AND the typed needs — a field with no
 *    known value becomes a `fact` need, a signature field becomes a `signature` need. Need keys match classifyFinding
 *    (`signature:<form>`, `fact:<form>_<field>`) so the same ask collapses across the inbox.
 *  - buildPilotExhibit: assembles the build-evidence exhibit from the VERIFIED artifacts (unverified are never shown)
 *    plus the live demo URL; a missing demo URL becomes a `setting` need rather than a blank exhibit.
 *
 * Same inputs ⇒ same output, so both are table-testable and safe to re-run (idempotent).
 */
import type { HumanNeed } from './proposalReviewTypes';

const norm = (s: string): string => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
const escapeText = (s: string): string => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export type FormFieldKind = 'text' | 'date' | 'checkbox' | 'signature';
export interface FormFieldInput { key: string; label: string; kind?: FormFieldKind; required?: boolean }

export type PrefillStatus = 'prefilled' | 'needed' | 'signature';
export interface PrefillRow { fieldKey: string; label: string; value: string; status: PrefillStatus }

export interface FormPrefillInput {
  formKey: string;
  formLabel: string;
  fields: FormFieldInput[];
  /** Values known from the approved company library, keyed by field key. */
  known?: Record<string, string | undefined>;
}

export interface FormPrefillResult { rows: PrefillRow[]; needs: HumanNeed[] }

/**
 * PURE: the prefill table + the needs for one form. A field defaults to required; a signature field is always a
 * `signature` need; a non-signature field with no known value is a `fact` need. Needs are deduped by key.
 */
export function buildFormPrefill(input: FormPrefillInput): FormPrefillResult {
  const fields = Array.isArray(input?.fields) ? input.fields : [];
  const known = input?.known ?? {};
  const formKey = String(input?.formKey ?? '');
  const formLabel = String(input?.formLabel ?? '').trim() || formKey;
  const rows: PrefillRow[] = [];
  const byKey = new Map<string, HumanNeed>();

  for (const f of fields) {
    const fieldKey = String(f?.key ?? '').trim();
    if (!fieldKey) continue;
    const label = String(f?.label ?? '').trim() || fieldKey;
    const required = f?.required !== false; // required unless explicitly false

    if (f?.kind === 'signature') {
      rows.push({ fieldKey, label, value: '', status: 'signature' });
      const key = `signature:${norm(formKey || fieldKey)}`;
      if (!byKey.has(key)) {
        byKey.set(key, { kind: 'signature', key, ask: `Sign ${formLabel}: ${label}.`, why: 'The form must be signed to be valid; an unsigned required form is nonresponsive.', usedIn: formKey ? [{ docKey: formKey }] : [], format: 'PDF of the signed form', blocking: required ? 'fatal' : 'score' });
      }
      continue;
    }

    const val = String(known[fieldKey] ?? '').trim();
    if (val) { rows.push({ fieldKey, label, value: val, status: 'prefilled' }); continue; }

    rows.push({ fieldKey, label, value: '', status: 'needed' });
    const key = `fact:${norm(formKey)}_${norm(fieldKey)}`;
    if (!byKey.has(key)) {
      byKey.set(key, { kind: 'fact', key, ask: `Provide ${label} for ${formLabel}.`, why: 'This form field has no value on file; the agent cannot fill it without the fact.', usedIn: formKey ? [{ docKey: formKey }] : [], format: 'the value for this form field', blocking: required ? 'fatal' : 'score' });
    }
  }
  return { rows, needs: [...byKey.values()] };
}

export interface ExhibitArtifact {
  caption: string | null;
  verified: boolean;
  requirementIds?: string[];
  /** The access-checked artifact id a <figure data-artifact> renders. */
  dataArtifactId?: string;
}

export interface PilotExhibitResult { html: string; needs: HumanNeed[] }

/**
 * PURE: the pilot/build-evidence exhibit. Only VERIFIED artifacts are shown (an unverified screenshot is never cited
 * as proof); a missing demo URL is a `setting` need, not a silent blank. With no verified artifact the exhibit leaves
 * a visible placeholder so the gap is not hidden.
 */
export function buildPilotExhibit(artifacts: ExhibitArtifact[], demoUrl: string | null | undefined): PilotExhibitResult {
  const verified = (Array.isArray(artifacts) ? artifacts : []).filter((a) => a && a.verified);
  const needs: HumanNeed[] = [];
  const parts: string[] = ['<h3>Pilot Exhibit</h3>'];

  const url = String(demoUrl ?? '').trim();
  if (url) parts.push(`<p>Live demonstration: ${escapeText(url)}</p>`);
  else needs.push({ kind: 'setting', key: 'setting:demo_url', ask: 'Set the live demo URL for the pilot exhibit.', why: 'The exhibit points reviewers at a working demonstration; without the URL there is nothing to link to.', usedIn: [], format: 'a URL (https://…)', blocking: 'score' });

  for (const a of verified) {
    const cap = escapeText(a.caption ?? 'Build screenshot');
    const ref = (Array.isArray(a.requirementIds) ? a.requirementIds : []).filter(Boolean).join(', ');
    const label = `${cap}${ref ? ` (proves ${escapeText(ref)})` : ''}`;
    parts.push(
      a.dataArtifactId && /^[A-Za-z0-9-]+$/.test(a.dataArtifactId)
        ? `<figure data-artifact="${a.dataArtifactId}"><figcaption>${label}</figcaption></figure>`
        : `<p>${label}</p>`,
    );
  }
  if (!verified.length) parts.push('<p>[PLACEHOLDER: capture and verify at least one build screenshot for the pilot exhibit]</p>');

  return { html: parts.join('\n'), needs };
}
