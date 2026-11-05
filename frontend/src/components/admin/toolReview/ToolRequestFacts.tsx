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
  needed_by: 'Needed by',
  run_frequency: 'How often it runs',
  touches: 'Systems it touches',
  inputs: 'Inputs',
  writes: 'Writes anywhere',
  side_effects: 'Side effects',
  reversible: 'Reversible',
  reversibility_note: 'How it is undone',
};

type Group = { key: string; heading: string; question: string; fields: string[] };

/**
 * The six groups, in the order the contract names them: *"who, what, what for, when, where and
 * how."* The question under each heading is there because "WHERE" alone does not tell an
 * approver what they are being asked to judge.
 */
export const GROUPS: Group[] = [
  { key: 'who', heading: 'Who', question: 'Which agent is asking, in whose domain', fields: ['agent_id', 'domain_key'] },
  { key: 'what', heading: 'What', question: 'The tool, and what it would read and produce', fields: ['tool_name', 'purpose', 'reads', 'produces'] },
  { key: 'what_for', heading: 'What for', question: 'The capability it serves, and what is manual today', fields: ['capability_id', 'task_unblocked', 'manual_today'] },
  { key: 'when', heading: 'When', question: 'By when, and how often it would run', fields: ['needed_by', 'run_frequency'] },
  { key: 'where', heading: 'Where', question: 'The blast radius — this is the thing being approved', fields: ['touches'] },
  { key: 'how', heading: 'How', question: 'What it writes, what it changes, and whether that can be undone', fields: ['inputs', 'writes', 'side_effects', 'reversible', 'reversibility_note'] },
];

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
    // one value on this screen that carries a colour.
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

  const monospace = field === 'agent_id' || field === 'domain_key'
    || field === 'capability_id' || field === 'tool_name';
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
