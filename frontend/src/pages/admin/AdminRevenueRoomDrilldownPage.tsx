import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import api from '../../utils/api';
import { PageHeader, SectionCard } from '../../components/admin/shell';

/**
 * R4 — the page behind a Revenue Room card (/admin/revenue-room/:cardKey).
 *
 * Ali's ask: "every card is clickable to drill through to another page that shows the
 * timeline, documents etc... of all the things that have happened moving towards that
 * initiative."
 *
 * ── TWO SHAPES, BECAUSE ONE CARD IS NOT ALWAYS ONE INITIATIVE ────────────────────────────
 *
 * Six cards are a single initiative and get a timeline. The government card is an
 * aggregate of every bid carrying the pursuit flag, so it gets a ROSTER: the bids inside
 * it, each with its own evidence count and the flags its own row shows, each clickable
 * through to its own timeline. A merged timeline across twelve unrelated bids would have
 * been a story that never happened.
 *
 * ── AN EMPTY TIMELINE SAYS WHY IT IS EMPTY ───────────────────────────────────────────────
 *
 * The spine is new and only one producer writes to it so far, so most of these timelines
 * are genuinely empty. That is the point at which a page usually starts lying — by
 * rendering nothing and letting the reader supply the explanation. So the three cases are
 * kept apart in words: the table is missing, the table is there and holds nothing for this
 * initiative, or here is what happened. The same five-state discipline as the board.
 */

type DrilldownShape = 'single' | 'roster';
type SpineState = 'ready' | 'absent';

interface EvidenceLink {
  id: string;
  sourceSystem: string;
  sourceId: string;
  sourceUrl: string | null;
  title: string | null;
  relation: string;
  observedAt: string;
  linkedBy: string;
  linkMethod: 'human' | 'automatic';
  confidence: number | null;
  notes: string | null;
}

interface Timeline {
  state: SpineState;
  links: EvidenceLink[];
  note: string | null;
}

interface RosterEntry {
  initiativeType: string;
  initiativeKey: string;
  label: string;
  evidenceCount: number;
  flags: string[];
}

interface Drilldown {
  shape: DrilldownShape;
  cardKey: string;
  label: string;
  provenance: string;
  owner: string;
  timeline: Timeline | null;
  roster: RosterEntry[] | null;
  spine: SpineState;
  note: string | null;
}

/** What each source system is, in words a reader does not have to decode. */
const SOURCE_LABEL: Record<string, string> = {
  basecamp_todo: 'Basecamp to-do',
  basecamp_comment: 'Basecamp comment',
  basecamp_vault: 'Basecamp vault document',
  email_thread: 'Email thread',
  gov_proposal_document: 'Proposal document',
  gov_submission: 'Submission',
  interaction_outcome: 'Recorded interaction',
  calendar_event: 'Meeting',
  pull_request: 'Pull request',
  session_log: 'Build session log',
};

const RELATION_LABEL: Record<string, string> = {
  produced: 'produced',
  discussed: 'discussed',
  decided: 'decided',
  submitted: 'submitted',
  met: 'met',
  corresponded: 'corresponded',
};

/** A date a reader can scan, in the house timezone rather than the container's UTC. */
function day(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'America/Chicago',
  });
}

/**
 * Exported so the "an empty timeline explains itself" rule can be tested against fixtures.
 * `renderToStaticMarkup` never runs effects, so the page's own fetch cannot populate this.
 */
export function TimelineView({ timeline }: { timeline: Timeline }) {
  if (timeline.state === 'absent') {
    return (
      <div className="alert alert-warning mb-0" role="alert" data-testid="timeline-absent">
        <strong>The evidence table is not present in this database.</strong>{' '}
        {timeline.note}
      </div>
    );
  }

  if (timeline.links.length === 0) {
    return (
      <div data-testid="timeline-empty">
        <p className="mb-2" style={{ color: 'var(--text-body)' }}>
          <strong>Nothing is linked to this initiative yet.</strong>
        </p>
        <p className="small mb-0" style={{ color: 'var(--text-muted)' }}>
          {timeline.note} Scheduled ingestion of Basecamp (R5) and email (R8) is what fills
          this in. Until then the only linked evidence is the proposal documents that
          already existed.
        </p>
      </div>
    );
  }

  return (
    <ol className="list-unstyled mb-0" data-testid="timeline">
      {timeline.links.map((l) => (
        <li
          key={l.id}
          className="d-flex gap-3 pb-3 mb-3"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
          data-testid={`event-${l.id}`}
        >
          <div className="flex-shrink-0 small fw-semibold" style={{ width: '7.5rem', color: 'var(--text-muted)' }}>
            {day(l.observedAt)}
          </div>
          <div className="flex-grow-1">
            <div className="fw-semibold" style={{ color: 'var(--text-primary)' }}>
              {l.sourceUrl
                ? <a href={l.sourceUrl} target="_blank" rel="noreferrer">{l.title || l.sourceId}</a>
                : (l.title || l.sourceId)}
            </div>
            <div className="small" style={{ color: 'var(--text-secondary)' }}>
              {SOURCE_LABEL[l.sourceSystem] ?? l.sourceSystem}
              {' · '}
              {RELATION_LABEL[l.relation] ?? l.relation}
            </div>
            <div className="small" style={{ color: 'var(--text-muted)' }}>
              Linked by {l.linkedBy}
              {l.linkMethod === 'automatic' && l.confidence !== null
                // Shown because a machine-made link is not a judgment, and a reader
                // deciding whether to trust a timeline entry needs to know which it is.
                ? ` · automatic, confidence ${l.confidence.toFixed(2)}`
                : ' · by hand'}
              {l.notes ? ` · ${l.notes}` : ''}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Exported for the same reason as TimelineView. */
export function RosterView({ cardKey, roster }: { cardKey: string; roster: RosterEntry[] }) {
  if (roster.length === 0) {
    return (
      <p className="mb-0" style={{ color: 'var(--text-muted)' }} data-testid="roster-empty">
        No bid carries the pursuit flag.
      </p>
    );
  }
  return (
    <div className="d-flex flex-column gap-2" data-testid="roster">
      {roster.map((r) => (
        <Link
          key={r.initiativeKey}
          to={`/admin/revenue-room/${cardKey}?bid=${r.initiativeKey}`}
          className="d-flex justify-content-between align-items-start gap-3 p-3 rounded border text-decoration-none"
          style={{ background: 'var(--surface-card)', borderColor: 'var(--border-subtle)' }}
          data-testid={`roster-${r.initiativeKey}`}
        >
          <div>
            <div className="fw-semibold" style={{ color: 'var(--text-primary)' }}>{r.label}</div>
            <div className="small d-flex flex-wrap gap-2 mt-1">
              {r.flags.map((f) => (
                <span
                  key={f}
                  className="px-2 py-1 rounded-pill"
                  style={{
                    // A test row and a documented pursuit must not look the same.
                    background: /test|no proposal|never submitted/i.test(f)
                      ? 'var(--surface-subtle)' : 'var(--status-info-bg)',
                    color: /test/i.test(f) ? 'var(--status-danger)' : 'var(--text-secondary)',
                  }}
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
          <div className="text-end flex-shrink-0">
            <div className="fw-bold" style={{ color: 'var(--text-primary)' }}>{r.evidenceCount}</div>
            <div className="small" style={{ color: 'var(--text-muted)' }}>
              linked item{r.evidenceCount === 1 ? '' : 's'}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function AdminRevenueRoomDrilldownPage() {
  const { cardKey = '' } = useParams<{ cardKey: string }>();
  const [search] = useSearchParams();
  const bid = search.get('bid');

  const [data, setData] = useState<Drilldown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    const qs = bid ? `?bid=${encodeURIComponent(bid)}` : '';
    api.get(`/api/admin/commercialization/revenue-room/${encodeURIComponent(cardKey)}${qs}`)
      .then((res) => {
        if (!alive) return;
        setData(res.data?.data ?? null);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e?.response?.data?.error || 'Could not load this initiative.');
        setLoading(false);
      });
    return () => { alive = false; };
  }, [cardKey, bid]);

  return (
    <div data-testid="revenue-room-drilldown">
      <PageHeader
        title={data?.label ?? 'Initiative'}
        subtitle="Everything linked to this initiative, and where each piece came from"
        icon="time-line"
        breadcrumb={[
          { label: 'Admin', to: '/admin' },
          { label: 'Revenue Room', to: '/admin/revenue-room' },
          { label: data?.label ?? cardKey },
        ]}
      />

      {loading && <p className="text-muted">Loading…</p>}

      {error && (
        <div className="alert alert-danger" role="alert" data-testid="drilldown-error">{error}</div>
      )}

      {data && (
        <>
          <SectionCard title="What this is">
            <p className="mb-2">{data.provenance}</p>
            <p className="small mb-0" style={{ color: 'var(--text-muted)' }}>
              Owner: {data.owner}
            </p>
          </SectionCard>

          {data.shape === 'roster' ? (
            <SectionCard title="The bids behind this card">
              <p className="small mb-3" style={{ color: 'var(--text-muted)' }}>
                This card reports a <strong>flag count</strong>, not a confirmed pipeline. Each
                row below shows what its own record contains, so a test row and a documented
                pursuit do not look alike. Nothing here has been submitted.
              </p>
              {data.spine === 'absent'
                ? (
                  <div className="alert alert-warning mb-0" role="alert" data-testid="roster-absent">
                    {data.note}
                  </div>
                )
                : <RosterView cardKey={data.cardKey} roster={data.roster ?? []} />}
            </SectionCard>
          ) : (
            <SectionCard title="Timeline">
              {data.timeline
                ? <TimelineView timeline={data.timeline} />
                : <p className="mb-0 text-muted">No timeline was returned.</p>}
            </SectionCard>
          )}

          {bid && (
            <p className="mt-3">
              <Link to={`/admin/revenue-room/${data.cardKey}`} data-testid="back-to-roster">
                ← Back to all bids
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
