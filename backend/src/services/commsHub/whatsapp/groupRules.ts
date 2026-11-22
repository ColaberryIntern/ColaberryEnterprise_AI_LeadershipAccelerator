import type CommsHubWhatsAppGroup from '../../../models/CommsHubWhatsAppGroup';

/**
 * CH10.2 Can the hub number post in this group? Pure: no I/O, no provider import, so the destination
 * rules (messageService) and the worker (deliveryRepo) can share it without pulling in the adapter.
 */
export type CantSendReason = 'left' | 'suspended' | 'terminated' | 'admins_only' | 'not_a_member' | 'forbidden';
export const CANT_SEND_TEXT: Record<CantSendReason, string> = {
  left: 'The hub number is no longer in this group.',
  suspended: 'WhatsApp has suspended this group.',
  terminated: 'This group has been closed.',
  admins_only: 'Only admins can post here, and the hub number is not an admin.',
  not_a_member: 'The hub number is not listed as a member of this group.',
  forbidden: 'WhatsApp refused a message to this group.',
};

type GroupFacts = Pick<CommsHubWhatsAppGroup, 'left_at' | 'suspended' | 'terminated' | 'announcements' | 'our_rank' | 'cant_send_reason'>;

export function cantSendReason(g: GroupFacts): CantSendReason | null {
  if (g.left_at) return 'left';
  if (g.terminated) return 'terminated';
  if (g.suspended) return 'suspended';
  if (!g.our_rank) return 'not_a_member';
  if (g.announcements && g.our_rank !== 'admin' && g.our_rank !== 'creator') return 'admins_only';
  if (g.cant_send_reason === 'forbidden') return 'forbidden';
  return null;
}

