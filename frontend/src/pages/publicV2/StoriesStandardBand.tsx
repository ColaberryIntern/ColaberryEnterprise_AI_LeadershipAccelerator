import React from 'react';
import Icon from '../../components/publicV2/Icon';
import { EVIDENCE_CLASSES } from '../../config/v2Proof';

/**
 * The evidence standard, on the page that carries the evidence.
 *
 * WHY IT MOVED HERE. `/proof` used to explain the four evidence classes and then
 * promise, in future tense, that "each record WILL carry its evidence class, the
 * artifact behind it and the reviewer who accepted it". That capability shipped -
 * it is what `/stories/:slug` does - so the page was describing as roadmap the
 * thing the site could already show. Ali, 2026-09-04: the records take the
 * `/proof` route over, and this band is the part of the old page that had to come
 * with them.
 *
 * IT IS NOT DECORATION. Every card below it prints a verification class as a
 * word - `verified`, `anonymized`. Without this band that badge is a colour and
 * an adjective; with it, a reader knows `verified` means a third party could
 * check the source, and that `illustrative` would have to carry a sample label.
 * The band explains the vocabulary the cards are about to use, which is why it
 * sits above the results rather than at the foot of the page.
 *
 * THE COPY IS NOT RE-AUTHORED. It reads `EVIDENCE_CLASSES` from `config/v2Proof`,
 * the same constant the old page rendered and the same one that mirrors the
 * backend's `EvidenceClass`. A second wording of this list on a page about not
 * inventing things would be the wrong kind of irony.
 */
export function StoriesStandardBand(): React.ReactElement {
  return (
    <section
      className="cbv2-rv cbv2-section cbv2-section--sunken"
      aria-labelledby="cbv2-standard-title"
      data-testid="stories-standard"
    >
      <div className="cbv2-wrap">
        <p className="cbv2-eyebrow">The standard</p>
        <h2 id="cbv2-standard-title">Four evidence classes, declared on every figure</h2>
        <p className="cbv2-lede cbv2-stories__standard-lede">
          Every record below states which class each of its figures belongs to, and what
          the figure was counted from. A number with no class does not get published.
        </p>

        <ul className="cbv2-stories__standard" data-testid="stories-standard-classes">
          {EVIDENCE_CLASSES.map((evidenceClass) => (
            <li className="cbv2-stories__standard-item" key={evidenceClass.key}>
              {/* No `title`: the class name is printed right beside it, so a
                  label here would only repeat what a screen reader already says. */}
              <Icon name={evidenceClass.icon} size={22} />
              <div>
                <h3 className="cbv2-stories__standard-name">{evidenceClass.key}</h3>
                <p className="cbv2-stories__standard-meaning">{evidenceClass.meaning}</p>
                <p className="cbv2-stories__standard-rule">{evidenceClass.rule}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default StoriesStandardBand;
