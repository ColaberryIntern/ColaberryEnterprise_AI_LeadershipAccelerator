/* Colaberry marketing site — shared parts: Logo, Header, Footer, helpers.
   Exposes to window for the other script files. */
const { Button: CBButton, Avatar: CBAvatar, Badge: CBBadge } = window.ColaberryDesignSystem_098454;

/* React-safe Lucide icon. React owns the <span>; Lucide mutates only the
   inner <i>→<svg>, so re-renders never touch the swapped node. Size = font-size
   (1em), color = currentColor — both driven by CSS/parent. */
function I({ n, s, c, className = '', style }) {
  const st = { fontSize: s ? s + 'px' : undefined, color: c, ...style };
  return <span className={'cb-i ' + className} style={st} dangerouslySetInnerHTML={{ __html: `<i data-lucide="${n}"></i>` }} />;
}
// Back-compat alias
function Icon({ name, size, style, ...rest }) {
  return <I n={name} s={size} style={style} {...rest} />;
}

function Logo({ height = 34, variant = 'default' }) {
  const src = variant === 'white'
    ? '../../assets/logo/colaberry-horizontal-white.png?v=2'
    : '../../assets/logo/colaberry-horizontal.png';
  return <img src={src} alt="Colaberry" style={{ height, display: 'block' }} />;
}

const NAV = [
  { label: 'Programs', view: 'program' },
  { label: 'Outcomes', view: 'home' },
  { label: 'Scholarships', view: 'home' },
  { label: 'About', view: 'home' },
];

function Header({ go, current }) {
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const el = document.querySelector('.cbsite-scroll');
    const onScroll = () => setScrolled((el ? el.scrollTop : window.scrollY) > 8);
    const target = el || window;
    target.addEventListener('scroll', onScroll);
    return () => target.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <header className="cbsite-header" data-scrolled={scrolled}>
      <div className="cbsite-header__inner">
        <a className="cbsite-logo" onClick={() => go('home')}><Logo /></a>
        <nav className="cbsite-nav">
          {NAV.map((n, i) => (
            <a key={i} className="cbsite-nav__link" onClick={() => go(n.view)}>{n.label}</a>
          ))}
        </nav>
        <div className="cbsite-header__actions">
          <a className="cbsite-nav__link cbsite-nav__link--ghost" onClick={() => go('enroll')}>Sign in</a>
          <CBButton size="sm" onClick={() => go('enroll')}>Apply now</CBButton>
        </div>
      </div>
    </header>
  );
}

function Footer({ go }) {
  const cols = [
    { h: 'Programs', items: ['Data Analytics', 'Data Science', 'Intro Seminar', 'Career Accelerator'] },
    { h: 'School', items: ['About us', 'Outcomes', 'Mentors', 'Reviews'] },
    { h: 'Support', items: ['Scholarships', 'Payment options', 'FAQ', 'Contact'] },
  ];
  return (
    <footer className="cbsite-footer">
      <div className="cbsite-footer__inner">
        <div className="cbsite-footer__brand">
          <Logo variant="white" height={32} />
          <p>Build amazing, local, diverse, and job-ready talent in Data Analytics &amp; Data Science. Since 2012.</p>
          <div className="cbsite-footer__loc">
            <span><Icon name="map-pin" size={15} /> Plano, TX</span>
            <span><Icon name="map-pin" size={15} /> Boston, MA</span>
          </div>
        </div>
        <div className="cbsite-footer__cols">
          {cols.map((c, i) => (
            <div key={i} className="cbsite-footer__col">
              <h4>{c.h}</h4>
              {c.items.map((it, j) => <a key={j} onClick={() => go('home')}>{it}</a>)}
            </div>
          ))}
        </div>
      </div>
      <div className="cbsite-footer__bar">
        <span>© 2026 Colaberry, Inc. · Texas Workforce Commission approved</span>
        <span className="cbsite-footer__legal"><a onClick={() => go('home')}>Privacy</a><a onClick={() => go('home')}>Terms</a><a onClick={() => go('home')}>Accreditation</a></span>
      </div>
    </footer>
  );
}

Object.assign(window, { Icon, I, Logo, Header, Footer });
