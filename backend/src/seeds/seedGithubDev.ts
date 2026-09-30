/**
 * seedGithubDev.ts — inject a GitHub personal access token for local dev testing
 *
 * Bypasses the OAuth flow entirely. Pass your GitHub PAT and optionally a
 * repo to pre-connect. The warm test student (test-warm@colaberry.test) is
 * the default target, but you can supply any enrollment ID as the third arg.
 *
 * Run:
 *   npm run seed:github -- <github-pat> [owner/repo] [enrollment-id]
 *
 * Example:
 *   npm run seed:github -- ghp_xxxx kesetebirhan/my-ai-project
 *
 * The PAT needs: repo, read:user scopes.
 * Generate one at: https://github.com/settings/tokens
 *
 * Safe to re-run: upserts the connection, does not duplicate.
 */

import { connectDatabase, sequelize } from '../config/database';
import '../models';
import { Enrollment, GitHubConnection } from '../models';

async function seed() {
  await connectDatabase();
  await sequelize.sync();

  const pat = process.argv[2];
  const repoArg = process.argv[3]; // optional: "owner/repo"
  const enrollmentIdArg = process.argv[4]; // optional: specific enrollment ID

  if (!pat || pat.startsWith('--')) {
    console.error('\nUsage: npm run seed:github -- <github-pat> [owner/repo] [enrollment-id]');
    console.error('  github-pat   Your GitHub personal access token (ghp_...)');
    console.error('  owner/repo   Optional: pre-connect a specific repo (e.g. kesetebirhan/my-project)');
    console.error('  enrollment-id  Optional: target enrollment (defaults to warm test student)\n');
    process.exit(1);
  }

  // Resolve enrollment
  let enrollmentId = enrollmentIdArg;
  if (!enrollmentId) {
    const warm = await Enrollment.findOne({ where: { email: 'test-warm@colaberry.test' } });
    if (!warm) {
      console.error('Warm test student not found. Run `npm run seed:students` first.');
      process.exit(1);
    }
    enrollmentId = warm.id;
    console.log(`\nTargeting warm test student: test-warm@colaberry.test (${enrollmentId})`);
  }

  // Parse optional repo
  let repoOwner: string | undefined;
  let repoName: string | undefined;
  if (repoArg && repoArg.includes('/')) {
    [repoOwner, repoName] = repoArg.split('/');
  }

  // Upsert GitHub connection
  const [connection, created] = await GitHubConnection.findOrCreate({
    where: { enrollment_id: enrollmentId },
    defaults: {
      enrollment_id: enrollmentId,
      access_token_encrypted: pat,
      repo_owner: repoOwner || null,
      repo_name: repoName || null,
      status_json: { dev_injected: true, injected_at: new Date().toISOString() },
    } as any,
  });

  if (!created) {
    await connection.update({
      access_token_encrypted: pat,
      ...(repoOwner ? { repo_owner: repoOwner, repo_name: repoName } : {}),
      status_json: { dev_injected: true, injected_at: new Date().toISOString() },
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log('GITHUB DEV CONNECTION ' + (created ? 'CREATED' : 'UPDATED'));
  console.log('='.repeat(60));
  console.log(`  Enrollment:  ${enrollmentId}`);
  console.log(`  PAT:         ${pat.slice(0, 8)}... (redacted)`);
  if (repoOwner) {
    console.log(`  Repo:        ${repoOwner}/${repoName}`);
  } else {
    console.log(`  Repo:        (not set — student will connect via Project Builder UI)`);
  }
  console.log('\nNote: Webhooks (real-time commit tracking) require a public URL.');
  console.log('For local dev, the Portfolio Agent reads activity on its daily cron run.');
  console.log('To test webhooks locally: install ngrok, then set GITHUB_WEBHOOK_URL.\n');

  process.exit(0);
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
