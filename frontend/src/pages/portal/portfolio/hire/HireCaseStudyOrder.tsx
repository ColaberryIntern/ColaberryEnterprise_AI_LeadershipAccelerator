import React, { useEffect, useState } from 'react';
import { saveCaseStudyOrder, type CaseStudyOrder } from '../../../../services/hireStudioApi';
import { fullOrder, makeSignature, move, type Loaded } from './hireStudioModel';
import { sectionState } from './HireSectionState';

/**
 * Case studies (kit §3.5): the candidate's PUBLISHED Hire case studies, in the order their
 * profile carousel shows them. ★ makes one the signature, which moves it to the top. Only
 * published case studies appear; the server refuses any other slug.
 */

// Covers may be origin-relative (`/site-v2/...`); the portal is served from that same origin.
const coverSrc = (url: string | null) => url;

interface Props {
  loaded: Loaded<CaseStudyOrder>;
  onSaved: (slugs: string[]) => void;
  onRetry: () => void;
}

const HireCaseStudyOrder: React.FC<Props> = ({ loaded, onSaved, onRetry }) => {
  const [slugs, setSlugs] = useState<string[]>(fullOrder(loaded.value));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setSlugs(fullOrder(loaded.value)); }, [loaded.value]);

  const state = sectionState(loaded, onRetry, 'case studies');
  if (state || !loaded.value) return state;
  const byslug = new Map(loaded.value.cases.map((c) => [c.slug, c]));

  if (!slugs.length) {
    return (
      <section className="cp-card" data-testid="hs-cases">
        <h3 className="cp-card-h">Case studies</h3>
        <p className="cp-muted" data-testid="hs-cases-empty">
          None published on Hire yet. Once a case study about your work is published there, you choose its place here.
        </p>
      </section>
    );
  }

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      onSaved(await saveCaseStudyOrder(slugs));
      setMessage({ ok: true, text: 'Saved. Your carousel follows this order within two minutes.' });
    } catch (e: any) {
      setMessage({ ok: false, text: e?.response?.data?.error || 'That did not save. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="cp-card" aria-labelledby="hs-cases-h" data-testid="hs-cases">
      <h3 className="cp-card-h" id="hs-cases-h">Case studies</h3>
      <p className="cp-muted">This is the order your profile’s carousel shows them in. The ★ one leads.</p>
      <ol className="hs-cases">
        {slugs.map((slug, i) => {
          const c = byslug.get(slug);
          const title = c?.title ?? slug;
          const src = coverSrc(c?.coverImageUrl ?? null);
          return (
            <li key={slug} className={i === 0 ? 'sig' : ''} data-testid="hs-case">
              {src ? <img src={src} alt="" loading="lazy" className="hs-case-cover" /> : <span className="hs-case-cover" aria-hidden="true" />}
              <span className="hs-case-t">{title}{i === 0 && <span className="hs-pill gold">Signature</span>}</span>
              <span className="hs-case-acts">
                <button type="button" className="hs-icon" aria-pressed={i === 0} aria-label={`Make “${title}” your signature`}
                  onClick={() => setSlugs(makeSignature(slugs, slug))} data-testid={`hs-star-${slug}`}>★</button>
                <button type="button" className="hs-icon" aria-label={`Move “${title}” up`} disabled={i === 0}
                  onClick={() => setSlugs(move(slugs, slug, -1))} data-testid={`hs-up-${slug}`}>↑</button>
                <button type="button" className="hs-icon" aria-label={`Move “${title}” down`} disabled={i === slugs.length - 1}
                  onClick={() => setSlugs(move(slugs, slug, 1))} data-testid={`hs-down-${slug}`}>↓</button>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="hs-actions">
        <button type="button" className="cp-btn cp-btn-primary" disabled={busy} onClick={save} data-testid="hs-cases-save">Save order</button>
        {message && <p className={message.ok ? 'cp-ok' : 'hs-error'} role={message.ok ? 'status' : 'alert'} data-testid="hs-cases-msg">{message.text}</p>}
      </div>
    </section>
  );
};

export default HireCaseStudyOrder;
