/**
 * The rendered `body_html` contract.
 *
 * ClaudeStudioRender parses these exact class names and data attributes back
 * out. If a rename here is not mirrored there the card silently degrades to raw
 * HTML — so the contract is asserted rather than trusted.
 */
import { renderClaudeStudio, studioCardTitle, studioSummary, CLAUDE_STUDIO_STYLE, esc, escAttr, foldShortcuts } from '../claudeStudioFormat';
import { CLAUDE_STUDIOS, studioForWeek } from '../../data/claudeStudios';
import { STAGE_ORDER } from '../../data/claudeStudios/types';

const LAUNCH = { conversation: 'https://claude.ai/new', projects: 'https://claude.ai/projects' };

describe('escaping', () => {
  it('escapes HTML-significant characters in text', () => {
    expect(esc('<script>alert("x")</script>')).toBe('&lt;script&gt;alert("x")&lt;/script&gt;');
    expect(esc('a & b')).toBe('a &amp; b');
  });

  it('escapes quotes in attribute values', () => {
    expect(escAttr('say "hi" & \'bye\'')).toBe('say &quot;hi&quot; &amp; &#39;bye&#39;');
  });

  it('escapes null and undefined to an empty string rather than the word', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});

describe('renderClaudeStudio — the parse contract', () => {
  const html = renderClaudeStudio(studioForWeek(1)!, LAUNCH);

  it('emits the root marker with the launch and certification attributes', () => {
    expect(html).toContain('data-claude-studio="1"');
    expect(html).toContain('data-chat-url="https://claude.ai/new"');
    expect(html).toContain('data-projects-url="https://claude.ai/projects"');
    expect(html).toContain('data-cert-active="0"');
    expect(html).toContain('data-career-asset=');
    expect(html).toContain('data-week-theme=');
  });

  it('ships its own stylesheet so it renders standalone in the generic iframe', () => {
    expect(html).toContain('<style>');
    expect(html).toContain(CLAUDE_STUDIO_STYLE);
  });

  it('emits four stages with the attributes the renderer reads', () => {
    STAGE_ORDER.forEach((key) => {
      expect(html).toContain(`data-stage="${key}"`);
    });
    expect((html.match(/class="cs-stage"/g) || []).length).toBe(4);
    expect((html.match(/data-title="/g) || []).length).toBeGreaterThanOrEqual(4);
    expect((html.match(/data-min="/g) || []).length).toBe(4);
  });

  it('emits every prompt with kind, label, why, and a <pre>', () => {
    const studio = studioForWeek(1)!;
    expect((html.match(/class="cs-prompt"/g) || []).length).toBe(studio.prompts.length);
    expect(html).toContain('data-prompt="starter"');
    expect((html.match(/<pre class="cs-pre">/g) || []).length).toBe(studio.prompts.length);
  });

  it('emits the named blocks the renderer looks up', () => {
    ['project', 'artifact', 'trust', 'deliverables', 'reflection', 'rubric']
      .forEach((name) => expect(html).toContain(`data-block="${name}"`));
  });

  it('marks the reflection checks and the free-response prompt', () => {
    const studio = studioForWeek(1)!;
    expect((html.match(/data-check="1"/g) || []).length).toBe(studio.reflection.checks.length);
    expect(html).toContain('data-free-response="1"');
  });

  it('emits a rubric row per dimension', () => {
    expect((html.match(/<tr data-dimension="/g) || []).length).toBe(5);
  });

  it('opens Claude in a new tab with noopener, and never embeds it', () => {
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
    expect(html).not.toContain('<iframe');
  });

  it('carries no scripts', () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/\son[a-z]+=/i);
  });
});

describe('renderClaudeStudio — every week', () => {
  CLAUDE_STUDIOS.forEach((s) => {
    const html = renderClaudeStudio(s, LAUNCH);

    it(`week ${s.week} renders four stages and all its prompts`, () => {
      expect((html.match(/class="cs-stage"/g) || []).length).toBe(4);
      expect((html.match(/class="cs-prompt"/g) || []).length).toBe(s.prompts.length);
    });

    it(`week ${s.week} sets data-cert-active to match the studio`, () => {
      expect(html).toContain(`data-cert-active="${s.certification_active ? '1' : '0'}"`);
    });

    it(`week ${s.week} has balanced div and section tags`, () => {
      const open = (tag: string) => (html.match(new RegExp(`<${tag}[\\s>]`, 'g') || []) || []).length;
      const close = (tag: string) => (html.match(new RegExp(`</${tag}>`, 'g')) || []).length;
      expect(open('div')).toBe(close('div'));
      expect(open('section')).toBe(close('section'));
      expect(open('table')).toBe(close('table'));
    });

    it(`week ${s.week} states the privacy boundary on the card itself`, () => {
      expect(html).toMatch(/your own authorized Claude account/i);
      expect(html).toMatch(/read by or sent back to this platform/i);
    });
  });
});

describe('card title and summary', () => {
  it('uses the "Claude Studio — {name}" title format', () => {
    expect(studioCardTitle(studioForWeek(3)!)).toBe('Claude Studio — Stakeholder and Requirements Studio');
  });

  it('summarises with the career asset and the four stages', () => {
    const summary = studioSummary(studioForWeek(3)!);
    expect(summary).toContain('Requirements Explorer');
    expect(summary).toMatch(/explore.*Project.*Artifact.*prove/i);
  });
});

// ─── template tightening, from a learner's review of Weeks 1 and 2 (2026-09-16) ──

describe('foldShortcuts — "does not count as finishing" minus what a checkpoint already says', () => {
  it('drops a shortcut that restates a checkpoint (the Week 2 unread-source line)', () => {
    const checkpoints = ['A citation is only a citation if you opened the source. Confirm the source actually says what the brief claims it says.'];
    const shortcuts = ['Citing a source you have not read', 'Recording a contradiction and resolving it by preference rather than by reason'];
    expect(foldShortcuts(checkpoints, shortcuts)).toEqual(['Recording a contradiction and resolving it by preference rather than by reason']);
  });
  it('keeps a shortcut that says something new', () => {
    expect(foldShortcuts(['Numbers need a source.'], ['Skipping the reflection entirely'])).toEqual(['Skipping the reflection entirely']);
  });
  it('never drops everything by accident: an empty checkpoint list changes nothing', () => {
    expect(foldShortcuts([], ['a', 'b'])).toEqual(['a', 'b']);
  });
});

describe('renderClaudeStudio — section order and shape after the tightening', () => {
  it('puts "How this is assessed" BEFORE "What you submit", in every week', () => {
    CLAUDE_STUDIOS.forEach((s) => {
      const html = renderClaudeStudio(s, LAUNCH);
      const rubric = html.indexOf('data-block="rubric"');
      const submit = html.indexOf('data-block="deliverables"');
      expect(rubric).toBeGreaterThan(-1);
      expect(submit).toBeGreaterThan(-1);
      expect(rubric).toBeLessThan(submit);
    });
  });
  it('renders the trust block as one list plus a single compact line, never a second bulleted list', () => {
    CLAUDE_STUDIOS.forEach((s) => {
      const html = renderClaudeStudio(s, LAUNCH);
      const trust = html.slice(html.indexOf('data-block="trust"'), html.indexOf('</section>', html.indexOf('data-block="trust"')));
      expect((trust.match(/<ul>/g) || []).length).toBe(1);
      expect(trust).not.toMatch(/These do not count as finishing/);
    });
  });
  it('Week 2 now opens with a starter that sets the Project up, before the research prompts', () => {
    const wk2 = studioForWeek(2)!;
    expect(wk2.prompts[0].kind).toBe('starter');
    expect(wk2.prompts[0].label).toMatch(/Confirm the Project is loaded/);
    expect(wk2.prompts[0].text).toMatch(/List every source you can actually see/);
  });
});
