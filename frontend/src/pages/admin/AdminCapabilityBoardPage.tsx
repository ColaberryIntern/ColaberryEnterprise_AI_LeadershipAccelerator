import React, { useEffect, useState } from 'react';
import { PageHeader, SectionCard } from '../../components/admin/shell';
import {
  ageInWords,
  fetchCapabilityBoard,
  type Board,
  type BoardCard,
  type UndecidedChangeRequest,
} from '../../services/capabilityBoardApi';

/**
 * AF11.10 — one board, five columns, every capability in flight.
 *
 * Ali, 16 Nov 2026: *"they need to be able to put multiple in the works since there are many
 * steps, we don't want them to have to wait for anything."*
 *
 * ## THE PAGE IS BUILT AROUND COLUMN TWO
 *
 * The ticket: *"Ali reads column two and nothing else."* So the first thing on the page is the
 * answer to "is anybody waiting on me", in a sentence, before any column is drawn. An empty
 * column two is good news and good news has to be readable at a glance rather than inferred from
 * an absence.
 *
 * ## WHAT THE CARDS SAY, and what they refuse to say
 *
 * Every card carries WHO is holding it and FOR HOW LONG, in words: "Kes · building, 2 days".
 * Not a status chip. A chip tells you what state something is in; the point of this board is who
 * has to move, and a chip cannot say that.
 *
 * The run count on column five renders as "not recorded", never as zero. Nothing in the product
 * records how often an agent has used a tool it holds, and showing an unknown as a zero would
 * make a working tool look unused.
 *
 * ## UNKNOWN IS A SECTION, NOT A HIDDEN STATE
 *
 * A capability the records cannot place is shown in its own block with the reason. That block is
 * the most valuable thing on the page: an approved request with no build event is exactly how
 * Kalkidan's request sat undecided from 13 Nov, and a board that quietly dropped it would
 * reproduce the problem it exists to solve.
 */

const COLUMN_TITLE: Record<string, string> = {
  scoping: 'Scoping',
  your_desk: 'Your desk',
  being_built: 'Being built',
  builder_validates: 'Builder validates',
  agent_has_it: 'Agent has it',
};

const COLUMN_HINT: Record<string, string> = {
  scoping: 'A request exists and its case is not finished',
  your_desk: 'Complete, and undecided',
  being_built: 'Somebody is building it',
  builder_validates: 'Handed over, being confirmed by hand',
  agent_has_it: 'Granted',
};

function Card({ card }: { card: BoardCard }) {
  const age = ageInWords(card.held_hours);
  return (
    <div className="border rounded p-2 mb-2" data-testid={`board-card-${card.change_request_id}`}>
      <div className="small fw-semibold">{card.title}</div>
      <div className="text-muted" style={{ fontSize: '.78rem' }}>{card.domain_key}</div>
      {/* WHO AND HOW LONG, which is the whole reason this board exists. */}
      <div className="mt-1" style={{ fontSize: '.8rem' }}>
        <span className="fw-semibold">{card.held_by}</span>
        {' · '}
        {card.holding_because}
        {age ? `, ${age}` : ''}
      </div>
      {card.column === 'agent_has_it' && (
        <div className="text-muted" style={{ fontSize: '.75rem' }}>
          {/* Not zero. Nothing records this yet, and saying so is the honest version. */}
          {card.runs === null ? 'runs: not recorded' : `runs: ${card.runs}`}
        </div>
      )}
    </div>
  );
}

export default function AdminCapabilityBoardPage() {
  const [data, setData] = useState<{
    board: Board; undecided_change_requests: UndecidedChangeRequest[];
  } | null>(null);
  const [problem, setProblem] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetchCapabilityBoard();
        if (alive) setData(res);
      } catch {
        // A board that cannot be read must say so. An empty board would read as "nothing is in
        // flight", which is the most misleading thing this page could show.
        if (alive) setProblem('Could not read the board, so this is unknown rather than empty.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <>
      <PageHeader
        title="Capability board"
        subtitle="Every capability in flight, and who is holding each one up"
      />

      {loading && <SectionCard><div className="text-muted small">Reading the records…</div></SectionCard>}
      {problem && (
        <SectionCard>
          <div className="alert alert-danger small mb-0" role="alert">{problem}</div>
        </SectionCard>
      )}

      {data && (
        <>
          {/* COLUMN TWO, ANSWERED IN A SENTENCE, BEFORE ANY COLUMN IS DRAWN. */}
          <SectionCard>
            <div
              className={`alert mb-0 ${data.board.nobody_is_waiting_on_you ? 'alert-success' : 'alert-warning'}`}
              role="status"
              data-testid="waiting-on-you"
            >
              {data.board.nobody_is_waiting_on_you
                ? 'Nobody is waiting on you. Nothing on this board needs a decision from you right now.'
                : `${data.board.columns.find((c) => c.key === 'your_desk')?.cards.length ?? 0} capability(s) are waiting on your decision.`}
            </div>
          </SectionCard>

          <div className="row g-3">
            {data.board.columns.map((col) => (
              <div className="col-12 col-lg" key={col.key}>
                <SectionCard title={COLUMN_TITLE[col.key] ?? col.key} subtitle={COLUMN_HINT[col.key]}>
                  <div data-testid={`board-column-${col.key}`}>
                    {col.cards.length === 0
                      ? <div className="text-muted small">Nothing here.</div>
                      : col.cards.map((c) => <Card key={c.change_request_id} card={c} />)}
                  </div>
                </SectionCard>
              </div>
            ))}
          </div>

          {/* The most valuable block on the page: what the records could not place, and why. */}
          {data.board.unknown.length > 0 && (
            <SectionCard
              title="The records cannot place these"
              subtitle="Not a stage. Nothing says where these are, which is usually the problem"
            >
              <div data-testid="board-unknown">
                {data.board.unknown.map((c) => (
                  <div className="border rounded p-2 mb-2" key={c.change_request_id}>
                    <div className="small fw-semibold">{c.title}</div>
                    <div style={{ fontSize: '.8rem' }}>
                      <span className="fw-semibold">{c.held_by}</span>
                      {' · '}
                      {c.holding_because}
                      {ageInWords(c.held_hours) ? `, ${ageInWords(c.held_hours)}` : ''}
                    </div>
                    <div className="text-muted" style={{ fontSize: '.75rem' }}>{c.placed_because}</div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* CHANGE requests are not capabilities and do not belong in the five columns. They
              are shown here anyway, because an undecided request is an undecided request
              whatever table it sits in, and the person waiting does not care which. This block
              is where Kalkidan's request appears, with its true age. */}
          {data.undecided_change_requests.length > 0 && (
            <SectionCard
              title="Undecided change requests"
              subtitle="Not capabilities, so not on the board. Still waiting on a decision"
            >
              <div data-testid="undecided-change-requests">
                {data.undecided_change_requests.map((r) => (
                  <div className="border rounded p-2 mb-2" key={r.id}>
                    <div className="small fw-semibold">{r.title}</div>
                    <div style={{ fontSize: '.8rem' }}>
                      {r.requested_by_identity}
                      {' · '}
                      {r.domain_key}
                      {ageInWords(r.waiting_hours) ? ` · waiting ${ageInWords(r.waiting_hours)}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </>
      )}
    </>
  );
}
