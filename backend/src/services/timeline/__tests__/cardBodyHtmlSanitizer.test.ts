import * as cheerio from 'cheerio';
import {
  repairMalformedBlockOpenTags,
  findMalformedBlockOpenTags,
} from '../cardBodyHtmlSanitizer';

/**
 * Verbatim excerpt of the production defect: timeline_cards row
 * bc6e4b6b-9595-4c33-86fd-ac1540a15c3f (Week 2, "Prompt Lab: your first system
 * prompt"), as reported 2026-08-14. Note `<pThis` — the paragraph open tag is
 * missing its ">".
 */
const BROKEN_WEEK2 = [
  '<h3>Push Further</h3>',
  '<h4>Troubleshooting Skills</h4>',
  '<pThis prompt will help you practice diagnosing why a Skill might not trigger.</p>',
  "<pre>Claude, let's troubleshoot a Skill that isn't triggering.</pre>",
  '<h4>Sharing Skills Effectively</h4>',
  '<p>This prompt will guide you on how to package and share your Skills.</p>',
  '<pre>Claude, explain best practices for packaging and sharing Skills.</pre>',
].join('\n');

const WELL_FORMED = [
  '<h3>Warm Up</h3>',
  '<h4>Understanding Agent Skills</h4>',
  '<p>This prompt helps you explain what Agent Skills are.</p>',
  '<pre>Claude, please explain what Agent Skills are.</pre>',
].join('\n');

interface PromptItem { title: string; explanation: string; prompt: string }
interface Category { name: string; prompts: PromptItem[] }

/**
 * Mirror of parseCatalog() in frontend/src/components/timeline/PromptCatalogRender.tsx.
 * The frontend uses DOMParser; this uses cheerio, which is parse5-backed and
 * produces the same tree for this input (verified against jsdom before commit).
 *
 * The load matters: the renderer walks DIRECT CHILDREN only, pairing
 * <h3> category / <h4> title / <p> explanation / <pre> prompt. Reproducing that
 * walk here is the whole point, because the bug is invisible at the string level
 * and only shows up once the HTML is parsed into a tree.
 */
function parseCatalog(html: string): Category[] {
  const $ = cheerio.load(`<div id="r">${html}</div>`, null, false);
  const cats: Category[] = [];
  let cur: Category | null = null;
  let curP: PromptItem | null = null;
  $('#r').children().each((_i, el) => {
    const tag = (el as { tagName: string }).tagName.toLowerCase();
    const text = $(el).text().trim();
    if (tag === 'h3') { cur = { name: text, prompts: [] }; cats.push(cur); curP = null; }
    else if (tag === 'h4') {
      if (!cur) { cur = { name: '', prompts: [] }; cats.push(cur); }
      curP = { title: text, explanation: '', prompt: '' };
      cur.prompts.push(curP);
    } else if (tag === 'p') { if (curP) curP.explanation = (curP.explanation ? curP.explanation + ' ' : '') + text; }
    else if (tag === 'pre') { if (curP) curP.prompt = $(el).text() || ''; }
  });
  return cats.filter((c) => c.prompts.length);
}

const allPrompts = (html: string) => parseCatalog(html).flatMap((c) => c.prompts);

describe('cardBodyHtmlSanitizer', () => {
  describe('the production defect it exists to prevent', () => {
    it('REGRESSION: the raw broken body loses prompts and renders an empty prompt box', () => {
      const prompts = allPrompts(BROKEN_WEEK2);
      // Only the heading survives as a direct child. The explanation is consumed
      // into the bogus tag name, and the <pre> plus everything after it is
      // re-parented inside the unclosed <pthis> element.
      expect(prompts).toHaveLength(1);
      expect(prompts[0].title).toBe('Troubleshooting Skills');
      expect(prompts[0].prompt).toBe('');      // the empty box the reviewer saw
      expect(prompts[0].explanation).toBe(''); // swallowed into the tag name
      expect(prompts.some((p) => p.title === 'Sharing Skills Effectively')).toBe(false);
    });

    it('after repair, every prompt renders with its explanation and body', () => {
      const prompts = allPrompts(repairMalformedBlockOpenTags(BROKEN_WEEK2));
      expect(prompts).toHaveLength(2);
      expect(prompts.map((p) => p.title)).toEqual([
        'Troubleshooting Skills',
        'Sharing Skills Effectively',
      ]);
      prompts.forEach((p) => {
        expect(p.prompt.trim()).not.toBe('');
        expect(p.explanation.trim()).not.toBe('');
      });
      expect(prompts[0].prompt).toContain("troubleshoot a Skill");
      expect(prompts[0].explanation).toContain('diagnosing why a Skill might not trigger');
    });

    it('leaves an already-healthy catalog rendering identically', () => {
      expect(allPrompts(repairMalformedBlockOpenTags(WELL_FORMED)))
        .toEqual(allPrompts(WELL_FORMED));
    });
  });

  describe('repairMalformedBlockOpenTags', () => {
    it('inserts exactly the missing ">" and changes nothing else', () => {
      const out = repairMalformedBlockOpenTags(BROKEN_WEEK2);
      expect(out).toBe(BROKEN_WEEK2.replace('<pThis', '<p>This'));
      expect(out.length).toBe(BROKEN_WEEK2.length + 1);
    });

    it('is byte-identical on well-formed HTML (safe to run on every write)', () => {
      expect(repairMalformedBlockOpenTags(WELL_FORMED)).toBe(WELL_FORMED);
    });

    it('never mistakes a valid <pre> for a broken <p>', () => {
      const html = '<pre>code</pre><p>text</p>';
      expect(repairMalformedBlockOpenTags(html)).toBe(html);
    });

    it('leaves tags carrying attributes untouched', () => {
      const html = '<p class="lead">text</p><pre data-lang="ts">x</pre>';
      expect(repairMalformedBlockOpenTags(html)).toBe(html);
    });

    it('leaves end tags and comments untouched', () => {
      const html = '<p>a</p><!-- <pNot a tag --><ul><li>b</li></ul>';
      expect(repairMalformedBlockOpenTags(html)).toBe(html);
    });

    /**
     * Guard against the destructive false positive found while validating this
     * module against production: the Deep Dive cards embed inline SVG, and a
     * prefix-only rule turns `<path .../>` into `<p>ath .../>`, corrupting 13
     * published cards. Real element names that merely share a prefix with a block
     * tag must survive untouched.
     */
    it('never corrupts real elements that share a prefix with a block tag', () => {
      const svg = '<svg viewBox="0 0 24 24"><path d="m21 21-4.3-4.3"/><polyline points="1,2"/><line x1="0"/></svg>';
      expect(repairMalformedBlockOpenTags(svg)).toBe(svg);

      const htmlish = '<picture><source srcset="a.webp"></picture><progress value="1"></progress><option>x</option><header>h</header>';
      expect(repairMalformedBlockOpenTags(htmlish)).toBe(htmlish);

      expect(findMalformedBlockOpenTags(svg)).toEqual([]);
      expect(findMalformedBlockOpenTags(htmlish)).toEqual([]);
    });

    it('repairs headings and list items too', () => {
      expect(repairMalformedBlockOpenTags('<h4Title</h4>')).toBe('<h4>Title</h4>');
      expect(repairMalformedBlockOpenTags('<liItem</li>')).toBe('<li>Item</li>');
    });

    it('repairs several malformed tags in one body', () => {
      const html = '<pOne</p><p>Two</p><pThree</p>';
      expect(repairMalformedBlockOpenTags(html)).toBe('<p>One</p><p>Two</p><p>Three</p>');
    });

    it('is idempotent', () => {
      const once = repairMalformedBlockOpenTags(BROKEN_WEEK2);
      expect(repairMalformedBlockOpenTags(once)).toBe(once);
    });

    it('handles empty and undefined input without throwing', () => {
      expect(repairMalformedBlockOpenTags('')).toBe('');
      expect(repairMalformedBlockOpenTags(undefined as unknown as string)).toBeUndefined();
    });
  });

  describe('findMalformedBlockOpenTags', () => {
    it('reports the offending fragment', () => {
      const found = findMalformedBlockOpenTags(BROKEN_WEEK2);
      expect(found).toHaveLength(1);
      expect(found[0]).toContain('<pThis prompt will help you');
    });

    it('reports nothing for well-formed HTML', () => {
      expect(findMalformedBlockOpenTags(WELL_FORMED)).toEqual([]);
    });

    it('reports every occurrence', () => {
      expect(findMalformedBlockOpenTags('<pOne</p><pTwo</p>')).toHaveLength(2);
    });
  });
});
