/**
 * How a build's title and subtitle render — the two holes that stayed open even
 * once the backend started naming projects.
 *
 * 1. `(tree.name || 'Your build').trim()` — `' '` is TRUTHY, so a whitespace-only
 *    name defeated the `||`, then trimmed to `''`. The card rendered with no
 *    heading at all: worse than the fallback it had just beaten.
 * 2. The descriptor fell back to `name`, so an unnamed build read "Your build"
 *    as both the heading AND the subtitle underneath it.
 *
 * The fallback still exists — a build with genuinely nothing to call it must
 * still render. It should simply never be the normal case, and it must never
 * be printed twice.
 */
import { backendTreeToProject, FALLBACK_NAME, FALLBACK_DESCRIPTOR } from '../projectHydrate';
import type { BackendProjectTree } from '../projectHydrate';

const tree = (over: Partial<BackendProjectTree> = {}): BackendProjectTree => ({
  id: 'p1',
  name: 'GoalKick',
  organization_name: null,
  lists: [{
    id: 'l1', title: 'r0 Skeleton', position: 0,
    tasks: [{
      id: 't1', story_id: 'STORY-001', requirement_key: 'REQ-001',
      title: 'Book a field', description: 'A customer reserves a pitch.',
      status: 'not_started', position: 0, owner_agent: null, release_key: 'r0',
      acceptance: null, build: null, blocked_by: [],
    }],
  }],
  ...over,
});

describe('the build title', () => {
  it('uses the name the server sent', () => {
    expect(backendTreeToProject(tree({ name: 'MeshMedic' })).name).toBe('MeshMedic');
  });

  it('trims a padded name rather than rendering the padding', () => {
    expect(backendTreeToProject(tree({ name: '  HomeHub  ' })).name).toBe('HomeHub');
  });

  it('does NOT render blank for a whitespace-only name', () => {
    // The regression. `' '` used to survive the `||` and trim to `''`.
    const name = backendTreeToProject(tree({ name: ' ' })).name;
    expect(name).toBe(FALLBACK_NAME);
    expect(name).not.toBe('');
  });

  it('does not render blank for a tab/newline-only name either', () => {
    expect(backendTreeToProject(tree({ name: '\t\n ' })).name).toBe(FALLBACK_NAME);
  });

  it('falls back for a null name', () => {
    expect(backendTreeToProject(tree({ name: null })).name).toBe(FALLBACK_NAME);
  });

  it('produces a usable slug even when it fell back', () => {
    // slugify() returns 'restored-build' for an empty string, so a blank name
    // used to silently change the project's slug as well as its heading.
    expect(backendTreeToProject(tree({ name: ' ' })).slug).toBe('your-build');
    expect(backendTreeToProject(tree({ name: 'Peace Of Mind' })).slug).toBe('peace-of-mind');
  });
});

describe('the build descriptor', () => {
  it('prefers the organization name', () => {
    expect(backendTreeToProject(tree({ organization_name: 'Colaberry' })).descriptor).toBe('Colaberry');
  });

  it("uses the first task's description when there is no organization", () => {
    expect(backendTreeToProject(tree()).descriptor).toBe('A customer reserves a pitch.');
  });

  it('never repeats the heading when the build is unnamed', () => {
    // The exact double-render: heading "Your build", subtitle "Your build".
    const p = backendTreeToProject(tree({
      name: null, organization_name: null,
      lists: [{ id: 'l1', title: 'r0', position: 0, tasks: [] }],
    }));
    expect(p.name).toBe(FALLBACK_NAME);
    expect(p.descriptor).toBe(FALLBACK_DESCRIPTOR);
    expect(p.descriptor).not.toBe(p.name);
  });

  it('never repeats the heading when a named build has no other descriptor', () => {
    const p = backendTreeToProject(tree({
      name: 'VendorIQ', organization_name: null,
      lists: [{ id: 'l1', title: 'r0', position: 0, tasks: [] }],
    }));
    expect(p.name).toBe('VendorIQ');
    expect(p.descriptor).toBe(FALLBACK_DESCRIPTOR);
  });

  it('does not echo the heading when the organization name equals the name', () => {
    // A subtitle that restates the heading carries no information at any time,
    // not only in the fallback case.
    const p = backendTreeToProject(tree({ name: 'CoreOps', organization_name: 'CoreOps' }));
    expect(p.name).toBe('CoreOps');
    expect(p.descriptor).toBe(FALLBACK_DESCRIPTOR);
  });

  it('keeps the two fallbacks distinct from each other', () => {
    expect(FALLBACK_DESCRIPTOR).not.toBe(FALLBACK_NAME);
  });
});
