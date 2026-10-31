/**
 * The one-page visual's short copy, written for the card rather than cut down to fit it.
 *
 * The first version truncated `af27Data`'s prose algorithmically. It passed the fit audit and the
 * containment audit, and then the rendered page showed "there is no route into the bridg...",
 * "a mutation in either direct..." and "reported 10 ALREA..." -- clipped mid-word, three times.
 * A sentence-boundary fallback does not help when the boundary falls outside the budget.
 *
 * So the visual gets its own complete sentences. The one-pager and the spec are two documents for
 * two readers, not one document and a squeezed copy of it; `af27Data` stays the single source of
 * the FACTS, and nothing here may state a number that is not in it.
 */
module.exports = {
  'view-as': {
    asked: 'Open the impersonated person\'s management portal read-only, or hide the entry with '
      + 'a one-line reason. A silent fall-through must be impossible, proved by a test that '
      + 'drives a view-as session.',
    delivered: 'Hidden, with the reason on the read-only banner. No route into the bridge is '
      + 'left anywhere in the nav to fall through.',
    evidence: 'Three files, and every case is paired with its own control in the employee\'s own '
      + 'session. One check scans the whole nav and names no nav item.',
  },
  preview: {
    asked: 'Do not render the link unless the host actually resolves. Building the preview '
      + 'hosting itself was explicitly out of scope.',
    delivered: 'It renders only when the preview host is configured. The host is unset in '
      + 'production, so nothing renders at all.',
    evidence: 'The host is read per render rather than once at import time, which is what let '
      + 'the test drive it without re-isolating the module registry.',
  },
  names: {
    asked: 'The ten must read as titles. findOrCreate will not repair rows that already exist, '
      + 'so the provisioner and the ten live rows both needed fixing.',
    delivered: 'One naming function beside the titles, called by the provisioner AND by the '
      + 'repair script, so the two can never disagree.',
    evidence: 'A third --execute run against the live database wrote nothing and reported 10 '
      + 'already correct: idempotency measured, not argued.',
  },
};
