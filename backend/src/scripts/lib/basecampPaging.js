/**
 * Read every page of a Basecamp collection.
 *
 * ## The bug this exists to stop happening a third time
 *
 * `comments.json` returns the OLDEST 15 and pages from there. Two jobs read it unpaginated and
 * both broke on 26 Oct, the day Ellis's ticket crossed fifteen comments:
 *
 *   - the mail sweep's duplicate check fetched a page that could not contain the comment it had
 *     just written, so it filed "Security findings while building Ellis" twice;
 *   - the ticket sync scanned backwards for its own fingerprint through a page that could not
 *     contain it, concluded it had never posted, and posted on every tick that afternoon.
 *
 * Neither job changed. The data grew into a bug that had been there since both were written, and
 * the verification I used to check the filing had the same blind spot, so the first answer I gave
 * was "zero of two filed" when both were sitting on the ticket.
 *
 * **A response holding exactly one page is not an answer, it is a prompt to ask again.** That is
 * the whole rule, and it is why this takes the page size as a parameter rather than hiding it:
 * the stopping condition is "shorter than a full page", never "empty", because an exactly-full
 * last page would otherwise end the loop one page early.
 */

/** Basecamp's default page size. */
const BC_PAGE = 15;

/** Refuse to loop forever on a server that keeps returning full pages. */
const MAX_PAGES = 50;

/**
 * @param fetchPage  (page: number) => Promise<any[]>  one-based
 * @param pageSize   the full-page size that means "ask for more"
 */
async function fetchAllPages(fetchPage, pageSize = BC_PAGE, maxPages = MAX_PAGES) {
  const out = [];
  for (let page = 1; page <= maxPages; page += 1) {
    /* eslint-disable-next-line no-await-in-loop */
    const batch = await fetchPage(page);
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    // Short page means last page. An exactly-full page means there may be more, even if there
    // is not: one wasted request is cheaper than silently truncating the answer.
    if (batch.length < pageSize) break;
  }
  return out;
}

module.exports = { fetchAllPages, BC_PAGE, MAX_PAGES };
