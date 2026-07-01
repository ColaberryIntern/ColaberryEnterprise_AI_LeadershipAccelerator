/* Colaberry marketing site — Program detail + Enroll views */
const { Button: PButton, Card: PCard, Badge: PBadge, Input: PInput, Checkbox: PCheckbox } = window.ColaberryDesignSystem_098454;

function ProgramView({ go }) {
  const [open, setOpen] = React.useState(0);
  const modules = [
    { h: 'Foundations of Data Analytics', d: 'How data drives decisions, the analyst workflow, and reading real datasets.', wk: 'Weeks 1–2' },
    { h: 'SQL & SQL Server', d: 'Querying, joins, aggregation and building reporting tables with SSDT.', wk: 'Weeks 3–6' },
    { h: 'Reporting with SSRS & SSIS', d: 'ETL pipelines, report architecture and automated delivery.', wk: 'Weeks 7–9' },
    { h: 'Dashboards & Storytelling', d: 'Turn analysis into compelling dashboards and a portfolio project.', wk: 'Weeks 10–12' },
  ];
  const faqs = [
    { q: 'Do I need a degree or experience?', a: 'No. Everyone with a high-school diploma or GED is welcome — there are no tests in admissions.' },
    { q: 'Is it online or in person?', a: 'Both. Join live online from anywhere, or on campus in Plano, TX. Sessions are instructor-led.' },
    { q: 'How do I pay for it?', a: 'Scholarships, military grants, loan options and Income Share Agreements are available to fit your situation.' },
    { q: 'What happens after I finish?', a: 'The Career Accelerator adds mentorship, interview prep and job coaching with one year of on-the-job support.' },
  ];
  const tools = ['SQL Server', 'SSRS', 'SSIS', 'Power BI', 'Excel', 'Git'];
  return (
    <main>
      <div className="cbsite-prog-hero">
        <div className="cbsite-prog-hero__inner">
          <div className="cbsite-bc"><a onClick={()=>go('home')}>Home</a> <I n="chevron-right"/> <a onClick={()=>go('home')}>Programs</a> <I n="chevron-right"/> <span>Data Analytics</span></div>
          <div className="cbsite-prog-hero__grid">
            <div>
              <PBadge tone="blue" dot>Now enrolling · Spring cohort</PBadge>
              <h1>Data Analytics Bootcamp</h1>
              <p>Become job-ready in 12 weeks. Learn the exact SQL, reporting and dashboard skills employers hire for — guided by industry mentors, start to finish.</p>
              <div className="cbsite-meta">
                <span><I n="clock"/> 12 weeks</span>
                <span><I n="monitor"/> Online or Plano, TX</span>
                <span><I n="signal"/> Beginner-friendly</span>
                <span><I n="globe"/> 49 countries</span>
              </div>
              <div className="cbsite-prog-hero__cta">
                <PButton size="lg" onClick={()=>go('enroll')}>Apply for this cohort</PButton>
                <PButton size="lg" variant="ghost" onClick={()=>go('enroll')} leadingIcon={<I n="download"/>}>Syllabus</PButton>
              </div>
            </div>
            <PCard elevation="md" padded className="cbsite-pricecard">
              <span className="cbsite-pricecard__label">Tuition from</span>
              <div className="cbsite-pricecard__price">$1,999<small>/ session</small></div>
              <ul>
                <li><I n="check"/><span>Live instructor-led classes</span></li>
                <li><I n="check"/><span>1:1 mentorship</span></li>
                <li><I n="check"/><span>Portfolio project &amp; badge</span></li>
                <li><I n="check"/><span>Scholarships available</span></li>
              </ul>
              <PButton fullWidth onClick={()=>go('enroll')}>Apply now</PButton>
              <span className="cbsite-pricecard__note">Deferred &amp; ISA payment options available</span>
            </PCard>
          </div>
        </div>
      </div>

      <section className="cbsite-section">
        <div className="cbsite-section__head cbsite-section__head--left">
          <PBadge tone="green">Curriculum</PBadge>
          <h2>What you'll learn</h2>
        </div>
        <div className="cbsite-modules">
          {modules.map((m,i)=>(
            <div key={i} className={'cbsite-module' + (open===i?' is-open':'')} onClick={()=>setOpen(open===i?-1:i)}>
              <div className="cbsite-module__top">
                <span className="cbsite-module__wk">{m.wk}</span>
                <h3>{m.h}</h3>
                <I n={open===i?'minus':'plus'}/>
              </div>
              {open===i && <p>{m.d}</p>}
            </div>
          ))}
        </div>
        <div className="cbsite-tools">
          <span>Tools you'll master</span>
          <div>{tools.map((t,i)=><PBadge key={i} outline>{t}</PBadge>)}</div>
        </div>
      </section>

      <section className="cbsite-section cbsite-section--subtle">
        <div className="cbsite-section__head cbsite-section__head--left">
          <PBadge tone="blue">FAQ</PBadge>
          <h2>Questions, answered</h2>
        </div>
        <div className="cbsite-faq">
          {faqs.map((f,i)=>(
            <details key={i} className="cbsite-faqitem">
              <summary>{f.q}<I n="plus"/></summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="cbsite-cta">
        <div className="cbsite-cta__inner">
          <h2>Ready to start your data career?</h2>
          <p>Apply in minutes. Our admissions team will help you find the right path and payment plan.</p>
          <div className="cbsite-cta__btns"><PButton size="lg" tone="green" onClick={()=>go('enroll')}>Apply now</PButton></div>
        </div>
      </section>
    </main>
  );
}

function EnrollView({ go }) {
  const [program, setProgram] = React.useState('analytics');
  const [done, setDone] = React.useState(false);
  const progs = {
    analytics: { name: 'Data Analytics', price: '$1,999', tone: 'blue', len: '12 weeks' },
    science: { name: 'Data Science', price: '$4,500', tone: 'green', len: '24 weeks' },
  };
  const p = progs[program];
  if (done) {
    return (
      <main className="cbsite-enroll">
        <div className="cbsite-success">
          <div className="cbsite-success__icon"><I n="check"/></div>
          <h1>You're on the list!</h1>
          <p>Thanks for applying to the <strong>{p.name}</strong> program. An admissions advisor will reach out within one business day to talk goals and payment options.</p>
          <div className="cbsite-success__btns">
            <PButton onClick={()=>{setDone(false);go('home');}}>Back to home</PButton>
            <PButton variant="outline" onClick={()=>go('program')}>Explore the curriculum</PButton>
          </div>
        </div>
      </main>
    );
  }
  return (
    <main className="cbsite-enroll">
      <div className="cbsite-enroll__grid">
        <form className="cbsite-form" onSubmit={(e)=>{e.preventDefault();setDone(true);}}>
          <h1>Apply to Colaberry</h1>
          <p className="cbsite-form__sub">No tests, no degree required. Takes about 2 minutes.</p>

          <div className="cbsite-form__choice">
            <span className="cbsite-form__legend">Choose your program</span>
            <div className="cbsite-choice">
              {Object.entries(progs).map(([k,v])=>(
                <button type="button" key={k} className={'cbsite-choice__opt'+(program===k?' is-sel':'')} onClick={()=>setProgram(k)}>
                  <span className="cbsite-choice__check"><I n="check"/></span>
                  <strong>{v.name}</strong>
                  <span>{v.len} · from {v.price}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="cbsite-form__row">
            <PInput label="First name" placeholder="Ada" required />
            <PInput label="Last name" placeholder="Lovelace" required />
          </div>
          <PInput label="Email" type="email" placeholder="ada@email.com" required />
          <PInput label="Phone" type="tel" placeholder="(972) 992-1024" helperText="We'll only call about your application." />
          <PInput label="Why do you want to learn data?" multiline rows={3} placeholder="A sentence or two about your goals…" />
          <div className="cbsite-form__checks">
            <PCheckbox label="I'd like to hear about scholarships and upcoming cohorts" defaultChecked />
            <PCheckbox label="I agree to be contacted by Colaberry's admissions team" required />
          </div>
          <PButton type="submit" size="lg" fullWidth>Submit application</PButton>
        </form>

        <aside className="cbsite-summary">
          <PCard elevation="md" padded>
            <PBadge tone={p.tone} dot>Selected program</PBadge>
            <h3>{p.name}</h3>
            <div className="cbsite-summary__price">{p.price}<small>from / session</small></div>
            <ul>
              <li><I n="calendar"/><span>{p.len}, instructor-led</span></li>
              <li><I n="users"/><span>1:1 mentorship included</span></li>
              <li><I n="award"/><span>Verifiable digital badge</span></li>
              <li><I n="shield-check"/><span>1-year job support</span></li>
            </ul>
          </PCard>
          <div className="cbsite-summary__trust">
            <I n="heart-handshake"/>
            <p>Built on inclusivity since 2012 — proudly supporting veterans and career-changers.</p>
          </div>
        </aside>
      </div>
    </main>
  );
}

Object.assign(window, { ProgramView, EnrollView });
