import { GOVERNED_OUTBOUND_AGENTS, showsGovernedOutbound } from '../governedOutboundAgents';
import { EXPLORER_PREVIEW_AGENTS } from '../explorerPreviewAgents';

/**
 * The allowlist that decides which agents' workspace carries the outbound approval queue and the
 * capability dial.
 *
 * Pinned for the same reason its sibling `explorerPreviewAgents.test.ts` is pinned, with one
 * difference that raises the stakes: widening THIS list does not add a read-only preview panel, it
 * puts a control that decides whether a real person is contacted onto an agent whose messages it
 * does not govern. So the failure direction tested hardest here is the one where the gate opens.
 */
describe('GOVERNED_OUTBOUND_AGENTS', () => {
  it('is exactly Maya today, and a newcomer is a failed build rather than a surprise', () => {
    expect([...GOVERNED_OUTBOUND_AGENTS]).toEqual(['Maya']);
  });

  it('shows the surfaces for Maya', () => {
    expect(showsGovernedOutbound('Maya')).toBe(true);
  });

  it('excludes every other agent that has a detail page', () => {
    // Not a product preference. The capability vocabulary, its defaults and its refusal set are a
    // frozen compile-time map that exists for Maya alone, and the promotion record is one
    // system_settings row with no agent dimension. A dial rendered for Reese would be a dial over
    // Maya's state wearing Reese's name.
    expect(showsGovernedOutbound('Reese')).toBe(false);
    expect(showsGovernedOutbound('Dara')).toBe(false);
    expect(showsGovernedOutbound('Cory')).toBe(false);
  });

  it('matches the name exactly, so a near miss does not open the gate', () => {
    expect(showsGovernedOutbound('maya')).toBe(false);
    expect(showsGovernedOutbound('MAYA')).toBe(false);
    expect(showsGovernedOutbound('Maya ')).toBe(false);
    expect(showsGovernedOutbound(' Maya')).toBe(false);
    expect(showsGovernedOutbound('Maya2')).toBe(false);
    expect(showsGovernedOutbound('MayaAdmissions')).toBe(false);
  });

  it('treats an absent name as "no surface" rather than throwing or defaulting to shown', () => {
    // The caller reads this off a detail payload that is null while loading. Defaulting to shown
    // during a load would flash an approval control onto an arbitrary agent's page.
    expect(showsGovernedOutbound(null)).toBe(false);
    expect(showsGovernedOutbound(undefined)).toBe(false);
    expect(showsGovernedOutbound('')).toBe(false);
  });

  it('is frozen, so a caller cannot widen the audience at runtime', () => {
    expect(Object.isFrozen(GOVERNED_OUTBOUND_AGENTS)).toBe(true);
    expect(() => {
      (GOVERNED_OUTBOUND_AGENTS as string[]).push('Reese');
    }).toThrow();
    expect([...GOVERNED_OUTBOUND_AGENTS]).toEqual(['Maya']);
  });

  it('is a SEPARATE list from the Explorer preview allowlist, not an alias of it', () => {
    // They happen to hold the same single name today, which is exactly the condition under which
    // somebody later "simplifies" one into the other. They answer different questions - one shows
    // a read-only feed, the other shows a send control - so they must be able to diverge without
    // a refactor. This asserts they are distinct objects, not that they differ in content.
    expect(GOVERNED_OUTBOUND_AGENTS).not.toBe(EXPLORER_PREVIEW_AGENTS);
  });
});
