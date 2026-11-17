import React from 'react';
import type { ToolRequestDetail } from '../../../services/agentDomainApi';

/**
 * AF11.3 — the six groups AF11.1 captures, all on one screen.
 *
 * ## Why no tabs, no accordion, nothing collapsed
 *
 * The acceptance criterion is that all six are **visible on one screen**, and it is written that
 * way for a reason: the decision being made is whether an agent may act on the systems in WHERE,
 * and that is only answerable next to WHAT FOR and HOW. A console that hid blast radius behind a
 * tab would let a grant be settled without it ever being read, and the click would look like
 * diligence.
 *
 * ## An empty field renders as "not stated", never as blank
 *
 * The gate requires every one of these, so a missing value means something went wrong upstream
 * rather than that the intern left it out — and a blank cell reads as "nothing to see here". The
 * word is deliberately different from "none", which `side_effects` legitimately is when the tool
 * does not write.
 */

const LABELS: Record<string, string> = {
  agent_id: 'Agent',
  domain_key: 'Domain',
  tool_name: 'Tool name',
  purpose: 'Purpose',
  reads: 'Reads',
  produces: 'Produces',
  capability_id: 'Capability',
  task_unblocked: 'Task it unblocks',
  manual_today: 'Done by hand today',
  acts_on_output: 'Who acts on the output',
  judged_threshold: 'The number it is judged by',
  judged_measured_from: 'Measured from',
  tried_in_product: 'Tried in the app',
  missing_from_product: 'What the app cannot do',
  needed_by: 'Needed by',
  run_frequency: 'How often it runs',
  touches: 'Systems it touches',
  environment: 'Environment',
  read_datasets: 'Datasets it reads',
  inputs: 'Inputs',
  writes: 'Writes anywhere',
  side_effects: 'Side effects',
  reversible: 'Reversible',
  reversibility_note: 'How it is undone',
};

type Group = { key: string; heading: string; question: string; fields: string[] };

/**
 * The groups, in the order the contract names them: *"who, what, what for, when, where and how"* —
 * plus the two the contract gained afterwards. The question under each heading is there because
 * "WHERE" alone does not tell an approver what they are being asked to judge.
 *
 * ## `worth_building` IS FIRST, which is the one ordering decision in this file
 *
 * AF11.7 added three required fields that answer **whether this should be built at all**: who acts
 * on the output, what number judges it, and what the product cannot already do. Those decide the
 * request before the blast radius matters, so reading them last would be reading them after the
 * decision had effectively been made. Ali, 16 Nov 2026: *"I need to approve these functionalities
 * because I'm seeing that people are proposing things we don't even need."* This group is that
 * sentence's place on the screen.
 *
 * ## `which_data` exists because two REQUIRED fields were invisible here
 *
 * `environment` and `read_datasets` have been required by the API since the dataset-scope change
 * and appeared in no group, so the console could not show them and the approver was deciding a
 * production grant without seeing that it was one. Found while adding the AF11.7 group: the panel
 * is `GROUPS`-driven, so a field absent from this list is absent from the page, silently and
 * without a failing test.
 */
export const GROUPS: Group[] = [
  { key: 'worth_building', heading: 'Worth building', question: 'Who reads it, what number judges it, and what the app cannot already do', fields: ['acts_on_output', 'judged_threshold', 'judged_measured_from', 'tried_in_product', 'missing_from_product'] },
  { key: 'who', heading: 'Who', question: 'Which agent is asking, in whose domain', fields: ['agent_id', 'domain_key'] },
  { key: 'what', heading: 'What', question: 'The tool, and what it would read and produce', fields: ['tool_name', 'purpose', 'reads', 'produces'] },
  { key: 'what_for', heading: 'What for', question: 'The capability it serves, and what is manual today', fields: ['capability_id', 'task_unblocked', 'manual_today'] },
  { key: 'when', heading: 'When', question: 'By when, and how often it would run', fields: ['needed_by', 'run_frequency'] },
  { key: 'where', heading: 'Where', question: 'The blast radius — this is the thing being approved', fields: ['touches'] },
  { key: 'which_data', heading: 'Which data', question: 'Sandbox or production, and which datasets a grant would be written against', fields: ['environment', 'read_datasets'] },
  { key: 'how', heading: 'How', question: 'What it writes, what it changes, and whether that can be undone', fields: ['inputs', 'writes', 'side_effects', 'reversible', 'reversibility_note'] },
];

/**
 * The three `tried_in_product` states as a sentence rather than a token.
 *
 * `not_built` is the only one a stored request can carry, so in practice this renders one string.
 * The other two are here because the value comes off the wire: a request that somehow carries one
 * should read as the anomaly it is, not as a raw enum the reader has to decode.
 */
const PRODUCT_STATE_WORDS: Record<string, string> = {
  not_built: 'The app cannot do this',
  used_by_hand: 'Already in the app, and used: this should be a grant',
  exists_unused: 'Already in the app, not yet tried',
};

function Value({ field, detail }: { field: string; detail: ToolRequestDetail }) {
  const raw = (detail as unknown as Record<string, unknown>)[field];

  if (Array.isArray(raw)) {
    if (raw.length === 0) {
      return <span className="text-muted fst-italic">not stated</span>;
    }
    // EACH VALUE IS ITS OWN CHIP, with a border and a background.
    //
    // A bare `gap-1` between two `<code>` elements was not enough separation: the first
    // screenshot of this page rendered the blast-radius field as `skool postgres`, which reads as
    // one system called "skool postgres" rather than two called `skool` and `postgres`. On the
    // field the ticket calls "the thing being approved", an approver miscounting the systems is
    // the worst available misreading. `community_posts community_members` had the same problem.
    //
    // Found by looking at the picture. Every test on this panel passed, because a test asserting
    // the text contains "skool" and "postgres" passes whether or not a reader can tell them apart.
    return (
      <span className="d-inline-flex flex-wrap gap-1">
        {raw.map((v) => (
          <code
            key={String(v)}
            className="small border rounded px-1"
            style={{ background: 'var(--color-bg-alt)' }}
          >
            {String(v)}
          </code>
        ))}
      </span>
    );
  }

  if (typeof raw === 'boolean') {
    // `writes: true` is the fact that turns an observing agent into an acting one, so it is the
    // one value on this screen that carries a color.
    const emphasize = field === 'writes' && raw;
    return (
      <span className={emphasize ? 'badge bg-warning text-dark' : 'badge bg-light text-dark'}>
        {raw ? 'yes' : 'no'}
      </span>
    );
  }

  if (raw === null || raw === undefined || String(raw).trim() === '') {
    // `side_effects` and `reversibility_note` are legitimately null when the tool does not write,
    // which is a different fact from a field nobody filled in.
    const expectedNull = field === 'side_effects' || field === 'reversibility_note'
      || field === 'reversible';
    return (
      <span className="text-muted fst-italic">
        {expectedNull && detail.writes === false ? 'none — it does not write' : 'not stated'}
      </span>
    );
  }

  // `tried_in_product` reads as a sentence, and the two states that should never be stored carry a
  // color. A request on this screen saying the app can already do the thing means the gate was
  // bypassed, and that is worth noticing rather than scanning past.
  if (field === 'tried_in_product') {
    const word = PRODUCT_STATE_WORDS[String(raw)] ?? String(raw);
    const wrongPlace = String(raw) === 'used_by_hand' || String(raw) === 'exists_unused';
    return wrongPlace
      ? <span className="badge bg-warning text-dark">{word}</span>
      : <>{word}</>;
  }

  // The environment is the input to Ali's grant-width rule, so `production` is not a neutral word
  // on this screen: it is the difference between a wide grant and a narrow one.
  if (field === 'environment') {
    return String(raw) === 'production'
      ? <span className="badge bg-warning text-dark">production</span>
      : <span className="badge bg-light text-dark">sandbox</span>;
  }

  const monospace = field === 'agent_id' || field === 'domain_key'
    || field === 'capability_id' || field === 'tool_name' || field === 'acts_on_output';
  return monospace ? <code className="small">{String(raw)}</code> : <>{String(raw)}</>;
}

/**
 * All six groups. `columns` lays them out two-up on a wide screen and one-up on a narrow one, so
 * "one screen" survives being read on a laptop rather than only on a desk monitor.
 */
export default function ToolRequestFacts({ detail }: { detail: ToolRequestDetail }) {
  return (
    <div className="row g-3">
      {GROUPS.map((g) => (
        <div className="col-12 col-lg-6" key={g.key} data-testid={`facts-group-${g.key}`}>
          <div className="border rounded h-100 p-3">
            <div className="d-flex align-items-baseline gap-2 mb-2">
              <span
                className="badge-label text-uppercase"
                style={{ color: 'var(--color-primary)', letterSpacing: '.06em', fontSize: '.7rem', fontWeight: 700 }}
              >
                {g.heading}
              </span>
              <span className="text-muted small">{g.question}</span>
            </div>
            <dl className="row mb-0 small">
              {g.fields.map((f) => (
                <React.Fragment key={f}>
                  <dt className="col-5 col-xl-4 text-muted fw-normal">{LABELS[f] ?? f}</dt>
                  <dd className="col-7 col-xl-8 mb-1">
                    <Value field={f} detail={detail} />
                  </dd>
                </React.Fragment>
              ))}
            </dl>
          </div>
        </div>
      ))}
    </div>
  );
}
