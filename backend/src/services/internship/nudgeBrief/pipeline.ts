/**
 * pipeline - run the REPORT, exactly as the nightly email runs it, and hand back every artifact.
 *
 *     "I think the problem is that you are not generating the html or json file that the email is
 *      doing therefore you don't have all the right data to make the right message. Add those two
 *      components and I bet it fixes the messaging."  (Ali, 10 Nov 2026)
 *
 * He was right about the cause, and the diagnosis is worth stating precisely because it is not
 * quite that the JSON was missing. `buildBriefFor` DID build a sidecar. It built a POORER one, in
 * three specific ways, and each one removed something the message needed:
 *
 *   1. **`conversations` was never passed.** `buildSidecar` feeds it to `rankCommunications()`, so
 *      with an empty array every intern came back with `communications: []`. The composer had no
 *      sight of the actual email thread. That is the single biggest reason messages talked about
 *      the wrong thing: they were written from build telemetry alone, by something that could not
 *      read what the person had said.
 *   2. **`narrateAsks` was skipped.** The ask text therefore stayed on its deterministic fallback,
 *      which is the same sentence for everybody. Six of six messages ended "paste the prompt below
 *      into Claude Code and correct what it gets wrong".
 *   3. **`summarizeInterns` was skipped and no previous snapshot was loaded**, so there was no
 *      delta and no narrative beyond the fallback.
 *
 * The old header argued the model calls were "what make the daily run slow" and that a brief
 * "must render the same way twice". Both are answered rather than ignored: the client is the same
 * CACHED client the report uses, so a re-run on unchanged data returns the same text from the
 * store rather than paying for or re-rolling the call, and a missing key or a model outage still
 * degrades to the deterministic fallback instead of failing. Determinism is preserved where it was
 * real; what is gone is a brief that was deterministic because it was uninformed.
 *
 * Running one pipeline for both surfaces is also the only way the email and the console can agree.
 * Two pipelines over one dataset is a guarantee they will drift, and they had.
 */
import { collectInternshipPortfolio } from '../portfolioReport/collect';
import { composeInternshipPortfolio } from '../portfolioReport/compose';
import { narrateAsks, type ChatClient } from '../portfolioReport/narrate';
import { summarizeInterns } from '../portfolioReport/summary';
import { buildSidecar, serializeSidecar } from '../portfolioReport/sidecar/build';
import { cachedChatClient, ensureSidecarSchema, loadPreviousSnapshot } from '../portfolioReport/sidecar/store';
import { renderDashboard } from '../portfolioReport/dashboard/renderDashboard';
import { getInstrumentedOpenAI } from '../../openaiInstrumented';
import type { PortfolioReport } from '../portfolioReport/types';
import type { Sidecar } from '../portfolioReport/sidecar/types';
import type { ConsoleRosterRow } from '../internConsoleRoster';

export interface PipelineResult {
  readonly report: PortfolioReport;
  readonly sidecar: Sidecar;
  /** The JSON the email attaches, serialized. */
  readonly sidecarJson: string;
  /** The interactive page the email attaches. */
  readonly dashboardHtml: string;
  /** The roster rows, which are the only place an email address lives. */
  readonly roster: ConsoleRosterRow[];
  readonly reportDate: string;
  /** The cached model client, or null when OPENAI_API_KEY is absent. */
  readonly chatClient: ChatClient | null;
  /** Which enrichments actually ran, so a caller can say so rather than assume. */
  readonly enrichment: {
    readonly model: boolean;
    readonly asksNarrated: number;
    readonly summaries: number;
    readonly conversations: number;
    readonly previousReportDate: string | null;
  };
}

function centralDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

function log(event: string, context: Record<string, unknown>, level: 'info' | 'warn' = 'info'): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(), level, service: 'intern-nudge-brief', event, context,
  }));
}

/**
 * Collect, compose, narrate, summarize, build the sidecar and render the dashboard.
 *
 * Every enrichment is fail-soft: the model is optional, the snapshot store is optional, and a
 * failure in either degrades the text rather than losing the brief. The one thing that is not
 * optional is `conversations`, because that is the data the message is supposed to be about.
 */
export async function runPortfolioPipeline(
  { now = new Date(), onlyEnrollments }: { now?: Date; onlyEnrollments?: string[] } = {},
): Promise<PipelineResult> {
  const data = await collectInternshipPortfolio(onlyEnrollments ? { now, onlyEnrollments } : { now });
  const report = composeInternshipPortfolio(data, { now });

  // Same cached client the report uses: unchanged data returns the stored reply rather than
  // paying for the call again, which is what keeps repeated renders identical.
  await ensureSidecarSchema().catch((err) => log('sidecar_schema_failed', { message: (err as Error).message }, 'warn'));

  let client: ChatClient | null = null;
  if (process.env.OPENAI_API_KEY) {
    try {
      const live = getInstrumentedOpenAI(
        { workflow_id: 'intern_nudge_brief' },
        { timeout: 30000, maxRetries: 0 },
      ) as unknown as ChatClient;
      client = cachedChatClient(live);
    } catch (err) {
      log('model_client_unavailable', { message: (err as Error).message }, 'warn');
    }
  }

  // Both mutate `report` in place, and both already fall back to deterministic text when the
  // client is null, so neither is wrapped in a condition.
  const asks = await narrateAsks(report, client).catch((err) => {
    log('narrate_asks_failed', { message: (err as Error).message }, 'warn');
    return { narrated: 0, total: 0 };
  });
  const summaries = await summarizeInterns(report, client).catch((err) => {
    log('summarize_interns_failed', { message: (err as Error).message }, 'warn');
    return { fromModel: 0, total: 0 };
  });

  const reportDate = centralDate(now);
  const previous = await loadPreviousSnapshot(reportDate).catch(() => null);

  // `conversations` is the line that was missing. Without it rankCommunications() receives an
  // empty array and every intern's `communications` comes back empty.
  const sidecar = buildSidecar(report, {
    reportDate,
    previous,
    lastOutbound: data.lastOutbound ?? [],
    conversations: data.conversations ?? [],
  });

  return {
    report,
    sidecar,
    sidecarJson: serializeSidecar(sidecar),
    dashboardHtml: renderDashboard(report, sidecar),
    roster: data.roster ?? [],
    // Exposed so the brief builder can offer the model a message body (modelBody.ts). It is the
    // same CACHED client the report already used, so one run does not pay twice for a call.
    chatClient: client,
    reportDate,
    enrichment: {
      model: client !== null,
      asksNarrated: asks.narrated,
      summaries: summaries.fromModel,
      conversations: (data.conversations ?? []).length,
      previousReportDate: previous?.report_date ?? null,
    },
  };
}
