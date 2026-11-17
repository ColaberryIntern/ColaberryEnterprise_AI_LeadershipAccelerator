/**
 * ARTIFACT CONTRACT VALIDATOR, publisher side (phase A0).
 *
 * The publisher is plain CommonJS and the platform is TypeScript, so the contract schema has two
 * implementations: this one and `backend/src/services/artifacts/storyArtifactContract.ts`.
 *
 * TWO IMPLEMENTATIONS ARE A DRIFT RISK, SO THE DRIFT IS TESTED, NOT PROMISED.
 * `backend/src/services/artifacts/__tests__/contractValidatorParity.test.ts` runs BOTH over one
 * shared fixture corpus (`__tests__/fixtures/artifactContracts.cases.json`) and fails by name if
 * the two disagree on any case's refusal codes. Add a refusal to one side without the other and
 * the suite goes red.
 *
 * THE DATA IS NOT DUPLICATED. Both read the same catalog file, the one in `backend/src`, so the
 * list of types, their extensions and their evidence sources cannot diverge at all.
 *
 * Nothing else in this skill is changed by A0: a story with no `artifacts` block publishes
 * exactly as it did before.
 */
const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(
  __dirname,
  '../../../../../backend/src/services/artifacts/storyArtifactTypes.json',
);

const ANY_FILE_TYPE = '*';
const ARTIFACT_GATES = ['story_complete', 'release_demo', 'project_close'];
const ARTIFACT_KEY_PATTERN = /^[A-Z][A-Z0-9]{1,7}-[0-9]{1,4}$/;
const EXTENSION_PATTERN = /^[a-z0-9]{1,8}$/;
const DEFAULT_GATES = ['story_complete'];
const ALLOWED_FIELDS = [
  'key', 'name', 'type', 'file_types', 'repo_path', 'must_contain',
  'evaluation_criteria', 'gates', 'evidence_source',
];

let CATALOG = null;
function catalog() {
  if (CATALOG) return CATALOG;
  if (!fs.existsSync(CATALOG_PATH)) {
    throw new Error(`artifact type catalog not found at ${CATALOG_PATH}`);
  }
  const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  CATALOG = new Map((raw.types || []).map((t) => [t.type, t]));
  return CATALOG;
}
function typeNames() { return [...catalog().keys()]; }
function artifactType(name) { return catalog().get(name) || null; }
function acceptsAny(t) { return (t.file_types || []).indexOf(ANY_FILE_TYPE) !== -1; }
function allowsEvidence(t, src) {
  if (t.evidence_source === 'either') return src === 'repo' || src === 'platform';
  return src === t.evidence_source;
}

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNonBlankString = (v) => typeof v === 'string' && v.trim().length > 0;

function pathExtension(repoPath) {
  const parts = String(repoPath).split('/');
  const base = parts[parts.length - 1] || '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return '';
  return base.slice(dot + 1).toLowerCase();
}

/** Validate one story's `artifacts` block. Mirrors validateArtifactContract in the TS module. */
function validateArtifactContract(raw, ctx) {
  const storyId = ctx && ctx.storyId ? ctx.storyId : undefined;
  const refusals = [];
  const artifacts = [];
  const refuse = (code, message, extra) => {
    const r = { code, message };
    if (storyId) r.storyId = storyId;
    Object.assign(r, extra || {});
    refusals.push(r);
  };

  if (raw === undefined || raw === null) return { ok: true, artifacts, refusals };
  if (!Array.isArray(raw)) {
    refuse('contract_not_an_array', 'The artifacts block must be an array of contract entries.', { field: 'artifacts' });
    return { ok: false, artifacts, refusals };
  }
  if (raw.length === 0) {
    refuse('contract_empty',
      'The artifacts block is present but declares nothing. Name at least one artifact, or remove '
      + 'the block entirely: an empty contract would read as "everything handed over".',
      { field: 'artifacts' });
    return { ok: false, artifacts, refusals };
  }

  const seenKeys = new Set();

  raw.forEach((entry, index) => {
    const at = `artifacts[${index}]`;
    const refusalsBefore = refusals.length;
    if (!isPlainObject(entry)) {
      refuse('entry_not_an_object', `${at} must be an object.`, { field: at });
      return;
    }

    for (const field of Object.keys(entry)) {
      if (ALLOWED_FIELDS.indexOf(field) === -1) {
        const extra = { field: `${at}.${field}` };
        if (isNonBlankString(entry.key)) extra.key = entry.key;
        refuse('unknown_field',
          `${at} carries an unrecognized field "${field}". A field the schema does not know is `
          + `ignored by every reader, so it is refused rather than dropped. Allowed fields: ${ALLOWED_FIELDS.join(', ')}.`,
          extra);
      }
    }

    // ---- key ----
    let key;
    if (!isNonBlankString(entry.key)) {
      refuse('key_missing', `${at} has no key. A key is how the artifact is cited once the story is retitled.`, { field: `${at}.key` });
    } else if (!ARTIFACT_KEY_PATTERN.test(entry.key)) {
      refuse('key_malformed',
        `${at}.key "${entry.key}" is not a contract key. Expected a short uppercase prefix, a hyphen and a number, for example ART-014.`,
        { field: `${at}.key` });
    } else if (seenKeys.has(entry.key)) {
      refuse('key_duplicated', `${at}.key "${entry.key}" is used twice in the same contract.`, { key: entry.key, field: `${at}.key` });
    } else {
      key = entry.key;
      seenKeys.add(key);
    }
    const keyCtx = key ? { key } : {};
    const withKey = (extra) => Object.assign({}, keyCtx, extra);

    // ---- name ----
    if (!isNonBlankString(entry.name)) {
      refuse('name_missing', `${at} has no name. The name is what the ticket shows the builder.`, withKey({ field: `${at}.name` }));
    }

    // ---- type ----
    if (!isNonBlankString(entry.type)) {
      refuse('type_missing', `${at} has no type. One of: ${typeNames().join(', ')}.`, withKey({ field: `${at}.type` }));
      return;
    }
    const ct = artifactType(entry.type);
    if (!ct) {
      refuse('type_unknown',
        `${at}.type "${entry.type}" is not in the artifact type catalog. One of: ${typeNames().join(', ')}.`,
        withKey({ field: `${at}.type` }));
      return;
    }

    // ---- file_types ----
    let fileTypes = (ct.file_types || []).slice();
    if (entry.file_types !== undefined) {
      if (!Array.isArray(entry.file_types)) {
        refuse('file_types_not_an_array', `${at}.file_types must be an array of extensions.`, withKey({ field: `${at}.file_types` }));
      } else if (entry.file_types.length === 0) {
        refuse('file_types_empty',
          `${at}.file_types is empty, which would accept nothing. Omit it to take the catalog default (${(ct.file_types || []).join(', ')}).`,
          withKey({ field: `${at}.file_types` }));
      } else {
        const declared = [];
        for (const ft of entry.file_types) {
          if (typeof ft !== 'string' || !EXTENSION_PATTERN.test(ft)) {
            refuse('file_type_malformed',
              `${at}.file_types contains ${JSON.stringify(ft)}. Use lowercase extensions with no dot, for example "pdf".`,
              withKey({ field: `${at}.file_types` }));
            continue;
          }
          if (!acceptsAny(ct) && (ct.file_types || []).indexOf(ft) === -1) {
            refuse('file_type_not_allowed',
              `${at}.file_types names "${ft}", which type "${ct.type}" does not accept. `
              + `A contract may narrow the catalog's list (${(ct.file_types || []).join(', ')}) but never widen it.`,
              withKey({ field: `${at}.file_types` }));
            continue;
          }
          declared.push(ft);
        }
        if (declared.length) fileTypes = declared;
      }
    }

    // ---- evidence source ----
    let evidence;
    const rawRepoPath = entry.repo_path;
    if (entry.evidence_source !== undefined) {
      const src = entry.evidence_source;
      if (src !== 'repo' && src !== 'platform') {
        refuse('evidence_source_unknown',
          `${at}.evidence_source must be "repo" or "platform". "either" describes a type's options, not one artifact's evidence.`,
          withKey({ field: `${at}.evidence_source` }));
        return;
      }
      if (!allowsEvidence(ct, src)) {
        refuse('evidence_source_not_allowed',
          `${at}.evidence_source is "${src}" but type "${ct.type}" is handed over via "${ct.evidence_source}".`,
          withKey({ field: `${at}.evidence_source` }));
        return;
      }
      evidence = src;
    } else if (ct.evidence_source === 'either') {
      evidence = rawRepoPath === undefined ? 'platform' : 'repo';
    } else {
      evidence = ct.evidence_source;
    }

    // ---- repo_path ----
    let repoPath = null;
    if (rawRepoPath !== undefined) {
      if (typeof rawRepoPath !== 'string' || rawRepoPath.trim().length === 0) {
        refuse('repo_path_not_a_string', `${at}.repo_path must be a non-empty string.`, withKey({ field: `${at}.repo_path` }));
      } else if (evidence === 'platform') {
        refuse('repo_path_on_platform_type',
          `${at} names a repo_path but its evidence comes from a platform upload, so nothing would ever read that path. `
          + 'Remove it, or set evidence_source to "repo" if the type allows it.',
          withKey({ field: `${at}.repo_path` }));
      } else {
        const p = rawRepoPath.trim();
        if (p.charAt(0) === '/' || /^[A-Za-z]:[\\/]/.test(p)) {
          refuse('repo_path_absolute', `${at}.repo_path must be relative to the repository root.`, withKey({ field: `${at}.repo_path` }));
        } else if (p.split('/').indexOf('..') !== -1) {
          refuse('repo_path_escapes', `${at}.repo_path must not contain "..".`, withKey({ field: `${at}.repo_path` }));
        } else {
          const ext = pathExtension(p);
          if (!ext) {
            refuse('repo_path_no_extension', `${at}.repo_path "${p}" has no file extension, so no type check is possible.`, withKey({ field: `${at}.repo_path` }));
          } else if (fileTypes.indexOf(ANY_FILE_TYPE) === -1 && fileTypes.indexOf(ext) === -1) {
            refuse('repo_path_extension_not_declared',
              `${at}.repo_path ends in ".${ext}" but this artifact accepts ${fileTypes.join(', ')}.`,
              withKey({ field: `${at}.repo_path` }));
          } else {
            repoPath = p;
          }
        }
      }
    } else if (ct.requires_github_validation) {
      refuse('repo_path_missing',
        `${at} is a "${ct.type}", which is verified from the repository, so it must name the path the builder commits it to.`,
        withKey({ field: `${at}.repo_path` }));
    }

    // ---- must_contain ----
    const mustContain = [];
    if (entry.must_contain !== undefined) {
      if (!Array.isArray(entry.must_contain)) {
        refuse('must_contain_not_an_array', `${at}.must_contain must be an array of strings.`, withKey({ field: `${at}.must_contain` }));
      } else {
        for (const m of entry.must_contain) {
          if (!isNonBlankString(m)) {
            refuse('must_contain_blank', `${at}.must_contain contains a blank entry.`, withKey({ field: `${at}.must_contain` }));
          } else {
            mustContain.push(m.trim());
          }
        }
      }
    }

    // ---- evaluation_criteria ----
    let criteria = ct.evaluation_criteria;
    if (entry.evaluation_criteria !== undefined) {
      if (!isNonBlankString(entry.evaluation_criteria)) {
        refuse('evaluation_criteria_blank',
          `${at}.evaluation_criteria is blank. Omit it to take the catalog sentence for "${ct.type}".`,
          withKey({ field: `${at}.evaluation_criteria` }));
      } else {
        criteria = entry.evaluation_criteria.trim();
      }
    }

    // ---- gates ----
    let gates = DEFAULT_GATES.slice();
    if (entry.gates !== undefined) {
      if (!Array.isArray(entry.gates)) {
        refuse('gates_not_an_array', `${at}.gates must be an array.`, withKey({ field: `${at}.gates` }));
      } else if (entry.gates.length === 0) {
        refuse('gates_empty',
          `${at}.gates is empty, which would require the artifact at no gate at all. Omit it to take the default (story_complete).`,
          withKey({ field: `${at}.gates` }));
      } else {
        const declared = [];
        for (const g of entry.gates) {
          if (typeof g !== 'string' || ARTIFACT_GATES.indexOf(g) === -1) {
            refuse('gate_unknown', `${at}.gates contains ${JSON.stringify(g)}. One of: ${ARTIFACT_GATES.join(', ')}.`, withKey({ field: `${at}.gates` }));
          } else if (declared.indexOf(g) === -1) {
            declared.push(g);
          }
        }
        if (declared.length) gates = declared;
      }
    }

    if (!key || refusals.length > refusalsBefore) return;

    artifacts.push({
      key,
      name: String(entry.name).trim(),
      type: ct.type,
      file_types: fileTypes,
      repo_path: repoPath,
      must_contain: mustContain,
      evaluation_criteria: criteria,
      gates,
      evidence_source: evidence,
      requires_screenshot: !!ct.requires_screenshot,
    });
  });

  return { ok: refusals.length === 0, artifacts, refusals };
}

/** Validate every story's contract plus the config's by_story overrides. Mirrors the TS module. */
function validateStoryPlanArtifacts(stories, byStoryOverrides) {
  const overrides = byStoryOverrides || {};
  const byStory = {};
  const refusals = [];
  let withContract = 0;
  const storyIds = new Set();

  for (const story of stories || []) {
    const storyId = isNonBlankString(story.id) ? story.id : undefined;
    if (storyId) storyIds.add(storyId);
    const raw = story.artifacts !== undefined
      ? story.artifacts
      : (storyId ? overrides[storyId] : undefined);
    if (raw === undefined || raw === null) continue;
    withContract += 1;
    const result = validateArtifactContract(raw, { storyId });
    refusals.push.apply(refusals, result.refusals);
    if (result.ok && storyId) byStory[storyId] = result.artifacts;
  }

  for (const k of Object.keys(overrides)) {
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
    storiesTotal: (stories || []).length,
  };
}

/**
 * Validate the CONFIG-level `artifacts` block (publisher only; the platform never reads a story
 * config, so this one has no TypeScript counterpart and nothing to drift from).
 *
 * Refuses an unknown key for the same reason an entry does: a misspelled `by_stories` would be
 * ignored, and every contract under it would silently never reach a ticket.
 */
function validateArtifactsConfig(block) {
  const refusals = [];
  if (block === undefined || block === null) return { ok: true, refusals };
  if (!isPlainObject(block)) {
    refusals.push({ code: 'config_artifacts_not_an_object', message: 'config.artifacts must be an object with a by_story map.', field: 'artifacts' });
    return { ok: false, refusals };
  }
  const allowed = ['by_story'];
  for (const k of Object.keys(block)) {
    if (allowed.indexOf(k) === -1) {
      refusals.push({
        code: 'config_artifacts_unknown_field',
        message: `config.artifacts carries an unrecognized key "${k}". Allowed: ${allowed.join(', ')}.`,
        field: `artifacts.${k}`,
      });
    }
  }
  if (block.by_story !== undefined && !isPlainObject(block.by_story)) {
    refusals.push({
      code: 'config_artifacts_by_story_not_an_object',
      message: 'config.artifacts.by_story must be an object keyed by the plan\'s story ids.',
      field: 'artifacts.by_story',
    });
  }
  return { ok: refusals.length === 0, refusals };
}

module.exports = {
  ANY_FILE_TYPE,
  validateArtifactsConfig,
  ARTIFACT_GATES,
  ARTIFACT_KEY_PATTERN,
  CATALOG_PATH,
  pathExtension,
  validateArtifactContract,
  validateStoryPlanArtifacts,
};
