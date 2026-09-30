import fs from 'fs/promises';
import path from 'path';
import CommunityRoom from '../../models/CommunityRoom';
import RoomMembership from '../../models/RoomMembership';
import RoomBooking from '../../models/RoomBooking';
import RoomResource, { RoomResourceType } from '../../models/RoomResource';
import { ROOM_RESOURCE_DIR } from '../../config/upload';
import { RoomAccessContext, canReadContent, canUploadResource, canModerate } from './roomEntitlementService';
import { emitRoomEvent } from './roomOutboxService';
import { ROOM_EVENTS } from './roomEvents';
import { notFoundError, forbiddenError, validationError, log } from './roomShared';

// Docs & Files: list/create/delete/download for room_resources, scoped to a
// room and optionally one of its bookings. Every operation re-checks
// entitlement server-side — never trust a client-supplied room_id/booking_id
// pairing or an unguessable resource id.

async function loadRoom(roomId: string): Promise<CommunityRoom> {
  const room = await CommunityRoom.findByPk(roomId);
  if (!room) throw notFoundError('Room not found');
  return room;
}

function membershipFor(roomId: string, enrollmentId: string): Promise<RoomMembership | null> {
  return RoomMembership.findOne({ where: { room_id: roomId, enrollment_id: enrollmentId } });
}

async function assertBookingBelongsToRoom(bookingId: string, roomId: string): Promise<void> {
  const booking = await RoomBooking.findByPk(bookingId);
  if (!booking) throw notFoundError('Booking not found');
  if (booking.room_id !== roomId) throw validationError('That booking does not belong to this room');
}

export interface ListResourcesOpts {
  bookingId?: string | 'none';
  resourceType?: RoomResourceType;
}

export type ResourceWithPerms = RoomResource & { can_delete: boolean };

export async function listResources(
  ctx: RoomAccessContext,
  roomId: string,
  opts: ListResourcesOpts = {},
): Promise<ResourceWithPerms[]> {
  const room = await loadRoom(roomId);
  const membership = await membershipFor(roomId, ctx.enrollmentId);
  if (!canReadContent(room, ctx, membership)) throw forbiddenError('You cannot read this room');

  const where: Record<string, unknown> = { room_id: roomId };
  if (opts.bookingId === 'none') where.booking_id = null;
  else if (opts.bookingId) where.booking_id = opts.bookingId;
  if (opts.resourceType) where.resource_type = opts.resourceType;

  const rows = await RoomResource.findAll({
    where,
    order: [['is_pinned', 'DESC'], ['created_at', 'DESC']],
    limit: 200,
  });
  const canMod = canModerate(ctx, membership);
  return rows.map((row) => Object.assign(row, {
    can_delete: row.created_by_enrollment_id === ctx.enrollmentId || canMod,
  })) as ResourceWithPerms[];
}

export interface CreateFileResourceInput {
  bookingId?: string | null;
  title?: string;
  file: Express.Multer.File;
}

export async function createFileResource(
  ctx: RoomAccessContext,
  roomId: string,
  input: CreateFileResourceInput,
): Promise<RoomResource> {
  const room = await loadRoom(roomId);
  const membership = await membershipFor(roomId, ctx.enrollmentId);
  if (!canUploadResource(room, ctx, membership)) throw forbiddenError('You cannot add files to this room');
  if (input.bookingId) await assertBookingBelongsToRoom(input.bookingId, roomId);

  const resource = await RoomResource.create({
    room_id: roomId,
    booking_id: input.bookingId ?? null,
    resource_type: 'file',
    title: (input.title || '').trim() || input.file.originalname,
    url: null,
    body: null,
    mime_type: input.file.mimetype,
    size_bytes: input.file.size,
    storage_key: input.file.filename,
    created_by_enrollment_id: ctx.enrollmentId,
  });
  await emitRoomEvent({
    eventType: ROOM_EVENTS.ArtifactShared,
    aggregateType: 'resource',
    aggregateId: resource.id,
    payload: { room_id: roomId, booking_id: resource.booking_id, resource_type: 'file' },
  });
  log('info', 'resource_file_created', { resource_id: resource.id, room_id: roomId, booking_id: resource.booking_id, by: ctx.enrollmentId });
  return resource;
}

export interface CreateLinkOrNoteInput {
  bookingId?: string | null;
  resourceType: 'link' | 'recording' | 'recap' | 'note';
  title?: string;
  url?: string;
  body?: string;
}

const EVENT_FOR_TYPE: Record<CreateLinkOrNoteInput['resourceType'], typeof ROOM_EVENTS[keyof typeof ROOM_EVENTS]> = {
  recording: ROOM_EVENTS.RecordingAttached,
  recap: ROOM_EVENTS.RecapApproved,
  link: ROOM_EVENTS.ArtifactShared,
  note: ROOM_EVENTS.ArtifactShared,
};

export async function createLinkOrNoteResource(
  ctx: RoomAccessContext,
  roomId: string,
  input: CreateLinkOrNoteInput,
): Promise<RoomResource> {
  const room = await loadRoom(roomId);
  const membership = await membershipFor(roomId, ctx.enrollmentId);
  if (!canUploadResource(room, ctx, membership)) throw forbiddenError('You cannot add files to this room');
  if (input.bookingId) await assertBookingBelongsToRoom(input.bookingId, roomId);

  // Defense-in-depth: the Zod layer already enforces this, but a service must
  // never assume every caller went through it.
  if ((input.resourceType === 'link' || input.resourceType === 'recording') && !input.url?.trim()) {
    throw validationError('A URL is required');
  }
  if ((input.resourceType === 'recap' || input.resourceType === 'note') && !input.body?.trim()) {
    throw validationError('Body text is required');
  }

  const resource = await RoomResource.create({
    room_id: roomId,
    booking_id: input.bookingId ?? null,
    resource_type: input.resourceType,
    title: (input.title || '').trim() || null,
    url: input.url?.trim() ?? null,
    body: input.body?.trim() ?? null,
    created_by_enrollment_id: ctx.enrollmentId,
  });
  await emitRoomEvent({
    eventType: EVENT_FOR_TYPE[input.resourceType],
    aggregateType: 'resource',
    aggregateId: resource.id,
    payload: { room_id: roomId, booking_id: resource.booking_id, resource_type: input.resourceType },
  });
  log('info', 'resource_created', { resource_id: resource.id, room_id: roomId, resource_type: input.resourceType, by: ctx.enrollmentId });
  return resource;
}

export async function deleteResource(ctx: RoomAccessContext, roomId: string, resourceId: string): Promise<void> {
  const resource = await RoomResource.findByPk(resourceId);
  if (!resource || resource.room_id !== roomId) throw notFoundError('Resource not found');
  const membership = await membershipFor(roomId, ctx.enrollmentId);
  const isOwner = resource.created_by_enrollment_id === ctx.enrollmentId;
  if (!isOwner && !canModerate(ctx, membership)) throw forbiddenError('Not authorized to delete this resource');

  if (resource.resource_type === 'file' && resource.storage_key) {
    // Best-effort — a stray orphaned file on disk is not worth failing the
    // delete over (matches the best-effort idiom used elsewhere in this domain,
    // e.g. recordContribution/joinVideoRoom's provider call).
    try { await fs.unlink(path.join(ROOM_RESOURCE_DIR, resource.storage_key)); }
    catch (e) { log('warn', 'resource_file_unlink_failed', { resource_id: resourceId, message: (e as Error)?.message }); }
  }
  await resource.destroy();
  log('info', 'resource_deleted', { resource_id: resourceId, room_id: roomId, by: ctx.enrollmentId });
}

export async function getResourceForDownload(
  ctx: RoomAccessContext,
  roomId: string,
  resourceId: string,
): Promise<RoomResource> {
  const resource = await RoomResource.findByPk(resourceId);
  if (!resource || resource.room_id !== roomId) throw notFoundError('Resource not found');
  const room = await loadRoom(roomId);
  const membership = await membershipFor(roomId, ctx.enrollmentId);
  // This is the entitlement re-check the communityMediaUpload precedent
  // (public, unauthenticated GET keyed only on an unguessable UUID) explicitly
  // lacks — room/booking files must not be fetchable by guessing an id.
  if (!canReadContent(room, ctx, membership)) throw forbiddenError('You cannot read this room');
  const downloadable = resource.resource_type === 'file' || resource.resource_type === 'recording';
  if (!downloadable || !resource.storage_key) throw notFoundError('This resource is not a downloadable file');
  return resource;
}
