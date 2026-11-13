/**
 * hireVideoAnalysisClient - the hand-off to colaberry/video-analysis (kit §4.3).
 *
 * THE WORKER'S CONTRACT (read from that repo, dpu.py + orchestrator.py):
 *   in   an MP4 put at `<record_id>.mp4` in its S3 input bucket (an S3 event feeds its SQS queue;
 *        the record id must not contain "_", which the worker splits on)
 *   out  `<record_id>/res.json` in its output bucket: AWS Transcribe JSON, filler words, pauses,
 *        voiced ratio, head pose, expression
 *
 * OFF UNTIL IT CAN BE ON. This backend holds no AWS identity that can reach those buckets (the
 * prod host's key is a certbot-only IAM user), and the S3 transport needs the AWS SDK, a new
 * dependency. Until both are approved there is NO transport, so the mode is 'off': the studio
 * says captions and coaching are not switched on yet, and a recording publishes without them.
 * There is deliberately no env flag that can claim 'pending' with nothing behind it - that would
 * leave a candidate waiting on a result that never comes.
 *
 * When the transport lands it registers here: `submitForAnalysis` puts the file, a poller reads
 * `res.json`, and `applyAnalysis` (hireVideoService) already turns it into captions and coaching.
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
