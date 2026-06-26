import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SEOHead from '../components/SEOHead';
import api from '../utils/api';
import { Button, ButtonProps } from '../colaberry/components/core/Button';
import { Badge } from '../colaberry/components/core/Badge';
import { Card } from '../colaberry/components/core/Card';
import { Avatar } from '../colaberry/components/core/Avatar';
import { Progress } from '../colaberry/components/core/Progress';
import { Table } from '../colaberry/components/core/Table';
import { Skeleton } from '../colaberry/components/core/Skeleton';

// SponsorDashboardPage — /sponsor/dashboard (Door B: employer view).
// DS-only, semantic tokens only. Reads GET /api/sponsor/dashboard via the
// axios client with a graceful sample-data fallback so the page always
// renders something credible while the endpoint is wired. The shapes in
// SponsorDashboard / Participant below ARE the contract that endpoint returns.
//
// Strategy framing: corporate value is TALENT DISCOVERY, not training. The
// copy answers "who are my real AI builders?" — not "did people finish a course?"

// ----- CtaButton: route via href + onClick (DS Button drops RR's `to`) -----
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

// ----------------------------- Contract types -----------------------------
type TierName = 'Gold' | 'Silver' | 'Bronze' | 'Unranked';

interface Participant {
  rank: number;
  name: string;
  email: string;
  tier: TierName;
  points: number;
  projects: number;
  certified: boolean;
  demoDayCandidate: boolean;
  avatar?: string;
}

interface SponsorDashboard {
  company: string;
  season: string;
  seatsPurchased: number;
  seatsRedeemed: number;
  seatsAvailable: number;
  seatsReassignable: number; // redeemed seats inactive long enough to reclaim
  tierMax: number; // points ceiling used for the progress fill
  participants: Participant[];
}

// ----------------------------- Sample fallback ----------------------------
// Realistic data shown only if the endpoint is unreachable. Mirrors the
// contract exactly so the live view drops in with no shape changes.
const SAMPLE: SponsorDashboard = {
  company: 'Meridian Freight',
  season: 'Season 3',
  seatsPurchased: 25,
  seatsRedeemed: 19,
  seatsAvailable: 6,
  seatsReassignable: 3,
  tierMax: 600,
  participants: [
    { rank: 1, name: 'Priya Nandakumar', email: 'priya.n@meridianfreight.com', tier: 'Gold', points: 540, projects: 9, certified: true, demoDayCandidate: true },
    { rank: 2, name: 'Grace Mwangi', email: 'grace.m@meridianfreight.com', tier: 'Gold', points: 505, projects: 8, certified: true, demoDayCandidate: true },
    { rank: 3, name: 'Daniel Okonkwo', email: 'daniel.o@meridianfreight.com', tier: 'Silver', points: 472, projects: 7, certified: true, demoDayCandidate: true },
    { rank: 4, name: 'Hannah Liu', email: 'hannah.l@meridianfreight.com', tier: 'Silver', points: 441, projects: 7, certified: false, demoDayCandidate: false },
    { rank: 5, name: 'Marcus Bell', email: 'marcus.b@meridianfreight.com', tier: 'Silver', points: 398, projects: 6, certified: false, demoDayCandidate: false },
    { rank: 6, name: 'Sofia Alvarez', email: 'sofia.a@meridianfreight.com', tier: 'Silver', points: 352, projects: 5, certified: false, demoDayCandidate: false },
    { rank: 7, name: 'Tyler Brooks', email: 'tyler.b@meridianfreight.com', tier: 'Bronze', points: 244, projects: 4, certified: false, demoDayCandidate: false },
    { rank: 8, name: 'Lena Fischer', email: 'lena.f@meridianfreight.com', tier: 'Bronze', points: 188, projects: 3, certified: false, demoDayCandidate: false },
    { rank: 9, name: 'Omar Haddad', email: 'omar.h@meridianfreight.com', tier: 'Bronze', points: 121, projects: 2, certified: false, demoDayCandidate: false },
    { rank: 10, name: 'Beatriz Santos', email: 'beatriz.s@meridianfreight.com', tier: 'Unranked', points: 40, projects: 1, certified: false, demoDayCandidate: false },
  ],
};

const tierTone = (t: TierName): 'red' | 'neutral' | 'warning' =>
  t === 'Gold' ? 'red' : t === 'Silver' ? 'neutral' : 'warning';

const progressTone = (t: TierName): 'red' | 'blue' | 'green' =>
  t === 'Gold' ? 'red' : t === 'Silver' ? 'blue' : 'green';

// ------------------------------- Styles -----------------------------------
const CSS = `
.cbsd-root{font-family:var(--font-body);color:var(--text-body);background:var(--surface-page);line-height:var(--lh-relaxed);-webkit-font-smoothing:antialiased}
.cbsd-root *{box-sizing:border-box}
.cb-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.cbsd-root h1,.cbsd-root h2,.cbsd-root h3{font-family:var(--font-display);color:var(--text-strong);margin:0;line-height:var(--lh-heading);letter-spacing:var(--ls-tight)}
.cbsd-wrap{max-width:var(--container-lg);margin:0 auto;padding:0 var(--space-6)}
.cbsd-eyebrow{font-size:var(--fs-overline);font-weight:var(--fw-bold);letter-spacing:var(--ls-overline);text-transform:uppercase;color:var(--brand-accent)}

/* HEADER */
.cbsd-head{background:var(--surface-inverse);color:var(--text-on-inverse);padding:var(--space-16) 0 var(--space-12)}
.cbsd-head h1{color:var(--text-on-inverse);font-size:var(--fs-h1);max-width:20ch}
.cbsd-head .cbsd-eyebrow{color:var(--red-300)}
.cbsd-head p{color:var(--neutral-300);max-width:60ch;margin-top:var(--space-4)}
.cbsd-head-row{display:flex;justify-content:space-between;align-items:flex-end;gap:var(--space-8);flex-wrap:wrap}
.cbsd-season-pill{display:inline-flex;align-items:center;gap:var(--space-2);font-size:var(--fs-caption);color:var(--neutral-300);background:rgba(255,255,255,0.06);border:var(--border-1) solid var(--border-default);border-radius:var(--radius-pill);padding:var(--space-2) var(--space-4)}
.cbsd-live{width:8px;height:8px;border-radius:var(--radius-circle);background:var(--status-success);box-shadow:0 0 0 4px color-mix(in srgb, var(--status-success) 30%, transparent)}

/* STAT CARDS */
.cbsd-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:var(--space-5);margin-top:calc(-1 * var(--space-10));position:relative;z-index:1}
.cbsd-stat{padding:var(--space-6)}
.cbsd-stat .label{font-size:var(--fs-caption);font-weight:var(--fw-bold);letter-spacing:var(--ls-overline);text-transform:uppercase;color:var(--text-muted)}
.cbsd-stat .value{font-family:var(--font-display);font-weight:var(--fw-black);font-size:var(--fs-h2);line-height:1;color:var(--text-strong);margin-top:var(--space-3)}
.cbsd-stat .hint{font-size:var(--fs-caption);color:var(--text-subtle);margin-top:var(--space-2)}
.cbsd-stat.accent .value{color:var(--brand-accent)}

/* SECTION HEADERS */
.cbsd-sec{margin:var(--space-12) 0 var(--space-5)}
.cbsd-sec h2{font-size:var(--fs-h3)}
.cbsd-sec p{color:var(--text-muted);max-width:64ch;margin-top:var(--space-2)}

/* DEMO DAY HIGHLIGHT */
.cbsd-dd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:var(--space-4)}
.cbsd-dd-card{display:flex;align-items:center;gap:var(--space-3);padding:var(--space-5);min-width:0}
.cbsd-dd-card .meta{min-width:0}
.cbsd-dd-card .nm{font-weight:var(--fw-bold);color:var(--text-strong);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cbsd-dd-card .sub{font-size:var(--fs-caption);color:var(--text-muted)}
.cbsd-dd-empty{padding:var(--space-8);text-align:center;color:var(--text-muted)}

/* TABLE CELLS */
.cbsd-rankcell{display:inline-flex;align-items:center;font-family:var(--font-display);font-weight:var(--fw-black);color:var(--text-strong);font-size:var(--fs-body-lg);min-width:var(--space-8)}
.cbsd-builder{display:flex;align-items:center;gap:var(--space-3);min-width:0}
.cbsd-builder .meta{min-width:0}
.cbsd-builder .nm{font-weight:var(--fw-bold);color:var(--text-strong)}
.cbsd-builder .og{font-size:var(--fs-caption);color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cbsd-progcell{min-width:140px;display:inline-block}
.cbsd-ptscell{font-family:var(--font-display);font-weight:var(--fw-black);color:var(--text-strong);font-size:var(--fs-body-lg)}
.cbsd-cert-yes{color:var(--green-700);font-weight:var(--fw-bold)}
.cbsd-cert-no{color:var(--text-subtle)}

/* NOTE + CTA */
.cbsd-note{margin-top:var(--space-6);font-size:var(--fs-caption);color:var(--text-subtle)}
.cbsd-cta{background:var(--surface-subtle);border-radius:var(--radius-xl);padding:var(--space-12);text-align:center;margin:var(--space-16) 0}
.cbsd-cta h2{font-size:var(--fs-h2);max-width:22ch;margin:0 auto var(--space-4)}
.cbsd-cta p{color:var(--text-muted);max-width:54ch;margin:0 auto var(--space-8)}
.cbsd-cta-row{display:flex;gap:var(--space-4);justify-content:center;flex-wrap:wrap}

@media(max-width:980px){.cbsd-stats{grid-template-columns:repeat(2,1fr);margin-top:var(--space-8)}}
@media(max-width:680px){.cbsd-stats{grid-template-columns:1fr}.cbsd-progcell{display:none}}
`;

// --------------------------- Loading skeleton -----------------------------
function StatsSkeleton() {
  return (
    <div className="cbsd-stats" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} className="cbsd-stat">
          <Skeleton variant="text" width="60%" height={12} />
          <div style={{ marginTop: 'var(--space-3)' }}>
            <Skeleton variant="text" width="40%" height={32} />
          </div>
          <div style={{ marginTop: 'var(--space-2)' }}>
            <Skeleton variant="text" width="80%" height={10} />
          </div>
        </Card>
      ))}
    </div>
  );
}

// ------------------------------ Component ---------------------------------
function SponsorDashboardPage() {
  const [data, setData] = useState<SponsorDashboard | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [usingSample, setUsingSample] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .get<SponsorDashboard>('/api/sponsor/dashboard')
      .then((res) => {
        if (!active) return;
        const payload = res.data;
        // Validate the contract at the boundary; fall back if it's malformed.
        if (payload && Array.isArray(payload.participants)) {
          setData(payload);
          setUsingSample(false);
        } else {
          setData(SAMPLE);
          setUsingSample(true);
        }
      })
      .catch(() => {
        // Graceful degradation — never show an empty page to a sponsor.
        if (!active) return;
        setData(SAMPLE);
        setUsingSample(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const view = data ?? SAMPLE;
  const tierMax = view.tierMax || 600;

  const candidates = useMemo(
    () => view.participants.filter((p) => p.demoDayCandidate),
    [view.participants]
  );

  const certifiedCount = useMemo(
    () => view.participants.filter((p) => p.certified).length,
    [view.participants]
  );

  const columns = [
    {
      key: 'rank',
      header: 'Rank',
      render: (v: number) => <span className="cbsd-rankcell">{v}</span>,
    },
    {
      key: 'name',
      header: 'Participant',
      render: (_v: string, row: Participant) => (
        <span className="cbsd-builder">
          <Avatar name={row.name} src={row.avatar} size="sm" ring={row.tier === 'Gold'} />
          <span className="meta cb-min0">
            <span className="nm">{row.name}</span>
            <span className="og">{row.email}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'tier',
      header: 'Tier',
      render: (_v: TierName, row: Participant) =>
        row.tier === 'Unranked' ? (
          <Badge tone="neutral">Unranked</Badge>
        ) : (
          <Badge tone={tierTone(row.tier)} dot>
            {row.tier}
          </Badge>
        ),
    },
    {
      key: 'points',
      header: 'Points',
      render: (_v: number, row: Participant) => (
        <span
          className="cbsd-progcell"
          aria-label={`${row.points} of ${tierMax} points toward next tier`}
        >
          <Progress value={row.points} max={tierMax} tone={progressTone(row.tier)} />
        </span>
      ),
    },
    {
      key: 'projects',
      header: 'Projects',
      align: 'right' as const,
      render: (v: number) => <span title={`${v} shipped`}>{v}</span>,
    },
    {
      key: 'certified',
      header: 'Cert',
      align: 'right' as const,
      render: (_v: boolean, row: Participant) =>
        row.certified ? (
          <span className="cbsd-cert-yes">
            <span aria-hidden="true">✓</span>
            <span className="cb-sr-only">Certified</span>
          </span>
        ) : (
          <span className="cbsd-cert-no">
            <span aria-hidden="true">—</span>
            <span className="cb-sr-only">Not yet certified</span>
          </span>
        ),
    },
  ];

  return (
    <div className="cbsd-root">
      <style>{CSS}</style>
      <SEOHead
        title="Sponsor Dashboard"
        description="See who your real AI builders are. Track seats, tiers, shipped projects, and Demo Day candidates across your sponsored team — without taking anyone off the job."
      />

      {/* HEADER */}
      <header
        className="cbsd-head"
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: 'var(--surface-inverse)',
          color: 'var(--text-on-inverse)',
          padding: 'var(--space-24) var(--space-5) var(--space-16)',
        }}
      >
        {/* Hero photo + dark overlay (decorative) */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            backgroundImage:
              "linear-gradient(180deg, color-mix(in srgb, var(--surface-inverse) 74%, transparent), color-mix(in srgb, var(--surface-inverse) 93%, transparent)), url('/img/data-dashboard.jpg')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div className="cbsd-wrap" style={{ position: 'relative', zIndex: 1 }}>
          <div className="cbsd-head-row">
            <div>
              <div className="cbsd-eyebrow" style={{ color: 'var(--text-on-inverse)', opacity: 0.85 }}>
                Sponsor Dashboard
              </div>
              <h1 className="cb-balance" style={{ marginTop: 'var(--space-3)', color: 'var(--text-on-inverse)' }}>
                {view.company}: find out who your real AI builders are.
              </h1>
              <p style={{ color: 'var(--text-on-inverse)', opacity: 0.88 }}>
                Every seat you sponsor puts a colleague in the same Challenge as everyone else — they learn on
                their own time and ship real projects. This is where you watch the talent surface, without taking
                anyone off the job.
              </p>
            </div>
            <span className="cbsd-season-pill">
              <span className="cbsd-live" aria-hidden /> {view.season} · Live
            </span>
          </div>
        </div>
      </header>

      {/* SEAT STAT CARDS */}
      <section className="cbsd-wrap" aria-label="Seat usage">
        {loading ? (
          <StatsSkeleton />
        ) : (
          <div className="cbsd-stats">
            <Card className="cbsd-stat" elevation="sm">
              <div className="label">Seats purchased</div>
              <div className="value">{view.seatsPurchased}</div>
              <div className="hint">Annual seats on your plan</div>
            </Card>
            <Card className="cbsd-stat" elevation="sm">
              <div className="label">Seats redeemed</div>
              <div className="value">{view.seatsRedeemed}</div>
              <div className="hint">Codes claimed by your team</div>
            </Card>
            <Card className="cbsd-stat" elevation="sm" accent="green">
              <div className="label">Available</div>
              <div className="value">{view.seatsAvailable}</div>
              <div className="hint">Unassigned — ready to invite</div>
            </Card>
            <Card className="cbsd-stat accent" elevation="sm" accent="red">
              <div className="label">Reassignable</div>
              <div className="value">{view.seatsReassignable}</div>
              <div className="hint">Inactive seats you can reclaim</div>
            </Card>
          </div>
        )}
      </section>

      {/* DEMO DAY CANDIDATES */}
      <section className="cbsd-wrap">
        <div className="cbsd-sec">
          <Badge solid>Demo Day candidates</Badge>
          <h2 style={{ marginTop: 'var(--space-3)' }}>Your standouts, ready to present.</h2>
          <p>
            These builders have shipped enough, climbed high enough, and certified — they are the people to put on
            stage at Demo Day. This is talent discovery in action: proof of who can actually build with AI.
          </p>
        </div>

        {loading ? (
          <div className="cbsd-dd-grid" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <Card key={i} className="cbsd-dd-card">
                <Skeleton variant="circle" width={40} height={40} />
                <span className="meta cb-min0" style={{ flex: 1 }}>
                  <Skeleton variant="text" width="70%" />
                  <Skeleton variant="text" width="45%" height={10} />
                </span>
              </Card>
            ))}
          </div>
        ) : candidates.length > 0 ? (
          <div className="cbsd-dd-grid">
            {candidates.map((p) => (
              <Card key={p.email} className="cbsd-dd-card" elevation="sm" hoverable accent="red">
                <Avatar name={p.name} src={p.avatar} size="md" ring />
                <span className="meta cb-min0">
                  <span className="nm">{p.name}</span>
                  <span className="sub">
                    {p.points.toLocaleString()} pts · {p.projects} {p.projects === 1 ? 'project' : 'projects'}
                  </span>
                </span>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="cbsd-dd-empty" elevation="sm">
            No Demo Day candidates yet. As your team ships projects and certifies, standouts will surface here.
          </Card>
        )}
      </section>

      {/* PARTICIPANTS TABLE */}
      <section className="cbsd-wrap" style={{ paddingBottom: 'var(--space-12)' }}>
        <div className="cbsd-sec">
          <h2>Your sponsored team</h2>
          <p>
            {certifiedCount} of {view.participants.length} active builders certified so far. Ranked by points
            earned in {view.season}. Points come from shipping, not watching.
          </p>
        </div>

        <Table columns={columns} data={view.participants} hover striped />

        <p className="cbsd-note">
          Company-scoped view — you see only builders on your purchased seats.{' '}
          {usingSample ? (
            <>Showing sample data; this view reads <code>GET /api/sponsor/dashboard</code> once the endpoint is live.</>
          ) : (
            <>Live from <code>GET /api/sponsor/dashboard</code>.</>
          )}
        </p>
      </section>

      {/* CTA */}
      <section className="cbsd-wrap">
        <div className="cbsd-cta">
          <Badge solid>Seats left to fill?</Badge>
          <h2 style={{ marginTop: 'var(--space-4)' }}>
            Every unassigned seat is a builder you haven&apos;t discovered yet.
          </h2>
          <p>
            Invite more of your team into the Challenge, or top up your plan. The more people you put in, the
            clearer the picture of who your real AI builders are.
          </p>
          <div className="cbsd-cta-row">
            <CtaButton to="/sponsorship" size="lg" trailingIcon={<span aria-hidden>→</span>}>
              Sponsor more seats
            </CtaButton>
            <CtaButton to="/leaderboard" size="lg" variant="outline">
              View the leaderboard
            </CtaButton>
            <CtaButton to="/demo-day" size="lg" variant="ghost">
              About Demo Day
            </CtaButton>
          </div>
        </div>
      </section>
    </div>
  );
}

export default SponsorDashboardPage;
