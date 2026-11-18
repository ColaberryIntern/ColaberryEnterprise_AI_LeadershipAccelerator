/**
 * THE ARTIFACT CONTRACT ON A STORY (phase A0 of the artifact-acceptance plan).
 *
 * A story gains a contract naming what it hands over. This module is the schema: it turns a raw
 * `artifacts` block from a story config or a generated plan into either a list of resolved
 * contract entries or a list of named refusals. It writes nothing, reads no database, and
 * nothing consumes its verdict to decide completion yet. A0 validates; A1 renders; A2 verifies.
 *
 * ## FOUR DECISIONS IN HERE THAT ARE NOT ARBITRARY
 *
 * 1. AN EMPTY CONTRACT IS A REFUSAL, NOT AN EMPTY SUCCESS. `"artifacts": []` is refused by name.
 *    Absent is not empty: a story with no `artifacts` key has no contract yet, which A0 permits
 *    because contracts do not exist yet, while a story that explicitly declares zero artifacts is
 *    claiming everything is handed over and handing over nothing. That exact hole, an empty list
 *    posted by the caller satisfying a governance check, was closed in the lifecycle coverage
 *    gate last week.
 *
 * 2. AN UNKNOWN FIELD IS A REFUSAL. A contract is read by a gate that decides whether a person's
 *    work counts. A misspelled `repo_paths` that is silently ignored produces a contract which
 *    does not say what its author meant, and the author has no way to find out. There is no
 *    forward-compatibility argument for leniency here: this schema and its only writers are in
 *    the same repository.
 *
 * 3. REFUSALS ARE CODED AND POINT AT A FIELD. The point of the gate is to tell a builder what to
 *    produce, not that they failed, so every refusal carries the story, the key and the field.
 *
 * 4. VALIDATION NEVER CONSULTS THE REPO OR THE DATABASE. It is a pure function of the text. The
 *    measurement of whether the file actually exists is A2's job, from the git tree, and must
 *    stay separate from the question of whether the contract is well formed, or the two failures
 *    become one indistinguishable "invalid".
 */
import {
  ANY_FILE_TYPE,
  ArtifactEvidenceSource,
  acceptsAnyFileType,
  allowsEvidenceSource,
  artifactType,
  artifactTypeNames,
} from './storyArtifactTypes';

/** The gates a contract entry can be required at. A closed set on purpose. */
export const ARTIFACT_GATES = ['story_complete', 'release_demo', 'project_close'] as const;
export type ArtifactGate = (typeof ARTIFACT_GATES)[number];

/** Contract keys are stable and citable: they survive a retitle and go in a ticket body. */
export const ARTIFACT_KEY_PATTERN = /^[A-Z][A-Z0-9]{1,7}-[0-9]{1,4}$/;

export type ContractRefusalCode =
  | 'contract_not_an_array'
  | 'contract_empty'
  | 'entry_not_an_object'
  | 'unknown_field'
  | 'key_missing'
  | 'key_malformed'
  | 'key_duplicated'
  | 'name_missing'
  | 'type_missing'
  | 'type_unknown'
  | 'file_types_not_an_array'
  | 'file_types_empty'
  | 'file_type_malformed'
  | 'file_type_not_allowed'
  | 'repo_path_missing'
  | 'repo_path_not_a_string'
  | 'repo_path_absolute'
  | 'repo_path_escapes'
  | 'repo_path_no_extension'
  | 'repo_path_extension_not_declared'
  | 'repo_path_on_platform_type'
  | 'must_contain_not_an_array'
  | 'must_contain_blank'
  | 'evaluation_criteria_blank'
  | 'gates_not_an_array'
  | 'gates_empty'
  | 'gate_unknown'
  | 'evidence_source_unknown'
  | 'evidence_source_not_allowed'
  | 'override_story_unknown'
  | 'story_missing_contract';

export interface ContractRefusal {
  code: ContractRefusalCode;
  /** One sentence naming what to change, addressed to whoever authored the contract. */
  message: string;
  /** The story the contract sits on, when the caller supplied one. */
  storyId?: string;
  /** The artifact key, when the entry had a usable one. */
  key?: string;
  /** The offending field, when the refusal is about one field. */
  field?: string;
}

/** A contract entry with every default resolved. What A1 renders and A2 measures against. */
export interface ResolvedArtifact {
  key: string;
  name: string;
  type: string;
  file_types: string[];
  repo_path: string | null;
  must_contain: string[];
  evaluation_criteria: string;
  gates: ArtifactGate[];
  evidence_source: Exclude<ArtifactEvidenceSource, 'either'>;
  requires_screenshot: boolean;
}

export interface ContractValidation {
  ok: boolean;
  artifacts: ResolvedArtifact[];
  refusals: ContractRefusal[];
}

/** The fields a contract entry may carry. Anything else is refused by `unknown_field`. */
const ALLOWED_FIELDS = new Set([
  'key',
  'name',
  'type',
  'file_types',
  'repo_path',
  'must_contain',
  'evaluation_criteria',
  'gates',
  'evidence_source',
]);

const DEFAULT_GATES: ArtifactGate[] = ['story_complete'];
const EXTENSION_PATTERN = /^[a-z0-9]{1,8}$/;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNonBlankString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/** The extension of a repo path, lowercased and without the dot. Empty when there is none. */
export function pathExtension(repoPath: string): string {
  const base = repoPath.split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return '';
  return base.slice(dot + 1).toLowerCase();
}

/**
 * Validate one story's `artifacts` block.
 *
 * `raw` is whatever was in the config or the plan, including undefined. Undefined means NO
 * CONTRACT, which is reported as ok with zero artifacts: A0 does not enforce that a story has
 * one, because no story has one yet. A1 adds that gate. An empty array is a different thing and
 * is refused; see decision 1 in this file's header.
 */
export function validateArtifactContract(
  raw: unknown,
  ctx: { storyId?: string } = {},
): ContractValidation {
  const refusals: ContractRefusal[] = [];
  const artifacts: ResolvedArtifact[] = [];
  const { storyId } = ctx;
  const refuse = (code: ContractRefusalCode, message: string, extra: Partial<ContractRefusal> = {}) =>
    refusals.push({ code, message, ...(storyId ? { storyId } : {}), ...extra });

  if (raw === undefined || raw === null) {
    return { ok: true, artifacts, refusals };
  }
  if (!Array.isArray(raw)) {
    refuse('contract_not_an_array', 'The artifacts block must be an array of contract entries.', {
      field: 'artifacts',
    });
    return { ok: false, artifacts, refusals };
  }
  if (raw.length === 0) {
    refuse(
      'contract_empty',
      'The artifacts block is present but declares nothing. Name at least one artifact, or remove '
        + 'the block entirely: an empty contract would read as "everything handed over".',
      { field: 'artifacts' },
    );
    return { ok: false, artifacts, refusals };
  }

  const seenKeys = new Set<string>();

  raw.forEach((entry, index) => {
    const at = `artifacts[${index}]`;
    // Refusals recorded from here on belong to THIS entry, which is how we know at the end
    // whether to resolve it. Counting is exact; scanning the refusal list for a matching key
    // would miss every refusal raised before the key was readable.
    const refusalsBefore = refusals.length;
    if (!isPlainObject(entry)) {
      refuse('entry_not_an_object', `${at} must be an object.`, { field: at });
      return;
    }

    for (const field of Object.keys(entry)) {
      if (!ALLOWED_FIELDS.has(field)) {
        refuse(
          'unknown_field',
          `${at} carries an unrecognized field "${field}". A field the schema does not know is `
            + 'ignored by every reader, so it is refused rather than dropped. Allowed fields: '
            + `${[...ALLOWED_FIELDS].join(', ')}.`,
          { field: `${at}.${field}`, ...(isNonBlankString(entry.key) ? { key: entry.key } : {}) },
        );
      }
    }

    // ---- key ----
    const rawKey = entry.key;
    let key: string | undefined;
    if (!isNonBlankString(rawKey)) {
      refuse('key_missing', `${at} has no key. A key is how the artifact is cited once the story `
        + 'is retitled.', { field: `${at}.key` });
    } else if (!ARTIFACT_KEY_PATTERN.test(rawKey)) {
      refuse(
        'key_malformed',
        `${at}.key "${rawKey}" is not a contract key. Expected a short uppercase prefix, a hyphen `
          + 'and a number, for example ART-014.',
        { field: `${at}.key` },
      );
    } else if (seenKeys.has(rawKey)) {
      refuse('key_duplicated', `${at}.key "${rawKey}" is used twice in the same contract.`, {
        key: rawKey,
        field: `${at}.key`,
      });
    } else {
      key = rawKey;
      seenKeys.add(rawKey);
    }
    const keyCtx = key ? { key } : {};

    // ---- name ----
    if (!isNonBlankString(entry.name)) {
      refuse('name_missing', `${at} has no name. The name is what the ticket shows the builder.`, {
        ...keyCtx,
        field: `${at}.name`,
      });
    }

    // ---- type ----
    if (!isNonBlankString(entry.type)) {
      refuse('type_missing', `${at} has no type. One of: ${artifactTypeNames().join(', ')}.`, {
        ...keyCtx,
        field: `${at}.type`,
      });
      return;
    }
    const catalogType = artifactType(entry.type);
    if (!catalogType) {
      refuse(
        'type_unknown',
        `${at}.type "${entry.type}" is not in the artifact type catalog. One of: `
          + `${artifactTypeNames().join(', ')}.`,
        { ...keyCtx, field: `${at}.type` },
      );
      return;
    }

    // ---- file_types: default from the catalog, narrow but never widen ----
    let fileTypes: string[] = [...catalogType.file_types];
    if (entry.file_types !== undefined) {
      if (!Array.isArray(entry.file_types)) {
        refuse('file_types_not_an_array', `${at}.file_types must be an array of extensions.`, {
          ...keyCtx,
          field: `${at}.file_types`,
        });
      } else if (entry.file_types.length === 0) {
        refuse(
          'file_types_empty',
          `${at}.file_types is empty, which would accept nothing. Omit it to take the catalog `
            + `default (${catalogType.file_types.join(', ')}).`,
          { ...keyCtx, field: `${at}.file_types` },
        );
      } else {
        const declared: string[] = [];
        for (const ft of entry.file_types) {
          if (typeof ft !== 'string' || !EXTENSION_PATTERN.test(ft)) {
            refuse(
              'file_type_malformed',
              `${at}.file_types contains ${JSON.stringify(ft)}. Use lowercase extensions with no `
                + 'dot, for example "pdf".',
              { ...keyCtx, field: `${at}.file_types` },
            );
            continue;
          }
          if (!acceptsAnyFileType(catalogType) && !catalogType.file_types.includes(ft)) {
            refuse(
              'file_type_not_allowed',
              `${at}.file_types names "${ft}", which type "${catalogType.type}" does not accept. `
                + `A contract may narrow the catalog's list (${catalogType.file_types.join(', ')}) `
                + 'but never widen it.',
              { ...keyCtx, field: `${at}.file_types` },
            );
            continue;
          }
          declared.push(ft);
        }
        if (declared.length) fileTypes = declared;
      }
    }

    // ---- evidence source: explicit, else resolved from the type and the path ----
    let evidence: Exclude<ArtifactEvidenceSource, 'either'>;
    const rawRepoPath = entry.repo_path;
    if (entry.evidence_source !== undefined) {
      const src = entry.evidence_source;
      if (src !== 'repo' && src !== 'platform') {
        refuse(
          'evidence_source_unknown',
          `${at}.evidence_source must be "repo" or "platform". "either" describes a type's `
            + 'options, not one artifact\'s evidence.',
          { ...keyCtx, field: `${at}.evidence_source` },
        );
        return;
      }
      if (!allowsEvidenceSource(catalogType, src)) {
        refuse(
          'evidence_source_not_allowed',
          `${at}.evidence_source is "${src}" but type "${catalogType.type}" is handed over via `
            + `"${catalogType.evidence_source}".`,
          { ...keyCtx, field: `${at}.evidence_source` },
        );
        return;
      }
      evidence = src;
    } else if (catalogType.evidence_source === 'either') {
      // A declared path is the author saying "the repo is where this lives".
      evidence = rawRepoPath === undefined ? 'platform' : 'repo';
    } else {
      evidence = catalogType.evidence_source;
    }

    // ---- repo_path: required by requires_github_validation, refused when meaningless ----
    let repoPath: string | null = null;
    if (rawRepoPath !== undefined) {
      if (typeof rawRepoPath !== 'string' || rawRepoPath.trim().length === 0) {
        refuse('repo_path_not_a_string', `${at}.repo_path must be a non-empty string.`, {
          ...keyCtx,
          field: `${at}.repo_path`,
        });
      } else if (evidence === 'platform') {
        refuse(
          'repo_path_on_platform_type',
          `${at} names a repo_path but its evidence comes from a platform upload, so nothing `
            + 'would ever read that path. Remove it, or set evidence_source to "repo" if the type '
            + 'allows it.',
          { ...keyCtx, field: `${at}.repo_path` },
        );
      } else {
        const p = rawRepoPath.trim();
        if (p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p)) {
          refuse('repo_path_absolute', `${at}.repo_path must be relative to the repository root.`, {
            ...keyCtx,
            field: `${at}.repo_path`,
          });
        } else if (p.split('/').includes('..')) {
          refuse('repo_path_escapes', `${at}.repo_path must not contain "..".`, {
            ...keyCtx,
            field: `${at}.repo_path`,
          });
        } else {
          const ext = pathExtension(p);
          if (!ext) {
            refuse(
              'repo_path_no_extension',
              `${at}.repo_path "${p}" has no file extension, so no type check is possible.`,
              { ...keyCtx, field: `${at}.repo_path` },
            );
          } else if (!fileTypes.includes(ANY_FILE_TYPE) && !fileTypes.includes(ext)) {
            refuse(
              'repo_path_extension_not_declared',
              `${at}.repo_path ends in ".${ext}" but this artifact accepts `
                + `${fileTypes.join(', ')}.`,
              { ...keyCtx, field: `${at}.repo_path` },
            );
          } else {
            repoPath = p;
          }
        }
      }
    } else if (catalogType.requires_github_validation) {
      // The one place `requires_github_validation` is load-bearing.
      refuse(
        'repo_path_missing',
        `${at} is a "${catalogType.type}", which is verified from the repository, so it must name `
          + 'the path the builder commits it to.',
        { ...keyCtx, field: `${at}.repo_path` },
      );
    }

    // ---- must_contain ----
    const mustContain: string[] = [];
    if (entry.must_contain !== undefined) {
      if (!Array.isArray(entry.must_contain)) {
        refuse('must_contain_not_an_array', `${at}.must_contain must be an array of strings.`, {
          ...keyCtx,
          field: `${at}.must_contain`,
        });
      } else {
        for (const m of entry.must_contain) {
          if (!isNonBlankString(m)) {
            refuse('must_contain_blank', `${at}.must_contain contains a blank entry.`, {
              ...keyCtx,
              field: `${at}.must_contain`,
            });
          } else {
            mustContain.push(m.trim());
          }
        }
      }
    }

    // ---- evaluation_criteria: the sentence a human judges it by ----
    let criteria = catalogType.evaluation_criteria;
    if (entry.evaluation_criteria !== undefined) {
      if (!isNonBlankString(entry.evaluation_criteria)) {
        refuse(
          'evaluation_criteria_blank',
          `${at}.evaluation_criteria is blank. Omit it to take the catalog sentence for `
            + `"${catalogType.type}".`,
          { ...keyCtx, field: `${at}.evaluation_criteria` },
        );
      } else {
        criteria = entry.evaluation_criteria.trim();
      }
    }

    // ---- gates ----
    let gates: ArtifactGate[] = [...DEFAULT_GATES];
    if (entry.gates !== undefined) {
      if (!Array.isArray(entry.gates)) {
        refuse('gates_not_an_array', `${at}.gates must be an array.`, {
          ...keyCtx,
          field: `${at}.gates`,
        });
      } else if (entry.gates.length === 0) {
        refuse(
          'gates_empty',
          `${at}.gates is empty, which would require the artifact at no gate at all. Omit it to `
            + 'take the default (story_complete).',
          { ...keyCtx, field: `${at}.gates` },
        );
      } else {
        const declared: ArtifactGate[] = [];
        for (const g of entry.gates) {
          if (typeof g !== 'string' || !(ARTIFACT_GATES as readonly string[]).includes(g)) {
            refuse(
              'gate_unknown',
              `${at}.gates contains ${JSON.stringify(g)}. One of: ${ARTIFACT_GATES.join(', ')}.`,
              { ...keyCtx, field: `${at}.gates` },
            );
          } else if (!declared.includes(g as ArtifactGate)) {
            declared.push(g as ArtifactGate);
          }
        }
        if (declared.length) gates = declared;
      }
    }

    if (!key || refusals.length > refusalsBefore) return;

    artifacts.push({
      key,
      name: String(entry.name).trim(),
      type: catalogType.type,
      file_types: fileTypes,
      repo_path: repoPath,
      must_contain: mustContain,
      evaluation_criteria: criteria,
      gates,
      evidence_source: evidence,
      requires_screenshot: catalogType.requires_screenshot,
    });
  });

  return { ok: refusals.length === 0, artifacts, refusals };
}

export interface StoryLikeForContract {
  id?: string;
  artifacts?: unknown;
  /**
   * A real plan story carries a title, a narrative, acceptance scenarios and more. Only the two
   * fields above are read here, but without this the interface type-rejects the very objects it
   * is documented to take: an excess-property check refuses a story literal that has a title.
   */
  [key: string]: unknown;
}

export interface PlanContractValidation {
  ok: boolean;
  /** Resolved contracts by story id, for the stories that had one and passed. */
  byStory: Record<string, ResolvedArtifact[]>;
  refusals: ContractRefusal[];
  /** Stories carrying a contract. A0 reported this; A1 turns a story without one into a refusal. */
  storiesWithContract: number;
  /**
   * The id of every story that declared no contract, in plan order, with `null` for a story that
   * has no id to name. Always populated, whether or not a contract is required, so a caller can
   * report the gap before it enforces it: A1's publisher prints a paste-ready skeleton from this.
   */
  storiesMissingContract: (string | null)[];
  storiesTotal: number;
}

/** Options for {@link validateStoryPlanArtifacts}. */
export interface PlanContractOptions {
  /**
   * When true, a story with NO contract is a refusal (`story_missing_contract`) rather than a
   * story that publishes as it did before A0. The publisher passes true as of A1; the platform
   * reads contracts off boards that predate the rule, so its default stays false.
   */
  requireContract?: boolean;
}

/**
 * Validate the contracts across a whole plan, plus the config's `artifacts.by_story` overrides.
 *
 * A story's own `artifacts` block wins over the config override, because the generator is closer
 * to the story than the config is. Keys are unique within a story, not across the plan: two
 * stories may each hand over their own ART-001, and forcing global uniqueness would make adding
 * a story to a release renumber the board.
 */
export function validateStoryPlanArtifacts(
  stories: ReadonlyArray<StoryLikeForContract>,
  byStoryOverrides: Record<string, unknown> = {},
  opts: PlanContractOptions = {},
): PlanContractValidation {
  const requireContract = opts.requireContract === true;
  const byStory: Record<string, ResolvedArtifact[]> = {};
  const refusals: ContractRefusal[] = [];
  const missing: (string | null)[] = [];
  let withContract = 0;

  const overrideKeys = new Set(Object.keys(byStoryOverrides));
  const storyIds = new Set<string>();

  for (const story of stories) {
    const storyId = isNonBlankString(story.id) ? story.id : undefined;
    if (storyId) storyIds.add(storyId);
    const raw = story.artifacts !== undefined
      ? story.artifacts
      : (storyId ? byStoryOverrides[storyId] : undefined);
    if (raw === undefined || raw === null) {
      missing.push(storyId || null);
      if (requireContract) {
        refusals.push({
          code: 'story_missing_contract',
          message: 'this story declares no artifact contract, so nothing it hands over is named '
            + 'and "done" would be a claim that work happened rather than something that exists. '
            + 'Add an entry under artifacts.by_story for it, or in the story itself.',
          storyId,
          field: storyId ? `artifacts.by_story.${storyId}` : 'artifacts.by_story',
        });
      }
      continue;
    }
    withContract += 1;
    const result = validateArtifactContract(raw, { storyId });
    refusals.push(...result.refusals);
    if (result.ok && storyId) byStory[storyId] = result.artifacts;
  }

  // An override aimed at a story id the plan does not contain is silently dead, which is how a
  // contract comes to be "written" and never shown to anyone. Name it.
  for (const k of overrideKeys) {
    if (!storyIds.has(k)) {
      refusals.push({
        code: 'override_story_unknown',
        message: `artifacts.by_story names story "${k}", which this plan does not contain, so that `
          + 'contract would never be rendered or verified. Fix the story id or remove the entry.',
        storyId: k,
        field: `artifacts.by_story.${k}`,
      });
    }
  }

  return {
    ok: refusals.length === 0,
    byStory,
    refusals,
    storiesWithContract: withContract,
    storiesMissingContract: missing,
    storiesTotal: stories.length,
  };
}
