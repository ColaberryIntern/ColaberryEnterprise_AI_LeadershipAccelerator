import React from 'react';
import type { ToolDuplicateCheck, ToolMatchedField } from '../../../services/agentDomainApi';

/**
 * AF11.3 — the AF11.2 duplicate check, beside the request, with its matched field NAMED.
 *
 * ## Three states, rendered as three different things
 *
 * | The data | What it means | What this shows |
 * |---|---|---|
 * | `null` | no check is stored | "never checked" — NOT "no duplicates" |
 * | `catalog_absent` | the detector could not see the catalog | "could not check" |
 * | `candidates: []` | it compared against N tools and found nothing | "compared against N, nothing close" |
 *
 * Collapsing any two of those is the mistake this panel exists to prevent. "We checked 57 tools
 * and found nothing" is a reason to approve; "this was never checked" is a reason to go and look.
 * An approver cannot tell them apart from an empty list.
 *
 * ## The score is never shown alone
 *
 * `score` is advice, not a verdict — nothing is granted or refused on it. So every candidate shows
 * WHICH field matched and WHICH words it shared, because 0.53 tells an approver nothing they can
 * check and "both are named `read_feed` and both read `community_posts`" tells them everything.
 */

const FIELD_LABEL: Record<ToolMatchedField['field'], string> = {
  tool_name: 'the name',
  tool_name_tokens: 'words in the name',
  reads: 'what it reads',
  produces: 'what it produces',
  // Deliberately not "purpose": the catalog has no purpose field, so the request's purpose is
  // compared against what the tool reads and produces. Calling it "purpose" would claim a
  // comparison that did not happen.
  purpose_vs_behavior: 'the purpose against its behavior',
};

function MatchedField({ m }: { m: ToolMatchedField }) {
  return (
    <li className="mb-1">
      <span className="fw-semibold">{FIELD_LABEL[m.field] ?? m.field}</span>
      <span className="text-muted">{` — ${m.detail}`}</span>
      {/* Chips, for the reason `ToolRequestFacts` records: two bare `<code>` elements separated
          by a gap render as one value. "feed posts" read as a single shared token rather than as
          the two words `feed` and `posts` that the matcher actually found. */}
      {m.tokens.length > 0 && (
        <span className="d-inline-flex flex-wrap gap-1 ms-1 align-middle">
          {m.tokens.map((t) => (
            <code
              key={t}
              className="small border rounded px-1"
              style={{ background: 'var(--color-bg-alt)' }}
            >
              {t}
            </code>
          ))}
        </span>
      )}
    </li>
  );
}

export default function DuplicateCandidatesPanel({ check }: { check: ToolDuplicateCheck | null }) {
  if (!check) {
    return (
      <div className="alert alert-warning mb-0" role="status">
        <div className="fw-semibold">This was never checked against the tool catalog.</div>
        <div className="small">
          That is not the same as finding no duplicates. Nothing compared this request against the
          tools that already exist, so a tool that does this job may well be registered already.
        </div>
      </div>
    );
  }

  if (check.catalog_absent) {
    return (
      <div className="alert alert-warning mb-0" role="status">
        <div className="fw-semibold">The check ran, but could not see the catalog.</div>
        <div className="small">
          The empty result below means nothing. Treat this as unchecked.
        </div>
      </div>
    );
  }

  if (check.candidates.length === 0) {
    return (
      <div>
        <div className="alert alert-success mb-2" role="status">
          <div className="fw-semibold">
            {`Compared against ${check.catalog_size} registered tools. Nothing close.`}
          </div>
          <div className="small">
            {`Anything scoring above ${check.threshold} would be listed here.`}
          </div>
        </div>
        {check.behaviorless_tools.length > 0 && (
          <div className="small text-muted">
            {`${check.behaviorless_tools.length} of those tools document no behavior, so they could `}
            only be matched by name:
            <span className="d-inline-flex flex-wrap gap-1 ms-1">
              {check.behaviorless_tools.map((t) => <code key={t} className="small">{t}</code>)}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="text-muted small mb-2">
        {`Ranked against ${check.catalog_size} registered tools. The score is advice, not a verdict `}
        — nothing is granted or refused on it, so read the matched fields.
      </div>
      {check.candidates.map((c) => (
        <div className="border rounded p-3 mb-2" key={c.tool_name} data-testid={`candidate-${c.tool_name}`}>
          <div className="d-flex align-items-center gap-2 flex-wrap mb-2">
            <code className="fw-semibold">{c.tool_name}</code>
            <span className="badge bg-light text-dark">{`score ${c.score.toFixed(2)}`}</span>
          </div>
          <ul className="list-unstyled small mb-0">
            {c.matched_fields.map((m) => <MatchedField key={m.field} m={m} />)}
          </ul>
        </div>
      ))}
      {check.behaviorless_tools.length > 0 && (
        <div className="small text-muted">
          {`${check.behaviorless_tools.length} tools in the catalog document no behavior and could `}
          only be matched by name.
        </div>
      )}
    </div>
  );
}
