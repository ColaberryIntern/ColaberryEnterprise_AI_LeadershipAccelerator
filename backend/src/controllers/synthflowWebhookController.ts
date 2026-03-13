import { Request, Response } from 'express';
import { CommunicationLog, CampaignSimulationStep } from '../models';
import { InteractionOutcome } from '../models';
import { processCallTranscript } from '../services/callTranscriptProcessor';

/**
 * POST /api/webhook/synthflow/call-complete
 * Receives call completion data from Synthflow AI.
 * Updates the CommunicationLog with transcript and call metadata.
 */
export async function handleSynthflowCallComplete(req: Request, res: Response): Promise<void> {
  try {
    const {
      call_id,
      status,
      duration,
      transcript,
      recording_url,
      disposition,
    } = req.body;

    if (!call_id) {
      res.status(400).json({ error: 'Missing call_id' });
      return;
    }

    console.log(`[Synthflow Webhook] Call complete: ${call_id}, status: ${status}, disposition: ${disposition}`);

    // Find the communication log entry by provider_message_id
    const commLog = await CommunicationLog.findOne({
      where: { provider_message_id: call_id, provider: 'synthflow' },
    });

    if (!commLog) {
      console.warn(`[Synthflow Webhook] No CommunicationLog found for call_id: ${call_id}`);
      res.status(200).json({ ok: true, matched: false });
      return;
    }

    // Update communication log with transcript and call data
    const callCompleted = status === 'completed' || disposition === 'answered';
    await commLog.update({
      status: callCompleted ? 'delivered' : 'failed',
      provider_response: {
        ...(commLog.provider_response || {}),
        call_status: status,
        duration,
        transcript,
        recording_url,
        disposition,
        completed_at: new Date().toISOString(),
      },
    } as any);

    // If this was a simulation step, update step details with transcript
    if (commLog.simulation_step_id) {
      const simStep = await CampaignSimulationStep.findByPk(commLog.simulation_step_id);
      if (simStep) {
        const details = (simStep as any).details || {};
        await simStep.update({
          details: {
            ...details,
            transcript,
            recording_url,
            call_duration: duration,
            call_disposition: disposition,
          },
        } as any);
      }
    }

    // Create interaction outcome if lead_id exists
    if (commLog.lead_id && commLog.campaign_id) {
      const outcome = disposition === 'answered' ? 'answered'
        : disposition === 'voicemail' ? 'voicemail'
        : disposition === 'declined' ? 'declined'
        : 'no_answer';

      await InteractionOutcome.create({
        lead_id: commLog.lead_id,
        campaign_id: commLog.campaign_id,
        channel: 'voice',
        outcome,
        metadata: {
          call_id,
          duration,
          disposition,
          has_transcript: !!transcript,
          source: 'synthflow_webhook',
        },
      } as any);
    }

    // Process transcript via AI to extract lead data (fire-and-forget)
    if (transcript && commLog.lead_id) {
      processCallTranscript(commLog.lead_id, transcript, call_id).catch((err: any) => {
        console.warn('[Synthflow Webhook] Transcript processing failed:', err.message);
      });
    }

    res.status(200).json({ ok: true, matched: true });
  } catch (err: any) {
    console.error('[Synthflow Webhook] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}
