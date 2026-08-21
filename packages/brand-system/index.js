/**
 * Brand app configuration contract.
 *
 * Every public application exports one of these. It carries STABLE SLUGS ONLY — never a
 * tenant UUID, never a brand UUID, never a secret. The server resolves slugs to IDs.
 *
 * This is the browser-side half of the security invariant in tenantResolver.ts: if an
 * app could ship a tenant ID, that ID would be readable by anyone who opened dev tools,
 * and a hand-crafted request could then claim it. Slugs are safe to publish because
 * naming a source does not grant access to it.
 *
 * Plain JavaScript with JSDoc types rather than TypeScript: these packages are consumed
 * by three independently-buildable apps that must not inherit the platform's build
 * toolchain, which is the whole point of the extraction boundary.
 */

/**
 * @typedef {Object} BrandAppConfig
 * @property {string} appSlug      Workspace identity, e.g. 'cpn-public'.
 * @property {string} sourceSlug   Matches lead_sources.slug. Drives tenant resolution.
 * @property {string} brandSlug    Matches brands.slug. Informational for the app.
 * @property {string} publicUrl    Canonical public URL.
 * @property {string} [supportEmail]
 * @property {string} platformApiBase  Where /api/ingest and /api/t/* live.
 * @property {{enabled: boolean}} tracking
 */

/** Fields an app config must carry to be usable. */
const REQUIRED_FIELDS = ['appSlug', 'sourceSlug', 'brandSlug', 'publicUrl', 'platformApiBase'];

/** Keys that must NEVER appear in a browser-shipped config. */
const FORBIDDEN_FIELDS = ['tenantId', 'brandId', 'tenant_id', 'brand_id', 'apiKey', 'secret'];

/**
 * Validate a brand app config. Throws on anything missing or forbidden.
 *
 * The forbidden-field check is not defensive programming for its own sake: it is the
 * automated version of "do not put brand secrets in the frontend", and it fails the
 * app's own build rather than waiting for a code review to catch it.
 *
 * @param {BrandAppConfig} config
 * @returns {BrandAppConfig}
 */
function validateBrandConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('brand config must be an object');
  }

  const missing = REQUIRED_FIELDS.filter((field) => !config[field]);
  if (missing.length > 0) {
    throw new Error(`brand config missing required field(s): ${missing.join(', ')}`);
  }

  const forbidden = FORBIDDEN_FIELDS.filter((field) =>
    Object.prototype.hasOwnProperty.call(config, field),
  );
  if (forbidden.length > 0) {
    throw new Error(
      `brand config must not ship server-resolved identifiers or secrets: ${forbidden.join(', ')}`,
    );
  }

  if (!/^[a-z0-9-]{1,64}$/.test(config.sourceSlug)) {
    throw new Error(`sourceSlug must be lowercase kebab-case: ${config.sourceSlug}`);
  }

  return config;
}

module.exports = { validateBrandConfig, REQUIRED_FIELDS, FORBIDDEN_FIELDS };
