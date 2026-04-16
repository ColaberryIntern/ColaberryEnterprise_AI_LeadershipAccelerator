import InboxAuditLog from '../../models/InboxAuditLog';

const LOG_PREFIX = '[InboxCOS][Audit]';

interface AuditEventParams {
  email_id?: string;
  action: string;
  old_state?: string;
  new_state?: string;
  confidence?: number;
  reasoning?: string;
  actor?: string;
  metadata?: Record<string, any>;
}

/**
 * Logs an audit event to the inbox_audit_logs table.
 * Every inbox service calls this to maintain a complete decision trail.
 */
export async function logAuditEvent(params: AuditEventParams): Promise<any> {
  const {
    email_id,
    action,
    old_state,
    new_state,
    confidence,
    reasoning,
    actor = 'system',
    metadata,
  } = params;

  try {
    const row = await InboxAuditLog.create({
      email_id: email_id || null,
      action,
      old_state: old_state || null,
      new_state: new_state || null,
      confidence: confidence ?? null,
      reasoning: reasoning || null,
      actor,
      metadata: metadata || null,
    });

    console.log(
      `${LOG_PREFIX} ${action} | email=${email_id || 'N/A'} | actor=${actor} | ${old_state || '-'} -> ${new_state || '-'}`
    );

    return row;
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Failed to log audit event: ${error.message}`, {
      action,
      email_id,
      error: error.message,
    });
    throw error;
  }
}
