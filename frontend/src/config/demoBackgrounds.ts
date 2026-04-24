/**
 * Industry-themed background images for the demo player poster frames.
 *
 * Matches the pattern the home-page hero uses (external Unsplash image).
 * Keyed by demo scenario ID first, falls back to industry keywords, then
 * to a default hero image.
 *
 * To swap a picture: change the URL here — no component changes needed.
 * Width 1600 is fine because the poster renders at max 800px wide and we
 * want 2x for retina.
 */

const U = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1600&q=70`;

/** Per-scenario-ID overrides (highest priority). */
const BY_SCENARIO_ID: Record<string, string> = {
  // Manufacturing / operational blueprint
  'aixcel-eos-blueprint': U('photo-1504917595217-d4dc5ebe6122'),     // industrial machinery floor
  // Multi-industry executive peer group
  'aixcel-vistage-group': U('photo-1556761175-5973dc0f32e7'),        // executive boardroom
  // Logistics upsell / acceleration
  'aixcel-acceleration-upsell': U('photo-1586528116311-ad8dd3c8310d'), // trucking / logistics
  // Freight operations
  'freight-billing':    U('photo-1586528116311-ad8dd3c8310d'),       // trucks at depot
  'freight-invoice':    U('photo-1601584115197-04ecc0da31d7'),       // warehouse / ops
  'freight-dispute':    U('photo-1553413077-190dd305871c'),          // shipping yard
  'freight-settlement': U('photo-1601582974970-0e5b98b5a1ba'),       // freight logistics
};

/** Fallback by generic industry keyword (case-insensitive contains match). */
const BY_INDUSTRY_KEYWORD: Array<[RegExp, string]> = [
  [/freight|logistic|shipping|trucking/i, U('photo-1586528116311-ad8dd3c8310d')],
  [/manufactur|factory|industrial/i,       U('photo-1504917595217-d4dc5ebe6122')],
  [/healthcare|medical|hospital|clinic/i,  U('photo-1519494026892-80bbd2d6fd0d')],
  [/saas|software|tech|data|ai/i,          U('photo-1451187580459-43490279c0fa')],
  [/ecommerce|retail|e-commerce/i,         U('photo-1563013544-824ae1b704d3')],
  [/consult|advisory|strategy/i,           U('photo-1521737604893-d14cc237f11d')],
  [/finance|financial|banking/i,           U('photo-1460925895917-afdab827c52f')],
  [/construction|contractor/i,             U('photo-1503387762-592deb58ef4e')],
  [/eos|blueprint/i,                       U('photo-1552664730-d307ca884978')],
  [/vistage|executive|ceo|peer/i,          U('photo-1556761175-5973dc0f32e7')],
];

/** Default — the same team-collaboration image the home-page hero uses. */
const DEFAULT_BG = U('photo-1522071820081-009f0129c71c');

/**
 * Resolve a background image URL for a demo scenario.
 * Pass the scenario ID and the display `industry` label — the function tries
 * exact scenario first, then industry keyword match, then the default.
 */
export function getDemoBackground(scenarioId: string, industry?: string): string {
  if (scenarioId && BY_SCENARIO_ID[scenarioId]) return BY_SCENARIO_ID[scenarioId];
  if (industry) {
    for (const [re, url] of BY_INDUSTRY_KEYWORD) {
      if (re.test(industry)) return url;
    }
  }
  return DEFAULT_BG;
}
