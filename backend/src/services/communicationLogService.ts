import { CommunicationLog } from '../models';

interface LogCommunicationParams {
  lead_id?: number | null;
  campaign_id?: string | null;
  simulation_id?: string | null;
  simulation_step_id?: string | null;
  channel: string;
  direction?: string;
  delivery_mode: string;
  status: string;
  to_address?: string | null;
  from_address?: string | null;
  subject?: string | null;
  body?: string | null;
  provider?: string | null;
  provider_message_id?: string | null;
  provider_response?: Record<string, any> | null;
  error_message?: string | null;
  metadata?: Record<string, any> | null;
}

export async function logCommunication(params: LogCommunicationParams): Promise<InstanceType<typeof CommunicationLog>> {
  try {
    const log = await CommunicationLog.create({
      ...params,
      direction: params.direction || 'outbound',
    } as any);
    return log;
  } catch (err: any) {
    console.error('[CommunicationLog] Failed to log communication:', err.message);
    throw err;
  }
}

export async function getSimulationComms(simulationId: string): Promise<InstanceType<typeof CommunicationLog>[]> {
  return CommunicationLog.findAll({
    where: { simulation_id: simulationId },
    order: [['created_at', 'ASC']],
  });
}

export async function getLeadComms(
  leadId: number,
  options?: { channel?: string; limit?: number }
): Promise<InstanceType<typeof CommunicationLog>[]> {
  const where: any = { lead_id: leadId };
  if (options?.channel) where.channel = options.channel;

  return CommunicationLog.findAll({
    where,
    order: [['created_at', 'DESC']],
    limit: options?.limit || 50,
  });
}
