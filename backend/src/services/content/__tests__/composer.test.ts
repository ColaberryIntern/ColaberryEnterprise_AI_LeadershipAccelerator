import {
  applyEdit,
  deriveVariantText,
  fingerprint,
  generateVariants,
  revertToGenerated,
  type Variant,
} from '../composerVariants';
import { validateSubmission, validateVariant, type VariantContext } from '../composerValidation';
import { getProviderCapabilities } from '../../publishing/providerCapabilities';

/**
 * Two properties, both about not doing something silently:
 *
 *   1. Regenerating variants PRESERVES manually-edited copy. The operator's work is never
 *      overwritten as a side effect of anything - only by their own explicit revert.
 *
 *   2. A variant that violates a provider limit BLOCKS submission with a specific reason - the
 *      provider, the limit, the actual value - not a bare "invalid".
 */

const CANONICAL = 'Join our free AI class this Thursday at 6pm CT. Seats are limited. https://learn.colaberry.com/free';
const CANONICAL_V2 = 'Join our free AI class this FRIDAY at 6pm CT. Seats are limited. https://learn.colaberry.com/free';

const TEXT_CTX: VariantContext = { contentType: 'text', mediaCount: 0, links: ['https://learn.colaberry.com/free'] };

describe('regenerating variants never overwrites operator copy', () => {
  it('a generated variant is replaced on regeneration', () => {
    const first = generateVariants(CANONICAL, ['linkedin_member']);
    expect(first[0].source).toBe('generated');
    const second = generateVariants(CANONICAL_V2, ['linkedin_member'], first);
    expect(second[0].text).toContain('FRIDAY');
    expect(second[0].source).toBe('generated');
  });

  it('an EDITED variant is preserved byte-for-byte across regeneration', () => {
    // The acceptance criterion. Sohail rewrote the LinkedIn copy; regenerating for a changed
    // canonical must not touch it.
    const [generated] = generateVariants(CANONICAL, ['linkedin_member']);
    const edited = applyEdit(generated, 'Sohail\'s hand-written LinkedIn version.', CANONICAL);
    const after = generateVariants(CANONICAL_V2, ['linkedin_member'], [edited]);
    expect(after[0].text).toBe('Sohail\'s hand-written LinkedIn version.');
    expect(after[0].source).toBe('edited');
  });

  it('a preserved edit is marked STALE when the canonical it was written against has changed', () => {
    // Not overwritten (their work gone) and not silently current (their work now describes a
    // message that no longer exists). Flagged, so they look.
    const [generated] = generateVariants(CANONICAL, ['linkedin_member']);
    const edited = applyEdit(generated, 'edited', CANONICAL);
    const after = generateVariants(CANONICAL_V2, ['linkedin_member'], [edited]);
    expect(after[0].stale).toBe(true);
  });

  it('a preserved edit is NOT stale when regenerated against the same canonical', () => {
    const [generated] = generateVariants(CANONICAL, ['linkedin_member']);
    const edited = applyEdit(generated, 'edited', CANONICAL);
    const after = generateVariants(CANONICAL, ['linkedin_member'], [edited]);
    expect(after[0].stale).toBe(false);
  });

  it('editing a variant back to exactly the generated text still counts as edited', () => {
    // Provenance is on the variant, not inferred from the text. An operator who retypes the
    // machine version has still made a decision, and regeneration must respect it.
    const [generated] = generateVariants(CANONICAL, ['linkedin_member']);
    const edited = applyEdit(generated, generated.text, CANONICAL);
    expect(edited.source).toBe('edited');
    const after = generateVariants(CANONICAL_V2, ['linkedin_member'], [edited]);
    expect(after[0].text).toBe(generated.text);
    expect(after[0].source).toBe('edited');
  });

  it('mixed: edited providers kept, generated providers refreshed, new providers added', () => {
    const first = generateVariants(CANONICAL, ['linkedin_member', 'meta_facebook_page']);
    const li = applyEdit(first[0], 'LI edited', CANONICAL);
    const after = generateVariants(CANONICAL_V2, ['linkedin_member', 'meta_facebook_page', 'x'], [li, first[1]]);
    expect(after.map((v) => v.provider)).toEqual(['linkedin_member', 'meta_facebook_page', 'x']);
    expect(after[0].text).toBe('LI edited');
    expect(after[1].text).toContain('FRIDAY');
    expect(after[2].source).toBe('generated');
  });

  it('only an explicit revert replaces edited text, and it is the operator\'s own action', () => {
    const [generated] = generateVariants(CANONICAL, ['linkedin_member']);
    const edited = applyEdit(generated, 'edited', CANONICAL);
    const reverted = revertToGenerated(edited, CANONICAL);
    expect(reverted.source).toBe('generated');
    expect(reverted.text).toBe(generated.text);
  });

  it('does not mutate the existing variants it is given', () => {
    const first = generateVariants(CANONICAL, ['linkedin_member']);
    const snapshot = JSON.stringify(first);
    generateVariants(CANONICAL_V2, ['linkedin_member'], first);
    expect(JSON.stringify(first)).toBe(snapshot);
  });

  it('fingerprint is stable and change-sensitive', () => {
    expect(fingerprint(CANONICAL)).toBe(fingerprint(CANONICAL));
    expect(fingerprint(CANONICAL)).not.toBe(fingerprint(CANONICAL_V2));
  });
});

describe('derivation fits the canonical to the provider', () => {
  it('truncates at a word boundary with an ellipsis for X', () => {
    const long = 'word '.repeat(80).trim(); // 399 chars
    const text = deriveVariantText(long, getProviderCapabilities('x'));
    expect(text.length).toBeLessThanOrEqual(280);
    expect(text.endsWith('…')).toBe(true);
    expect(text).not.toMatch(/wor…$/); // did not cut mid-word
  });

  it('strips URLs for a provider where links are not clickable', () => {
    const text = deriveVariantText(CANONICAL, getProviderCapabilities('meta_instagram'));
    expect(text).not.toMatch(/https?:\/\//);
  });

  it('leaves URLs in place where links are inline', () => {
    expect(deriveVariantText(CANONICAL, getProviderCapabilities('linkedin_member'))).toContain('https://learn.colaberry.com/free');
  });
});

describe('a variant violating provider limits blocks submission with a specific reason', () => {
  const NOW = Date.parse('2026-09-11T00:00:00Z');

  it('over the character limit: names the provider, the limit, and how far over', () => {
    const v: Variant = { provider: 'x', text: 'a'.repeat(300), source: 'edited', canonicalFingerprint: 'x', stale: false };
    const r = validateVariant(v, TEXT_CTX, NOW);
    expect(r.ok).toBe(false);
    const p = r.problems.find((x) => x.field === 'text')!;
    expect(p.severity).toBe('block');
    expect(p.message).toBe('X: 300 of 280 characters - 20 over.');
  });

  it('too many hashtags on Instagram', () => {
    const v: Variant = { provider: 'meta_instagram', text: Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(' '), source: 'generated', canonicalFingerprint: 'x', stale: false };
    const r = validateVariant(v, { contentType: 'image', mediaCount: 1, links: [] }, NOW);
    const p = r.problems.find((x) => x.field === 'hashtags')!;
    expect(p.severity).toBe('block');
    expect(p.message).toMatch(/31 hashtags, limit 30/);
  });

  it('a text post to Instagram is blocked - it has no text-only type', () => {
    const v: Variant = { provider: 'meta_instagram', text: 'hello', source: 'generated', canonicalFingerprint: 'x', stale: false };
    const r = validateVariant(v, TEXT_CTX, NOW);
    const p = r.problems.find((x) => x.field === 'contentType')!;
    expect(p.severity).toBe('block');
    expect(p.message).toMatch(/does not accept text posts/);
  });

  it('a carousel over the per-post media cap', () => {
    const v: Variant = { provider: 'x', text: 'hi', source: 'generated', canonicalFingerprint: 'x', stale: false };
    const r = validateVariant(v, { contentType: 'carousel', mediaCount: 5, links: [] }, NOW);
    expect(r.problems.find((x) => x.field === 'media')!.message).toMatch(/5 media items, limit 4/);
  });

  it('submission is blocked if ANY variant blocks - no partial publish by design', () => {
    const ok: Variant = { provider: 'linkedin_member', text: 'fine', source: 'generated', canonicalFingerprint: 'x', stale: false };
    const bad: Variant = { provider: 'x', text: 'a'.repeat(281), source: 'generated', canonicalFingerprint: 'x', stale: false };
    const r = validateSubmission([ok, bad], () => TEXT_CTX, NOW);
    expect(r.ok).toBe(false);
    expect(r.blockers).toHaveLength(1);
    expect(r.blockers[0].provider).toBe('x');
    // The passing variant is still reported as passing; the block is precise.
    expect(r.variants.find((v) => v.provider === 'linkedin_member')!.ok).toBe(true);
  });

  it('a clean submission passes with no blockers', () => {
    const v: Variant = { provider: 'linkedin_member', text: 'fine', source: 'generated', canonicalFingerprint: 'x', stale: false };
    const r = validateSubmission([v], () => TEXT_CTX, NOW);
    expect(r.ok).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  it('a stale registry entry WARNS rather than blocking - the check ran, against old limits', () => {
    const v: Variant = { provider: 'linkedin_member', text: 'fine', source: 'generated', canonicalFingerprint: 'x', stale: false };
    const later = NOW + 200 * 86_400_000;
    const r = validateVariant(v, TEXT_CTX, later);
    expect(r.ok).toBe(true);
    const p = r.problems.find((x) => x.field === 'registry')!;
    expect(p.severity).toBe('warn');
    expect(p.message).toMatch(/last verified on 2026-09-11/);
  });

  it('links in an Instagram caption warn with the workaround, since they will not be clickable', () => {
    const v: Variant = { provider: 'meta_instagram', text: 'see https://learn.colaberry.com', source: 'edited', canonicalFingerprint: 'x', stale: false };
    const r = validateVariant(v, { contentType: 'image', mediaCount: 1, links: ['https://learn.colaberry.com'] }, NOW);
    expect(r.problems.find((x) => x.field === 'links')!.message).toMatch(/bio or a first comment/);
  });
});
