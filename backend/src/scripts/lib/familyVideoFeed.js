/**
 * familyVideoFeed - one family video a day for the Family Dashboard, as a short silent moving clip
 * (an animated GIF, which plays inside Gmail, Apple Mail and Outlook on the web) with a "Watch the
 * full video" button that opens the real video, with sound, in OneDrive.
 *
 * Ali, 2026-11-16: "Is it possible to bring a video play into the pictures or throw back pictures
 * section?" Email cannot play real video (clients strip <video>, and phone videos are 30-370 MB),
 * so he chose option B: the moving clip plus a share link.
 *
 * Which video: the newest unposted family video from the same window as new photos goes in "Family Photos"
 * (older ones that age out of the window become throwback candidates, so none is lost); when
 * there is none, an older one (closest time of year) goes in "Throw Back Pics". At most one a day.
 * The photo ledger is the record, with media "video": a posted video, any copy of it, and other
 * videos from the same moment are never shown again. Photos and videos of the same moment do not
 * block each other (a clip of the game and a photo of the game are different memories).
 *
 * The clip is cut by ffmpeg straight from OneDrive's short-lived download URL using range reads, so
 * the 100+ MB file is never downloaded whole. The share link is a view-only "anyone with the link"
 * link; Graph returns the same link when asked again, so re-runs do not mint new ones. If the link
 * cannot be made (consent missing), the clip still goes out without the button.
 *
 * Helpers are passed in as `h` ({ takenAt, isBlocked, hashOf, hasTrueDate, labelPhoto, downloadThumb,
 * fetchJson }) to avoid a require cycle with familyPhotoFeed.
 */
const { execFile } = require('child_process');
const { seasonGap } = require('./familyThrowbacks');

const GRAPH = 'https://graph.microsoft.com/v1.0';
const CLIP_SECONDS = 4;
const CLIP_WIDTH = 300;
const CLIP_FPS = 8;
const MAX_GIF_BYTES = 4 * 1024 * 1024; // keeps the whole email comfortably small
const FFMPEG_TIMEOUT_MS = 180000;
// ffmpeg lives in the backend container, not on the host where this cron runs, so it is borrowed
// with `docker exec` (as the feed already borrows psql from the db container). Set
// FAMILY_FFMPEG_CONTAINER='' to use an ffmpeg on the PATH instead.
const FFMPEG_CONTAINER = process.env.FAMILY_FFMPEG_CONTAINER ?? 'accelerator-backend';

const isVideo = (item) => /\.(mp4|mov|m4v)$/i.test(item.name || '') && !!item.file;
const ymd = (item, h) => h.takenAt(item).slice(0, 10);

/** Where to start the clip: 30% in, never running past the end. Seconds. */
function clipStart(durationMs) {
  const d = Math.max(0, Number(durationMs) || 0) / 1000;
  if (d <= CLIP_SECONDS) return 0;
  return Math.min(Math.round(d * 0.3 * 10) / 10, Math.floor((d - CLIP_SECONDS) * 10) / 10);
}

/** "1:23" from milliseconds. */
function fmtDuration(ms) {
  const s = Math.round((Number(ms) || 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Today's video: { item, section: 'new'|'throwback', why } or null. Pure. */
function chooseVideo(items, ledger, today, windowStart, h) {
  const posted = Object.entries(ledger.posted).find(([, p]) => p.postedOn === today && p.media === 'video');
  if (posted) {
    const it = items.find((i) => i.id === posted[0]);
    return it ? { item: it, section: posted[1].section || 'new', why: posted[1].why || '', reused: true } : null;
  }
  const ok = items.filter((i) => {
    const l = ledger.labels[i.id];
    return isVideo(i) && h.hasTrueDate(i) && l && l.family && !h.isBlocked(i, ledger) && ymd(i, h) <= today;
  });
  const fresh = ok.filter((i) => ymd(i, h) >= windowStart).sort((a, b) => h.takenAt(b).localeCompare(h.takenAt(a))); // newest first: what Ali just shot shows tomorrow
  if (fresh.length) return { item: fresh[0], section: 'new', why: '' };
  const gap = (i) => seasonGap(ymd(i, h), today);
  const old = ok.filter((i) => ymd(i, h) < windowStart).sort((a, b) => gap(a) - gap(b) || h.takenAt(b).localeCompare(h.takenAt(a)));
  return old.length ? { item: old[0], section: 'throwback', why: 'A moving Throw Back' } : null;
}

/** Run ffmpeg with args (no shell) and return its stdout as a Buffer. */
function ffmpeg(args) {
  const [cmd, full] = FFMPEG_CONTAINER ? ['docker', ['exec', FFMPEG_CONTAINER, 'ffmpeg', ...args]] : ['ffmpeg', args];
  return new Promise((resolve, reject) => {
    execFile(cmd, full, { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: MAX_GIF_BYTES * 2, encoding: 'buffer' }, (err, out, stderr) => (err ? reject(new Error(`ffmpeg failed: ${String(stderr || err.message).slice(-300)}`)) : resolve(out)));
  });
}

/** Cut a CLIP_SECONDS silent GIF from the video's download URL. Returns a Buffer. */
async function makeClip(downloadUrl, startSec) {
  const vf = `fps=${CLIP_FPS},scale=${CLIP_WIDTH}:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`;
  const buf = await ffmpeg(['-hide_banner', '-loglevel', 'error', '-ss', String(startSec), '-t', String(CLIP_SECONDS), '-i', downloadUrl, '-an', '-vf', vf, '-loop', '0', '-f', 'gif', 'pipe:1']);
  if (!buf.length || buf.slice(0, 3).toString() !== 'GIF') throw new Error('ffmpeg returned no GIF');
  if (buf.length > MAX_GIF_BYTES) throw new Error(`clip too large (${buf.length} bytes)`);
  return buf;
}

async function shareLink(token, itemId, h) {
  const r = await h.fetchJson(`${GRAPH}/me/drive/items/${itemId}/createLink`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'view', scope: 'anonymous' }),
  });
  return r.link && r.link.webUrl;
}

/**
 * Label unlabelled videos by their thumbnail (same family/not-family rules as photos), pick today's
 * video and build its clip. Returns the embeddable video or null. Never throws past a log line for
 * the link; any other failure throws to the caller, which drops the video and keeps the email.
 */
async function compileFamilyVideo({ roll, ledger, today, windowStart, token, h, linkToken }) {
  const videos = roll.filter((i) => isVideo(i) && h.hasTrueDate(i) && !ledger.labels[i.id] && !h.isBlocked(i, ledger));
  let labelled = 0;
  for (const v of videos.slice(0, 40)) {
    try { ledger.labels[v.id] = { ...(await h.labelPhoto((await h.downloadThumb(v)).buf)), name: v.name }; labelled++; } catch (e) { console.warn(`[FamilyVideo] could not label ${v.name}: ${e.message}`); }
  }
  const pick = chooseVideo(roll, ledger, today, windowStart, h);
  if (!pick) { console.log(`[FamilyVideo] newly labelled ${labelled}, no video today`); return { video: null, labelled }; }
  const meta = await h.fetchJson(`${GRAPH}/me/drive/items/${pick.item.id}`, { headers: { Authorization: `Bearer ${token}` } });
  const durationMs = (meta.video && meta.video.duration) || (pick.item.video && pick.item.video.duration) || 0;
  const gif = await makeClip(meta['@microsoft.graph.downloadUrl'], clipStart(durationMs));
  let url = null;
  try { url = await shareLink(linkToken || token, pick.item.id, h); } catch (e) { console.warn(`[FamilyVideo] no share link (${e.message.slice(0, 160)}); sending the clip without a button`); }
  console.log(`[FamilyVideo] newly labelled ${labelled}, ${pick.section} video ${pick.item.name}${pick.reused ? ' (same-day reuse)' : ''}, clip ${gif.length} bytes, link ${url ? 'yes' : 'no'}`);
  return {
    labelled,
    video: { item: pick.item, section: pick.section, why: pick.why, buf: gif, shareUrl: url, duration: fmtDuration(durationMs) },
  };
}

module.exports = { compileFamilyVideo, isVideo, chooseVideo, clipStart, fmtDuration };
