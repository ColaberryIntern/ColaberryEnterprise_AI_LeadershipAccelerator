import type { PublishPayload } from './socialProviderAdapter';

/**
 * postText - what actually reaches a network, assembled in one place.
 *
 * The tracked link and the paid-placement disclosure are stored apart from the copy, so every
 * adapter has to put them back together. When only the LinkedIn adapter did, the link was
 * minted, stored on the variant, shown in the preview, named in the handoff package - and left
 * out of the post itself (found live on 2026-09-17, the first tracked-link post). One function,
 * so a second network cannot repeat it.
 */
export function assemblePostText(
  content: Pick<PublishPayload, 'text' | 'linkUrl' | 'disclosureText'>,
): string {
  const parts = [content.text];
  // Not duplicated when the operator already typed the link into the copy.
  if (content.linkUrl && !content.text.includes(content.linkUrl)) parts.push(content.linkUrl);
  if (content.disclosureText) parts.push(content.disclosureText);
  return parts.join('\n\n');
}
