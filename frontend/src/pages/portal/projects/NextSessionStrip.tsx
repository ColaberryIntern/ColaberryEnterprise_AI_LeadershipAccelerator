import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchSchedule, OnboardingSchedule } from '../../../services/onboardingApi';
import { countdown, firstClassTargetMs, fmtCentralDateTime } from '../today/shellUtils';

// The "next live event (session)" strip — the same beat every page carries just
// under its hero, matching the Today page. Reuses the cohort schedule so the
// countdown is real. Renders the `.te-oh` strip so it looks identical to Today.

const NextSessionStrip: React.FC = () => {
  const [schedule, setSchedule] = useState<OnboardingSchedule | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => { fetchSchedule().then(setSchedule).catch(() => { }); }, []);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const oh = schedule?.next_open_house || null;
  const fc = schedule?.first_class || null;
  const title = oh?.title || (fc ? `${fc.cohort_name || 'Your cohort'} · first class` : null);
  if (!title) return null;

  const targetMs = oh ? new Date(oh.starts_at).getTime() : firstClassTargetMs(fc);
  const cd = countdown(targetMs, now);
  const when = oh ? fmtCentralDateTime(oh.starts_at) : (fc?.start_date ? `Starts ${fc.start_date}` : '');

  return (
    <div className="te-oh">
      <span className="ic">◷</span>
      <div className="body">
        <div className="t">{oh ? 'Next live session' : 'Your first class'} · {title}</div>
        <div className="w">{when}{cd && <> · <span className="cd">{cd.d}d {cd.h}h {cd.m}m {cd.s}s</span></>}</div>
      </div>
      <Link className="te-btn berry sm" to="/portal/schedule">View schedule</Link>
    </div>
  );
};

export default NextSessionStrip;
