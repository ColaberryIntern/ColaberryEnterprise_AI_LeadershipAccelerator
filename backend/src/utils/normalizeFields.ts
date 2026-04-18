import { normalizePhone } from '../services/leadService';

/**
 * Known destination fields on the canonical Lead shape. Any `field_map` value
 * that starts with `metadata.` is routed into the `metadata` bag instead of
 * a top-level lead column.
 */
export const KNOWN_LEAD_FIELDS = new Set<string>([
  'name',
  'email',
  'phone',
  'company',
  'role',
  'title',
  'company_size',
  'evaluating_90_days',
  'interest_area',
  'message',
  'source',
  'form_type',
  'consent_contact',
  'utm_source',
  'utm_campaign',
  'page_url',
  'corporate_sponsorship_interest',
  'industry',
  'annual_revenue',
  'employee_count',
  'linkedin_url',
  'idea_input',
  'advisory_session_id',
]);

export interface NormalizedLead {
  name: string;
  email: string;
  phone: string;
  company: string;
  role: string;
  title: string;
  company_size: string;
  evaluating_90_days: boolean;
  interest_area: string;
  message: string;
  source: string;
  form_type: string;
  consent_contact: boolean;
  utm_source: string;
  utm_campaign: string;
  page_url: string;
  corporate_sponsorship_interest: boolean;
  timeline: string;
  metadata: Record<string, any>;
  [key: string]: any;
}

function setByPath(target: Record<string, any>, path: string, value: any): void {
  const parts = path.split('.');
  let cur = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (typeof cur[p] !== 'object' || cur[p] === null) cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function coerceBoolean(v: any): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === 'true' || s === 'yes' || s === '1' || s === 'on';
  }
  return Boolean(v);
}

/**
 * Apply a per-entry-point `field_map` to raw webhook body, producing a
 * canonical `NormalizedLead`. Unmapped fields are preserved in `metadata`.
 *
 * `field_map` shape: `{ <incoming_field>: <dest_field_or_metadata_path> }`
 * - `{ "full_name": "name" }` → top-level lead field
 * - `{ "message": "metadata.message" }` → nested into metadata bag
 */
export function normalizeWithFieldMap(
  rawBody: Record<string, any>,
  fieldMap: Record<string, string> | undefined | null
): NormalizedLead {
  const out: NormalizedLead = {
    name: '',
    email: '',
    phone: '',
    company: '',
    role: '',
    title: '',
    company_size: '',
    evaluating_90_days: false,
    interest_area: '',
    message: '',
    source: 'website',
    form_type: 'ingest',
    consent_contact: false,
    utm_source: '',
    utm_campaign: '',
    page_url: '',
    corporate_sponsorship_interest: false,
    timeline: '',
    metadata: {},
  };

  const mapped = new Set<string>();
  const body = rawBody || {};

  // 1. Apply explicit mappings from field_map
  if (fieldMap) {
    for (const [incoming, dest] of Object.entries(fieldMap)) {
      if (body[incoming] === undefined || body[incoming] === null) continue;
      mapped.add(incoming);
      const value = body[incoming];

      if (dest.startsWith('metadata.')) {
        setByPath(out.metadata, dest.slice('metadata.'.length), value);
        continue;
      }

      if (KNOWN_LEAD_FIELDS.has(dest)) {
        if (dest === 'phone') {
          out.phone = normalizePhone(String(value)) || '';
        } else if (dest === 'evaluating_90_days' || dest === 'consent_contact' || dest === 'corporate_sponsorship_interest') {
          (out as any)[dest] = coerceBoolean(value);
        } else {
          (out as any)[dest] = String(value);
        }
      } else {
        // Unknown destination — drop into metadata under the dest name
        setByPath(out.metadata, dest, value);
      }
    }
  }

  // 2. Apply fallback key aliases for common cases if not already set
  const ALIASES: Record<string, string[]> = {
    name: ['full_name', 'fullname', 'first_name'],
    email: ['email_address', 'work_email'],
    phone: ['phone_number', 'mobile', 'telephone'],
    company: ['company_name', 'organization'],
    title: ['job_title'],
    role: ['job_role'],
    page_url: ['url', 'page'],
    utm_source: ['utmSource'],
    utm_campaign: ['utmCampaign'],
    message: ['note', 'notes', 'comments'],
  };
  for (const [dest, aliases] of Object.entries(ALIASES)) {
    if ((out as any)[dest]) continue;
    for (const alias of aliases) {
      if (body[alias] !== undefined && body[alias] !== null && !mapped.has(alias)) {
        mapped.add(alias);
        if (dest === 'phone') {
          out.phone = normalizePhone(String(body[alias])) || '';
        } else {
          (out as any)[dest] = String(body[alias]);
        }
        break;
      }
    }
  }

  // 3. Direct-name pass: if a raw key matches a known lead field and isn't
  //    mapped yet, adopt it.
  for (const [k, v] of Object.entries(body)) {
    if (mapped.has(k)) continue;
    if (KNOWN_LEAD_FIELDS.has(k) && v !== undefined && v !== null) {
      mapped.add(k);
      if (k === 'phone') out.phone = normalizePhone(String(v)) || '';
      else if (k === 'evaluating_90_days' || k === 'consent_contact' || k === 'corporate_sponsorship_interest') (out as any)[k] = coerceBoolean(v);
      else (out as any)[k] = typeof v === 'string' ? v : String(v);
    }
  }

  // 4. Everything else goes into metadata.
  for (const [k, v] of Object.entries(body)) {
    if (mapped.has(k)) continue;
    if (v === undefined || v === null) continue;
    out.metadata[k] = v;
  }

  // Trim name/email and use a placeholder name if none provided so the
  // downstream `leadSchema` (min 1 char) passes.
  out.email = (out.email || '').trim().toLowerCase();
  out.name = (out.name || '').trim();
  if (!out.name) out.name = out.email || out.phone || 'Unknown';

  return out;
}

export function validateNormalized(
  n: NormalizedLead,
  requiredFields: string[] | null | undefined
): { ok: true } | { ok: false; missing: string[] } {
  const required = requiredFields && requiredFields.length > 0 ? requiredFields : ['email'];
  const missing: string[] = [];

  // Special-case: "email OR phone" is acceptable when neither is explicitly required.
  const requiresEmail = required.includes('email');
  const hasEmailOrPhone = Boolean(n.email) || Boolean(n.phone);

  for (const f of required) {
    if (f === 'email' && !n.email && n.phone) continue; // allow phone-only if email was only required
    const v = (n as any)[f] ?? n.metadata?.[f];
    if (v === undefined || v === null || v === '') missing.push(f);
  }

  if (requiresEmail && !hasEmailOrPhone) {
    if (!missing.includes('email')) missing.push('email');
  }

  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}
