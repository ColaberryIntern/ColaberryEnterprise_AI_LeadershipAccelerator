/**
 * commercializationController — thin handler for the Commercialization Command Center
 * (/admin/commercialization). Read-only.
 */
import { Request, Response } from 'express';
import { z } from 'zod';
import { getCommercializationBoard } from '../services/commercialization/commercializationBoardService';
import { getHypothesisHealth } from '../services/commercialization/hypothesisHealthService';
import {
  assertReportNeverQuotesAnUnmeasuredCount,
  assertUnavailableMinutesAreNotZero,
  buildLivePopulationReport,
  currentReportMonth,
} from '../services/broadcast/livePopulationReport';
import {
  assertGapsAreStatedNotHidden,
  buildDayNinetyReport,
} from '../services/impact/dayNinetyReport';
import type { PopulationSelector } from '../services/impact/dayNinetyReportService';

export async function handleGetCommercializationBoard(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const board = await getCommercializationBoard();
    res.json({ success: true, data: board });
  } catch (error) {
    const err = error as Error;
    // Classified rather than generic: a board that fails silently would render ten
    // empty tiles, which is exactly the "measured zero" this ticket forbids faking.
    console.error(JSON.stringify({
      level: 'error',
      service: 'commercialization-board',
      event: 'board_fetch_failed',
      error_class: err.name || 'UnknownError',
      outcome: 'failure',
      message: err.message,
    }));
    res.status(500).json({
      success: false,
      error: 'Could not build the commercialization board.',
    });
  }
}

/**
 * C8.6 - which revenue hypotheses are gaining evidence and which are dying.
 *
 * Read-only, and every count comes from the C8.4 funnel rather than from manual entry,
 * which is an acceptance criterion on that ticket rather than a preference.
 */
export async function handleGetHypothesisHealth(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    res.json({ success: true, data: await getHypothesisHealth() });
  } catch (error) {
    const err = error as Error;
    console.error(JSON.stringify({
      level: 'error',
      service: 'commercialization-hypotheses',
      event: 'hypothesis_health_failed',
      error_class: err.name || 'UnknownError',
      outcome: 'failure',
      message: err.message,
    }));
    res.status(500).json({ success: false, error: 'Could not read hypothesis health.' });
  }
}

/** Month defaults to the current one in the house timezone, not the container's UTC. */
const LivePopulationQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
}).strict();

/**
 * C8.10 - how many learners actually shared Colaberry Live in a month, and what
 * Cloudflare delivered to serve them.
 *
 * The two assertions run on the built report before it is sent rather than only in tests.
 * This endpoint's whole purpose is refusing to publish a number nobody measured, so the
 * refusal is enforced on the response itself: a 500 here is strictly better than a
 * confident zero, and the ticket says so in its own words.
 */
export async function handleGetLivePopulation(req: Request, res: Response): Promise<void> {
  const parsed = LivePopulationQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      error_class: 'ValidationError',
      details: parsed.error.flatten(),
    });
    return;
  }

  const now = currentReportMonth(Date.now());
  const year = parsed.data.year ?? now.year;
  const month = parsed.data.month ?? now.month;

  try {
    const report = await buildLivePopulationReport(year, month);
    assertReportNeverQuotesAnUnmeasuredCount(report);
    assertUnavailableMinutesAreNotZero(report);
    res.json({ success: true, data: report });
  } catch (error) {
    const err = error as Error;
    console.error(JSON.stringify({
      level: 'error',
      service: 'live-population',
      event: 'live_population_report_failed',
      error_class: err.name || 'UnknownError',
      outcome: 'failure',
      context: { year, month },
      message: err.message,
    }));
    res.status(500).json({
      success: false,
      error: 'Could not build the Colaberry Live population report.',
    });
  }
}

/**
 * Exactly one selector, enforced rather than defaulted.
 *
 * There is deliberately no "all learners" branch. This report is sponsor-facing, and a
 * selector that could be omitted would make the widest possible disclosure the easiest
 * thing to request by accident.
 */
const DayNinetyQuerySchema = z.object({
  sponsorId: z.string().uuid().optional(),
  cohortId: z.string().uuid().optional(),
}).strict().refine(
  (q) => [q.sponsorId, q.cohortId].filter(Boolean).length === 1,
  { message: 'Supply exactly one of sponsorId or cohortId.' },
);

/**
 * C8.12 - the day-90 impact report, built from evidence records that already exist.
 *
 * The guard runs on the built report before it is sent, for the same reason the C8.10
 * endpoint above does it: this report's value is entirely in what it declines to claim,
 * so the decline is enforced on the response rather than only in tests. A 500 is better
 * than a confident document, because this one gets forwarded to a paying customer.
 */
export async function handleGetDayNinetyReport(req: Request, res: Response): Promise<void> {
  const parsed = DayNinetyQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      error_class: 'ValidationError',
      details: parsed.error.flatten(),
    });
    return;
  }

  const selector: PopulationSelector = parsed.data.sponsorId
    ? { kind: 'sponsor', sponsorId: parsed.data.sponsorId }
    : { kind: 'cohort', cohortId: parsed.data.cohortId as string };

  try {
    const report = await buildDayNinetyReport(selector);
    assertGapsAreStatedNotHidden(report);
    res.json({ success: true, data: report });
  } catch (error) {
    const err = error as Error;
    console.error(JSON.stringify({
      level: 'error',
      service: 'day-ninety-impact',
      event: 'day_ninety_report_failed',
      error_class: err.name || 'UnknownError',
      outcome: 'failure',
      context: { selector: selector.kind },
      message: err.message,
    }));
    res.status(500).json({
      success: false,
      error: 'Could not build the day-90 impact report.',
    });
  }
}
