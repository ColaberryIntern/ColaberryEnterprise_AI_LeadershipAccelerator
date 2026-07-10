/**
 * versionDiffService — side-by-side comparison of two AI Component versions.
 * Pure field-by-field diff over the version snapshots (prompts, capabilities,
 * variables, metadata, estimates). Powers the version-compare UI + rollback.
 */
import CurriculumTypeDefinition from '../../models/CurriculumTypeDefinition';
import ComponentVersion from '../../models/ComponentVersion';
import { EDITABLE_FIELDS } from './componentService';

export interface FieldDiff { field: string; changed: boolean; a: any; b: any }

/** PURE — compare two snapshot objects across the editable field set. */
export function diffSnapshots(a: Record<string, any>, b: Record<string, any>): FieldDiff[] {
  return (EDITABLE_FIELDS as readonly string[]).map((f) => {
    const av = a?.[f]; const bv = b?.[f];
    return { field: f, changed: JSON.stringify(av ?? null) !== JSON.stringify(bv ?? null), a: av ?? null, b: bv ?? null };
  });
}

async function snapshotAt(slug: string, version: number | 'current'): Promise<Record<string, any>> {
  if (version === 'current') {
    const c = await CurriculumTypeDefinition.findOne({ where: { slug } });
    if (!c) throw Object.assign(new Error(`Component "${slug}" not found`), { status: 404 });
    const j = c.toJSON() as any; const out: Record<string, any> = {};
    for (const f of EDITABLE_FIELDS) out[f] = j[f];
    return out;
  }
  const v = await ComponentVersion.findOne({ where: { component_slug: slug, version } });
  if (!v) throw Object.assign(new Error(`Version ${version} of "${slug}" not found`), { status: 404 });
  return v.snapshot || {};
}

export async function compareVersions(slug: string, a: number | 'current', b: number | 'current') {
  const [sa, sb] = await Promise.all([snapshotAt(slug, a), snapshotAt(slug, b)]);
  const diffs = diffSnapshots(sa, sb);
  return { slug, a, b, changed_count: diffs.filter((d) => d.changed).length, diffs };
}
