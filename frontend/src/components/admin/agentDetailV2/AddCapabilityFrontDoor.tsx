import React, { useState } from 'react';
import {
  askProductFeatures,
  type FrontDoorAnswer,
} from '../../../services/productFeatureApi';

/**
 * AF11.9 — the builder's front door. Before a word of a request is written, the app answers
 * "can the product already do this?"
 *
 * Ali, 16 Nov 2026: *"1st Sarbjit would need to create a landing page in the app to see how it
 * works and make sure she can build it how she wants. If that functionality does not exist, she
 * has to put the request in."*
 *
 * ## WHAT THIS SCREEN IS FOR, and what it refuses to be
 *
 * It is a SIGNPOST, not a gate. AF11.7 is the gate: it refuses a request that does not answer
 * the three questions. This screen runs earlier and changes which path the builder takes, and it
 * writes nothing, files nothing and grants nothing.
 *
 * That matters because the obvious next step — have the front door record its answer onto the
 * request — would give `tried_in_product` two sources, and they would disagree the first time a
 * builder changed their mind after actually using the feature.
 *
 * ## THE THREE ANSWERS ARE THREE DIFFERENT ACTIONS
 *
 * Already in the app is deliberately NOT a "request" button. The ticket is explicit: the answer
 * is *"go use the real feature, confirm it does what you need, then ask for your agent to be
 * given the thing you just used."* So that branch offers a link to the product and nothing else
 * — there is no way to turn it straight into a build, which is the mistake it exists to stop.
 */

const STATE_TITLE: Record<string, string> = {
  in_app: 'The app already does this',
  partly: 'The app does this, and whether an agent may is a separate decision',
  not_built: 'The app cannot do this yet',
};

export default function AddCapabilityFrontDoor({ domainKey }: { domainKey: string }) {
  const [candidate, setCandidate] = useState('');
  const [answer, setAnswer] = useState<FrontDoorAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!candidate.trim()) return;
    setBusy(true);
    setProblem('');
    setAnswer(null);
    try {
      const res = await askProductFeatures(candidate.trim(), domainKey);
      setAnswer(res.answer);
    } catch {
      // A failed lookup must NOT read as "not built". Saying nothing is the honest answer when
      // the catalog could not be consulted, and telling somebody to write a scope sheet for a
      // feature that exists is the expensive direction.
      setProblem('Could not check the catalog just now, so this is unanswered rather than no.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="front-door">
      <form onSubmit={ask} className="mb-3">
        <label className="form-label small fw-medium" htmlFor="front-door-candidate">
          What do you want your agent to be able to do?
        </label>
        <div className="d-flex gap-2 flex-wrap">
          <input
            id="front-door-candidate"
            className="form-control form-control-sm"
            style={{ maxWidth: 480 }}
            value={candidate}
            placeholder="draft a landing page from a campaign brief"
            onChange={(e) => setCandidate(e.target.value)}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !candidate.trim()}>
            {busy ? 'Checking…' : 'Check the app first'}
          </button>
        </div>
        <div className="form-text">
          Nothing is filed by this. It only answers whether the product can already do it, which
          decides whether you need a build at all.
        </div>
      </form>

      {problem && <div className="alert alert-warning small" role="alert">{problem}</div>}

      {answer && (
        <div
          className={`border rounded p-3 ${answer.state === 'not_built' ? '' : 'border-2'}`}
          data-testid={`front-door-${answer.state}`}
          style={answer.state === 'not_built' ? undefined : { borderColor: 'var(--color-primary)' }}
        >
          <div className="fw-semibold mb-1">{STATE_TITLE[answer.state]}</div>

          {answer.feature && (
            <div className="small mb-2">
              <div>{answer.feature.what_it_does}</div>
              <div className="text-muted mt-1">
                {'Checked against '}
                <code className="small">{answer.feature.backed_by}</code>
                {` · last verified ${answer.feature.verified_on}`}
              </div>
            </div>
          )}

          {/* ALREADY THERE: a link to the product, and no way to turn this into a build. */}
          {answer.state === 'in_app' && answer.feature && (
            <div className="small">
              <a className="btn btn-sm btn-outline-primary" href={answer.feature.product_route}>
                Go and use it
              </a>
              <div className="form-text mt-2">
                Use it once and confirm it does what you need. Then ask for your agent to be given
                the thing you just used: that is a grant, which is a much shorter request than a
                build, and it does not need a scope sheet.
              </div>
            </div>
          )}

          {/* PARTLY: the endpoint works; whether an agent may call it is Ali's ruling. */}
          {answer.state === 'partly' && answer.feature && (
            <div className="small">
              <div className="alert alert-warning py-2 mb-2">{answer.feature.ruling_needed}</div>
              <a className="btn btn-sm btn-outline-primary me-2" href={answer.feature.product_route}>
                Go and use it
              </a>
              <span className="text-muted">
                Then ask Ali for a ruling on whether the agent may do it unsupervised. This is not
                a build, so it does not need a scope sheet.
              </span>
            </div>
          )}

          {/* NOT BUILT: the only branch that leads to a request, and AF11.7 gates it. */}
          {answer.state === 'not_built' && (
            <div className="small">
              {answer.domain_is_mapped ? (
                <div className="mb-2">
                  Nothing in this domain does this today, so this is a genuine build request.
                </div>
              ) : (
                // UNMAPPED IS NOT EMPTY. Saying "nothing exists" about a domain nobody has
                // curated would be a confident wrong answer, and the next one would not be
                // believed either.
                <div className="alert alert-secondary py-2 mb-2">
                  Nobody has mapped what the product already does for this domain yet, so this
                  answer is a best guess rather than a check. Worth asking before you build.
                </div>
              )}
              <div className="text-muted">
                The next step is the scope sheet: who acts on the output, what number it is judged
                by, and what the app cannot do today.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
