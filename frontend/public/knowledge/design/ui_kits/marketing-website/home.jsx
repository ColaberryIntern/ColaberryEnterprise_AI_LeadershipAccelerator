/* Colaberry marketing site — Home view */
const { Button: HButton, Card: HCard, Badge: HBadge, Avatar: HAvatar } = window.ColaberryDesignSystem_098454;

function Photo({ label, tone = 'blue', tall = false, children }) {
  const grad = {
    blue: 'linear-gradient(135deg, var(--blue-400), var(--blue-700))',
    green: 'linear-gradient(135deg, var(--green-400), var(--green-700))',
    red: 'linear-gradient(135deg, var(--red-400), var(--red-700))',
    mix: 'linear-gradient(135deg, var(--blue-500), var(--green-600))',
  }[tone];
  return (
    <div className="cbsite-photo" style={{ background: grad, minHeight: tall ? 380 : 220 }}>
      {children}
      <span className="cbsite-photo__tag"><I n="image"/>{label}</span>
    </div>
  );
}

function HomeView({ go }) {
  const programs = [
    { tone: 'blue', tag: '12 weeks · Beginner-friendly', title: 'Data Analytics', desc: 'Master SQL, reporting and data storytelling with dashboards. No degree required.', icon: 'bar-chart-3' },
    { tone: 'green', tag: '24 weeks · Intermediate', title: 'Data Science', desc: 'Python, machine learning and the statistics behind modern AI systems.', icon: 'brain-circuit' },
    { tone: 'red', tag: 'Add-on · 1 year support', title: 'Career Accelerator', desc: 'Mentorship, interview prep and job coaching until you are hired.', icon: 'rocket' },
  ];
  const steps = [
    { n: '01', icon: 'phone-call', h: 'Talk to admissions', p: 'No tests. Discuss your goals and flexible payment options.' },
    { n: '02', icon: 'laptop', h: 'Learn by doing', p: 'Instructor-led, project-based lessons with real-world data.' },
    { n: '03', icon: 'badge-check', h: 'Get hired', p: 'Build a portfolio, earn badges, and land a data role.' },
  ];
  return (
    <main>
      {/* HERO */}
      <section className="cbsite-hero">
        <div className="cbsite-hero__copy">
          <HBadge tone="green" dot>Texas Workforce Commission approved</HBadge>
          <h1>Future-proof your career in <span className="cb-grad">data &amp; AI</span></h1>
          <p>Colaberry turns ambition into a data career — through hands-on projects, mentorship, and a community built on tenacity. No degree required.</p>
          <div className="cbsite-hero__cta">
            <HButton size="lg" onClick={() => go('enroll')}>Apply now</HButton>
            <HButton size="lg" variant="outline" onClick={() => go('program')} trailingIcon={<I n="arrow-right"/>}>See the program</HButton>
          </div>
          <div className="cbsite-trust">
            <div className="cb-avatar-group">
              <HAvatar name="Mika Rivera" size="sm" /><HAvatar name="Owen Brooks" size="sm" /><HAvatar name="Ada Lovelace" size="sm" /><HAvatar name="Sam Okafor" size="sm" />
            </div>
            <span><strong>5,000+</strong> careers changed since 2012</span>
          </div>
        </div>
        <div className="cbsite-hero__media">
          <Photo label="Students collaborating" tone="mix" tall>
            <div className="cbsite-floatchip cbsite-floatchip--tl"><I n="trending-up"/><div><strong>$74k</strong><span>median starting salary</span></div></div>
            <div className="cbsite-floatchip cbsite-floatchip--br"><I n="users"/><div><strong>49</strong><span>countries served</span></div></div>
          </Photo>
        </div>
      </section>

      {/* STATS */}
      <section className="cbsite-stats">
        {[['5,000+','Graduates placed'],['2012','Founded for veterans'],['1:1','Mentor support'],['12 wks','To job-ready']].map((s,i)=>(
          <div key={i} className="cbsite-stat"><div className="cbsite-stat__n">{s[0]}</div><div className="cbsite-stat__l">{s[1]}</div></div>
        ))}
      </section>

      {/* PROGRAMS */}
      <section className="cbsite-section">
        <div className="cbsite-section__head">
          <HBadge tone="blue">Programs</HBadge>
          <h2>Two proven paths into tech</h2>
          <p>Both bootcamps blend technical depth with the human skills employers actually hire for.</p>
        </div>
        <div className="cbsite-prog">
          {programs.map((p,i)=>(
            <HCard key={i} hoverable media={<div className="cbsite-prog__media" style={{['--g']:`var(--${p.tone}-500)`}}><I n={p.icon}/></div>}>
              <HBadge tone={p.tone}>{p.tag}</HBadge>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
              <HButton variant="link" onClick={()=>go('program')} trailingIcon={<I n="arrow-right"/>}>Course details</HButton>
            </HCard>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="cbsite-section cbsite-section--subtle">
        <div className="cbsite-section__head">
          <HBadge tone="green">How it works</HBadge>
          <h2>From day one to hired</h2>
        </div>
        <div className="cbsite-steps">
          {steps.map((s,i)=>(
            <div key={i} className="cbsite-step">
              <div className="cbsite-step__icon"><I n={s.icon}/></div>
              <span className="cbsite-step__n">{s.n}</span>
              <h3>{s.h}</h3>
              <p>{s.p}</p>
            </div>
          ))}
        </div>
      </section>

      {/* TESTIMONIAL */}
      <section className="cbsite-quote">
        <div className="cbsite-quote__mark"><I n="quote"/></div>
        <blockquote>I had no tech experience before Colaberry. I now lead the team of mentors serving trainees in over 49 countries. This program is a seed — you decide how far it grows.</blockquote>
        <div className="cbsite-quote__by">
          <HAvatar name="Mika Rivera" size="lg" ring />
          <div><strong>Mika Rivera</strong><span>Program Success Manager · Data Analytics grad</span></div>
        </div>
      </section>

      {/* CTA */}
      <section className="cbsite-cta">
        <div className="cbsite-cta__inner">
          <h2>Your data career starts with one conversation.</h2>
          <p>Everyone with a high-school diploma or GED is welcome. Scholarships and flexible payment plans available.</p>
          <div className="cbsite-cta__btns">
            <HButton size="lg" tone="green" onClick={()=>go('enroll')}>Apply now</HButton>
            <HButton size="lg" variant="outline" onClick={()=>go('enroll')}>Download catalog</HButton>
          </div>
        </div>
      </section>
    </main>
  );
}

Object.assign(window, { HomeView, Photo });
