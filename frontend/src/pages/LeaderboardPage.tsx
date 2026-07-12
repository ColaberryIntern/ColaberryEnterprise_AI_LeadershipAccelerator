import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SEOHead from '../components/SEOHead';
import { Button, ButtonProps } from '../colaberry/components/core/Button';
import { Badge } from '../colaberry/components/core/Badge';
import { Card } from '../colaberry/components/core/Card';
import { Avatar } from '../colaberry/components/core/Avatar';
import { Progress } from '../colaberry/components/core/Progress';
import { Table } from '../colaberry/components/core/Table';
import { fetchLeaderboard, ApiLeaderboardRow } from '../services/challengeApi';

// CtaButton: the DS Button only forwards href + on* handlers to its host
// element (it drops React Router's `to`), so we route via href + onClick —
// a real anchor for crawlers/focus, client-side nav without a full reload.
interface CtaButtonProps extends Omit<ButtonProps, 'href' | 'onClick'> {
  to: string;
}
function CtaButton({ to, children, ...rest }: CtaButtonProps) {
  const navigate = useNavigate();
  return (
    <Button
      href={to}
      onClick={(e: React.MouseEvent<HTMLElement>) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </Button>
  );
}

// LeaderboardPage — /leaderboard
// DS-only, semantic tokens only. Reads the live GET /api/challenge/leaderboard
// (via services/challengeApi) with a loading state, and GRACEFULLY FALLS BACK
// to the sample rows below on error, empty board, or pre-migration (no
// challenge id configured) so the page never looks broken. The LeaderRow shape
// below is the page's view model; mapApiRow() adapts the API contract to it.

const CSS = `
.cblb-root{font-family:var(--font-body);color:var(--text-body);background:var(--surface-page);line-height:var(--lh-relaxed);-webkit-font-smoothing:antialiased}
.cblb-root *{box-sizing:border-box}
.cb-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.cblb-root h1,.cblb-root h2,.cblb-root h3{font-family:var(--font-display);color:var(--text-strong);margin:0;line-height:var(--lh-heading);letter-spacing:var(--ls-tight)}
.cblb-wrap{max-width:var(--container-lg);margin:0 auto;padding:0 var(--space-6)}
.cblb-eyebrow{font-size:var(--fs-overline);font-weight:var(--fw-bold);letter-spacing:var(--ls-overline);text-transform:uppercase;color:var(--brand-accent)}

/* HEADER */
.cblb-head{background:var(--surface-inverse);color:var(--text-on-inverse);padding:var(--space-16) 0 var(--space-12)}
.cblb-head h1{color:var(--text-on-inverse);font-size:var(--fs-h1);max-width:18ch}
.cblb-head .cblb-eyebrow{color:var(--red-300)}
.cblb-head p{color:var(--neutral-300);max-width:58ch;margin-top:var(--space-4)}
.cblb-head-row{display:flex;justify-content:space-between;align-items:flex-end;gap:var(--space-8);flex-wrap:wrap}
.cblb-season-pill{display:inline-flex;align-items:center;gap:var(--space-2);font-size:var(--fs-caption);color:var(--neutral-300);background:rgba(255,255,255,0.06);border:var(--border-1) solid var(--border-default);border-radius:var(--radius-pill);padding:var(--space-2) var(--space-4)}
.cblb-live{width:8px;height:8px;border-radius:var(--radius-circle);background:var(--status-success);box-shadow:0 0 0 4px color-mix(in srgb, var(--status-success) 30%, transparent)}

/* PODIUM */
.cblb-podium{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-5);margin-top:calc(-1 * var(--space-12));position:relative;z-index:1}
.cblb-pod{text-align:center;padding:var(--space-8) var(--space-6)}
.cblb-pod.first{transform:translateY(calc(-1 * var(--space-6)))}
.cblb-pod .rank{font-family:var(--font-display);font-weight:var(--fw-black);font-size:var(--fs-h2);line-height:1}
.cblb-pod.first .rank{color:var(--brand-accent)}
.cblb-pod .name{font-weight:var(--fw-bold);color:var(--text-strong);margin-top:var(--space-3)}
.cblb-pod .org{font-size:var(--fs-caption);color:var(--text-muted)}
.cblb-pod .pts{font-family:var(--font-display);font-weight:var(--fw-black);font-size:var(--fs-h4);color:var(--text-strong);margin-top:var(--space-3)}
.cblb-pod .pts span{font-size:var(--fs-caption);font-weight:var(--fw-regular);color:var(--text-muted)}
.cblb-pod .av{display:flex;justify-content:center;margin-bottom:var(--space-3)}

/* CONTROLS */
.cblb-controls{display:flex;gap:var(--space-3);flex-wrap:wrap;margin:var(--space-12) 0 var(--space-5)}
.cblb-tab{font:inherit;font-size:var(--fs-body-sm);font-weight:var(--fw-medium);cursor:pointer;border:var(--border-1) solid var(--border-default);background:var(--surface-card);color:var(--text-body);border-radius:var(--radius-pill);padding:var(--space-2) var(--space-5);transition:all var(--dur-fast) var(--ease-out)}
.cblb-tab:hover{border-color:var(--border-strong);color:var(--text-strong)}
.cblb-tab[aria-pressed="true"]{background:var(--surface-inverse);color:var(--text-on-inverse);border-color:var(--surface-inverse)}
.cblb-tab:focus-visible{outline:none;box-shadow:var(--focus-ring)}

/* TABLE CELLS */
.cblb-rankcell{display:inline-flex;align-items:center;gap:var(--space-2);font-family:var(--font-display);font-weight:var(--fw-black);color:var(--text-strong);font-size:var(--fs-body-lg);min-width:var(--space-10)}
.cblb-delta{font-size:var(--fs-caption);font-weight:var(--fw-bold)}
.cblb-delta.up{color:var(--status-success)}
.cblb-delta.down{color:var(--status-danger)}
.cblb-delta.flat{color:var(--text-subtle)}
.cblb-builder{display:flex;align-items:center;gap:var(--space-3);min-width:0}
.cblb-builder .meta{min-width:0}
.cblb-builder .nm{font-weight:var(--fw-bold);color:var(--text-strong)}
.cblb-builder .og{font-size:var(--fs-caption);color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cblb-progcell{min-width:140px}
.cblb-ptscell{font-family:var(--font-display);font-weight:var(--fw-black);color:var(--text-strong);font-size:var(--fs-body-lg)}

/* NOTE */
.cblb-note{margin-top:var(--space-6);font-size:var(--fs-caption);color:var(--text-subtle)}

/* LOADING */
.cblb-loading{display:flex;align-items:center;justify-content:center;gap:var(--space-3);padding:var(--space-12) var(--space-6);color:var(--text-muted);font-size:var(--fs-body-sm)}
.cblb-spin{width:18px;height:18px;border-radius:var(--radius-circle);border:2px solid var(--border-default);border-top-color:var(--brand-accent);animation:cblb-spin 0.8s linear infinite}
@keyframes cblb-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.cblb-spin{animation-duration:1.6s}}

/* CTA */
.cblb-cta{background:var(--surface-subtle);border-radius:var(--radius-xl);padding:var(--space-12);text-align:center;margin:var(--space-16) 0}
.cblb-cta h2{font-size:var(--fs-h2);max-width:20ch;margin:0 auto var(--space-4)}
.cblb-cta p{color:var(--text-muted);max-width:52ch;margin:0 auto var(--space-8)}
.cblb-cta-row{display:flex;gap:var(--space-4);justify-content:center;flex-wrap:wrap}

@media(max-width:820px){
  .cblb-podium{grid-template-columns:1fr;margin-top:var(--space-8)}
  .cblb-pod.first{transform:none}
  .cblb-progcell{display:none}
}
`;

type TierName = 'Gold' | 'Silver' | 'Bronze';

interface LeaderRow {
  rank: number;
  name: string;
  org: string;
  scope: 'public' | 'company';
  tier: TierName;
  points: number;
  builds: number;
  streak: number;
  delta: number; // rank change vs last week; + = climbed
  avatar?: string;
}

const TIER_MAX = 600; // points ceiling used for the progress bar fill

// Realistic sample data. Replace with GET /api/challenge/leaderboard.
const ROWS: LeaderRow[] = [
  { rank: 1, name: 'Priya Nandakumar', org: 'Meridian Freight', scope: 'company', tier: 'Gold', points: 540, builds: 9, streak: 11, delta: 1 },
  { rank: 2, name: 'Marcus Bell', org: 'Self-funded', scope: 'public', tier: 'Gold', points: 512, builds: 8, streak: 10, delta: 2 },
  { rank: 3, name: 'Sofia Alvarez', org: 'Northstar Utilities', scope: 'company', tier: 'Gold', points: 505, builds: 8, streak: 9, delta: -2 },
  { rank: 4, name: 'David Okafor', org: 'Self-funded', scope: 'public', tier: 'Silver', points: 468, builds: 7, streak: 8, delta: 0 },
  { rank: 5, name: 'Hannah Liu', org: 'Cedar Health Group', scope: 'company', tier: 'Silver', points: 441, builds: 7, streak: 7, delta: 3 },
  { rank: 6, name: 'Andre Petrov', org: 'Self-funded', scope: 'public', tier: 'Silver', points: 410, builds: 6, streak: 6, delta: -1 },
  { rank: 7, name: 'Grace Mwangi', org: 'Meridian Freight', scope: 'company', tier: 'Silver', points: 388, builds: 6, streak: 5, delta: 1 },
  { rank: 8, name: 'Tyler Brooks', org: 'Self-funded', scope: 'public', tier: 'Silver', points: 352, builds: 5, streak: 6, delta: 4 },
  { rank: 9, name: 'Lena Fischer', org: 'Northstar Utilities', scope: 'company', tier: 'Silver', points: 319, builds: 5, streak: 4, delta: -3 },
  { rank: 10, name: 'Omar Haddad', org: 'Self-funded', scope: 'public', tier: 'Silver', points: 287, builds: 4, streak: 5, delta: 0 },
  { rank: 11, name: 'Beatriz Santos', org: 'Cedar Health Group', scope: 'company', tier: 'Silver', points: 241, builds: 4, streak: 3, delta: 2 },
  { rank: 12, name: 'Jordan Reyes', org: 'Self-funded', scope: 'public', tier: 'Bronze', points: 188, builds: 3, streak: 4, delta: 5 },
];

const tierTone = (t: TierName): 'warning' | 'neutral' | 'red' =>
  t === 'Gold' ? 'red' : t === 'Silver' ? 'neutral' : 'warning';

// Capitalize the API's lowercase tier into the page's TierName union. Unknown
// values fall back to Bronze so a contract drift never renders an undefined tier.
const TIER_FROM_API: Record<string, TierName> = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };

// Adapt one API row to the page's view model. The API contract carries identity,
// score, tier, projects, and cert; it does not (yet) carry per-row scope, rank
// delta, or streak. We derive scope from company presence ("Self-funded" / blank
// = individual/public; a named employer = sponsored/company) and leave delta and
// streak neutral until the endpoint exposes them, so the UI degrades cleanly
// rather than inventing movement that did not happen.
function mapApiRow(r: ApiLeaderboardRow): LeaderRow {
  const company = (r.company || '').trim();
  const isPublic = company === '' || /^self[\s-]?funded$/i.test(company);
  return {
    rank: r.rank,
    name: r.full_name,
    org: isPublic ? 'Self-funded' : company,
    scope: isPublic ? 'public' : 'company',
    tier: TIER_FROM_API[r.tier] ?? 'Bronze',
    points: r.score,
    builds: r.projects_shipped,
    streak: 0,
    delta: 0,
  };
}

function Delta({ value }: { value: number }) {
  if (value === 0) {
    return (
      <span className="cblb-delta flat" title="No change">
        <span aria-hidden="true">—</span>
        <span className="cb-sr-only">No change since last week</span>
      </span>
    );
  }
  const up = value > 0;
  const n = Math.abs(value);
  return (
    <span className={`cblb-delta ${up ? 'up' : 'down'}`}>
      <span aria-hidden="true">{up ? '▲' : '▼'}{n}</span>
      <span className="cb-sr-only">{`${up ? 'Up' : 'Down'} ${n} ${n === 1 ? 'place' : 'places'} since last week`}</span>
    </span>
  );
}

type ScopeFilter = 'public' | 'company';

function LeaderboardPage() {
  const [scope, setScope] = useState<ScopeFilter>('public');
  // live = rows returned by the API; null = "no live data, use sample". loading
  // gates the first paint per scope so we never flash sample → live.
  const [live, setLive] = useState<LeaderRow[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Fetch the live board whenever scope changes. The page's "Sponsored teams"
  // tab maps to the API's company scope; "Global" maps to global. Any failure,
  // empty board, or unconfigured-challenge result clears live → sample fallback.
  // AbortController cancels an in-flight request if the scope changes again.
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    fetchLeaderboard(scope === 'company' ? 'company' : 'global', controller.signal)
      .then((result) => {
        if (!active) return;
        setLive(result.ok ? result.rows.map(mapApiRow) : null);
        setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [scope]);

  // True when we are showing the built-in sample set rather than live API rows.
  const usingSample = live === null;

  const rows = useMemo(() => {
    // Live rows already arrive scoped + ranked from the API; sample rows are
    // client-filtered by scope exactly as before. Re-derive a contiguous
    // displayRank so the visible 1..N is dense after filtering either source.
    const source = live ?? (scope === 'company' ? ROWS.filter((r) => r.scope === 'company') : ROWS);
    return source.map((r, i) => ({ ...r, displayRank: i + 1 }));
  }, [live, scope]);

  const podium = rows.slice(0, 3);

  const columns = [
    {
      key: 'displayRank',
      header: 'Rank',
      render: (_v: number, row: LeaderRow & { displayRank: number }) => (
        <span className="cblb-rankcell">
          {row.displayRank}
          <Delta value={row.delta} />
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Builder',
      render: (_v: string, row: LeaderRow) => (
        <span className="cblb-builder">
          <Avatar name={row.name} src={row.avatar} size="sm" ring={row.tier === 'Gold'} />
          <span className="meta cb-min0">
            <span className="nm">{row.name}</span>
            <span className="og">{row.org}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'tier',
      header: 'Tier',
      render: (_v: TierName, row: LeaderRow) => (
        <Badge tone={tierTone(row.tier)} dot>{row.tier}</Badge>
      ),
    },
    {
      key: 'builds',
      header: 'Builds',
      align: 'right' as const,
      render: (v: number) => <span>{v}</span>,
    },
    {
      key: 'streak',
      header: 'Streak',
      align: 'right' as const,
      // Live API rows don't carry a streak yet (mapped to 0); show a neutral
      // dash with screen-reader text rather than a misleading "0w".
      render: (v: number) =>
        v > 0 ? (
          <span title={`${v}-week streak`}>{v}w</span>
        ) : (
          <span title="No active streak">
            <span aria-hidden="true">—</span>
            <span className="cb-sr-only">No active streak</span>
          </span>
        ),
    },
    {
      key: 'progress',
      header: 'To next tier',
      render: (_v: unknown, row: LeaderRow) => (
        <span
          className="cblb-progcell"
          style={{ display: 'inline-block' }}
          aria-label={`${row.points} of ${TIER_MAX} points toward next tier`}
        >
          <Progress
            value={row.points}
            max={TIER_MAX}
            tone={row.tier === 'Gold' ? 'red' : row.tier === 'Silver' ? 'blue' : 'green'}
          />
        </span>
      ),
    },
    {
      key: 'points',
      header: 'Points',
      align: 'right' as const,
      render: (v: number) => <span className="cblb-ptscell">{v.toLocaleString()}</span>,
    },
  ];

  return (
    <div className="cblb-root">
      <style>{CSS}</style>
      <SEOHead
        title="Leaderboard"
        description="The live Colaberry AI Challenge leaderboard. See who is shipping, climbing tiers, and earning their spot at Demo Day."
      />

      {/* HEADER */}
      <header className="cblb-head">
        <div className="cblb-wrap">
          <div className="cblb-head-row">
            <div>
              <div className="cblb-eyebrow">The Challenge</div>
              <h1 className="cb-balance" style={{ marginTop: 'var(--space-3)' }}>Who is actually building right now?</h1>
              <p>
                Points are earned by shipping, not watching. This is the live ranking of every builder in the
                current season. Climb it on your own time.
              </p>
            </div>
            <span className="cblb-season-pill"><span className="cblb-live" aria-hidden /> Season 3 · Live</span>
          </div>
        </div>
      </header>

      {/* PODIUM */}
      <section className="cblb-wrap">
        <div className="cblb-podium" aria-busy={loading}>
          {/* Hidden until the first fetch resolves so the top 3 don't flash
              sample → live. The table region shows the loading status text. */}
          {!loading && podium.map((p, i) => (
            <Card key={p.name} elevation={i === 0 ? 'md' : 'sm'} accent={i === 0 ? 'red' : undefined} className={`cblb-pod ${i === 0 ? 'first' : ''}`}>
              <div className="av"><Avatar name={p.name} size="lg" ring={i === 0} /></div>
              <div className="rank">
                <span aria-hidden="true">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                <span className="cb-sr-only">{`Rank ${i + 1}`}</span>
              </div>
              <div className="name">{p.name}</div>
              <div className="org">{p.org}</div>
              <div className="pts">{p.points.toLocaleString()} <span>pts</span></div>
            </Card>
          ))}
        </div>
      </section>

      {/* TABLE */}
      <section className="cblb-wrap" style={{ paddingBottom: 'var(--space-12)' }}>
        <div className="cblb-controls" role="group" aria-label="Leaderboard scope">
          <button type="button" className="cblb-tab" aria-pressed={scope === 'public'} onClick={() => setScope('public')}>
            Global leaderboard
          </button>
          <button type="button" className="cblb-tab" aria-pressed={scope === 'company'} onClick={() => setScope('company')}>
            Sponsored teams
          </button>
        </div>

        <div aria-busy={loading} aria-live="polite">
          {loading ? (
            <div className="cblb-loading" role="status">
              <span className="cblb-spin" aria-hidden="true" />
              Loading the live leaderboard…
            </div>
          ) : (
            <Table columns={columns} data={rows} hover striped />
          )}
        </div>

        {!loading && (
          <p className="cblb-note">
            Showing the top {rows.length} of the current season. Rank deltas compare to last week. Sponsored-team
            view filters to builders on employer-purchased seats; employers see only their own company-scoped board.
            {usingSample
              ? <> Live data is not available yet — showing a representative sample of <code>GET /api/challenge/leaderboard</code>.</>
              : <> Live data from <code>GET /api/challenge/leaderboard</code>.</>}
          </p>
        )}
      </section>

      {/* CTA */}
      <section className="cblb-wrap">
        <div className="cblb-cta">
          <Badge solid>Not on the board yet?</Badge>
          <h2 style={{ marginTop: 'var(--space-4)' }}>Ship one build this week and claim your rank.</h2>
          <p>
            Every builder here started at zero. Join the Challenge as an individual, or have your employer sponsor
            a seat, and your first shipped project puts your name on this list.
          </p>
          <div className="cblb-cta-row">
            <CtaButton to="/enroll" size="lg" trailingIcon={<span aria-hidden>→</span>}>
              Join the Challenge
            </CtaButton>
            <CtaButton to="/sponsorship" size="lg" variant="outline">
              Sponsor Your Team
            </CtaButton>
            <CtaButton to="/challenge" size="lg" variant="ghost">
              How scoring works
            </CtaButton>
          </div>
        </div>
      </section>
    </div>
  );
}

export default LeaderboardPage;
