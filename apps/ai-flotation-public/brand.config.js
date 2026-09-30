/**
 * AI Flotation brand app configuration.
 *
 * STABLE SLUGS ONLY. No tenant UUID, no brand UUID, no secret — the server resolves
 * `sourceSlug` through lead_sources to a tenant and brand. Shipping an ID here would
 * put it in the browser, where anyone could read it and claim it in a hand-crafted
 * request. Naming a source grants no access to it, which is why a slug is safe to publish.
 */
module.exports = {
  appSlug: 'ai-flotation-public',
  sourceSlug: 'ai-flotation',
  brandSlug: 'ai-flotation',
  publicUrl: 'https://aiflotation.com',
  supportEmail: 'build@aiflotation.com',
  // Points at the shared platform backend. During migration this is the existing
  // Enterprise origin; it moves to a neutral tracking host without an app code change.
  platformApiBase: process.env.PLATFORM_API_BASE || 'https://enterprise.colaberry.ai',
  tracking: { enabled: true },
};
