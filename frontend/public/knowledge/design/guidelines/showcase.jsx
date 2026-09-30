/* Live component gallery + example layouts for design-system.html.
   Reads the components off the standalone build's window namespace. */
const C = window.ColaberryDesignSystem_098454 || {};
const {
  Button, Badge, Card, Avatar, Input, Textarea, Checkbox, Switch,
  Accordion, Breadcrumb, Pagination, Tooltip, Popover, Progress,
  Skeleton, Toast, Table, Dialog, Drawer, Carousel
} = C;

function Tile({ name, wide, children }) {
  return (
    <div className={'ds-tile' + (wide ? ' ds-tile--wide' : '')}>
      <p className="ds-tile__name">{name}</p>
      {children}
    </div>
  );
}

function OverlayDemo() {
  const [dlg, setDlg] = React.useState(false);
  const [drw, setDrw] = React.useState(false);
  const [tst, setTst] = React.useState(false);
  React.useEffect(() => { if (!tst) return; const t = setTimeout(() => setTst(false), 3200); return () => clearTimeout(t); }, [tst]);
  return (
    <Tile name="Dialog · Drawer · Toast" wide>
      <div className="row">
        <Button size="sm" onClick={() => setDlg(true)}>Open dialog</Button>
        <Button size="sm" variant="outline" onClick={() => setDrw(true)}>Open drawer</Button>
        <Button size="sm" variant="ghost" onClick={() => setTst(true)}>Show toast</Button>
      </div>
      <Dialog open={dlg} title="Confirm enrollment" onClose={() => setDlg(false)}
        footer={<><Button variant="ghost" size="sm" onClick={() => setDlg(false)}>Cancel</Button><Button size="sm" onClick={() => setDlg(false)}>Confirm</Button></>}>
        Ready to start the Data Analytics program? You can change your cohort later.
      </Dialog>
      <Drawer open={drw} title="Filters" onClose={() => setDrw(false)}>
        <div className="stack"><Checkbox label="Online" defaultChecked /><Checkbox label="On campus" /><Switch label="Scholarships only" /></div>
      </Drawer>
      <Toast open={tst} variant="success" title="Application sent" onClose={() => setTst(false)}>We'll be in touch within a day.</Toast>
    </Tile>
  );
}

function Gallery() {
  const [page, setPage] = React.useState(3);
  const slide = (label, a, b) => <div style={{ height: 150, display: 'grid', placeItems: 'center', color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24, background: `linear-gradient(135deg, var(--${a}), var(--${b}))` }}>{label}</div>;
  return (
    <div className="ds-gal">
      <Tile name="Button">
        <div className="row"><Button>Apply now</Button><Button tone="green">Enroll</Button><Button tone="blue">Book a call</Button></div>
        <div className="row"><Button variant="outline">Outline</Button><Button variant="ghost">Ghost</Button><Button variant="link">Link</Button></div>
        <div className="row"><Button size="lg">Large</Button><Button size="sm">Small</Button><Button disabled>Disabled</Button></div>
      </Tile>
      <Tile name="Badge · Avatar">
        <div className="row"><Badge tone="green" dot>Enrolling</Badge><Badge tone="blue">Data Science</Badge><Badge tone="red" dot>Closing</Badge><Badge solid>New</Badge><Badge outline>Self-paced</Badge></div>
        <div className="row" style={{ marginTop: 16 }}>
          <Avatar src="assets/avatars/person-1.png" name="Mika Rivera" size="lg" ring />
          <Avatar src="assets/avatars/person-2.png" name="Owen Brooks" size="lg" />
          <Avatar src="assets/avatars/person-3.png" name="Sam Okafor" size="lg" />
          <Avatar name="Ada Lovelace" size="lg" />
          <div className="cb-avatar-group">
            <Avatar src="assets/avatars/person-2.png" name="Owen Brooks" />
            <Avatar src="assets/avatars/person-1.png" name="Mika Rivera" />
            <Avatar name="Ada Lovelace" />
            <Avatar name="Lee Park" />
          </div>
        </div>
      </Tile>
      <Tile name="Input · Textarea">
        <div className="stack">
          <Input label="Email" type="email" placeholder="ada@email.com" />
          <Textarea label="Why data?" placeholder="A sentence or two…" maxLength={120} />
        </div>
      </Tile>
      <Tile name="Checkbox · Switch">
        <div className="stack">
          <Checkbox label="Email me about new cohorts" defaultChecked />
          <Checkbox label="I agree to the terms" />
          <div className="row"><Switch label="Notifications" defaultChecked /><Switch label="SMS" /></div>
        </div>
      </Tile>
      <Tile name="Accordion">
        <Accordion defaultOpen={[0]} items={[
          { title: 'What is included?', content: 'Live classes, 1:1 mentorship, a portfolio project, and a year of job support.' },
          { title: 'Do I need a degree?', content: 'No — a GED or diploma is all you need. No admissions tests.' },
        ]} />
      </Tile>
      <Tile name="Breadcrumb · Pagination">
        <Breadcrumb items={[{ label: 'Home' }, { label: 'Programs' }, { label: 'Data Analytics' }]} />
        <div style={{ marginTop: 16 }}><Pagination page={page} total={9} onChange={setPage} /></div>
      </Tile>
      <Tile name="Tooltip · Popover">
        <div className="row">
          <Tooltip label="Closes the menu"><Button size="sm" variant="outline">Hover me</Button></Tooltip>
          <Popover placement="bottom" trigger={<Button size="sm">Open popover</Button>}>
            <strong>Need help?</strong>
            <div style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: 13 }}>Talk to an advisor — no pressure.</div>
          </Popover>
        </div>
      </Tile>
      <Tile name="Progress · Skeleton">
        <div className="stack">
          <Progress label="Course progress" value={68} showValue />
          <Progress tone="blue" indeterminate />
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <Skeleton variant="circle" width={42} height={42} />
            <div style={{ flex: 1 }}><Skeleton variant="text" width="80%" /><Skeleton variant="text" width="55%" /></div>
          </div>
        </div>
      </Tile>
      <Tile name="Table" wide>
        <Table columns={[
          { key: 'name', header: 'Cohort' }, { key: 'start', header: 'Starts' },
          { key: 'wk', header: 'Weeks', align: 'right' },
          { key: 'st', header: 'Status', render: (v) => <Badge tone={v === 'Open' ? 'green' : 'neutral'} dot={v === 'Open'}>{v}</Badge> },
        ]} data={[
          { name: 'Data Analytics', start: 'Apr 8', wk: 12, st: 'Open' },
          { name: 'Data Science', start: 'May 6', wk: 24, st: 'Open' },
          { name: 'Intro Seminar', start: 'Mar 18', wk: 2, st: 'Closed' },
        ]} />
      </Tile>
      <OverlayDemo />
      <Tile name="Carousel" wide>
        <Carousel slides={[slide('Mentorship', 'blue-500', 'blue-700'), slide('Real projects', 'green-500', 'green-700'), slide('Get hired', 'red-400', 'red-600')]} />
      </Tile>
    </div>
  );
}

/* ---------------- Example layouts ---------------- */

function Frame({ title, children }) {
  return (
    <div className="ds-ex__frame">
      <div className="ds-ex__bar"><span className="ds-ex__dot" /><span className="ds-ex__dot" /><span className="ds-ex__dot" /><span className="ds-ex__title">{title}</span></div>
      <div className="ds-ex__body">{children}</div>
    </div>
  );
}

function SignIn() {
  return (
    <Frame title="sign-in.html">
      <div style={{ maxWidth: 380, margin: '0 auto' }}>
        <img src="assets/logo/colaberry-horizontal.png" alt="Colaberry" style={{ height: 34, display: 'block', margin: '0 auto 22px' }} />
        <h2 style={{ textAlign: 'center', fontSize: 26, margin: '0 0 6px' }}>Welcome back</h2>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', margin: '0 0 24px' }}>Sign in to continue your data journey.</p>
        <div className="stack">
          <Input label="Email" type="email" placeholder="ada@email.com" />
          <Input label="Password" type="password" placeholder="••••••••" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
            <Checkbox label="Remember me" defaultChecked />
            <a href="#" style={{ fontSize: 14 }}>Forgot password?</a>
          </div>
          <Button fullWidth>Sign in</Button>
        </div>
        <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--text-muted)', marginTop: 20 }}>New here? <a href="#">Apply now</a></p>
      </div>
    </Frame>
  );
}

function Pricing() {
  const plans = [
    { tone: 'blue', tag: '12 weeks', name: 'Data Analytics', price: '$1,999', feats: ['SQL & reporting', 'Dashboards', 'Portfolio project'], cta: 'blue' },
    { tone: 'red', tag: 'Most popular', name: 'Analytics + Accelerator', price: '$12,000', feats: ['Everything in Analytics', '1:1 mentorship', '1-year job support'], featured: true, cta: 'red' },
    { tone: 'green', tag: '24 weeks', name: 'Data Science', price: '$4,500', feats: ['Python & ML', 'Statistics', 'Capstone project'], cta: 'green' },
  ];
  return (
    <Frame title="pricing.html">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
        {plans.map((p, i) => (
          <Card key={i} padded elevation={p.featured ? 'md' : 'sm'} accent={p.featured ? 'red' : undefined} style={p.featured ? { outline: '2px solid var(--red-500)' } : undefined}>
            <Badge tone={p.tone} solid={p.featured}>{p.tag}</Badge>
            <h3 style={{ margin: '4px 0 0', fontSize: 20 }}>{p.name}</h3>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 34, color: 'var(--text-strong)' }}>{p.price}</div>
            <div className="stack" style={{ gap: 9, margin: '4px 0 8px' }}>
              {p.feats.map((f, j) => (
                <div key={j} style={{ display: 'flex', gap: 9, alignItems: 'center', fontSize: 14, color: 'var(--text-body)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 6 9 17l-5-5" stroke="var(--green-600)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>{f}
                </div>
              ))}
            </div>
            <Button fullWidth tone={p.cta} variant={p.featured ? 'primary' : 'outline'}>Choose plan</Button>
          </Card>
        ))}
      </div>
    </Frame>
  );
}

function Dashboard() {
  const stats = [['68%', 'Course complete'], ['12', 'Lessons left'], ['4.9', 'Avg. score'], ['Apr 30', 'Cohort ends']];
  return (
    <Frame title="dashboard.html">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
        {stats.map((s, i) => (
          <Card key={i} padded><div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 28, color: 'var(--red-500)' }}>{s[0]}</div><div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{s[1]}</div></Card>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 18, alignItems: 'start' }}>
        <Card padded>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 18 }}>Upcoming cohorts</h3><Badge tone="green" dot>Live</Badge>
          </div>
          <Table columns={[{ key: 'name', header: 'Program' }, { key: 'wk', header: 'Weeks', align: 'right' }, { key: 'st', header: 'Status', render: (v) => <Badge tone={v === 'Open' ? 'green' : 'neutral'}>{v}</Badge> }]}
            data={[{ name: 'Data Analytics', wk: 12, st: 'Open' }, { name: 'Data Science', wk: 24, st: 'Open' }, { name: 'Intro Seminar', wk: 2, st: 'Closed' }]} />
        </Card>
        <Card padded>
          <h3 style={{ margin: '0 0 16px', fontSize: 18 }}>This week</h3>
          <div className="stack">
            <Progress label="SQL fundamentals" value={90} showValue tone="green" />
            <Progress label="Dashboards" value={55} showValue />
            <Progress label="Capstone" value={20} showValue tone="blue" />
          </div>
        </Card>
      </div>
    </Frame>
  );
}

function Examples() {
  return (
    <div className="ds-ex">
      <SignIn />
      <Pricing />
      <Dashboard />
    </div>
  );
}

if (C.Button) {
  const cmp = document.getElementById('cmp-root');
  const lay = document.getElementById('lay-root');
  cmp.classList.remove('ds-loading');
  lay.classList.remove('ds-loading');
  ReactDOM.createRoot(cmp).render(<Gallery />);
  ReactDOM.createRoot(lay).render(<Examples />);
} else {
  document.getElementById('cmp-root').textContent = 'Component bundle failed to load.';
}
