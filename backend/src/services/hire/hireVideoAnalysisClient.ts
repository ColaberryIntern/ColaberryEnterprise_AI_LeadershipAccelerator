/**
 * hireVideoAnalysisClient - the hand-off from an upload to whatever analyses it (kit §4.3).
 *
 * The transport is hireVideoCoach (OpenAI transcription + review), chosen by Ali on 2026-11-14
 * instead of colaberry/video-analysis, which needed an AWS identity this backend does not have.
 * It registers here at boot ONLY when OPENAI_API_KEY is set. With no transport the mode is
 * honestly 'off': the studio says coaching is not switched on, and a recording publishes without
 * it. There is deliberately no env flag that can claim 'pending' with nothing behind it.
 */
export type AnalysisMode = 'off' | 'pending';

export interface AnalysisTransport {
  submit(recordId: string, file: string): Promise<void>;
}

let transport: AnalysisTransport | null = null;

/** For the transport module (and tests) to plug in. */
export function setAnalysisTransport(t: AnalysisTransport | null): void { transport = t; }

export const analysisMode = (): AnalysisMode => (transport ? 'pending' : 'off');

/** The worker's record id for one of our assets: no underscore, recognisably ours. */
export const analysisRecordId = (assetId: string): string => `hire-${assetId}`;

/** Fire and forget: a failed hand-off never fails the upload, it only means no captions or coaching. */
export function submitForAnalysis(assetId: string, file: string): void {
  const log = (event: string, extra: Record<string, unknown>) => console.log(JSON.stringify({
    timestamp: new Date().toISOString(), service: 'backend', event, context: { assetId, recordId: analysisRecordId(assetId) }, ...extra,
  }));
  if (!transport) { log('hire_video_analysis_off', { level: 'info', outcome: 'partial' }); return; }
  transport.submit(analysisRecordId(assetId), file).then(
    () => log('hire_video_analysis_submitted', { level: 'info', outcome: 'success' }),
    (err: unknown) => log('hire_video_analysis_submit_failed', {
      level: 'error', outcome: 'failure', error_class: err instanceof Error ? err.name : 'UpstreamUnavailable',
    }),
  );
}
