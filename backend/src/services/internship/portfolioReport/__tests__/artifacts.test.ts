import { FINISH, artifactFileType, artifactProvenance, artifactSource, artifactUrl, chooseAsks, publishedArtifacts } from '../artifacts';
import { composeInternshipPortfolio } from '../compose';
import { renderInternshipPortfolio } from '../render';
import type { PublishedArtifact } from '../types';
import { NOW, collected, daysAgo, rosterRow } from './fixtures';

/** The default is a file in their repo: the one kind of artifact Ali asked for by name. */
const pub = (over: Partial<PublishedArtifact> = {}): PublishedArtifact => ({
  id: '11111111-2222-4333-8444-555555555555', enrollment_id: 'e1', card_id: 'c1', kind: 'build_artifact',
  title: 'project-standards.pdf', created_at: daysAgo(3), external_url: null,
  repo_path: 'artifacts/week-01/project-standards.pdf', commit_sha: '988eac32a1b2c3d4', upload_name: null, ...over,
});
/** A file they uploaded themselves. */
const upload = (over: Partial<PublishedArtifact> = {}): PublishedArtifact =>
  pub({ repo_path: null, commit_sha: null, upload_name: 'diagram.docx', title: 'diagram.docx', ...over });
/** Something they built elsewhere and submitted. */
const link = (over: Partial<PublishedArtifact> = {}): PublishedArtifact =>
  pub({ repo_path: null, commit_sha: null, upload_name: null, kind: 'claude_studio', external_url: 'https://claude.ai/artifact/abc', ...over });
/**
 * What `runtime/portfolioService.generateArtifact` writes: LLM prose ABOUT the student, with no
 * file, no commit, no upload and no link. This is the row Ali opened on 9 Nov.
 */
const generated = (over: Partial<PublishedArtifact> = {}): PublishedArtifact =>
  pub({ kind: 'case_study', title: 'Week 2 Evaluation Case Study', repo_path: null, commit_sha: null, upload_name: null, external_url: null, ...over });

const report = (over = {}) => composeInternshipPortfolio(collected({ artifacts: [pub()], ...over }), { now: NOW });
const card = (over = {}) => report(over).groups[0].interns[0];

describe('artifacts: only what they actually produced (Ali, 9 Nov: "not placeholders")', () => {
  it('lists the intern\'s own artifacts newest first, and nothing else', () => {
    const p = publishedArtifacts('e1', [
      pub({ id: 'a', title: 'Older', created_at: daysAgo(5) }),
      pub({ id: 'b', title: 'Newer', created_at: daysAgo(1) }),
      pub({ id: 'c', enrollment_id: 'someone-else' }),
    ]);
    expect(p.map((x) => x.title)).toEqual(['Newer', 'Older']);
  });

  it('nothing published means an empty list: no overdue, no due-this-week, no template items', () => {
    const c = card({ artifacts: [] });
    expect(c.artifacts.published).toEqual([]);
    expect(Object.keys(c.artifacts).sort()).toEqual(['asks', 'published']);
    const { html } = renderInternshipPortfolio(report({ artifacts: [] }));
    expect(html).toContain('Nothing published yet.');
    expect(html).not.toMatch(/Overdue, week|Due this week|training artifacts? overdue|more in their portfolio/);
  });

  it('artifacts never become a status reason or an "up next" item', () => {
    const c = card({ artifacts: [] });
    expect(c.status.reasons.join(' ')).not.toMatch(/artifact/);
    expect(c.timeline.next.some((n) => n.kind === 'artifact')).toBe(false);
  });

  it('every published artifact is a link, with no "+N more" cut-off', () => {
    const many = Array.from({ length: 14 }, (_, i) => pub({ id: `00000000-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`, title: `A${i}` }));
    const { html } = renderInternshipPortfolio(report({ artifacts: many }));
    expect(html).toContain('Artifacts they made (14)');
    for (const a of many) expect(html).toContain(`/admin/internship/artifact/${a.id}" target="_blank"`);
  });
});

/**
 * Ali, 9 Nov 2026, on a generated "Week 2 Evaluation Case Study": "I want things that come
 * directly from the repo. Not things that have been created or made up by this process. The data
 * should come from the user ONLY."
 */
describe('artifacts: provenance - the intern made it, or it is not shown', () => {
  it('an artifact the platform generated about the student is not shown anywhere', () => {
    expect(artifactSource(generated())).toBeNull();
    expect(publishedArtifacts('e1', [generated()])).toEqual([]);

    const { html, text } = renderInternshipPortfolio(report({ artifacts: [generated(), pub()] }));
    expect(html).not.toContain('Week 2 Evaluation Case Study');
    expect(text).not.toContain('Week 2 Evaluation Case Study');
    expect(html).toContain('Artifacts they made (1)');
  });

  it('a repo path alone is not provenance: the commit that put the file there is required', () => {
    expect(artifactSource(pub({ commit_sha: null }))).toBeNull();
    expect(artifactSource(pub({ repo_path: null }))).toBeNull();
    expect(artifactSource(pub())).toBe('repo');
  });

  it('uploads and submitted links are the intern\'s work too', () => {
    expect(artifactSource(upload())).toBe('upload');
    expect(artifactSource(link())).toBe('link');
    expect(artifactSource(link({ external_url: 'javascript:alert(1)' }))).toBeNull();
  });

  it('repo files come first, then uploads, then links, whatever the dates say', () => {
    const p = publishedArtifacts('e1', [
      link({ id: 'l', title: 'Link', created_at: daysAgo(0) }),
      upload({ id: 'u', title: 'Upload', created_at: daysAgo(1) }),
      pub({ id: 'r', title: 'Repo', created_at: daysAgo(9) }),
    ]);
    expect(p.map((x) => x.source)).toEqual(['repo', 'upload', 'link']);
  });

  it('each one names where it came from, so the claim is checkable without opening it', () => {
    expect(artifactProvenance(pub())).toBe('artifacts/week-01/project-standards.pdf @ 988eac3');
    expect(artifactProvenance(upload())).toBe('diagram.docx, uploaded');
    expect(artifactProvenance(link())).toBe('claude.ai');

    const { html, text } = renderInternshipPortfolio(report());
    expect(html).toContain('project-standards.pdf @ 988eac3');
    expect(text).toContain('[artifacts/week-01/project-standards.pdf @ 988eac3]');
  });

  it('a provenance value is escaped like everything else', () => {
    const { html } = renderInternshipPortfolio(report({ artifacts: [upload({ upload_name: '<script>x</script>' })] }));
    expect(html).not.toContain('<script>x</script>');
  });
});

describe('artifacts: links', () => {
  it('a Claude Studio artifact opens its own claude.ai page; everything else opens the admin viewer', () => {
    expect(artifactUrl({ id: 'x', external_url: 'https://claude.ai/artifact/abc' })).toBe('https://claude.ai/artifact/abc');
    expect(artifactUrl({ id: 'x', external_url: null })).toBe('https://enterprise.colaberry.ai/admin/internship/artifact/x');
    expect(artifactUrl({ id: 'x', external_url: 'javascript:alert(1)' })).toBe('https://enterprise.colaberry.ai/admin/internship/artifact/x');
  });

  it('published artifacts appear on the timeline as chips that open in a new tab', () => {
    const { html } = renderInternshipPortfolio(report());
    expect(html).toContain('href="https://enterprise.colaberry.ai/admin/internship/artifact/11111111-2222-4333-8444-555555555555" target="_blank"');
  });

  it('a published Command Center is a button; a missing one says so', () => {
    const data = collected({ artifacts: [] });
    data.projects[0].command_center_url = 'https://x.github.io/cc/';
    const withCc = renderInternshipPortfolio(composeInternshipPortfolio(data, { now: NOW })).html;
    expect(withCc).toContain('href="https://x.github.io/cc/" target="_blank"');
    expect(withCc).toContain('Open Command Center');
    expect(renderInternshipPortfolio(report()).html).toContain('No Command Center published');
  });

  it('a non-https Command Center value is never turned into a link', () => {
    const data = collected();
    data.projects[0].command_center_url = 'javascript:alert(1)';
    const html = renderInternshipPortfolio(composeInternshipPortfolio(data, { now: NOW })).html;
    expect(html).not.toContain('javascript:alert');
  });
});

describe('artifacts: what to ask for, with prompt and nudge', () => {
  it('a stuck builder is asked for a Blocker Brief first, and the prompt names their project and next story', () => {
    const data = collected();
    data.projects[0].commits = [{ date: daysAgo(9), author: 'kal', message: 'old work' }];
    const c = composeInternshipPortfolio(data, { now: NOW }).groups[0].interns[0];
    expect(c.artifacts.asks[0].key).toBe('blocker_brief');
    expect(c.artifacts.asks[0].prompt).toContain('Project: Console project (repo: https://github.com/x/y)');
    expect(c.artifacts.asks[0].prompt).toContain('"Next thing"');
    expect(c.artifacts.asks[0].nudge).toMatch(/^Hi Kalkidan, could you put together a Blocker Brief for Console project/);
  });

  it('a builder who reported an issue and kept committing is NOT asked for a Blocker Brief (prod: Quincy)', () => {
    const data = collected({ emails: [{ email: 'kal@example.com', subject: 'Issues found in the scheduler', snippet: '', received_at: daysAgo(3) }] });
    data.projects[0].commits = [{ date: daysAgo(1), author: 'kal', message: 'fix' }];
    const c = composeInternshipPortfolio(data, { now: NOW }).groups[0].interns[0];
    expect(c.artifacts.asks.map((a) => a.key)).not.toContain('blocker_brief');
  });

  it('a reported blocker with no build work since IS a Blocker Brief', () => {
    const data = collected({ emails: [{ email: 'kal@example.com', subject: 'Unable to push, access denied', snippet: '', received_at: daysAgo(1) }] });
    data.projects[0].commits = [{ date: daysAgo(2), author: 'kal', message: 'wip' }];
    const c = composeInternshipPortfolio(data, { now: NOW }).groups[0].interns[0];
    expect(c.artifacts.asks[0].key).toBe('blocker_brief');
  });

  it('a blocker Ali already answered is not a Blocker Brief (prod: Quincy)', () => {
    const data = collected({
      emails: [{ email: 'kal@example.com', subject: 'Unable to push, access denied', snippet: '', received_at: daysAgo(1) }],
      replies: [{ email: 'kal@example.com', subject: 'Re: Unable to push', received_at: daysAgo(1) }],
    });
    data.projects[0].commits = [{ date: daysAgo(2), author: 'kal', message: 'wip' }];
    const c = composeInternshipPortfolio(data, { now: NOW }).groups[0].interns[0];
    expect(c.artifacts.asks.map((a) => a.key)).not.toContain('blocker_brief');
  });

  it('no published Command Center produces the Command Center ask', () => {
    expect(card().artifacts.asks.map((a) => a.key)).toContain('command_center');
  });

  it('a nearly done gov build is asked for a Demo Walkthrough', () => {
    const c = card({
      govPursuits: [{ key: 'gws:a', title: 'Saratoga', stage: 'in_build', decision: 'x', hasActiveIntern: true, assignedInterns: [{ identityId: 'i', name: 'K', email: 'kal@example.com' }], build: { studentProjectId: 'p-console', pct: 91, verified: 10, total: 11, studentProjectName: 'x' } } as any],
    });
    expect(c.artifacts.asks.map((a) => a.key)).toContain('demo_walkthrough');
  });

  it('someone with no project is asked for a Project Proposal', () => {
    const c = composeInternshipPortfolio(collected({ roster: [rosterRow({ project: null })], projects: [] }), { now: NOW }).groups[0].interns[0];
    expect(c.artifacts.asks.map((a) => a.key)).toEqual(['project_proposal']);
  });

  it('never more than three asks', () => {
    const data = collected();
    data.projects[0].commits = [{ date: daysAgo(9), author: 'kal', message: 'old work' }];
    const ctx = composeInternshipPortfolio(data, { now: NOW }).groups[0].interns[0];
    expect(chooseAsks(ctx).length).toBeLessThanOrEqual(3);
    expect(chooseAsks(ctx).map((a) => a.key)).not.toContain('overdue_training');
  });

  it('renders each ask with its prompt and nudge, escaped', () => {
    const data = collected();
    data.projects[0].next_tasks = [{ story_id: 'S', title: '<b>bold</b> story', due_on: null, status: 'x' }];
    const { html, text } = renderInternshipPortfolio(composeInternshipPortfolio(data, { now: NOW }));
    expect(html).toContain('Ask them for');
    expect(html).toContain('Prompt to give them');
    expect(html).toContain('Matching nudge');
    expect(html).not.toContain('<b>bold</b>');
    expect(text).toContain('ASK: ');
  });
});

describe('artifacts: visual PDFs, not Markdown (Ali, 10 Nov 2026)', () => {
  it('knows each file type from the repo path, the upload name or the link', () => {
    expect(artifactFileType(pub())).toBe('pdf');
    expect(artifactFileType(pub({ repo_path: 'a/b/coreops-program-inventory.csv' }))).toBe('spreadsheet');
    expect(artifactFileType(upload())).toBe('word');
    expect(artifactFileType(upload({ upload_name: 'deck.PPTX' }))).toBe('slides');
    expect(artifactFileType(link())).toBe('claude');
    expect(artifactFileType(link({ external_url: 'https://example.github.io/x' }))).toBe('link');
    expect(artifactFileType(pub({ repo_path: 'a/notes.md' }))).toBe('markdown');
    expect(artifactFileType(upload({ upload_name: 'log.txt' }))).toBe('text');
  });

  it('Markdown and plain-text files are not listed as artifacts', () => {
    const p = publishedArtifacts('e1', [
      pub({ id: 'md', repo_path: 'artifacts/week-02/skill-sharing-guide.md' }),
      upload({ id: 'txt', upload_name: 'notes.txt' }),
      pub({ id: 'pdf' }),
      pub({ id: 'csv', repo_path: 'artifacts/week-08/custom-commands.csv' }),
    ]);
    expect(p.map((x) => x.id).sort()).toEqual(['csv', 'pdf']);
  });

  it('groups the chips by type, PDFs first, each group labeled and colored', () => {
    const { html } = renderInternshipPortfolio(report({ artifacts: [link({ id: 'l' }), pub({ id: 'c', repo_path: 'x/a.csv' }), pub({ id: 'p' })] }));
    const at = (s: string): number => html.indexOf(s);
    expect(at('PDF 1')).toBeGreaterThan(-1);
    expect(at('Spreadsheet 1')).toBeGreaterThan(at('PDF 1'));
    expect(at('claude.ai 1')).toBeGreaterThan(at('Spreadsheet 1'));
    expect(html).toContain('#b91c1c'); // PDF red
    expect(html).toContain('#15803d'); // spreadsheet green
  });

  it('every prompt asks for a visual HTML page exported to PDF, never Markdown', () => {
    expect(FINISH).toMatch(/self-contained HTML/);
    expect(FINISH).toMatch(/chart or diagram/);
    expect(FINISH).toMatch(/Save as PDF/);
    expect(FINISH).toMatch(/Do not submit a Markdown/);
    const data = collected();
    data.projects[0].commits = [{ date: daysAgo(9), author: 'kal', message: 'old work' }];
    const c = composeInternshipPortfolio(data, { now: NOW }).groups[0].interns[0];
    const asks = c.artifacts.asks;
    expect(asks.length).toBeGreaterThan(0);
    for (const a of asks) {
      // Nothing they are told to CREATE is Markdown (the warning "Do not submit a Markdown (.md) file" is fine).
      expect(a.prompt).not.toMatch(/Create [^\n]*\.md\b/);
      if (a.key !== 'command_center') {
        expect(a.prompt).toContain('Save as PDF');
        expect(a.nudge).toContain('upload the PDF');
      }
    }
    const none = composeInternshipPortfolio(collected({ roster: [rosterRow({ project: null })], projects: [] }), { now: NOW }).groups[0].interns[0];
    expect(none.artifacts.asks[0].prompt).toContain('PROJECT_PROPOSAL.html');
  });
});
