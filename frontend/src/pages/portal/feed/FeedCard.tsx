import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import './feed.css';

// The one Facebook-style feed card used across the whole platform. Today renders
// the aggregated feed of these; each other page (Classroom / Projects / Community
// / Cert Prep …) renders its own slice with the same card, so the system reads as
// one connected surface. See project memory: project_portal_fb_feed_system.

export type FeedSource =
  | 'onboarding' | 'schedule' | 'path' | 'classroom' | 'projects'
  | 'community' | 'certprep' | 'people';

export type FeedCTA = {
  label: string;
  to?: string;
  onClick?: () => void;
  variant?: 'berry' | 'cherry' | 'leaf' | 'ghost';
};

export type FeedItem = {
  id: string;
  source: FeedSource;
  sourceLabel: string;
  color: string;            // icon background + source-label color
  icon: React.ReactNode;    // inline SVG
  round?: boolean;          // round icon (people / activity)
  title: string;
  meta?: string;            // short meta (e.g. "Due today", "Week 1")
  when?: string;            // relative time / date
  desc?: string;
  pts?: number;
  cta?: FeedCTA;
  likes?: number;
};

const FeedCard: React.FC<{ item: FeedItem }> = ({ item }) => {
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(item.likes ?? 0);
  const toggleLike = () => { setLiked((v) => !v); setLikes((n) => n + (liked ? -1 : 1)); };
  const ctaClass = `tl-cta ${item.cta?.variant || 'ghost'}`;

  return (
    <div className="fcard" id={`fc-${item.id}`}>
      <div className="fc-head">
        <span className={`ico${item.round ? ' round' : ''}`} style={{ background: item.color }}>{item.icon}</span>
        <div style={{ minWidth: 0 }}>
          <div className="ttl">{item.title}</div>
          <div className="sub">
            <span className="src" style={{ color: item.color }}>{item.sourceLabel}</span>
            {item.meta ? <span> · {item.meta}</span> : null}
            {item.when ? <span> · {item.when}</span> : null}
            {item.pts ? <span> · <span className="ptbadge">+{item.pts} pts</span></span> : null}
          </div>
        </div>
      </div>

      {item.desc && <div className="fc-body"><p>{item.desc}</p></div>}

      <div className="fc-foot">
        <button className={`like${liked ? ' liked' : ''}`} onClick={toggleLike} type="button" aria-label="Like">
          <svg viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'}><path d="M12 21s-7-4.5-9.5-9C.8 8.5 2.5 5 6 5c2 0 3.2 1.3 4 2.5C10.8 6.3 12 5 14 5c3.5 0 5.2 3.5 3.5 7C19 16.5 12 21 12 21z" stroke="currentColor" strokeWidth="2" /></svg>
          <span>{likes}</span>
        </button>
        <button className="cmt" type="button" aria-label="Comment">
          <svg viewBox="0 0 24 24" fill="none"><path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
          <span>Comment</span>
        </button>
        <span className="spacer" />
        {item.cta && (item.cta.to
          ? <Link className={ctaClass} to={item.cta.to}>{item.cta.label}</Link>
          : <button className={ctaClass} type="button" onClick={item.cta.onClick}>{item.cta.label}</button>)}
      </div>
    </div>
  );
};

export default FeedCard;
