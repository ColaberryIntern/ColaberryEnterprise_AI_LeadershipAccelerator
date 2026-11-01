import { requestMagicLink } from '../participantService';

/**
 * C103: what a PUBLIC signup door answers when the email already has an account.
 *
 * Both `/api/portal/free-signup` and `/api/portal/org/register` used to return a
 * session for an existing account, so typing a member's email into a signup form
 * signed you in as that member (and `pickBestEnrollment` preferred their paid or
 * management row). Typing an email proves nothing about owning it; receiving mail
 * there does. So an existing account gets the same sign-in link the login page
 * sends, and the response carries no account details.
 *
 * Failure path: if the link cannot be sent, `requestMagicLink` throws and the
 * caller's error handler answers 500. We never say "we emailed you" for a send
 * that did not happen. A disabled-portal account gets requestMagicLink's own
 * explanation instead of the generic message.
 */
export const EXISTING_ACCOUNT_MESSAGE =
  'You already have an account with this email. We sent you a sign-in link; it expires in 24 hours.';

export interface CheckEmailResponse {
  check_email: true;
  message: string;
}

export async function emailSignInLinkInstead(email: string): Promise<CheckEmailResponse> {
  const result = await requestMagicLink(email);
  return { check_email: true, message: result.success ? EXISTING_ACCOUNT_MESSAGE : result.message };
}
