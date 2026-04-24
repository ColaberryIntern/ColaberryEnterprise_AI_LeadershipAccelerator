/**
 * Topic-specific background images for demo poster frames.
 *
 * Every scenario in demoScenarios.json has its own entry below so the image
 * matches what the demo is actually ABOUT (storm = lightning, metering =
 * electric meters, vegetation = power lines in trees), not just a generic
 * industry theme.
 *
 * Matches the pattern the home-page hero uses (external Unsplash image).
 * Width 1600 is retina for a 800px-max-width poster. Swap a URL to change
 * the picture for that demo — no component changes needed. If an image
 * ever fails to load, the CSS fallback in InlineDemoPlayer keeps the
 * original navy gradient so it never breaks.
 */

const U = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1600&q=70`;

/** Per-scenario-ID mapping. One entry per demo in demoScenarios.json. */
const BY_SCENARIO_ID: Record<string, string> = {
  // Generic industries
  logistics:     U('photo-1586528116311-ad8dd3c8310d'),   // line of freight trucks
  healthcare:    U('photo-1576091160399-112ba8d25d1d'),   // medical professionals
  saas:          U('photo-1551288049-bebda4e38f71'),      // analytics dashboard on laptop
  ecommerce:     U('photo-1556742049-0cfed4f6a45d'),      // shipping boxes / online retail
  consulting:    U('photo-1521737604893-d14cc237f11d'),   // professional services team meeting
  utility:       U('photo-1473341304170-971dccb5ac1e'),   // high-voltage power lines
  manufacturing: U('photo-1504917595217-d4dc5ebe6122'),   // industrial machinery / factory floor
  realestate:    U('photo-1486406146926-c627a92ad1ab'),   // commercial buildings skyline
  insurance:     U('photo-1450101499163-c8848c66ca85'),   // contract signing / agreements
  education:     U('photo-1524178232363-1fb2b075b655'),   // classroom / corporate training

  // Utility verticals — each tied to its specific operation
  'utility-outage':         U('photo-1548337138-e87d889cc369'),  // electric transformer / substation
  'utility-storm':          U('photo-1605727216801-e27ce1d0cc28'), // lightning storm over grid
  'utility-metering':       U('photo-1581091226033-da5d85cb33ee'), // smart electric meter hardware
  'utility-vegetation':     U('photo-1473773508845-188df298d2d1'), // power lines through forest
  'utility-ratecase':       U('photo-1554224155-6726b3ff858f'),   // financial reports / spreadsheets
  'utility-memberservices': U('photo-1560264280-88b68371db39'),   // call center headset operator
  'utility-fleet':          U('photo-1601584115197-04ecc0da31d7'), // utility service fleet
  'utility-compliance':     U('photo-1589829545856-d10d557cf95f'), // legal / regulatory documents

  // Freight engines — each picks a different logistics angle
  'freight-billing':    U('photo-1586528116311-ad8dd3c8310d'),  // trucks at depot
  'freight-invoice':    U('photo-1553413077-190dd305871c'),     // warehouse / invoices
  'freight-dispute':    U('photo-1494412651409-8963ce7935a7'),  // shipping yard / containers
  'freight-settlement': U('photo-1601584115197-04ecc0da31d7'),  // freight settlement / logistics ops

  // AIXcelerator playbooks — scenarios for Colaberry's partner channel
  'aixcel-eos-blueprint':       U('photo-1504917595217-d4dc5ebe6122'), // manufacturing client context
  'aixcel-vistage-group':       U('photo-1556761175-5973dc0f32e7'),    // executive peer group at a table
  'aixcel-acceleration-upsell': U('photo-1586528116311-ad8dd3c8310d'), // logistics client acceleration
};

/** Default — the same team-collaboration image the home-page hero uses. */
const DEFAULT_BG = U('photo-1522071820081-009f0129c71c');

/**
 * Resolve a background image URL for a demo scenario.
 *
 * Always prefers the explicit per-scenario mapping above. Only falls back
 * to the default when a brand-new scenario is added to demoScenarios.json
 * without a corresponding entry here — at that point, add a row above.
 */
export function getDemoBackground(scenarioId: string, _industry?: string): string {
  if (scenarioId && BY_SCENARIO_ID[scenarioId]) return BY_SCENARIO_ID[scenarioId];
  return DEFAULT_BG;
}
