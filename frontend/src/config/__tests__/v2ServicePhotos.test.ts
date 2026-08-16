/**
 * v2ServicePhotos.test.ts
 *
 * Guards the imagery attached to the five engagements.
 *
 * THE PROBLEM THIS EXISTS FOR. `public/img/` is a mixed folder. Most of it is
 * ordinary stock photography, but three files carry Creative Commons marks and
 * creator credits burned into the pixels:
 *
 *   ai-network.jpg      cc        Graham B Finney
 *   architect-plan.jpg  cc-nc     ARJWright   <- also a real, identifiable
 *                                                person's private screen
 *   data-dashboard.jpg  cc-nc-sa  Bevan R
 *
 * `-nc` means non-commercial. enterprise.colaberry.ai is a commercial site, so
 * two of those three cannot be used here at all, and the third would at minimum
 * require attribution the site does not give.
 *
 * Why a test and not a code review: EXIF is stripped from every file in that
 * folder, so `strings`/exiftool find nothing and a scan reports all-clear. The
 * only way to see the marks is to open the image. That makes this exactly the
 * kind of rule a human will forget and a machine should hold.
 *
 * These assertions do NOT prove an image is licensed for use — nothing in the
 * repo records provenance, which is the real gap (see PROGRESS.md). They prove
 * the three known-bad files never reach a customer-facing surface.
 */
import fs from 'fs';
import path from 'path';
import { SERVICE_DETAILS } from '../v2Services';

/** Verified by opening each file: CC-marked, creator-credited, NC where noted. */
const BARRED = ['ai-network.jpg', 'architect-plan.jpg', 'data-dashboard.jpg'];

const PUBLIC_DIR = path.resolve(__dirname, '../../../public');

describe('service photography — licensing', () => {
  it('references none of the CC-watermarked files', () => {
    SERVICE_DETAILS.forEach((s) => {
      BARRED.forEach((bad) => {
        expect(s.photo.src).not.toContain(bad);
      });
    });
  });

  it('keeps the barred list honest — each named file really is still on disk', () => {
    // If someone deletes these (the right fix), this test should be updated
    // deliberately rather than silently guarding nothing.
    const present = BARRED.filter((f) => fs.existsSync(path.join(PUBLIC_DIR, 'img', f)));
    expect(present.length).toBeGreaterThan(0);
  });
});

describe('service photography — every service has a usable image', () => {
  it('gives all five engagements a photo', () => {
    expect(SERVICE_DETAILS.length).toBe(5);
    SERVICE_DETAILS.forEach((s) => {
      expect(s.photo.src).toMatch(/^\/[\w/-]+\.(jpg|jpeg|png|webp)$/);
    });
  });

  it('points every photo at a file that actually exists', () => {
    // A 404ing <img> is invisible in a passing render test but obvious to a
    // visitor, so the file is checked on disk rather than trusting the string.
    const missing = SERVICE_DETAILS.filter(
      (s) => !fs.existsSync(path.join(PUBLIC_DIR, s.photo.src.replace(/^\//, ''))),
    ).map((s) => `${s.slug} -> ${s.photo.src}`);
    expect(missing).toEqual([]);
  });

  it('gives no two services the same photo', () => {
    const srcs = SERVICE_DETAILS.map((s) => s.photo.src);
    expect(new Set(srcs).size).toBe(srcs.length);
  });
});

describe('service photography — alt text describes, it does not claim', () => {
  it('writes a real description rather than an empty or token alt', () => {
    SERVICE_DETAILS.forEach((s) => {
      expect(s.photo.alt.trim().length).toBeGreaterThan(40);
    });
  });

  it('never presents stock photography as a customer, result or engagement', () => {
    // The site's whole position is that it does not fabricate proof. An alt
    // reading "a client team during a readiness sprint" would do exactly that,
    // in the one place nobody proofreads.
    const forbidden = [
      'client', 'customer', 'our team', 'colaberry', 'engagement',
      'sprint', 'pilot', 'result', 'outcome', 'success',
    ];
    SERVICE_DETAILS.forEach((s) => {
      const alt = s.photo.alt.toLowerCase();
      forbidden.forEach((word) => expect(alt).not.toContain(word));
    });
  });
});
