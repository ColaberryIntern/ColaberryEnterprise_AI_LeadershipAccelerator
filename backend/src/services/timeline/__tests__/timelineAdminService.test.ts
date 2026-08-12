/**
 * Unit tests for the pure card-composition core of the Timeline author service.
 * DB-touching functions (create/reorder/clone) are covered by integration; this
 * pins the registry-default + author-override logic that everything relies on.
 */
import { composeCardAttributes, buildVideoMeta, buildImageMeta, buildCourseMeta, CreateCardInput } from '../timelineAdminService';
import { videoFromMetadata, imageFromMetadata } from '../timelineService';
import { resolveOrThrow } from '../typeRegistry';

const COHORT = '11111111-1111-1111-1111-111111111111';

describe('composeCardAttributes', () => {
  it('inherits defaults from the type registry when no overrides given', () => {
    const def = resolveOrThrow('prompt_lab'); // learn/practice, builder-heavy, evidence_required
    const input: CreateCardInput = { cohort_id: COHORT, type: 'prompt_lab' };
    const attrs = composeCardAttributes(def, input, 0);

    expect(attrs.type).toBe('prompt_lab');
    expect(attrs.title).toBe(def.label);            // falls back to type label
    expect(attrs.bucket).toBe(def.bucket);          // 'practice'
    expect(attrs.difficulty).toBe(def.difficulty);  // 'core'
    expect(attrs.points).toEqual({ learning: def.learning_xp, builder: def.builder_xp, community: def.community_xp });
    expect(attrs.estimated_time).toBe(45);          // evidence_required => 45
    expect(attrs.visibility).toBe('draft');         // authored cards start hidden
    expect(attrs.status).toBe('active');
    expect(attrs.cohort_id).toBeNull();             // global curriculum — shared across batches
    expect(attrs.order).toBe(0);
  });

  it('maps registry competency ids into {domain_id, weight} pairs', () => {
    const def = resolveOrThrow('implementation_task'); // architecture, testing, deployment
    const attrs = composeCardAttributes(def, { cohort_id: COHORT, type: 'implementation_task' }, 3);
    expect(attrs.competencies).toEqual(
      def.competencies.map((domain_id) => ({ domain_id, weight: 1 })),
    );
    expect(attrs.order).toBe(3);
  });

  it('lets author overrides win over registry defaults', () => {
    const def = resolveOrThrow('deep_dive');
    const input: CreateCardInput = {
      cohort_id: COHORT, type: 'deep_dive',
      title: '  Week 1 kickoff  ', bucket: 'pre_class', week: 1,
      difficulty: 'stretch', estimated_time: 90,
      points: { learning: 5, builder: 0, community: 0 },
      visibility: 'published',
    };
    const attrs = composeCardAttributes(def, input, 2);

    expect(attrs.title).toBe('Week 1 kickoff'); // trimmed
    expect(attrs.bucket).toBe('pre_class');
    expect(attrs.week).toBe(1);
    expect(attrs.difficulty).toBe('stretch');
    expect(attrs.estimated_time).toBe(90);
    expect(attrs.points).toEqual({ learning: 5, builder: 0, community: 0 });
    expect(attrs.visibility).toBe('published');
  });

  it('defaults estimated_time to 15 for non-evidence types', () => {
    const def = resolveOrThrow('announcement'); // evidence_required=false
    const attrs = composeCardAttributes(def, { cohort_id: COHORT, type: 'announcement' }, 0);
    expect(attrs.estimated_time).toBe(15);
  });

  it('stores an authored video link in metadata.video', () => {
    const def = resolveOrThrow('video');
    const attrs = composeCardAttributes(def, {
      cohort_id: COHORT, type: 'video',
      video: { url: 'https://youtu.be/dQw4w9WgXcQ', presenter: 'Coach Tariq' },
    }, 0);
    expect(attrs.metadata).toEqual({ authored: true, video: { url: 'https://youtu.be/dQw4w9WgXcQ', presenter: 'Coach Tariq', poster: null } });
  });

  it('omits metadata.video when no url is given', () => {
    const def = resolveOrThrow('video');
    const attrs = composeCardAttributes(def, { cohort_id: COHORT, type: 'video' }, 0);
    expect(attrs.metadata).toEqual({ authored: true });
  });
});

describe('buildVideoMeta', () => {
  it('trims + keeps optional presenter/poster', () => {
    expect(buildVideoMeta({ url: '  https://x.com/v.mp4  ', presenter: ' Ram ', poster: '' }))
      .toEqual({ url: 'https://x.com/v.mp4', presenter: 'Ram', poster: null });
  });
  it('returns null without a usable url', () => {
    expect(buildVideoMeta({ url: '   ' })).toBeNull();
    expect(buildVideoMeta(null)).toBeNull();
    expect(buildVideoMeta(undefined)).toBeNull();
  });
});

describe('buildCourseMeta', () => {
  it('carries certName through alongside the display name', () => {
    expect(buildCourseMeta({ name: 'Building with the Claude API · Part 2', certName: 'Claude with the Anthropic API' }))
      .toEqual({ name: 'Building with the Claude API · Part 2', url: null, certName: 'Claude with the Anthropic API' });
  });
  it('omits certName when not given (unaffected — matches pre-existing cards)', () => {
    expect(buildCourseMeta({ name: 'Claude Code 101' })).toEqual({ name: 'Claude Code 101', url: null });
  });
  it('omits certName when it is blank', () => {
    expect(buildCourseMeta({ name: 'Claude Code 101', certName: '   ' })).toEqual({ name: 'Claude Code 101', url: null });
  });
  it('returns null without a usable name or url', () => {
    expect(buildCourseMeta({})).toBeNull();
    expect(buildCourseMeta(null)).toBeNull();
  });
});

describe('card image (write + feed read)', () => {
  it('stores an authored image url in metadata.image (trimmed)', () => {
    const def = resolveOrThrow('blog');
    const attrs = composeCardAttributes(def, {
      cohort_id: COHORT, type: 'blog', image: '  https://cdn.example.com/cover.jpg  ',
    }, 0);
    expect(attrs.metadata).toEqual({ authored: true, image: 'https://cdn.example.com/cover.jpg' });
  });
  it('buildImageMeta returns null for empty / non-string input', () => {
    expect(buildImageMeta('   ')).toBeNull();
    expect(buildImageMeta(null)).toBeNull();
    expect(buildImageMeta(undefined)).toBeNull();
  });
  it('imageFromMetadata reads it back for the student feed, null when absent', () => {
    expect(imageFromMetadata({ authored: true, image: ' https://cdn.example.com/cover.jpg ' }))
      .toBe('https://cdn.example.com/cover.jpg');
    expect(imageFromMetadata({ authored: true })).toBeNull();
    expect(imageFromMetadata(null)).toBeNull();
    expect(imageFromMetadata({ image: 42 })).toBeNull();
  });
});

describe('videoFromMetadata (feed read)', () => {
  it('reads a stored video, defaulting missing extras to null', () => {
    expect(videoFromMetadata({ authored: true, video: { url: 'https://vimeo.com/76979871' } }))
      .toEqual({ url: 'https://vimeo.com/76979871', presenter: null, poster: null, title: null });
  });
  it('returns null when absent, malformed, or url-less', () => {
    expect(videoFromMetadata(null)).toBeNull();
    expect(videoFromMetadata({ authored: true })).toBeNull();
    expect(videoFromMetadata({ video: { presenter: 'x' } })).toBeNull();
    expect(videoFromMetadata({ video: { url: '   ' } })).toBeNull();
  });
});
