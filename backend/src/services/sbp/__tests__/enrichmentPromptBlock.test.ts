/**
 * Every story prompt carries the enrichment protocol through one mechanism.
 *
 * The brief's requirement is not "the prompts mention enrichment"; it is
 * that all of them invoke the same block, so a story cannot opt out and a
 * change to the protocol lands everywhere at once. This holds every story in
 * the pilot plan, STORY-000 included, to the one block, and pins the words
 * that make the block safe: evidence required, business results refused.
 */
import { buildStoryPrompt } from '../buildStoryPrompt';
import { commandCenterPrompt } from '../commandCenterStory';
import { ENRICHMENT_BLOCK_HEADING, enrichmentPromptBlock } from '../enrichmentPromptBlock';
import { enrichmentPathFor, parseEnrichment } from '../storyEnrichmentContract';
import { renderDocs, manifestPaths } from '../renderDocs';
import { BuildPlan } from '../planContract';
import raw from './fixtures/pilot-dryrun-plan.json';

const pilot = raw as unknown as BuildPlan;
const PROJECT = 'cce94c20-a398-45b3-a6fb-b3fc87b6b1ef';
const REPO = 'https://github.com/ColaberryIntern/sponsor-dashboard-248d9d63';

describe('one block, every prompt', () => {
  it('every story in the plan carries the block, naming its own file', () => {
    const manifest = manifestPaths(renderDocs(pilot, { repoUrl: REPO }));
    expect(pilot.stories.length).toBeGreaterThan(3);
    for (const story of pilot.stories) {
      const prompt = buildStoryPrompt(pilot, story, { repoUrl: REPO, manifestPaths: manifest, projectId: PROJECT });
      expect(prompt).toContain(ENRICHMENT_BLOCK_HEADING);
      expect(prompt).toContain(enrichmentPathFor(story.id));
      expect(prompt).toContain(`"projectId": "${PROJECT}"`);
    }
  });

  it('a prompt built with no repo context still carries it', () => {
    const prompt = buildStoryPrompt(pilot, pilot.stories[0], {});
    expect(prompt).toContain(ENRICHMENT_BLOCK_HEADING);
    expect(prompt).toContain('<project_id from .colaberry/manifest.json>');
  });

  it('STORY-000 carries the same block, for its own file', () => {
    const prompt = commandCenterPrompt(pilot, null, { projectId: PROJECT });
    expect(prompt).toContain(ENRICHMENT_BLOCK_HEADING);
    expect(prompt).toContain(enrichmentPathFor('STORY-000'));
    expect(prompt).toContain(`"projectId": "${PROJECT}"`);
  });

  it('the block appears exactly once per prompt', () => {
    const prompt = buildStoryPrompt(pilot, pilot.stories[1], { projectId: PROJECT });
    expect(prompt.split(ENRICHMENT_BLOCK_HEADING)).toHaveLength(2);
  });
});

describe('what the block tells the agent', () => {
  const block = enrichmentPromptBlock({ projectId: PROJECT, storyId: 'STORY-003' });

  it('requires evidence per entry and refuses business results, in those words', () => {
    expect(block).toMatch(/No evidence, no entry/);
    expect(block).toMatch(/Never claim a business result/);
    expect(block).toMatch(/files it as\s+a question for the student rather than replacing/);
  });

  it('says replaying is harmless, so the agent does not try to be clever about it', () => {
    expect(block).toMatch(/pushing it twice changes nothing/);
  });

  it('lists every dimension the contract accepts, and only those', () => {
    const listed = /`dimension` is one of: ([\s\S]*?)\.\n/.exec(block)![1].replace(/\s+/g, ' ').split(', ').map((s) => s.trim());
    expect(listed).toHaveLength(20);
    expect(listed).toContain('success_definition');
    expect(listed).toContain('delivery_profile');
  });

  it('shows an example that parses under the contract once the placeholders are filled', () => {
    const json = /```\n(\{[\s\S]*?\n\})\n```/.exec(block)![1]
      .replace('"<ISO timestamp>"', '"2026-09-11T12:00:00.000Z"')
      .replace('"<sha of your last commit, or null>"', 'null');
    const parsed = parseEnrichment(json);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.event.storyId).toBe('STORY-003');
      expect(parsed.event.factProposals).toHaveLength(1);
    }
  });
});
