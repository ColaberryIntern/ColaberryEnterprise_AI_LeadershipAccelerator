import { nextIncompleteCard } from './classroomNextStep';
import { TimelineFeedCard } from '../../components/timeline/TimelineCard';

const card = (id: string, status: TimelineFeedCard['status']): TimelineFeedCard => ({
  id,
  type: 'reading',
  student_label: 'Reading',
  render_band: 'reading',
  title: `Card ${id}`,
  subtitle: null,
  description: null,
  week: 1,
  bucket: 'learn',
  order: 0,
  difficulty: 'core',
  estimated_time: null,
  points: {},
  competencies: null,
  status,
  quiz_score: null,
  completed_at: null,
});

describe('nextIncompleteCard', () => {
  it('returns the first non-completed card in array order', () => {
    const cards = [card('a', 'completed'), card('b', 'available'), card('c', 'available')];
    expect(nextIncompleteCard(cards)?.id).toBe('b');
  });

  it('returns null when every card is completed', () => {
    const cards = [card('a', 'completed'), card('b', 'completed')];
    expect(nextIncompleteCard(cards)).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(nextIncompleteCard([])).toBeNull();
  });
});
