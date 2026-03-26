/**
 * Medium Browser Login Helper
 *
 * One-time interactive script to establish a persistent Playwright session
 * for Medium. Run this on the production server with a display available
 * (X-forwarding or VNC).
 *
 * Usage:
 *   npx ts-node src/scripts/mediumBrowserLogin.ts
 *
 * The script launches a visible browser window pointing at Medium's sign-in
 * page. Log in manually, then press Enter in the terminal to save the session
 * and close the browser.
 */

import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import * as readline from 'readline';

const PROFILE_DIR = process.env.MEDIUM_PROFILE_DIR
  || path.resolve('/data/browser-profiles/medium');

async function main() {
  // Ensure profile directory exists
  if (!fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
    console.log(`Created profile directory: ${PROFILE_DIR}`);
  }

  console.log(`\nLaunching browser with persistent profile at:\n  ${PROFILE_DIR}\n`);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
    ],
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://medium.com/m/signin', { waitUntil: 'domcontentloaded' });

  console.log('='.repeat(60));
  console.log('  Browser is open. Please log into Medium now.');
  console.log('  After you are fully logged in (you see your feed),');
  console.log('  come back here and press ENTER to save the session.');
  console.log('='.repeat(60));

  // Wait for the user to press Enter
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((resolve) => {
    rl.question('\nPress ENTER when login is complete... ', () => {
      rl.close();
      resolve();
    });
  });

  // Verify login by checking for avatar or profile menu
  try {
    const avatarVisible = await page.locator('img[alt*="avatar"], button[aria-label*="user"], div[data-testid="headerAvatar"]')
      .first()
      .isVisible({ timeout: 3000 });
    if (avatarVisible) {
      console.log('\nLogin verified - avatar/profile element detected.');
    } else {
      console.log('\nWarning: Could not detect avatar element. Session may not be fully authenticated.');
      console.log('The session will still be saved. You can re-run this script if needed.');
    }
  } catch {
    console.log('\nWarning: Could not verify login state. Session saved anyway.');
  }

  await context.close();
  console.log(`\nSession saved to: ${PROFILE_DIR}`);
  console.log('Medium browser posting is now ready to use from the admin dashboard.');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
