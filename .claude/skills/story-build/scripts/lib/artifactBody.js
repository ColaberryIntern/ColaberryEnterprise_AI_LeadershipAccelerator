/* The artifact contract, rendered into the Basecamp to-do body (phase A1).
 *
 * A0 gave a story a contract and refused a malformed one. Nothing rendered it, so no builder
 * could see it: the contract existed in the config and the ticket still said only "all
 * acceptance scenarios pass". This module turns a resolved contract into the HTML a person
 * reads in the ticket they are judged against.
 *
 * Three decisions here are deliberate, and each one is tested.
 *
 * 1. EVERY resolved field is rendered. Not a chosen subset. A field that affects whether an
 *    artifact is accepted, and that the ticket does not show, is a rule a builder is held to
 *    and cannot read. `ARTIFACT_BODY_FIELDS` is the declared list, and
 *    `storyArtifactBody.test.ts` compares it against the keys of a real resolved artifact, so
 *    adding a field to the contract fails the test until this renderer shows it or the list
 *    explicitly accounts for it.
 *
 * 2. The loop stop is NOT a tenant of the trust line. Before A1 the stop condition was
 *    rendered inside `if (s.trust)`, so a story with no `trust` field showed no stop condition
 *    at all: the one sentence telling a builder when to stop was the easiest thing on the
 *    ticket to lose. It is now rendered for every story, with or without a contract.
 *
 * 3. The skeleton the hard gate prints cannot validate if pasted unedited. It is a filling-in
 *    aid, not a rubber stamp. `type` comes out as a CHOOSE_ONE_OF placeholder that the schema
 *    refuses with `type_unknown`, so an author who pastes it and publishes is refused again,
 *    by name. A skeleton that validated on paste would reintroduce the exact problem this
 *    workstream exists to fix, one level up: a declared contract nobody thought about.
 */

'use strict';

const { artifactTypeNames } = require('./artifactContract');

/* Every field of a resolved artifact. The test holds this against the real resolved shape. */
const ARTIFACT_BODY_FIELDS = [
  'key',
  'name',
  'type',
  'file_types',
  'repo_path',
  'must_contain',
  'evaluation_criteria',
  'gates',
  'evidence_source',
  'requires_screenshot',
];

const GATE_LABELS = {
  story_complete: 'this story is complete',
  release_demo: 'the release demo',
  project_close: 'project close',
};

const ANY_FILE_TYPE = '*';

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function gateLabel(gate) {
  return GATE_LABELS[gate] || gate;
}

function fileTypesLabel(fileTypes) {
  const list = fileTypes || [];
  if (list.length === 1 && list[0] === ANY_FILE_TYPE) return 'any file type';
  return list.map((t) => `<code>${escapeHtml(t)}</code>`).join(', ');
}

/* One artifact, as the rows a builder reads. Renders every field in ARTIFACT_BODY_FIELDS. */
function artifactHtml(a) {
  const rows = [];

  rows.push(`<strong><code>${escapeHtml(a.key)}</code></strong> ${escapeHtml(a.name)} `
    + `<em>(${escapeHtml(a.type)})</em>`);

  if (a.evidence_source === 'repo') {
    rows.push(`<strong>Hand it over in the repo at:</strong> <code>${escapeHtml(a.repo_path)}</code>`);
  } else {
    rows.push('<strong>Hand it over on the platform</strong>, not in the repo. '
      + 'There is no repo path for this one.');
  }

  rows.push(`<strong>Accepted file types:</strong> ${fileTypesLabel(a.file_types)}`);

  if ((a.must_contain || []).length) {
    rows.push(`<strong>Must contain:</strong> ${(a.must_contain || [])
      .map((p) => `"${escapeHtml(p)}"`).join(', ')}`);
  }

  rows.push(`<strong>Judged by:</strong> ${escapeHtml(a.evaluation_criteria)}`);

  if (a.requires_screenshot) {
    rows.push('<strong>A screen capture is owed as well</strong>, because this type cannot be '
      + 'read from the file alone.');
  }

  rows.push(`<strong>Owed at:</strong> ${(a.gates || []).map(gateLabel).map(escapeHtml).join(', ')}`);

  return `<li>${rows.join('<br>')}</li>`;
}

/* The contract block for one story. Returns '' when the story declares no contract, so a
 * pre-contract story's body is byte-for-byte what it was before A1. */
function artifactsHtml(artifacts) {
  const list = artifacts || [];
  if (!list.length) return '';
  return '<div><strong>HANDS OVER (the artifact contract).</strong> This story is not complete '
    + 'until each of these exists where it says, in an accepted format. The key is how it is '
    + 'cited and verified, so do not rename it.</div>'
    + `<ul>${list.map(artifactHtml).join('')}</ul>`;
}

/* The loop stop, for EVERY story: see decision 2 in the header. */
function loopStopHtml(artifacts) {
  const list = artifacts || [];
  if (!list.length) {
    return '<div><strong>Loop stop:</strong> all acceptance scenarios pass.</div>';
  }
  const keys = list.map((a) => `<code>${escapeHtml(a.key)}</code>`).join(', ');
  return '<div><strong>Loop stop:</strong> all acceptance scenarios pass AND every artifact key '
    + `is present: ${keys}.</div>`;
}

/* What the hard gate prints for a story with no contract. Deliberately unvalidatable: the type
 * placeholder is refused by the schema, so pasting this unedited gets refused again by name. */
function contractSkeleton(storyIds) {
  const ids = storyIds || [];
  const entry = (i) => ({
    key: `ART-${String(i + 1).padStart(3, '0')}`,
    name: '<what this story hands over, in a few words>',
    type: `CHOOSE_ONE_OF: ${artifactTypeNames().join(' | ')}`,
    repo_path: '<path from the repo root, for a type verified from the repo>',
    evaluation_criteria: '<the one sentence a person judges this by>',
  });
  const byStory = {};
  ids.forEach((id, i) => { byStory[id] = [entry(i)]; });
  return JSON.stringify({ artifacts: { by_story: byStory } }, null, 2);
}

module.exports = {
  ANY_FILE_TYPE,
  ARTIFACT_BODY_FIELDS,
  GATE_LABELS,
  artifactHtml,
  artifactsHtml,
  contractSkeleton,
  escapeHtml,
  loopStopHtml,
};
