import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchSkillSourcesApi, type PrepSkill, type PrepSourceItem, type PrepSourceKey } from './careerPrepApi';
import { useEscapeLayer } from './useEscapeLayer';

/**
 * Career Prep R1.1: "Where this score comes from". Opened from a source icon beside a skill (its own button,
 * never the row's plan button). Lists every result behind that skill's number from that source, newest first,
 * as the server describes it: the intro video opens in Portfolio, a saved Try answer plays here, an unsaved one
 * says the recording was not kept. A dialog above the room: Esc or Close returns focus to the icon.
 */
export const SOURCE_WORDS: Record<PrepSourceKey, { one: string; many: string }> = {
  video: { one: 'video result', many: 'video results' },
  phone_mock: { one: 'phone mock', many: 'phone mocks' },
  real_interview: { one: 'real interview', many: 'real interviews' },
  training: { one: 'lesson', many: 'lessons' },
  project: { one: 'project', many: 'projects' },
  read_aloud: { one: 'read-aloud warm-up', many: 'read-aloud warm-ups' },
};
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function Item({ it }: { it: PrepSourceItem }): React.ReactElement {
  return (
    <li className="cp-srcitem" data-testid={`cp-srcitem-${it.kind}`}>
      <div className="cp-srcitem-h"><b>{it.label}</b><span className="cp-srcitem-v">{it.value}</span></div>
      <small className="cp-faint">{when(it.at)} CT</small>
      {it.video && (
        <video className="cp-srcitem-video" controls playsInline preload="metadata" poster={it.video.posterUrl} aria-label={it.label} data-testid="cp-srcitem-video">
          <source src={it.video.streamUrl} type="video/mp4" />
        </video>
      )}
      {it.notKept && <small className="cp-faint" data-testid="cp-srcitem-notkept">Recording not kept. Answers are deleted after scoring unless you save them.</small>}
      {it.link && <Link className="cp-linkbtn" to={it.link} data-testid="cp-srcitem-link">{it.kind === 'intro_video' ? 'Watch your intro video' : 'Open your case studies'}</Link>}
    </li>
  );
}

export function SourcesPanel({ skill, source, onClose }: { skill: PrepSkill; source: PrepSourceKey; onClose: () => void }): React.ReactElement {
  const [items, setItems] = useState<PrepSourceItem[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const opener = useRef<Element | null>(typeof document !== 'undefined' ? document.activeElement : null);
  const title = useRef<HTMLHeadingElement>(null);
  useEscapeLayer(true, onClose);
  useEffect(() => {
    title.current?.focus();
    const back = opener.current;
    return () => { if (back instanceof HTMLElement && document.contains(back)) back.focus(); };
  }, []);
  useEffect(() => {
    let live = true;
    fetchSkillSourcesApi(skill.key, source).then((r) => { if (live) setItems(r); }).catch(() => { if (live) setProblem('Could not load where this score comes from. Try again.'); });
    return () => { live = false; };
  }, [skill.key, source]);
  return (
    <div className="cp-srcpanel-back" onClick={onClose} data-testid="cp-srcpanel-back">
      <div className="cp-srcpanel" role="dialog" aria-modal="true" aria-labelledby="cp-srcpanel-h" onClick={(e) => e.stopPropagation()} data-testid="cp-srcpanel">
        <div className="cp-srcpanel-top">
          <h3 id="cp-srcpanel-h" tabIndex={-1} ref={title}>Where this score comes from</h3>
          <button type="button" className="cp-ghost sm" onClick={onClose} data-testid="cp-srcpanel-close">Close</button>
        </div>
        <p className="cp-subline">{skill.label}{skill.score !== undefined ? ` · ${skill.score}` : ''} · {SOURCE_WORDS[source].many}</p>
        {problem && <p role="alert" className="cp-form-problem">{problem}</p>}
        {!problem && items === null && <p className="cp-pending">Loading...</p>}
        {items && items.length === 0 && <p className="cp-muted">No results from this source in the last 90 days.</p>}
        {items && items.length > 0 && <ul className="cp-srclist">{items.map((it, i) => <Item key={`${it.at}-${i}`} it={it} />)}</ul>}
      </div>
    </div>
  );
}
