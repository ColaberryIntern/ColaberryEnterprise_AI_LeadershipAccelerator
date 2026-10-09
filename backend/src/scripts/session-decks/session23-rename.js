/**
 * session23-rename.js — retitles Session 23 as a combined Architecture + Build
 * class and rewrites its student-facing description.
 *
 * Session 22 (Week 11 Architecture Day) was not taught, so session 23 carries
 * both halves. The title must still contain "Build Day" and must NOT contain
 * "Architecture Day": detectDayKind() tests /architecture day/i FIRST and would
 * otherwise render the Architecture Day deck instead of the Build Day one.
 * "Architecture + Build Day" satisfies both — same shape Week 7 used when Labor
 * Day forced the identical merge (session 15).
 *
 * Idempotent: re-running sets the same two strings. Prints the before values so
 * the change is reversible by hand.
 *
 * Run inside the container:  node /app/session23-rename.js
 */
const { sequelize } = require('/app/dist/config/database');

const TITLE = 'Week 11 · Architecture + Build Day — Systems Architecture + Architecture Package';
const DESCRIPTION =
  'Both halves of Week 11 in one class. First the architecture: the seven-layer reference model every agentic system maps onto, the four trust boundaries, the two diagrams every package needs, and the INPACT composite that turns readiness into a number. Then three prompts that turn your own repo into a committed architecture package — an inventory bound to the seven layers, system and data-flow diagrams with every boundary labelled, five ADRs that justify your hardest decisions, and a scorecard with a Trust Band and your top three gaps named. You leave with a folder, not slides: the exhibit you defend at the Expo.';

if (!/build day/i.test(TITLE) || /architecture day/i.test(TITLE)) {
  console.error('FAIL title would flip the deck to Architecture Day');
  process.exit(1);
}

sequelize
  .query('SELECT id, title, description FROM live_sessions WHERE session_number = 23', { type: 'SELECT' })
  .then(async (rows) => {
    if (!rows.length) throw new Error('session 23 not found');
    const s = rows[0];
    console.error('BEFORE title: ' + s.title);
    console.error('BEFORE description: ' + String(s.description || '').slice(0, 120) + '…');
    await sequelize.query(
      'UPDATE live_sessions SET title = :title, description = :description WHERE id = :id',
      { replacements: { title: TITLE, description: DESCRIPTION, id: s.id } },
    );
    const after = await sequelize.query('SELECT title, description FROM live_sessions WHERE id = :id', {
      type: 'SELECT', replacements: { id: s.id },
    });
    console.error('AFTER  title: ' + after[0].title);
    console.error('AFTER  description chars: ' + String(after[0].description || '').length);
    process.exit(after[0].title === TITLE && after[0].description === DESCRIPTION ? 0 : 1);
  })
  .catch((e) => { console.error('FAIL ' + e.message); process.exit(1); });
