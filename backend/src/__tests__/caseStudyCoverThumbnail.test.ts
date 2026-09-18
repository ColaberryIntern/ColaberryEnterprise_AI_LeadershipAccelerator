import * as fs from 'fs';
import * as path from 'path';
import {
  artifactPresentation,
  describesDeliveredWork,
} from '../services/caseStudy/caseStudyArtifactPresentation';
import { projectArtifacts, resolveHeroImage } from '../services/caseStudy/caseStudyPublicSections';
import type { CaseStudySnapshotContent } from '../types/caseStudy';

/**
 * SKILL.md §8f: every case study's cover and video poster is a picked, generated
 * thumbnail, published as a `photo` artifact, while the real captures move to the body.
 *
 * WHY THIS EXISTS. The process rests on three facts that live in different files and can
 * each drift without anything else noticing:
 *   1. the default caption in `scripts/case-study-thumbnails/cover-caption.json` must
 *      pass the atmosphere claim scan, or the projection DROPS the picture and the cover
 *      silently falls back to a screenshot (`projectArtifacts`);
 *   2. an explicit `identity.heroImageUrl` naming that photo must beat a screenshot,
 *      which type priority alone never allows (`resolveHeroImage`);
 *   3. the tools §8f names must exist where it says they are.
 * Each is asserted here against the real modules, not a restatement of them.
 */

const ROOT = path.resolve(__dirname, '..', '..', '..');
const TOOLS = path.join(ROOT, 'scripts', 'case-study-thumbnails');
const SKILL = path.join(ROOT, '.claude', 'skills', 'build-case-study', 'SKILL.md');
const IMG = 'https://enterprise.colaberry.ai/site-v2/';

const caption = JSON.parse(fs.readFileSync(path.join(TOOLS, 'cover-caption.json'), 'utf8')) as {
  titlePrefix: string;
  description: string;
};

/** The public artifact is a union; only the `open` arm carries a URL. */
const openUrl = (a: { access: string } & Partial<{ url: string }>): string | null => (a.access === 'open' ? a.url ?? null : null);

const artifact = (over: Record<string, unknown> = {}) => ({
  id: 'a1', artifactType: 'screenshot', title: 'The queue panel', sourceType: 'repo',
  visibility: 'public', status: 'approved', publicUrl: IMG + 'shot-panel.png', ...over,
});
const cover = artifact({
  id: 'a9', artifactType: 'photo', sourceType: 'generated',
  title: `${caption.titlePrefix}an operator catching a falling telephone handset above a safety net`,
  description: caption.description, publicUrl: IMG + 'thumb-x.jpg', previewUrl: IMG + 'thumb-x.jpg',
});
const content = (artifacts: unknown[], heroImageUrl?: string): CaseStudySnapshotContent => ({
  identity: {
    slug: 's', title: 't', organizationIdentityMode: 'named', organizationNamingConsent: true,
    builderIdentityMode: 'role_only', builderNamingConsent: false,
    ...(heroImageUrl ? { heroImageUrl } : {}),
  },
  taxonomy: { capabilities: [], stack: [], deliverables: [] },
  artifacts,
} as never);

describe('§8f cover thumbnail: the caption survives the atmosphere claim scan', () => {
  it('the default description and a well-formed title claim no delivered work', () => {
    expect(describesDeliveredWork(caption.description)).toBe(false);
    expect(describesDeliveredWork(cover.title)).toBe(false);
    expect(caption.titlePrefix).toBe('Illustration: ');
  });

  it('a photo is always atmosphere, so the thumbnail can never read as evidence', () => {
    expect(artifactPresentation('photo')).toBe('atmosphere');
    const projected = projectArtifacts([cover] as never).find((a) => openUrl(a) === cover.publicUrl);
    expect(projected).toBeDefined();
    expect(projected?.presentation).toBe('atmosphere');
  });

  it('a caption that claims the work drops the picture, which is what apply-cover.js refuses first', () => {
    const bad = { ...cover, title: `${caption.titlePrefix}the dashboard in production` };
    expect(describesDeliveredWork(bad.title)).toBe(true);
    expect(projectArtifacts([bad] as never)).toHaveLength(0);
  });
});

describe('§8f cover thumbnail: the chosen photo is the cover, the old cover goes to the body', () => {
  const screenshot = artifact();

  it('with the thumbnail named, it beats the screenshot type priority would pick', () => {
    expect(resolveHeroImage(content([screenshot, cover]))).toBe(IMG + 'shot-panel.png');
    expect(resolveHeroImage(content([screenshot, cover], cover.publicUrl as string))).toBe(IMG + 'thumb-x.jpg');
  });

  it('the previous cover stays an approved open image, so the body can place it', () => {
    const open = projectArtifacts([screenshot, cover] as never).map(openUrl).filter((u) => u !== null);
    expect(open).toEqual([IMG + 'shot-panel.png', IMG + 'thumb-x.jpg']);
  });
});

describe('§8f names only tools that exist', () => {
  const text = fs.readFileSync(SKILL, 'utf8');
  const start = text.indexOf('## 8f.');
  const sec = text.slice(start, text.indexOf('## 9.', start));

  it('has the section, and every tool it names is in scripts/case-study-thumbnails', () => {
    expect(start).toBeGreaterThan(-1);
    for (const tool of ['generate.js', 'build_review.py', 'edit.js', 'finalize.py', 'apply-cover.js', 'cover-caption.json', 'README.md']) {
      expect(sec).toContain(tool);
      expect(fs.existsSync(path.join(TOOLS, tool))).toBe(true);
    }
  });

  it('apply-cover.js keeps the refusals the section promises', () => {
    const src = fs.readFileSync(path.join(TOOLS, 'apply-cover.js'), 'utf8');
    expect(src).toContain("artifact_type: 'photo'");
    expect(src).toContain('describesDeliveredWork');
    expect(src).toContain('deploy the assets first');
    expect(src).toContain("status='published'");
    expect(src).toContain('posterUrl: IMAGE');
  });
});
