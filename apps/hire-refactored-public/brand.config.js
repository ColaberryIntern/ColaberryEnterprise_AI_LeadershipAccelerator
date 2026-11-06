/**
 * hire.refactored.ai brand app configuration.
 *
 * STABLE SLUGS ONLY, the same rule as every brand app here: no tenant UUID, no brand
 * UUID, no secret. `sourceSlug` names the `lead_sources` row intro requests are filed
 * under (`hire-refactored`, seeded by the backend); naming a source grants no access to it.
 *
 * `brandSlug` is `refactored` because this is a Refactored.ai surface: it wears the
 * Refactored "Terminal" design system, vendored under src/assets/design.
 */
module.exports = {
  appSlug: 'hire-refactored-public',
  sourceSlug: 'hire-refactored',
  brandSlug: 'refactored',
  publicUrl: 'https://hire.refactored.ai',
  // The platform API this static site reads. CORS on the platform is open, so the site can
  // live on its own hostname and call it cross-origin; nothing here is built per record.
  platformApiBase: process.env.PLATFORM_API_BASE || 'https://enterprise.colaberry.ai',
  tracking: { enabled: true },
};
