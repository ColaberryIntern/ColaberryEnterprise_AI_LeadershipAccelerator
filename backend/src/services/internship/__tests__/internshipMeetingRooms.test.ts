import { applyRoomLinks } from '../internshipMeetingRooms';
import type { RequiredMeeting } from '../internshipCohortService';

// applyRoomLinks is the pure routing rule: an interns-only meeting points at the
// interns room, everything else at the public room. No DB or Zoom is touched.
const meetings: RequiredMeeting[] = [
  { day: 'Monday', kind: 'standup', audience: 'interns_only', title: 'Intern standup' },
  { day: 'Tuesday', kind: 'session', audience: 'public', title: 'AI Internship Presentation' },
  { day: 'Friday', kind: 'session', audience: 'public', title: 'AI Friday Trends' },
];
const rooms = {
  interns: { slug: 'ai-internship-standup', id: 'room-interns', name: 'AI Internship', link: 'https://zoom.us/j/111' },
  public: { slug: 'colaberry-ai-sessions', id: 'room-public', name: 'Colaberry AI Sessions', link: 'https://zoom.us/j/222' },
};

describe('applyRoomLinks', () => {
  it('routes the interns-only meeting to the interns room (slug, id, name, link)', () => {
    const out = applyRoomLinks(meetings, rooms);
    const standup = out.find((m) => m.title === 'Intern standup')!;
    expect(standup.room_slug).toBe('ai-internship-standup');
    expect(standup.room_id).toBe('room-interns');
    expect(standup.room_name).toBe('AI Internship');
    expect(standup.join_url).toBe('https://zoom.us/j/111');
  });

  it('routes public meetings to the public room', () => {
    const out = applyRoomLinks(meetings, rooms);
    for (const m of out.filter((x) => x.audience === 'public')) {
      expect(m.room_slug).toBe('colaberry-ai-sessions');
      expect(m.room_id).toBe('room-public');
      expect(m.room_name).toBe('Colaberry AI Sessions');
      expect(m.join_url).toBe('https://zoom.us/j/222');
    }
  });

  it('keeps an existing link when this run could not mint one (Zoom outage)', () => {
    const withPrior: RequiredMeeting[] = [
      { day: 'Monday', kind: 'standup', audience: 'interns_only', join_url: 'https://zoom.us/j/OLD' },
    ];
    const out = applyRoomLinks(withPrior, { ...rooms, interns: { ...rooms.interns, link: null } });
    expect(out[0].join_url).toBe('https://zoom.us/j/OLD'); // not blanked
    expect(out[0].room_slug).toBe('ai-internship-standup'); // slug still set
    expect(out[0].room_name).toBe('AI Internship');
  });

  it('leaves join_url null when there is neither a new nor a prior link', () => {
    const fresh: RequiredMeeting[] = [{ day: 'Wednesday', kind: 'session', audience: 'public' }];
    const out = applyRoomLinks(fresh, { ...rooms, public: { ...rooms.public, link: null } });
    expect(out[0].join_url).toBeNull();
  });

  it('does not mutate the input meetings', () => {
    const input: RequiredMeeting[] = [{ day: 'Monday', kind: 'standup', audience: 'interns_only' }];
    applyRoomLinks(input, rooms);
    expect(input[0].join_url).toBeUndefined();
    expect(input[0].room_slug).toBeUndefined();
  });
});
