import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { CommunicationLog, CampaignSimulationStep } from '../models';
import { InteractionOutcome } from '../models';
import { CallContactLog } from '../models';
import { processCallTranscript } from '../services/callTranscriptProcessor';

/**
 * POST /api/webhook/synthflow/call-complete
 * Receives call completion data from Synthflow AI.
 * Updates the CommunicationLog with transcript and call metadata.
 */
export async function handleSynthflowCallComplete(req: Request, res: Response): Promise<void> {
  try {
    // Log raw payload to diagnose Synthflow's field names
    console.log('[Synthflow Webhook] Raw payload:', JSON.stringify(req.body).slice(0, 2000));

    const body = req.body || {};

    // Synthflow V2 nests most data under body.call.*
    const call = body.call || {};
    const call_id = call.call_id || body.call_id || call._id || body._id || null;
    const status = call.status || body.status || '';
    const duration = call.duration || body.duration || null;
    const transcript = call.transcript || body.transcript || '';
    const recording_url = call.recording_url || body.recording_url || '';
    const disposition = call.end_call_reason || body.disposition || '';
    const analysis = body.analysis || {};
    const metadata = body.metadata || {};

    if (!call_id) {
      console.warn('[Synthflow Webhook] No call_id found. Payload keys:', Object.keys(body).join(', '));
      // Accept it anyway with 200 so Synthflow doesn't retry, but log for debugging
      res.status(200).json({ ok: true, matched: false, reason: 'no_call_id', keys: Object.keys(body) });
      return;
    }

    console.log(`[Synthflow Webhook] Call complete: ${call_id}, status: ${status}, disposition: ${disposition}`);

    // Find the communication log entry by provider_message_id
    let commLog = await CommunicationLog.findOne({
      where: { provider_message_id: call_id, provider: 'synthflow' },
    });

    // Fallback: match by recent pending voice call (covers null call_id scenarios)
    if (!commLog) {
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
      commLog = await CommunicationLog.findOne({
        where: {
          provider: 'synthflow',
          channel: 'voice',
          status: 'pending',
          created_at: { [Op.gte]: tenMinAgo },
        },
        order: [['created_at', 'DESC']],
      });
      if (commLog) {
        console.log(`[Synthflow Webhook] Matched via fallback (recent pending voice call)`);
        await commLog.update({ provider_message_id: call_id });
      }
    }

    // Backfill CallContactLog with synthflow_call_id if it was null
    if (call_id) {
      CallContactLog.update(
        { synthflow_call_id: call_id, call_status: 'completed' },
        { where: { synthflow_call_id: { [Op.is]: null as any }, call_type: 'maya_initiated' }, limit: 1 } as any,
      ).catch(() => {});
    }

    if (!commLog) {
      console.warn(`[Synthflow Webhook] No CommunicationLog found for call_id: ${call_id}`);
      res.status(200).json({ ok: true, matched: false });
      return;
    }

    // Update communication log with transcript and call data
    const callCompleted = status === 'completed';
    await commLog.update({
      status: callCompleted ? 'delivered' : 'failed',
      provider_response: {
        ...(commLog.provider_response || {}),
        call_status: status,
        duration,
        transcript,
        recording_url,
        end_call_reason: disposition,
        analysis,
        metadata,
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
      // Map Synthflow end_call_reason to outcome
      const outcome = status === 'completed' ? 'answered'
        : disposition === 'voicemail' ? 'voicemail'
        : disposition === 'no_answer' ? 'no_answer'
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
