import portalApi from '../utils/portalApi';

// Client for the Community Rooms backend (/api/portal/community/rooms|bookings|
// events|home|people). Mirrors communityApi.ts — goes through portalApi so the
// participant JWT + 401 handling are shared. Never call fetch() or read
// process.env from a component.

export type RoomPrivacy = 'public' | 'cohort' | 'invite_only' | 'private';
export type RoomStatus = 'active' | 'archived' | 'locked' | 'removed';
export type BookingVariant =
  | 'study' | 'build_room' | 'demo' | 'office_hours'
  | 'architecture_review' | 'cert_prep' | 'accountability' | 'networking';
export type BookingState =
  | 'draft' | 'pending_approval' | 'scheduled' | 'lobby_open' | 'live'
  | 'cooldown' | 'completed' | 'archived' | 'rejected' | 'cancelled' | 'locked' | 'removed';
export type RoomPresence = 'online' | 'away' | 'offline';

export const ROOM_CATEGORIES = [
  { key: 'start_here', label: 'Start here' },
  { key: 'your_cohort', label: 'Your cohort' },
  { key: 'build_together', label: 'Build together' },
  { key: 'career_cert', label: 'Career & cert' },
  { key: 'demos_events', label: 'Demos & events' },
  { key: 'social', label: 'Social' },
] as const;

export const BOOKING_VARIANTS: { key: BookingVariant; label: string }[] = [
  { key: 'study', label: 'Study session' },
  { key: 'build_room', label: 'Project build room' },
  { key: 'demo', label: 'Demo / showcase' },
  { key: 'office_hours', label: 'Office hours' },
  { key: 'architecture_review', label: 'Architecture review' },
  { key: 'cert_prep', label: 'Certification prep' },
  { key: 'accountability', label: 'Accountability' },
  { key: 'networking', label: 'Networking' },
];

// A room can arrive "full" (all fields) or as a redacted locked "shell" (private
// rooms the viewer isn't in — name/description are absent). visibility tells you which.
export interface Room {
  id: string;
  slug?: string;
  name?: string;
  category: string;
  room_type: string;
  privacy: RoomPrivacy;
  status: RoomStatus;
  description?: string | null;
  topic?: string | null;
  capacity?: number | null;
  linked_live_session_id?: string | null;
  owner_enrollment_id?: string | null;
  is_system?: boolean;
  is_video?: boolean;
  always_open?: boolean;
  created_at: string;
  locked?: boolean;
  metadata?: { emoji?: string; tagline?: string; default_room?: boolean };
}

export interface RoomListItem {
  visibility: 'full' | 'shell';
  room: Room;
  here_count?: number;
}

// The viewer's enrollment id, decoded from the participant JWT (for owner checks).
export function myEnrollmentId(): string {
  try {
    const t = localStorage.getItem('participant_token') || '';
    return JSON.parse(atob(t.split('.')[1] || '')).sub || '';
  } catch { return ''; }
}

export interface RoomView {
  visibility: 'full' | 'shell';
  room: Room;
  membership: RoomMembership | null;
}

export interface RoomMembership {
  id: string;
  room_id: string;
  role: string;
  access_state: string;
  notification_pref: string;
}

// Safe booking projection (never carries the meeting link — that comes from join()).
export interface BookingCard {
  id: string;
  room_id: string;
  title: string;
  variant: BookingVariant;
  state: BookingState;
  start_at: string | null;
  end_at: string | null;
  timezone: string | null;
  privacy: RoomPrivacy;
  capacity: number | null;
  outcome: string | null;
  host_enrollment_id: string | null;
  emoji?: string;
}

export interface RoomsHome {
  happening_now: BookingCard[];
  up_next: BookingCard[];
  my_rooms: { id: string; name: string; category: string; privacy: RoomPrivacy }[];
}

export interface RoomMessage {
  id: string;
  room_id: string;
  enrollment_id: string | null;
  sender_name: string;
  content: string;
  kind: string;
  question_status: string | null;
  created_at: string;
}

export interface RoomPerson {
  id: string;
  display_name: string;
  avatar_url: string | null;
  level: number;
  presence: RoomPresence;
}

export interface CreateBookingInput {
  title: string;
  variant: BookingVariant;
  outcome?: string;
  start_at?: string;
  end_at?: string;
  timezone?: string;
  privacy?: RoomPrivacy;
  capacity?: number;
  room_id?: string;
}

export interface CreateRoomInput {
  name: string;
  category?: string;
  privacy?: RoomPrivacy;
  description?: string;
  topic?: string;
  is_video?: boolean;
  emoji?: string;
}

export async function fetchRoomsHome(): Promise<RoomsHome> {
  const { data } = await portalApi.get<RoomsHome>('/api/portal/community/home');
  return data;
}

export async function fetchRooms(category?: string): Promise<RoomListItem[]> {
  const { data } = await portalApi.get<{ rooms: RoomListItem[] }>('/api/portal/community/rooms', {
    params: category ? { category } : undefined,
  });
  return data.rooms;
}

export async function fetchRoom(roomId: string): Promise<RoomView> {
  const { data } = await portalApi.get<RoomView>(`/api/portal/community/rooms/${roomId}`);
  return data;
}

export async function createRoom(input: CreateRoomInput): Promise<Room> {
  const { data } = await portalApi.post<{ room: Room }>('/api/portal/community/rooms', input);
  return data.room;
}

export async function joinRoom(roomId: string): Promise<RoomMembership> {
  const { data } = await portalApi.post<{ membership: RoomMembership }>(`/api/portal/community/rooms/${roomId}/join`);
  return data.membership;
}

export async function joinVideoRoom(roomId: string): Promise<{ join_url: string | null }> {
  const { data } = await portalApi.post<{ join_url: string | null }>(`/api/portal/community/rooms/${roomId}/join-video`);
  return data;
}

export async function touchRoomPresence(roomId: string, inVideo = false): Promise<void> {
  await portalApi.post(`/api/portal/community/rooms/${roomId}/presence`, { in_video: inVideo });
}

export async function deleteRoom(roomId: string): Promise<void> {
  await portalApi.delete(`/api/portal/community/rooms/${roomId}`);
}

export async function inviteToRoom(roomId: string, enrollmentIds: string[]): Promise<number> {
  const { data } = await portalApi.post<{ granted: number }>(`/api/portal/community/rooms/${roomId}/invite`, { enrollment_ids: enrollmentIds });
  return data.granted;
}

export async function requestRoomAccess(roomId: string): Promise<RoomMembership> {
  const { data } = await portalApi.post<{ membership: RoomMembership }>(`/api/portal/community/rooms/${roomId}/request-access`);
  return data.membership;
}

export async function fetchRoomMessages(roomId: string, since?: string): Promise<{ messages: RoomMessage[]; active_count: number }> {
  const { data } = await portalApi.get<{ messages: RoomMessage[]; active_count: number }>(
    `/api/portal/community/rooms/${roomId}/messages`,
    { params: since ? { since } : undefined },
  );
  return data;
}

export async function postRoomMessage(roomId: string, content: string): Promise<RoomMessage> {
  const { data } = await portalApi.post<{ message: RoomMessage }>(`/api/portal/community/rooms/${roomId}/messages`, { content });
  return data.message;
}

export async function fetchEvents(): Promise<BookingCard[]> {
  const { data } = await portalApi.get<{ events: BookingCard[] }>('/api/portal/community/events');
  return data.events;
}

export async function createBooking(input: CreateBookingInput): Promise<BookingCard> {
  const { data } = await portalApi.post<{ booking: BookingCard }>('/api/portal/community/bookings', input);
  return data.booking;
}

export async function rsvpBooking(bookingId: string, rsvp_state: 'going' | 'declined'): Promise<void> {
  await portalApi.post(`/api/portal/community/bookings/${bookingId}/rsvp`, { rsvp_state });
}

export async function joinBooking(bookingId: string): Promise<{ join_url: string | null; state: BookingState }> {
  const { data } = await portalApi.post<{ join_url: string | null; state: BookingState }>(`/api/portal/community/bookings/${bookingId}/join`);
  return data;
}

export async function fetchPeople(): Promise<RoomPerson[]> {
  const { data } = await portalApi.get<{ people: RoomPerson[] }>('/api/portal/community/people');
  return data.people;
}
