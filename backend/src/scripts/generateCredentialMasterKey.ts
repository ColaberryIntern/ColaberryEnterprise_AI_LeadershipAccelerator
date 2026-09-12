/**
 * Mint a master key for the social credential vault, and say exactly where it goes.
 *
 * Run:  cd backend && TS_NODE_TRANSPILE_ONLY=1 npx ts-node src/scripts/generateCredentialMasterKey.ts
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: write the key anywhere. It prints it once. A script that
 * helpfully appended to `.env` would put a live key into a file that is one `git add -A` away
 * from the repository, and this codebase already carries the scar of a committed secret. The
 * operator places it by hand, in two places, and the second one is the part people skip:
 *
 *   1. The production container environment, as SOCIAL_CREDENTIAL_MASTER_KEY.
 *   2. A backup OUTSIDE the repository - Ali's instruction (2026-09-12) is one level up from
 *      the repo root, i.e. beside the checkout and never inside it.
 *
 * WHY THE BACKUP IS NOT OPTIONAL. The key encrypts every stored token. If the box is lost and
 * the key existed only in its environment, every connected account must be reconnected by hand
 * by whoever owns it - for company pages that is an afternoon, and for student accounts it is
 * an email to every student. The ciphertext in the database backup is worthless without it.
 *
 * ROTATION. Mint a second key, move the old one into SOCIAL_CREDENTIAL_PREVIOUS_KEYS as
 * `<oldKeyId>:<oldKeyBase64>`, deploy, run the re-wrap sweep, then drop the old entry. Nothing
 * is read-locked during that window; see credentialVault's `rewrap`.
 */

import { generateMasterKey } from '../services/security/credentialVault';

function main(): void {
  const key = generateMasterKey();

  // Printed, never logged through the structured logger: log pipelines are exactly the place a
  // key must not end up.
  process.stdout.write([
    '',
    'Social credential vault - new master key',
    '========================================',
    '',
    key,
    '',
    'Place it in BOTH of these, then delete this terminal buffer:',
    '',
    '  1. Production container environment:',
    '       SOCIAL_CREDENTIAL_MASTER_KEY=<the key above>',
    '     then restart the backend. Until it is set, accounts cannot be connected and every',
    '     provider stays in handoff mode - which is the current behaviour, so nothing breaks.',
    '',
    '  2. A backup one level ABOVE the repository root (never inside it, never in Basecamp):',
    '       <parent-of-repo>/social-credential-master-key.txt   (chmod 600)',
    '',
    'Verify after deploy:  GET /api/admin/channel-accounts/status  ->  vault_available: true',
    '',
  ].join('\n'));
}

main();
