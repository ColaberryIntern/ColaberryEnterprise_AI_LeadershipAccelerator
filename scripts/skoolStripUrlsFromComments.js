const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const RESPONSES = JSON.parse(fs.readFileSync(path.join(__dirname, '.skool_at_risk.json'), 'utf8'));

const SKOOL_EMAIL = process.env.SKOOL_EMAIL || 'ali_muwwakkil@hotmail.com';
const SKOOL_PASSWORD = process.env.SKOOL_PASSWORD || 'ali00250025';

function stripUrls(body) {
  // Strategy: keep ONLY the personal opener (first 1-2 sentences that reference the author),
  // strip everything that smells like a vendor pitch, append brief peer close + sign-off.
  // Also covers URL stripping (legacy) since boilerplate triggers come first.
  const SIGNOFF = '- Ali Muwwakkil';

  // Anything that triggers vendor-catalog / spam moderation. Truncate BEFORE the first one.
  const triggers = [
    // URLs
    /https?:\/\//i,
    /\bcolaberry\.(ai|com)/i,
    /\[enterprise\./i,
    // Service-catalog phrases
    /\bmy team\b/i,
    /\bwe (specialize|specialise|build|deploy|offer|provide|handle|act|are the delivery)/i,
    /\bour team\b/i,
    /\bproduction AI\b/i,
    /\bmulti[- ]agent orchestration\b/i,
    /\bAIOS install/i,
    /\bcustom backends?\b/i,
    /\bdelivery side\b/i,
    /\bon retainer\b/i,
    /\byou (close|handle) the deal/i,
    // Vendor closers
    /\bcollaborate effectively\b/i,
    /\bLet'?s (discuss|explore) how/i,
    /\bbring your (project|strategy|vision) to life\b/i,
    /\bvisit (our |the )?(partner|partners) page/i,
    /\bcheck out our (partner|partners) page/i,
    /\bexplore (more|further|partnership)/i,
    /\bmore details (are )?available at/i,
    /\bmore info(?:rmation)? (at|on|here)/i,
    /\bDM me or (visit|explore|see|check)/i,
    /\bfor more (info|details|information)/i,
  ];

  let earliest = -1;
  for (const t of triggers) {
    const m = body.search(t);
    if (m >= 0 && (earliest === -1 || m < earliest)) earliest = m;
  }

  let head;
  if (earliest === -1) {
    // No trigger — already clean. Just remove sign-off and we'll re-add.
    const sigIdx = body.lastIndexOf(SIGNOFF);
    head = sigIdx >= 0 ? body.slice(0, sigIdx).trim() : body.trim();
  } else {
    // Truncate to last sentence boundary before the trigger
    const slice = body.slice(0, earliest);
    const lastBoundary = Math.max(
      slice.lastIndexOf('. '),
      slice.lastIndexOf('! '),
      slice.lastIndexOf('? '),
      slice.lastIndexOf('.\n'),
      slice.lastIndexOf('!\n'),
      slice.lastIndexOf('?\n'),
    );
    head = lastBoundary >= 0 ? slice.slice(0, lastBoundary + 1).trim() : slice.trim();
    // Strip dangling connector phrases
    head = head.replace(/\s+(?:If you'?re (interested|looking|aiming)[^.]*|If this aligns[^.]*|Feel free to [^.]*|Let'?s connect[^.]*|Happy to [^.]*)$/gi, '');
    head = head.replace(/[,;:\-\s]+$/, '');
    if (!/[.!?]$/.test(head)) head += '.';
  }

  head = head.replace(/\s{2,}/g, ' ').trim();

  // If the head is now empty or just a fragment, use a neutral peer opener
  if (head.length < 30) {
    head = 'Sounds like an interesting project.';
  }

  return `${head} Happy to share more in a DM if useful. ${SIGNOFF}`;
}

async function login(page) {
  console.log('Logging in...');
  await page.goto('https://www.skool.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.fill('input[type=email]', SKOOL_EMAIL);
  await page.fill('input[type=password]', SKOOL_PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForTimeout(5000);
  console.log('Logged in');
}

async function findOurCommentEditor(page) {
  // Wait for comments to load
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);
  }

  // Find ALL comments authored by "Ali Muwwakkil"
  const result = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a'));
    // Find profile links that contain "Ali Muwwakkil" near them, then walk up to comment container
    const candidates = [];
    for (const link of links) {
      const text = link.textContent || '';
      if (/Ali\s+Muwwakkil/i.test(text)) {
        // Walk up to find comment block
        let parent = link.parentElement;
        while (parent && parent.tagName !== 'BODY') {
          // Skool comments are typically wrapped in styled divs - find one that contains contenteditable trigger context
          const hasMenu = parent.querySelector('button[aria-label*="more" i], button[aria-label*="More" i]');
          if (hasMenu) {
            const rect = parent.getBoundingClientRect();
            candidates.push({ rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height }, hasMenu: true });
            break;
          }
          parent = parent.parentElement;
        }
      }
    }
    return candidates;
  });

  return result;
}

async function editOneComment(page, postUrl, newBody, label) {
  console.log(`\n=== ${label} ===`);
  console.log('  URL:', postUrl);
  await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  // Scroll to load comments - more aggressive for posts with many comments
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);
  }
  // Click any "Show more comments" / "View N replies" buttons
  await page.evaluate(() => {
    const all = document.querySelectorAll('button, span, a, div');
    for (const el of all) {
      const t = (el.textContent || '').trim();
      if (/^(Show more|View \d+ (more |)repl(y|ies)|Show \d+ more|Load more)/i.test(t)) el.click();
    }
  });
  await page.waitForTimeout(2000);
  // One more scroll
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1500);

  // Find Ali Muwwakkil comments and click their kebab dropdown
  // Skool uses styled-components: kebab menu is button[class*="DropdownButton"]
  try {
    const clicked = await page.evaluate(() => {
      const candidates = document.querySelectorAll('a, span, p, div');
      for (const el of candidates) {
        const text = (el.textContent || '').trim();
        if (text.length > 100) continue;
        // Match "Ali Muwwakkil" or "Ali Muwakkil" (Skool may render either)
        if (!/^Ali\s+Muw{1,2}akkil$/i.test(text)) continue;
        // Walk up looking for a sibling/descendant DropdownButton on the same comment
        let parent = el.parentElement;
        for (let i = 0; i < 10 && parent; i++) {
          const dropdownBtn = parent.querySelector('button[class*="DropdownButton"]');
          if (dropdownBtn) {
            dropdownBtn.scrollIntoView({ block: 'center' });
            dropdownBtn.click();
            return { clicked: true, level: i };
          }
          parent = parent.parentElement;
        }
      }
      return { clicked: false };
    });

    console.log('  Menu click result:', JSON.stringify(clicked));
    if (!clicked.clicked) {
      console.log('  SKIP: could not find our comment menu');
      return false;
    }

    await page.waitForTimeout(1200);

    // Click "Edit" in the visible DropdownBackground menu
    const editClicked = await page.evaluate(() => {
      const dropdowns = document.querySelectorAll('[class*="DropdownBackground"]');
      for (const dd of dropdowns) {
        const rect = dd.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const items = dd.querySelectorAll('div, button, a');
        for (const it of items) {
          const txt = (it.textContent || '').trim();
          if (txt === 'Edit' || txt === 'Edit comment' || txt === 'Edit post') {
            it.click();
            return true;
          }
        }
      }
      return false;
    });

    if (!editClicked) {
      console.log('  SKIP: Edit option not found in menu');
      return false;
    }
    console.log('  Edit mode opened');
    await page.waitForTimeout(2000);

    // Replace content in the focused editor
    const focusedEditor = page.locator('.ProseMirror-focused').first();
    await focusedEditor.click();
    await page.waitForTimeout(300);
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(200);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(300);
    await page.keyboard.type(newBody, { delay: 3 });
    await page.waitForTimeout(500);
    // Trigger Tiptap dirty-state so Save becomes enabled
    await page.keyboard.type(' ');
    await page.waitForTimeout(150);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(800);
    console.log('  Body replaced');

    // Click Save via Playwright locator (real mouse event)
    try {
      const saveBtn = page.locator('button:has-text("Save")').last();
      await saveBtn.scrollIntoViewIfNeeded();
      await saveBtn.click({ force: true });
      console.log('  SAVED');
      await page.waitForTimeout(3500);
      return true;
    } catch (err) {
      console.log('  Save click failed:', err.message);
      return false;
    }
  } catch (err) {
    console.log('  FAIL:', err.message.substring(0, 150));
    return false;
  }
}

async function main() {
  console.log(`Editing ${RESPONSES.length} at-risk responses on Skool...`);
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  await login(page);

  let succeeded = 0;
  let failed = 0;

  for (const r of RESPONSES) {
    const newBody = stripUrls(r.body);
    if (newBody === r.body) {
      console.log(`\n=== ${r.id} ===\n  No change after stripping (skip)`);
      continue;
    }
    console.log(`\n--- Original: ${r.body.substring(0, 100)}...`);
    console.log(`--- Cleaned:  ${newBody.substring(0, 100)}...`);
    const ok = await editOneComment(page, r.post_url, newBody, r.id.substring(0, 8));
    if (ok) succeeded++;
    else failed++;
    await page.waitForTimeout(8000); // Anti-detection delay between edits
  }

  await browser.close();
  console.log(`\nDone. Succeeded: ${succeeded}, Failed: ${failed}`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
