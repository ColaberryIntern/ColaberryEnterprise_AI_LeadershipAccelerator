import React, { useEffect, useState } from 'react';
import { PageHeader, SectionCard } from '../../components/admin/shell';
import {
  fetchBuilderPathBoard, errorMessage,
  type BuilderPathBoardResponse, type BoardBuilder, type BoardCandidate, type GapGroup,
} from '../../services/builderPathApi';

/**
 * The builder path board — one place to see where all seven builders are, and what is waiting on
 * you.
 *
 * ## What this page is for
 *
 * Ali asked for somewhere to manage the path rather than reading it out of seven repositories. So
 * the first thing it answers is "what is waiting on me", because that is the only part of this
 * board the owner can act on, and the second is "is anybody stuck", which is a different question
 * from "is anybody idle".
 *
 * ## Three states, kept distinct
 *
 * Loading, failed and nothing-on-any-list are rendered separately. Collapsing them is how "it is
 * broken" and "nobody has proposed anything yet" become indistinguishable, which is exactly the
 * failure the platform's own My Domain page records in its header.
 *
 * ## Every figure comes from the API
 *
 * There is no hardcoded domain name, candidate count or gap count anywhere in this file, and a
 * test asserts that by reading the source. The counts in this programme have moved repeatedly
 * (1,477 to 553 to 598 stories; 40 to 70 path stories) and every time the stale number was in
 * prose nobody re-derived.
 *
 * ## The gap board has two halves and they are not the same thing
 *
 * `screens_owed` is the product catalog: endpoints that exist with no screen in front of them.
 * Those are yours. `scope_sheets_owed` is candidates the product cannot do at all, which are the
 * builder's to scope. One merged total would read as a queue, and most of it would not be.
 */
export default function AdminBuilderPathPage() {
  const [data, setData] = useState<BuilderPathBoardResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    fetchBuilderPathBoard()
      .then((r) => { if (live) { setData(r); setLoading(false); } })
      .catch((e) => {
        if (!live) return;
        setError(errorMessage(e, 'Could not load the builder path board.'));
        setLoading(false);
      });
    return () => { live = false; };
  }, []);

  const nothingOnAnyList = !!data && data.summary.candidates === 0;

  return (
    <>
      <PageHeader title="Builder path" />

      {loading && (
        <SectionCard>
          <div className="d-flex align-items-center gap-2 text-muted small">
            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
            Loading the board…
          </div>
        </SectionCard>
      )}

      {/* A failure says so. It is never rendered as an empty board. */}
      {!loading && error && (
        <SectionCard>
          <div className="alert alert-danger mb-0" role="alert">
            <div className="fw-semibold">Could not load the builder path board</div>
            <div className="small">{error}</div>
          </div>
        </SectionCard>
      )}

      {!loading && !error && data && (
        <>
          <SectionCard title="Where this stands">
            {/* The API's own sentence, verbatim. Do not paraphrase it into something softer. */}
            <p className="mb-3" style={{ color: 'var(--color-text)' }}>{data.reason}</p>
            <div className="row g-3">
              <Stat label="Domains" value={data.summary.domains} />
              <Stat label="Candidates" value={data.summary.candidates} />
              <Stat
                label="Waiting on you"
                value={data.summary.waiting_on_you}
                warn={data.summary.waiting_on_you > 0}
              />
              <Stat label="Screens owed" value={data.summary.screens_owed} />
              <Stat label="Scope sheets owed" value={data.summary.scope_sheets_owed} />
            </div>
          </SectionCard>

          {nothingOnAnyList && (
            <SectionCard title="Nothing is on any list yet">
              <p className="text-muted small mb-0">
                Every domain is listed below so you can see the silence is uniform rather than one
                builder having stalled. A domain with no candidates has had nothing proposed for
                it, which is not the same as a builder who is stuck.
              </p>
            </SectionCard>
          )}

          <GapBoard groups={data.gap_board} />

          {data.builders.map((b) => <BuilderCard key={b.domain_key} b={b} />)}
        </>
      )}
    </>
  );
}

function GapBoard({ groups }: { groups: GapGroup[] }) {
  if (groups.length === 0) {
    return (
      <SectionCard title="The gap board">
        {/* In words. An empty grid reads as a page that failed to load. */}
        <p className="text-muted small mb-0">
          Nothing is owed by the product right now. No feature is waiting for a screen and no
          candidate has come back as something the product cannot do at all.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="The gap board">
      <p className="text-muted small">
        Grouped by product area. <strong>Screens owed</strong> are yours: the endpoints exist and
        nobody built a page for them. <strong>Scope sheets owed</strong> are the builder&rsquo;s:
        the product cannot do it at all, so somebody has to say what it would mean first.
      </p>
      <div className="table-responsive">
        <table className="table table-hover mb-0">
          <thead className="table-light">
            <tr>
              <th>Product area</th>
              <th className="text-end">Screens owed</th>
              <th className="text-end">Scope sheets owed</th>
              <th className="text-end">Total</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.product_area}>
                <td>
                  <div className="fw-semibold">{g.product_area}</div>
                  {g.screens_owed.map((s) => (
                    <div key={s.feature_key} className="small text-muted">
                      {s.label}
                      {s.product_route_note && (
                        <span className="d-block">{s.product_route_note}</span>
                      )}
                    </div>
                  ))}
                  {g.scope_sheets_owed.map((c) => (
                    <div key={c.id} className="small text-muted">{c.title}</div>
                  ))}
                </td>
                <td className="text-end">{g.screens_owed.length}</td>
                <td className="text-end">{g.scope_sheets_owed.length}</td>
                <td className="text-end fw-semibold">{g.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function BuilderCard({ b }: { b: BoardBuilder }) {
  return (
    <SectionCard title={b.domain_key}>
      <div className="row g-3 mb-3">
        <Stat label="Waiting on you" value={b.waiting_on_you} warn={b.waiting_on_you > 0} />
        <Stat label="Theirs to move" value={b.theirs_to_move} />
        <Stat label="Cleared the gate" value={`${b.cleared_the_gate} of ${b.gate_size}`} />
      </div>

      {b.candidates.length === 0 && (
        /* The API's own sentence, so an empty row explains itself. */
        <p className="text-muted small mb-0">{b.note}</p>
      )}

      {b.candidates.length > 0 && (
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr>
                <th>Candidate</th>
                <th>Stage</th>
                <th>Whose move</th>
                <th>What happens next</th>
              </tr>
            </thead>
            <tbody>
              {b.candidates.map((c) => <CandidateRow key={c.id} c={c} />)}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function CandidateRow({ c }: { c: BoardCandidate }) {
  return (
    <tr>
      <td>
        <div className="fw-semibold">{c.title}</div>
        <div className="small text-muted">
          from {c.source} &middot; product: {c.product_state}
        </div>
      </td>
      <td><code>{c.stage}</code></td>
      <td>
        <span className={`badge ${c.turn === 'owner' ? 'bg-warning' : 'bg-secondary'}`}>
          {c.turn}
        </span>
      </td>
      <td className="small">
        {/* The sentence the platform computed. The page never writes its own. */}
        {c.action}
        {c.blocked_reason && (
          <div className="text-muted mt-1">{c.blocked_reason}</div>
        )}
      </td>
    </tr>
  );
}

function Stat(
  { label, value, warn }: { label: string; value: number | string; warn?: boolean },
) {
  return (
    <div className="col-6 col-md-3">
      <div className="card border-0 shadow-sm">
        <div className="card-body text-center p-3">
          <div className={`fs-4 fw-bold ${warn ? 'text-warning' : 'text-primary'}`}>{value}</div>
          <div className="text-muted small">{label}</div>
        </div>
      </div>
    </div>
  );
}
