import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, SectionCard } from '../../components/admin/shell';
import ReportAProblem from './marketing/bugReport/ReportAProblem';
import AgentDashboardWalkthrough from '../../components/admin/agentDashboard/AgentDashboardWalkthrough';
import {
  errorMessage,
  fetchMyChangeRequests,
  fetchMyDomains,
  type AgentDomainRow,
  type ChangeRequest,
} from '../../services/agentDomainApi';

/**
 * The agent dashboard: one place for everything about one agent.
 *
 * ## What Ali asked for
 *
 * 17 Nov 2026: *"Change Request page and domain page should be built into the agent dashboard.
 * Tools and Tasks should be built into the agent. So should tools and capability board / Tool
 * Request / All of these should be arranged in a dashboard like Marketing page is. They should be
 * removed from the left navigation and located inside the Agent dashboard for the 10 agents."*
 *
 * ## Four nav entries became ONE, not zero, and that is deliberate
 *
 * Taken literally, "removed from the left navigation" strands the seven people this is for. The
 * existing Agents sub-list lives under the Interns group on section `agents`, and **no builder
 * role carries `agents` or `internship`** — measured against `mgmtRoles`, all six builder roles
 * return false for both. Folding My Domain and Change Requests in there and deleting their nav
 * links would have left Victoria, Mihret, Ruth, Quincy, Sarbjit, Kalkidan and Tashima with no way
 * in at all, on the morning after they are told to go and file tool requests.
 *
 * So the four links collapse into this one, which carries `dashboard`: the section every mgmt
 * role holds. The nav gets simpler, which is the point of the ask, and nobody is stranded.
 *
 * ## The cards are the navigation, as on the Marketing page
 *
 * Marketing groups its cards under PLAN & WRITE / SHIP & MEASURE / SET UP. These are grouped
 * under **CAPABILITY / TASK / TOOL**, because those are the three things Ali said are being
 * conflated, and a reader learns the distinction by using the page rather than by being told it
 * in a paragraph they will not read.
 *
 * ## A card the viewer cannot open says so
 *
 * Tool Requests and the Capability Board sit on `program`, which no builder holds. Rendering them
 * as ordinary links would send seven people to a 403 and let them conclude they did something
 * wrong. Each card declares the section it needs and renders as unavailable, with the reason, when
 * the viewer lacks it. This is the AF11.9 lesson applied to a screen instead of a route.
 */

/** Where a card goes, and what it takes to get there. */
interface HubCard {
  readonly key: string;
  readonly label: string;
  readonly icon: string;
  readonly to: string;
  readonly blurb: string;
  /** The mgmt section the destination needs. Undefined means everyone who sees the hub. */
  readonly section?: 'program';
  /** Shown under the blurb: the real count, or the honest absence of one. */
  readonly stat?: string;
  /** True when the destination does not exist yet. Never rendered as a working link. */
  readonly notBuilt?: boolean;
}

interface HubGroup {
  readonly key: string;
  readonly title: string;
  readonly definition: string;
  readonly cards: ReadonlyArray<HubCard>;
  /**
   * AF12.2. The whole group is withheld from a viewer who does not hold `program`, rather than
   * rendered with every card marked unavailable.
   *
   * A CARD is optimistic (see `HubCardView`): it is already on the page, it has a blocked state,
   * and it can say why. A GROUP has no such affordance, so three unavailable cards under a
   * heading is just a longer page that says no. The point of folding these in was to make a
   * builder's page shorter, not to move the refusal somewhere new.
   */
  readonly ownerOnly?: boolean;
}

export function buildGroups(domain: AgentDomainRow | null, mine: ChangeRequest[]): HubGroup[] {
  const stories = domain?.stories ?? 0;
  const verified = domain?.stories_verified ?? 0;
  const open = mine.filter((r) => r.status === 'submitted').length;

  return [
    {
      key: 'capability',
      title: 'Capability',
      definition: 'The standing thing this agent can do in its domain. It has a real id, it lives '
        + 'on the board, and the four rungs are climbed against it.',
      cards: [
        {
          key: 'capability-board',
          label: 'Capability board',
          icon: 'layout-column-line',
          to: '/admin/capability-board',
          blurb: 'Every capability in this domain and which rung it stands on.',
          section: 'program',
          stat: `${stories} ${stories === 1 ? 'story' : 'stories'} · ${verified} verified`,
        },
        {
          key: 'my-domain',
          label: 'My domain',
          icon: 'robot-2-line',
          to: '/admin/my-domain',
          blurb: 'The builder’s own home: what is assigned here, and nothing from the other nine.',
          stat: domain?.agent_display_name
            ? `Agent: ${domain.agent_display_name}`
            : 'This agent has not been named yet',
        },
      ],
    },
    {
      key: 'task',
      title: 'Task',
      definition: 'A unit of work somebody wants off their hands. One task routinely needs '
        + 'SEVERAL tools, which is why it has to be the thing that groups them.',
      cards: [
        {
          key: 'tasks',
          label: 'Tasks',
          icon: 'list-check-2',
          to: '/admin/change-requests',
          blurb: 'Each task, the tools it needs, and which of them exist yet.',
          /**
           * AF12.2. Marked NOT BUILT, and the honesty is the point.
           *
           * This card opened `/admin/change-requests`, the same destination as the Change
           * requests card directly below it, while promising a view grouped by task that that
           * page does not render. Two cards, two blurbs, one URL, and the blurb of the pair that
           * was clicked first describes something the reader will not find.
           *
           * `notBuilt` already renders it as an unclickable card with a stated badge, which is
           * the truth until a task view exists. Deleting it instead would delete the only place
           * the three-noun model names its middle noun on this page.
           */
          notBuilt: true,
          stat: 'Grouped by task key',
        },
        {
          key: 'change-requests',
          label: 'Change requests',
          icon: 'git-pull-request-line',
          to: '/admin/change-requests',
          blurb: 'Ask for a platform change, and see the ones you have asked for.',
          stat: `${mine.length} filed · ${open} still open`,
        },
      ],
    },
    {
      key: 'tool',
      title: 'Tool',
      definition: 'One specific thing the agent is handed. One grant, one blast radius, one '
        + 'decision. One request per tool, which is why a task has to show you its siblings.',
      cards: [
        {
          key: 'tool-requests',
          label: 'Tool requests',
          icon: 'tools-line',
          to: '/admin/tool-requests',
          blurb: 'The queue where a tool request is read and settled.',
          section: 'program',
          stat: 'Scope sheet, blast radius, and the instruction sent with the grant',
        },
        {
          key: 'tools',
          label: 'Tools this agent holds',
          icon: 'hammer-line',
          to: '/admin/workforce',
          blurb: 'What the agent has actually been granted, and who granted it.',
          section: 'program',
          stat: 'A grant is a separate record from an approval',
        },
      ],
    },
    /**
     * AF12.2 — the two rows that used to be in the sidebar, as one group that is not about one
     * agent at all.
     *
     * The three groups above are scoped by the strip at the top of the page: pick an agent and
     * everything under them is that agent. These two are the opposite, which is why they get
     * their own heading rather than a card wedged into Capability. The definition says so out
     * loud, because the mistake this group exists to stop is reading a programme-wide total as
     * though it described the agent currently selected.
     *
     * The CAPABILITY BOARD deliberately stays where it is, in the Capability group, even though
     * it is also programme-wide and also `program`. `BUILDER_STEPS` step 4 points at
     * `hub-card-capability-board`, and `walkthroughTargets.test.ts` exists because a tour that
     * names an element the page does not render says "this step is about something that is not
     * on this page right now" and stays broken for a month. Moving that card would do it again,
     * for every builder, in the one group they do see.
     */
    {
      key: 'across',
      title: 'Across everyone',
      definition: 'Not one agent. The same ten domains read two ways: what they add up to, and '
        + 'whose move each capability is on.',
      ownerOnly: true,
      cards: [
        {
          key: 'all-domains',
          label: 'All Domains',
          icon: 'stack-line',
          to: '/admin/all-domains',
          blurb: 'Every domain project, its stage, its accountable manager and its counts.',
          section: 'program',
          stat: 'One row per domain, verified counts beside the story counts',
        },
        {
          key: 'builder-path',
          label: 'Builder path',
          icon: 'route-line',
          to: '/admin/builder-path',
          blurb: 'Whose move each capability is on, and what the platform owes each builder.',
          section: 'program',
          stat: 'The gap board: screens owed and scope sheets owed',
        },
      ],
    },
  ];
}

export default function AgentDashboardPage() {
  const [domains, setDomains] = useState<AgentDomainRow[]>([]);
  const [domainKey, setDomainKey] = useState('');
  const [mine, setMine] = useState<ChangeRequest[]>([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [canProgram, setCanProgram] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [d, m] = await Promise.all([fetchMyDomains(), fetchMyChangeRequests()]);
        if (!alive) return;
        setDomains(d.domains);
        setNote(d.note ?? '');
        setMine(m);
        if (d.domains.length > 0) setDomainKey((k) => k || d.domains[0].domain_key);
      } catch (e) {
        if (alive) setError(errorMessage(e, 'Could not load your agents.'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  /**
   * Whether this viewer can open the `program` cards, answered by ASKING the API rather than by
   * reading a role off the token. A client-side role check is a second copy of the rule, and the
   * first time it disagrees with `mgmtSectionGate` the page is confidently wrong about what the
   * person can do. A 403 here is a real answer, not an error.
   */
  useEffect(() => {
    let alive = true;
    import('../../utils/api').then(({ default: api }) => api
      .get('/api/admin/agent-domain-capability-board', { params: { probe: 1 } })
      .then(() => { if (alive) setCanProgram(true); })
      .catch((e: { response?: { status?: number } }) => {
        if (alive) setCanProgram(e?.response?.status === 403 ? false : null);
      }));
    return () => { alive = false; };
  }, []);

  const domain = useMemo(
    () => domains.find((d) => d.domain_key === domainKey) ?? null,
    [domains, domainKey],
  );
  const groups = useMemo(() => buildGroups(domain, mine), [domain, mine]);
  // Split once, here, rather than filtering twice in the JSX: the two halves answer different
  // questions and are laid out differently, so the render reads better when the split is named.
  const agentGroups = useMemo(() => groups.filter((g) => !g.ownerOnly), [groups]);
  const ownerGroups = useMemo(() => groups.filter((g) => g.ownerOnly), [groups]);

  const openCount = mine.filter((r) => r.status === 'submitted').length;

  return (
    <>
      {/*
        The agent bar, in the same place and the same shape as Marketing's brand bar: one strip
        above everything, holding the scope, so no card below has to ask for it again.
      */}
      <div
        className="d-flex flex-wrap align-items-center gap-2 px-3 py-2 border-bottom bg-light"
        data-testid="agent-scope-bar"
      >
        <label className="form-label small text-muted mb-0" htmlFor="agent-scope">Agent</label>
        <select
          id="agent-scope"
          className="form-select form-select-sm"
          style={{ maxWidth: '22rem' }}
          value={domainKey}
          disabled={loading || domains.length === 0}
          onChange={(e) => setDomainKey(e.target.value)}
          data-testid="agent-scope-select"
        >
          {domains.length === 0 && <option value="">No agent is assigned to you</option>}
          {domains.map((d) => (
            <option key={d.domain_key} value={d.domain_key}>
              {d.domain_key}{d.agent_display_name ? ` · ${d.agent_display_name}` : ''}
            </option>
          ))}
        </select>
        {domainKey && (
          <span className="small text-muted d-none d-md-inline">
            Everything below is this agent only.
          </span>
        )}
      </div>

      {/* AF12.2: matches the sidebar, which now says "Agents". A row and the page it opens
          disagreeing on their own name is a small thing that makes a surface feel unowned. */}
      <PageHeader title="Agents" />

      {loading && (
        <SectionCard>
          <div className="d-flex align-items-center gap-2 text-muted small">
            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
            Loading your agents…
          </div>
        </SectionCard>
      )}

      {error && (
        <SectionCard>
          <div className="text-danger small" data-testid="agent-dashboard-error">{error}</div>
        </SectionCard>
      )}

      {/*
        An empty list is not a failure, and the API says WHY it is empty. Rendering the reason
        is the difference between "you have no agent yet" and a page that looks broken.
      */}
      {!loading && !error && domains.length === 0 && (
        <SectionCard>
          <div className="small" data-testid="agent-dashboard-empty">
            <div className="fw-semibold mb-1">No agent is assigned to you yet.</div>
            <div className="text-muted">{note || 'Nothing is wrong. Ask Ali which domain is yours.'}</div>
          </div>
        </SectionCard>
      )}

      {!loading && !error && domains.length > 0 && (
        <>
          <AgentDashboardWalkthrough domainKey={domainKey} />

          <div className="row g-3 mb-1" data-testid="agent-dashboard-kpis">
            <Kpi value={String(domain?.stories ?? 0)} label="Stories on the board"
              sub={`${domain?.stories_verified ?? 0} verified`} />
            <Kpi value={String(openCount)} label="Waiting on a decision"
              sub={openCount === 0 ? 'Nothing is in the queue' : 'Filed by you'} />
            <Kpi value={String(domain?.build_authorizations ?? 0)} label="Build authorizations"
              sub="A grant is a separate record from an approval" />
          </div>

          <div className="row g-3" data-testid="agent-dashboard-groups">
            {agentGroups.map((g) => (
              <div className="col-lg-4" key={g.key}>
                <div className="text-uppercase small fw-bold text-primary mb-1">{g.title}</div>
                <div className="small text-muted mb-2">{g.definition}</div>
                {g.cards.map((c) => (
                  <HubCardView
                    key={c.key}
                    card={c}
                    blocked={c.section === 'program' && canProgram === false}
                  />
                ))}
              </div>
            ))}
          </div>

        </>
      )}

      {/*
        AF12.2. Full width and BELOW the three, because it is a different question: those are
        about the agent in the strip, this one is about all ten.

        OUTSIDE the `domains.length > 0` block, and that placement is the entire point.

        AF12.15b, 21 Nov 2026, reported by Ali with a screenshot of his own empty page. This
        shipped INSIDE that block, so a viewer with no agent assigned to them got the "No agent
        is assigned to you yet" card AND NOTHING ELSE. All Domains and Builder Path had just
        lost their sidebar rows in the same change, so for that viewer they became unreachable
        from the UI altogether: the rail no longer carried them and the only page that did
        refused to draw them. A nav consolidation that can hide a page is the failure the
        restatement work existed to prevent, and it was caught on the route and missed on the
        page.

        The group is NOT about the viewer's own agent. It is the ten domains read two ways, so
        an empty personal list is no reason to withhold it. The only thing that may gate it is
        the `program` section, below.

        Rendered on `canProgram === true` and not on `!== false`, which is the opposite of the
        per-card rule above, deliberately. A card that guesses wrong is already on the page and
        says so; a GROUP that guesses wrong hands a builder two live links the API will refuse,
        which is precisely what `adminNav.ts` warns about. Guessing wrong the other way costs an
        owner one refresh.
      */}
      {!loading && !error && ownerGroups.length > 0 && canProgram === true && ownerGroups.map((g) => (
        <div className="mt-4" key={g.key} data-testid={`agent-dashboard-group-${g.key}`}>
          <div className="text-uppercase small fw-bold text-primary mb-1">{g.title}</div>
          <div className="small text-muted mb-2">{g.definition}</div>
          <div className="row g-3">
            {g.cards.map((c) => (
              <div className="col-lg-4" key={c.key}>
                <HubCardView card={c} blocked={false} />
              </div>
            ))}
          </div>
        </div>
      ))}

      {/*
        The reporter, on its own route-independent mount. `brandLabel` carries the agent rather
        than a brand: the column is Marketing's and reusing it keeps one table of reports.
      */}
      <ReportAProblem
        brandLabel={domainKey || null}
        endpoint="/api/admin/agent-domain/bug-report"
        extra={{ area: 'agent-dashboard', domainKey }}
      />
    </>
  );
}

function Kpi({ value, label, sub }: { value: string; label: string; sub: string }) {
  return (
    <div className="col-md-4">
      <div className="card border-0 shadow-sm h-100">
        <div className="card-body p-3">
          <div className="fs-3 fw-bold text-primary">{value}</div>
          <div className="fw-semibold small">{label}</div>
          <div className="text-muted small">{sub}</div>
        </div>
      </div>
    </div>
  );
}

function HubCardView({ card, blocked }: { card: HubCard; blocked: boolean }) {
  const body = (
    <div className="card-body p-3">
      <div className="d-flex align-items-center gap-2 mb-1">
        <i className={`ri-${card.icon} text-primary`} aria-hidden="true" />
        <span className="fw-semibold">{card.label}</span>
        {card.notBuilt && <span className="badge bg-secondary">not built yet</span>}
        {blocked && <span className="badge bg-secondary">not yours to open</span>}
      </div>
      <div className="small text-muted">{card.blurb}</div>
      {card.stat && <div className="small mt-1">{card.stat}</div>}
      {blocked && (
        <div className="small text-muted mt-1">
          This one is for the person who decides requests. Nothing is wrong with your account.
        </div>
      )}
    </div>
  );

  if (blocked || card.notBuilt) {
    return (
      <div className="card border shadow-sm mb-2 bg-light" data-testid={`hub-card-${card.key}`}>
        {body}
      </div>
    );
  }
  return (
    <Link
      to={card.to}
      className="card border shadow-sm mb-2 text-decoration-none text-reset card-lift"
      data-testid={`hub-card-${card.key}`}
    >
      {body}
    </Link>
  );
}
