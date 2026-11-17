import React from 'react';
import type { PackageReadiness, ToolRequestPackage } from '../../../services/agentDomainApi';

/**
 * AF11.8 — the ten blocks an agent must bring, on one screen, in the order they are read.
 *
 * Ali, 16 Nov 2026: *"Any request from agent to human must come with all the pieces... We should
 * know the steps that are going to be followed and make the answer for the human go with option
 * A, B, C or Nothing."*
 *
 * ## The rule this component is laid out around
 *
 * **A request from an agent may not create work for the person receiving it.** Every block is
 * placed so that reading top to bottom answers the next question before it is asked: what is
 * this, what is it costing, what do we know and how do we know it, what could we do, what does
 * the agent think, what is it worth, what can it break, did we try it, and what happens next.
 *
 * Nothing here is behind a tab or an accordion, for the reason `ToolRequestFacts` records about
 * the six groups: a decision made without reading the blast radius is a click that looks like
 * diligence. The same is true of the simulation.
 *
 * ## The simulation gets the strongest treatment on the page
 *
 * It is the only block whose value is that it ACTUALLY HAPPENED, and it is the one that makes
 * the design-token case decide itself: once you can see that the scan has already produced
 * everything it would ever produce, Nothing stops being a judgement call. So it carries the date
 * it ran and what it ran against, both in the open.
 */

const RECOMMENDATION_WORD: Record<string, string> = {
  A: 'Option A',
  B: 'Option B',
  C: 'Option C',
  nothing: 'Nothing: do not build this',
};

/** What choosing an option would actually do, in words rather than as a verb name. */
const VERB_WORD: Record<string, string> = {
  approve_to_build: 'builds it',
  assign_existing_tool: 'grants a tool that already exists',
  send_back: 'sends it back for detail',
  deny: 'refuses it',
  nothing: 'takes it off the board',
};

function Block({ title, hint, children }: {
  title: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <div className="d-flex align-items-baseline gap-2 mb-1">
        <span
          className="badge-label text-uppercase"
          style={{ color: 'var(--color-primary)', letterSpacing: '.06em', fontSize: '.7rem', fontWeight: 700 }}
        >
          {title}
        </span>
        {hint && <span className="text-muted" style={{ fontSize: '.75rem' }}>{hint}</span>}
      </div>
      <div className="small">{children}</div>
    </div>
  );
}

/**
 * The bounce, rendered as the agent's problem rather than yours.
 *
 * This is what a request looks like when it has NOT reached you. It is deliberately not an error:
 * nothing is broken, an agent has not finished writing its case. The blocks are listed so the
 * sentence "go and write these" is actionable without opening anything else.
 */
export function PackageBounced({ readiness }: { readiness: PackageReadiness }) {
  const blocks = readiness.bounced_blocks ?? [];
  return (
    <div className="alert alert-warning mb-0" role="status">
      <div className="fw-semibold mb-1">
        {readiness.has_package
          ? 'This has not reached you yet.'
          : 'No decision package has been written for this request yet.'}
      </div>
      <div className="small mb-2">
        {readiness.has_package
          ? 'The agent still owes these blocks. Until they are written there is nothing here you '
            + 'could fairly decide, so the request sits with the agent rather than with you.'
          : 'An agent asking you to let it act has to bring the whole case: the problem, what it '
            + 'found, the options, what it simulated, and what happens next.'}
      </div>
      {blocks.length > 0 && (
        <ul className="small mb-0">
          {(readiness.bounce_reasons ?? []).map((r) => (
            <li key={`${r.block}-${r.rule}`}>
              <strong>{r.block.replace(/_/g, ' ')}</strong>
              {': '}
              {r.detail}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function RequestPackage({ pkg }: { pkg: ToolRequestPackage }) {
  const recommended = String(pkg.recommendation);
  return (
    <div>
      <Block title="Executive summary">
        {pkg.executive_summary}
      </Block>

      <Block title="The problem" hint="what it is costing now">
        {pkg.problem}
      </Block>

      <Block title="Key findings" hint="each one with where the number came from">
        <ul className="mb-0 ps-3">
          {pkg.key_findings.map((f) => (
            <li key={f.finding}>
              {f.finding}
              {' '}
              <span className="text-muted">
                (
                {f.source}
                )
              </span>
            </li>
          ))}
        </ul>
      </Block>

      {/* BLOCKS 4 AND 10 ARE ONE THING. The options are the answer: you pick one of these or
          Nothing, and the decision records which. Rendering them as two sections would invite
          the question "which list am I choosing from", which is the confusion the single list
          exists to prevent. */}
      <Block title="The options" hint="pick one of these, or Nothing">
        <div className="row g-2">
          {pkg.options.map((o) => (
            <div className="col-12 col-md-6" key={o.key}>
              <div
                className={`border rounded h-100 p-2${recommended === o.key ? ' border-2' : ''}`}
                style={recommended === o.key ? { borderColor: 'var(--color-primary)' } : undefined}
                data-testid={`package-option-${o.key}`}
              >
                <div className="d-flex align-items-baseline gap-2">
                  <span className="badge bg-light text-dark">{o.key}</span>
                  <span className="fw-semibold">{o.summary}</span>
                  {recommended === o.key && (
                    <span className="badge" style={{ background: 'var(--color-primary)' }}>
                      recommended
                    </span>
                  )}
                </div>
                <div className="text-muted mt-1">{o.what_happens}</div>
                <div className="mt-1">
                  <span className="text-muted">Choosing it </span>
                  {VERB_WORD[o.verb] ?? o.verb}
                  .
                </div>
              </div>
            </div>
          ))}
        </div>
      </Block>

      <Block title="Recommendation">
        <span className="fw-semibold">{RECOMMENDATION_WORD[recommended] ?? recommended}</span>
        {': '}
        {pkg.recommendation_reason}
      </Block>

      <Block title="Possible impact" hint="hours, dollars or risk">
        {pkg.impact}
      </Block>

      {/* BOTH HALVES, side by side. A risk section that only lists dangers tells you how worried
          to be and not how worried to stop being, and the boundary is usually the thing that
          makes an approval possible at all. */}
      <Block title="Risk assessment">
        <div className="row g-2">
          <div className="col-12 col-md-6">
            <div className="text-muted mb-1">What it can break</div>
            <ul className="mb-0 ps-3">
              {pkg.risk_can_break.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </div>
          <div className="col-12 col-md-6">
            <div className="text-muted mb-1">What it cannot break</div>
            <ul className="mb-0 ps-3">
              {pkg.risk_cannot_break.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </div>
        </div>
      </Block>

      {/* The strongest block on the page, because it is the only one whose value is that it
          really ran. The date and the data are in the open so a stale or hand-written simulation
          is visible as one. */}
      <Block title="Simulated action" hint="what it would have done, against real past data">
        <div
          className="border rounded p-2"
          style={{ background: 'var(--color-bg-alt)' }}
          data-testid="package-simulation"
        >
          <div>{pkg.simulated_action}</div>
          <div className="text-muted mt-1">
            Run against
            {' '}
            {pkg.simulated_against}
            {' · '}
            {new Date(pkg.simulated_at).toLocaleString()}
          </div>
        </div>
      </Block>

      <Block title="The steps that follow" hint="written before the decision, so a yes is a yes to this">
        <ol className="mb-0 ps-3">
          {pkg.steps_that_follow.map((s) => <li key={s}>{s}</li>)}
        </ol>
      </Block>
    </div>
  );
}
