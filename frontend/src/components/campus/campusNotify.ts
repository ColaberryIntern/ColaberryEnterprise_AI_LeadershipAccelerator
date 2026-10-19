import type { CommunityNotification } from '../../services/communityApi';
import type { BuildingId } from './campusMap';

/**
 * Where a community notification takes the learner on the campus (Colaberry Campus C8).
 *
 * Every notification the portal sends today is a Commons (Collab Cafe) event, so each one maps to a Commons room:
 *  - a post event (mention, reply, like) opens the community feed, exactly where the classic bell already sends it;
 *  - a person event (friend request, friend accepted, new message) opens People, the room where friends and messages live.
 * The switch is exhaustive over the union, so a new notification type fails the build until it is given a place. A value the
 * server sends that this build does not know yet still lands somewhere sensible: the feed.
 */
export interface NotificationPlace { buildingId: BuildingId; route: string }

export const FEED_PLACE: NotificationPlace = { buildingId: 'commons', route: '/portal/community' };
export const PEOPLE_PLACE: NotificationPlace = { buildingId: 'commons', route: '/portal/community/people' };

export function notificationPlace(type: CommunityNotification['notification_type']): NotificationPlace {
  switch (type) {
    case 'mention':
    case 'reply':
    case 'like':
      return FEED_PLACE;
    case 'friend_request':
    case 'friend_accepted':
    case 'new_message':
      return PEOPLE_PLACE;
    default: {
      const unknownType: never = type;
      void unknownType;
      return FEED_PLACE;
    }
  }
}
