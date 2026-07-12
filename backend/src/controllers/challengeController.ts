import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import {
  Challenge,
  ChallengeParticipant,
  LeaderboardScore,
  Enrollment,
  Sponsor,
  SponsorSeat,
} from '../models';
import {
  buildRankableParticipant,
  rankParticipants,
  RankedParticipant,
} from '../services/challengeScoringService';

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

// Mirror the ZodError → 400 shape used by sponsorController / leadController so
// the public two-door API stays consistent.
function respondZodError(res: Response, error: ZodError): void {
  res.status(400).json({
    error: 'Validation failed',
    details: error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    })),
  });
}

// Sequelize throws when a table referenced by a query does not exist yet (the
// migrations that create challenges/leaderboard_scores have not run on every
// environment). The leaderboard and dashboard are read-only public surfaces, so
// a missing table degrades to "empty board" rather than a 500. We detect the
// Postgres "undefined_table" SQLSTATE (42P01) and the matching Sequelize error
// names so a not-yet-migrated DB returns graceful empties.
function isMissingTableError(error: unknown): boolean {
  const e = error as { name?: string; original?: { code?: string }; parent?: { code?: string } };
  if (!e) return false;
  const pgCode = e.original?.code || e.parent?.code;
  if (pgCode === '42P01') return true;
  return e.name === 'SequelizeDatabaseError' && /does not exist|no such table/i.test(String((error as Error).message || ''));
}

/* ------------------------------------------------------------------ */
/*  Door A + Door B — Challenge leaderboard                            */
/*  GET /api/challenge/leaderboard  (public, on leadRoutes)           */
/* ------------------------------------------------------------------ */

// scope=company returns the board for a single challenge (a sponsor's
// company-scoped challenge, the company leaderboard employees climb).
// scope=global ranks every participant in the named challenge regardless of
// company — the "Join the Challenge" public board. challenge_id is always
// required: the board is always rendered for one challenge at a time.
const leaderboardQuerySchema = z.object({
  challenge_id: z.string().trim().uuid('challenge_id must be a valid UUID'),
  scope: z.enum(['company', 'global']).optional().default('global'),
});

interface LeaderboardRow {
  rank: number;
  challenge_participant_id: string;
  enrollment_id: string;
  full_name: string;
  company: string;
  score: number;
  projects_shipped: number;
  cert_earned: boolean;
  tier: 'bronze' | 'silver' | 'gold';
}

interface LeaderboardResponse {
  challenge_id: string;
  scope: 'company' | 'global';
  count: number;
  rows: LeaderboardRow[];
}

// Shape of one participant row after the join. Sequelize returns nested
// instances under the `as` aliases declared in models/index.ts.
interface ParticipantWithJoins extends ChallengeParticipant {
  enrollment?: Enrollment | null;
  score?: LeaderboardScore | null;
}

export async function handleGetLeaderboard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  let query: z.infer<typeof leaderboardQuerySchema>;
  try {
    query = leaderboardQuerySchema.parse(req.query);
  } catch (error) {
    if (error instanceof ZodError) {
      respondZodError(res, error);
      return;
    }
    next(error);
    return;
  }

  try {
    // Confirm the challenge exists. A missing challenge returns an empty board
    // (200, []) rather than 404: the leaderboard is a public render surface and
    // an unknown id should not leak existence or break the page.
    const challenge = await Challenge.findByPk(query.challenge_id, {
      attributes: ['id', 'sponsor_id'],
    });
    if (!challenge) {
      const empty: LeaderboardResponse = {
        challenge_id: query.challenge_id,
        scope: query.scope,
        count: 0,
        rows: [],
      };
      res.status(200).json(empty);
      return;
    }

    // Join ChallengeParticipant → Enrollment (identity) + LeaderboardScore
    // (points). LEFT joins: a participant with no score row yet still appears
    // (scored 0 by the pure service), and a participant whose enrollment is
    // missing is skipped below rather than crashing the board.
    const participants = (await ChallengeParticipant.findAll({
      where: { challenge_id: query.challenge_id },
      include: [
        {
          model: Enrollment,
          as: 'enrollment',
          attributes: ['id', 'full_name', 'company'],
          required: false,
        },
        {
          model: LeaderboardScore,
          as: 'score',
          attributes: ['points', 'projects_shipped', 'cert_earned'],
          required: false,
        },
      ],
    })) as ParticipantWithJoins[];

    // company scope narrows to the challenge's owning sponsor company. We have
    // sponsor_id on the challenge; resolve its company_name once and filter the
    // joined enrollments by it. If the challenge has no sponsor (a global/Door A
    // challenge), company scope simply yields the full set (nothing to narrow).
    let companyFilter: string | null = null;
    if (query.scope === 'company' && challenge.sponsor_id) {
      const sponsor = await Sponsor.findByPk(challenge.sponsor_id, {
        attributes: ['company_name'],
      });
      companyFilter = sponsor?.company_name ?? null;
    }

    const rankable = participants
      .filter((p) => p.enrollment) // drop orphaned participants (missing enrollment)
      .filter((p) =>
        companyFilter ? p.enrollment!.company === companyFilter : true,
      )
      .map((p) =>
        buildRankableParticipant({
          challenge_participant_id: p.id,
          enrollment_id: p.enrollment!.id,
          full_name: p.enrollment!.full_name,
          company: p.enrollment!.company,
          score: p.score
            ? {
                points: p.score.points,
                projects_shipped: p.score.projects_shipped,
                cert_earned: p.score.cert_earned,
              }
            : null,
        }),
      );

    const ranked: RankedParticipant[] = rankParticipants(rankable);

    const response: LeaderboardResponse = {
      challenge_id: query.challenge_id,
      scope: query.scope,
      count: ranked.length,
      rows: ranked.map((r) => ({
        rank: r.rank,
        challenge_participant_id: r.challenge_participant_id,
        enrollment_id: r.enrollment_id,
        full_name: r.full_name,
        company: r.company,
        score: r.score,
        projects_shipped: r.projects_shipped,
        cert_earned: r.cert_earned,
        tier: r.tier,
      })),
    };

    res.status(200).json(response);
  } catch (error) {
    if (isMissingTableError(error)) {
      // Tables not migrated on this environment — degrade to an empty board.
      const empty: LeaderboardResponse = {
        challenge_id: query.challenge_id,
        scope: query.scope,
        count: 0,
        rows: [],
      };
      res.status(200).json(empty);
      return;
    }
    next(error);
  }
}

/* ------------------------------------------------------------------ */
/*  Door B — Sponsor dashboard                                        */
/*  GET /api/sponsor/dashboard  (public, on leadRoutes)               */
/* ------------------------------------------------------------------ */

// Read-only employer dashboard: seat economics, ranked participants, and
// Demo-Day candidates. This is the corporate "talent discovery" view —
// who your real AI builders are — so it surfaces rank/tier/points per employee.
//
// AUTH (follow-up): this endpoint is registered PUBLIC (ahead of the deployed
// auth guard) so the sponsor portal can read without an admin session, but it
// must not be open to enumeration. As a stopgap it requires an access token
// supplied via the `access_token` query param OR the `x-sponsor-token` header,
// compared against the sponsor's id-derived token. REAL-AUTH FOLLOW-UP: replace
// this with a signed, per-sponsor bearer token (short-lived JWT issued at seat
// purchase) validated in middleware, and move the route behind a sponsor-scoped
// guard. Tracked as a hardening task — do not ship the stopgap as the final
// authorization story.
const sponsorDashboardQuerySchema = z.object({
  sponsor_id: z.string().trim().uuid('sponsor_id must be a valid UUID'),
  access_token: z.string().trim().min(1).optional(),
});

interface DashboardSeats {
  purchased: number;
  redeemed: number;
  available: number;
  reassignable: number;
}

interface DashboardParticipant {
  rank: number;
  enrollment_id: string;
  full_name: string;
  points: number;
  projects_shipped: number;
  cert_earned: boolean;
  tier: 'bronze' | 'silver' | 'gold';
}

interface SponsorDashboardResponse {
  sponsor_id: string;
  company_name: string;
  seats: DashboardSeats;
  participants: DashboardParticipant[];
  demo_day_candidates: DashboardParticipant[];
}

// Stopgap token: the sponsor id is itself the shared secret for now. A real
// per-sponsor bearer token replaces this (see the follow-up note above).
function isAuthorizedForSponsor(req: Request, sponsorId: string, queryToken?: string): boolean {
  const headerToken = req.header('x-sponsor-token') ?? undefined;
  const provided = queryToken ?? headerToken;
  return Boolean(provided) && provided === sponsorId;
}

interface SeatRow extends SponsorSeat {}
interface ParticipantRow extends ChallengeParticipant {
  enrollment?: Enrollment | null;
  score?: LeaderboardScore | null;
}

export async function handleGetSponsorDashboard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  let query: z.infer<typeof sponsorDashboardQuerySchema>;
  try {
    query = sponsorDashboardQuerySchema.parse(req.query);
  } catch (error) {
    if (error instanceof ZodError) {
      respondZodError(res, error);
      return;
    }
    next(error);
    return;
  }

  try {
    // Validate the Sponsor exists. Unlike the leaderboard, an unknown sponsor is
    // a 404 — this is an authenticated employer surface, not a public render.
    const sponsor = await Sponsor.findByPk(query.sponsor_id, {
      attributes: ['id', 'company_name', 'seats_purchased'],
    });
    if (!sponsor) {
      res.status(404).json({ error: 'Sponsor not found.' });
      return;
    }

    // Access-token gate (stopgap — see REAL-AUTH FOLLOW-UP note above).
    if (!isAuthorizedForSponsor(req, sponsor.id, query.access_token)) {
      res.status(401).json({
        error: 'Missing or invalid access token.',
        hint: 'Supply access_token query param or x-sponsor-token header.',
      });
      return;
    }

    // --- Seats ---
    // purchased is authoritative from the sponsor record; the rest are derived
    // from the seat rows so the numbers reconcile against actual redemptions.
    const seatRows = (await SponsorSeat.findAll({
      where: { sponsor_id: sponsor.id },
      attributes: ['id', 'status', 'assigned_enrollment_id'],
    })) as SeatRow[];

    const redeemed = seatRows.filter((s) => s.status === 'redeemed').length;
    const available = seatRows.filter((s) => s.status === 'available').length;
    // Reassignable = currently-redeemed seats that can be released and handed to
    // someone else. This kills the "what if they quit" objection.
    const reassignable = seatRows.filter(
      (s) => s.status === 'redeemed' && s.assigned_enrollment_id,
    ).length;

    const seats: DashboardSeats = {
      purchased: sponsor.seats_purchased ?? 0,
      redeemed,
      available,
      reassignable,
    };

    // --- Participants ---
    // Find this sponsor's challenges, then rank everyone across them. A sponsor
    // with no challenge yet simply has an empty participant list.
    const challenges = await Challenge.findAll({
      where: { sponsor_id: sponsor.id },
      attributes: ['id'],
    });
    const challengeIds = challenges.map((c) => c.id);

    let ranked: RankedParticipant[] = [];
    if (challengeIds.length > 0) {
      const participantRows = (await ChallengeParticipant.findAll({
        where: { challenge_id: challengeIds },
        include: [
          {
            model: Enrollment,
            as: 'enrollment',
            attributes: ['id', 'full_name', 'company'],
            required: false,
          },
          {
            model: LeaderboardScore,
            as: 'score',
            attributes: ['points', 'projects_shipped', 'cert_earned'],
            required: false,
          },
        ],
      })) as ParticipantRow[];

      const rankable = participantRows
        .filter((p) => p.enrollment)
        .map((p) =>
          buildRankableParticipant({
            challenge_participant_id: p.id,
            enrollment_id: p.enrollment!.id,
            full_name: p.enrollment!.full_name,
            company: p.enrollment!.company,
            score: p.score
              ? {
                  points: p.score.points,
                  projects_shipped: p.score.projects_shipped,
                  cert_earned: p.score.cert_earned,
                }
              : null,
          }),
        );

      ranked = rankParticipants(rankable);
    }

    const participants: DashboardParticipant[] = ranked.map((r) => ({
      rank: r.rank,
      enrollment_id: r.enrollment_id,
      full_name: r.full_name,
      points: r.score,
      projects_shipped: r.projects_shipped,
      cert_earned: r.cert_earned,
      tier: r.tier,
    }));

    // Demo-Day candidates: the builders worth putting on stage. A participant
    // qualifies if they earned the cert OR shipped at least one project — the
    // concrete "real AI builder" signal an employer cares about.
    const demoDayCandidates = participants.filter(
      (p) => p.cert_earned || p.projects_shipped > 0,
    );

    const response: SponsorDashboardResponse = {
      sponsor_id: sponsor.id,
      company_name: sponsor.company_name,
      seats,
      participants,
      demo_day_candidates: demoDayCandidates,
    };

    res.status(200).json(response);
  } catch (error) {
    if (isMissingTableError(error)) {
      // Sponsorship/challenge tables not migrated yet — return a graceful empty
      // dashboard for the validated sponsor rather than a 500.
      const empty: SponsorDashboardResponse = {
        sponsor_id: query.sponsor_id,
        company_name: '',
        seats: { purchased: 0, redeemed: 0, available: 0, reassignable: 0 },
        participants: [],
        demo_day_candidates: [],
      };
      res.status(200).json(empty);
      return;
    }
    next(error);
  }
}
