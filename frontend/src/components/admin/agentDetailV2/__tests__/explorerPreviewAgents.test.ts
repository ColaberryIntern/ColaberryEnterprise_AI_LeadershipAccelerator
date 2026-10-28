import { EXPLORER_PREVIEW_AGENTS, showsExplorerPreview } from '../explorerPreviewAgents';

/**
 * The allowlist that decides which agents' Email tab shows the Explorer Growth preview.
 *
 * This file is the whole reason the list is a constant rather than `agentName === 'Maya'` written
 * inline: the inline form is unpinnable, and the last time this folder used one it silently removed
 * two panels from Maya's Overview. Pinning it means widening who sees the panel is a visible, named
 * change in a diff rather than a side effect of editing a component.
 */
describe('EXPLORER_PREVIEW_AGENTS', () => {
  it('is exactly Maya today, and a newcomer is a failed build rather than a surprise', () => {
    expect([...EXPLORER_PREVIEW_AGENTS]).toEqual(['Maya']);
  });

  it('excludes the other two agents that have a detail page, which is the point of the list', () => {
    // Reese is student success and Dara is curriculum. Explorer Growth decides the ADMISSIONS
    // journey, so showing them these rows would imply an ownership that does not exist.
    expect(showsExplorerPreview('Reese')).toBe(false);
    expect(showsExplorerPreview('Dara')).toBe(false);
  });

  it('shows the panel for Maya', () => {
    expect(showsExplorerPreview('Maya')).toBe(true);
  });

  it('matches the name exactly, so a near miss does not slip through', () => {
    // Guards the failure mode where a rename, a trailing space, or a casing drift quietly turns
    // the gate off (or, worse, on) without anybody editing this list.
    expect(showsExplorerPreview('maya')).toBe(false);
    expect(showsExplorerPreview('Maya ')).toBe(false);
    expect(showsExplorerPreview('Maya2')).toBe(false);
    expect(showsExplorerPreview('MayaAdmissions')).toBe(false);
  });

  it('treats an absent name as "no panel" rather than throwing or defaulting to shown', () => {
    // The Email tab reads this out of its own fetched payload, which is null while loading.
    expect(showsExplorerPreview(null)).toBe(false);
    expect(showsExplorerPreview(undefined)).toBe(false);
    expect(showsExplorerPreview('')).toBe(false);
  });

  it('is frozen, so a caller cannot widen the audience at runtime', () => {
    expect(Object.isFrozen(EXPLORER_PREVIEW_AGENTS)).toBe(true);
    expect(() => {
      (EXPLORER_PREVIEW_AGENTS as string[]).push('Reese');
    }).toThrow();
    expect([...EXPLORER_PREVIEW_AGENTS]).toEqual(['Maya']);
  });
});
