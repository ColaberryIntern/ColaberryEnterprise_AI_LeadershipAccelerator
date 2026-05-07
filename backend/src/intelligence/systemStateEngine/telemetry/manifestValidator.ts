/**
 * manifestValidator — runtime validation for inbound BuildManifest payloads.
 *
 * Wraps the Zod schema with project/BP existence checks + secret-leak
 * detection. Returns either { ok: true, value } or a structured error list.
 *
 * Contract: /system/intelligence/contracts/BUILD_MANIFEST_CONTRACT.md
 */
import {
  BuildManifestSchema,
  SECRET_PATTERNS,
  type BuildManifest,
} from './buildManifestSchema';

export interface ValidationError {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export type ValidationOutcome =
  | { ok: true; value: BuildManifest }
  | { ok: false; errors: ReadonlyArray<ValidationError> };

/**
 * Pure (no DB) shape + content validation. Use this for fast rejection
 * before the heavier project/BP existence check.
 */
export function validateManifestShape(raw: unknown): ValidationOutcome {
  const parsed = BuildManifestSchema.safeParse(raw);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue): ValidationError => ({
      path: issue.path.join('.') || '(root)',
      code: issue.code,
      message: issue.message,
    }));
    return { ok: false, errors };
  }

  // Secret-leak detection on the entire serialized manifest. This is the
  // last line of defense — manifests should never carry credentials.
  const secretErrors = detectSecrets(parsed.data);
  if (secretErrors.length > 0) {
    return { ok: false, errors: secretErrors };
  }

  return { ok: true, value: parsed.data };
}

/**
 * DB-backed validation: confirms project_id and bp_id exist. Run AFTER
 * validateManifestShape passes. Splits to keep tests fast (shape tests
 * don't need a DB).
 */
export async function validateManifestRefs(
  manifest: BuildManifest,
): Promise<ValidationOutcome> {
  const errors: ValidationError[] = [];
  const { Project, Capability } = await import('../../../models');

  const project = await Project.findByPk(manifest.project_id);
  if (!project) {
    errors.push({
      path: 'project_id',
      code: 'unknown_project',
      message: `Project ${manifest.project_id} does not exist`,
    });
  }
  if (manifest.bp_id) {
    const cap = await Capability.findByPk(manifest.bp_id);
    if (!cap) {
      errors.push({
        path: 'bp_id',
        code: 'unknown_bp',
        message: `BP ${manifest.bp_id} does not exist`,
      });
    } else if (project && (cap as any).project_id !== manifest.project_id) {
      errors.push({
        path: 'bp_id',
        code: 'cross_project_bp',
        message: `BP ${manifest.bp_id} belongs to a different project`,
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: manifest };
}

function detectSecrets(manifest: BuildManifest): ValidationError[] {
  const out: ValidationError[] = [];
  // Walk all string values in the manifest.
  const visit = (value: unknown, path: string): void => {
    if (typeof value === 'string') {
      for (const { name, rx } of SECRET_PATTERNS) {
        if (rx.test(value)) {
          out.push({
            path,
            code: 'secret_in_manifest',
            message: `Detected likely ${name} value at ${path}. Manifests must not include secrets.`,
          });
        }
      }
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => visit(v, `${path}[${i}]`));
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        visit(v, path ? `${path}.${k}` : k);
      }
    }
  };
  visit(manifest, '');
  return out;
}
