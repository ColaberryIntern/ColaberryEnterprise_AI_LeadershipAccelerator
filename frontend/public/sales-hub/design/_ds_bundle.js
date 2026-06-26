/* @ds-bundle: {"format":3,"namespace":"ColaberryDesignSystem_098454","components":[{"name":"Accordion","sourcePath":"components/core/Accordion.jsx"},{"name":"Avatar","sourcePath":"components/core/Avatar.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Breadcrumb","sourcePath":"components/core/Breadcrumb.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Carousel","sourcePath":"components/core/Carousel.jsx"},{"name":"Checkbox","sourcePath":"components/core/Checkbox.jsx"},{"name":"Dialog","sourcePath":"components/core/Dialog.jsx"},{"name":"Drawer","sourcePath":"components/core/Drawer.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"Pagination","sourcePath":"components/core/Pagination.jsx"},{"name":"Popover","sourcePath":"components/core/Popover.jsx"},{"name":"Progress","sourcePath":"components/core/Progress.jsx"},{"name":"Skeleton","sourcePath":"components/core/Skeleton.jsx"},{"name":"Switch","sourcePath":"components/core/Switch.jsx"},{"name":"Table","sourcePath":"components/core/Table.jsx"},{"name":"Textarea","sourcePath":"components/core/Textarea.jsx"},{"name":"Toast","sourcePath":"components/core/Toast.jsx"},{"name":"Tooltip","sourcePath":"components/core/Tooltip.jsx"}],"sourceHashes":{"components/core/Accordion.jsx":"7f723d50ccb3","components/core/Avatar.jsx":"31e44eba8cc0","components/core/Badge.jsx":"a7eaff5c66e0","components/core/Breadcrumb.jsx":"70a7c059b6dc","components/core/Button.jsx":"743bf8196d3a","components/core/Card.jsx":"9128695a6e3b","components/core/Carousel.jsx":"32d39a3c7b97","components/core/Checkbox.jsx":"1234fac38bde","components/core/Dialog.jsx":"5546d1732c00","components/core/Drawer.jsx":"002789c5e7f2","components/core/Input.jsx":"b17416006ccf","components/core/Pagination.jsx":"c83839504ef4","components/core/Popover.jsx":"be044b8cad02","components/core/Progress.jsx":"060ad916d79f","components/core/Skeleton.jsx":"a00339768789","components/core/Switch.jsx":"dda1b7f891e5","components/core/Table.jsx":"34bcefbe3e5d","components/core/Textarea.jsx":"53c7e464d1d5","components/core/Toast.jsx":"36e8321d1a9b","components/core/Tooltip.jsx":"98775fb02133","guidelines/showcase.jsx":"8016c46bb9e8","landing.js":"08a3fe63af52","ui_kits/marketing-website/home.jsx":"f2d0585b6567","ui_kits/marketing-website/parts.jsx":"15b3c98dd221","ui_kits/marketing-website/program-enroll.jsx":"c838acdc9ad0"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.ColaberryDesignSystem_098454 = window.ColaberryDesignSystem_098454 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Accordion.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.cb-acc { border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); overflow: hidden; background: var(--surface-card); }
.cb-acc__item + .cb-acc__item { border-top: 1px solid var(--border-subtle); }
.cb-acc__btn { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 20px; background: none; border: none; cursor: pointer; font-family: var(--font-body); font-weight: var(--fw-bold); font-size: var(--fs-body); color: var(--text-strong); text-align: left; transition: background var(--dur-fast) var(--ease-out); }
.cb-acc__btn:hover { background: var(--surface-sunken); }
.cb-acc__btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.cb-acc__ic { flex: none; color: var(--red-500); transition: transform var(--dur-base) var(--ease-out); }
.cb-acc__item[data-open="true"] .cb-acc__ic { transform: rotate(180deg); }
.cb-acc__panel { display: grid; grid-template-rows: 0fr; transition: grid-template-rows var(--dur-base) var(--ease-out); }
.cb-acc__item[data-open="true"] .cb-acc__panel { grid-template-rows: 1fr; }
.cb-acc__inner { overflow: hidden; }
.cb-acc__body { padding: 0 20px 18px; font-size: var(--fs-body-sm); color: var(--text-muted); line-height: 1.6; }
@media (prefers-reduced-motion: reduce){ .cb-acc__panel, .cb-acc__ic { transition-duration: .001ms; } }
`;
function inject() {
  if (typeof document === 'undefined' || document.getElementById('cb-acc-css')) return;
  const s = document.createElement('style');
  s.id = 'cb-acc-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Vertically stacked, animated disclosure panels. Single-open by default;
 * pass `allowMultiple` to let several stay open. `defaultOpen` seeds indices.
 */
function Accordion({
  items = [],
  allowMultiple = false,
  defaultOpen = [],
  className = '',
  ...rest
}) {
  inject();
  const [open, setOpen] = React.useState(() => new Set(defaultOpen));
  const toggle = i => setOpen(prev => {
    const next = new Set(allowMultiple ? prev : []);
    if (prev.has(i)) next.delete(i);else next.add(i);
    return next;
  });
  return /*#__PURE__*/React.createElement("div", _extends({
    className: 'cb-acc ' + className
  }, rest), items.map((it, i) => {
    const isOpen = open.has(i);
    const btnId = 'cb-acc-b' + i,
      panelId = 'cb-acc-p' + i;
    return /*#__PURE__*/React.createElement("div", {
      className: "cb-acc__item",
      "data-open": isOpen,
      key: i
    }, /*#__PURE__*/React.createElement("button", {
      className: "cb-acc__btn",
      id: btnId,
      "aria-expanded": isOpen,
      "aria-controls": panelId,
      onClick: () => toggle(i)
    }, /*#__PURE__*/React.createElement("span", null, it.title), /*#__PURE__*/React.createElement("svg", {
      className: "cb-acc__ic",
      width: "18",
      height: "18",
      viewBox: "0 0 24 24",
      fill: "none"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M6 9l6 6 6-6",
      stroke: "currentColor",
      strokeWidth: "2.4",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }))), /*#__PURE__*/React.createElement("div", {
      className: "cb-acc__panel",
      id: panelId,
      role: "region",
      "aria-labelledby": btnId
    }, /*#__PURE__*/React.createElement("div", {
      className: "cb-acc__inner"
    }, /*#__PURE__*/React.createElement("div", {
      className: "cb-acc__body"
    }, it.content))));
  }));
}
Object.assign(__ds_scope, { Accordion });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Accordion.jsx", error: String((e && e.message) || e) }); }

// components/core/Avatar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.cb-avatar {
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%; overflow: hidden; flex: none;
  font-family: var(--font-body); font-weight: var(--fw-bold); color: #fff;
  background: var(--green-500); user-select: none;
}
.cb-avatar { position: relative; }
.cb-avatar img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; background: inherit; }
.cb-avatar__txt { line-height: 1; white-space: nowrap; }
.cb-avatar--xs { width: 28px; height: 28px; font-size: 11px; }
.cb-avatar--sm { width: 36px; height: 36px; font-size: 13px; }
.cb-avatar--md { width: 48px; height: 48px; font-size: 16px; }
.cb-avatar--lg { width: 64px; height: 64px; font-size: 22px; }
.cb-avatar--xl { width: 88px; height: 88px; font-size: 30px; }
.cb-avatar--ring { box-shadow: 0 0 0 3px var(--surface-card), 0 0 0 5px var(--red-500); }
.cb-avatar-group { display: inline-flex; }
.cb-avatar-group > .cb-avatar { box-shadow: 0 0 0 3px var(--surface-card); }
.cb-avatar-group > .cb-avatar + .cb-avatar { margin-left: -12px; }
`;
const TONES = ['var(--green-500)', 'var(--blue-500)', 'var(--red-500)', 'var(--green-600)', 'var(--blue-600)'];
function inject() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('cb-avatar-css')) return;
  const s = document.createElement('style');
  s.id = 'cb-avatar-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
}

/**
 * Circular avatar. Shows a photo when `src` is given, with the person's
 * initials underneath as a graceful fallback (used while the image loads or
 * if it fails). Initials get a stable brand-tone background from the name.
 */
function Avatar({
  src,
  name = '',
  size = 'md',
  ring = false,
  className = '',
  style,
  ...rest
}) {
  inject();
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    setFailed(false);
  }, [src]);
  const classes = ['cb-avatar', 'cb-avatar--' + size];
  if (ring) classes.push('cb-avatar--ring');
  if (className) classes.push(className);
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const bg = TONES[hash % TONES.length];
  const showImg = src && !failed;
  return /*#__PURE__*/React.createElement("span", _extends({
    className: classes.join(' '),
    style: {
      background: bg,
      ...style
    },
    role: "img",
    "aria-label": name || undefined
  }, rest), /*#__PURE__*/React.createElement("span", {
    className: "cb-avatar__txt",
    "aria-hidden": "true"
  }, initials(name)), showImg && /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: "",
    onError: () => setFailed(true)
  }));
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.cb-badge {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--font-body); font-weight: var(--fw-medium);
  font-size: var(--fs-caption); line-height: 1;
  padding: 5px 12px; border-radius: var(--radius-pill);
  background: var(--surface-sunken); color: var(--text-body);
  white-space: nowrap;
}
.cb-badge--solid { background: var(--red-500); color: #fff; }
.cb-badge--neutral { background: var(--surface-sunken); color: var(--text-body); }
.cb-badge--red { background: var(--status-danger-bg); color: var(--red-700); }
.cb-badge--green { background: var(--status-success-bg); color: var(--green-700); }
.cb-badge--blue { background: var(--status-info-bg); color: var(--blue-700); }
.cb-badge--warning { background: var(--status-warning-bg); color: var(--amber-500); }
.cb-badge--outline { background: transparent; box-shadow: inset 0 0 0 1px var(--border-default); color: var(--text-body); }
.cb-badge__dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
`;
function inject() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('cb-badge-css')) return;
  const s = document.createElement('style');
  s.id = 'cb-badge-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Small status / category label. Soft tints by default; use `solid` for the
 * cherry-red emphasis pill and `dot` for a status indicator.
 */
function Badge({
  tone = 'neutral',
  solid = false,
  outline = false,
  dot = false,
  className = '',
  children,
  ...rest
}) {
  inject();
  const classes = ['cb-badge'];
  if (solid) classes.push('cb-badge--solid');else if (outline) classes.push('cb-badge--outline');else classes.push('cb-badge--' + tone);
  if (className) classes.push(className);
  return /*#__PURE__*/React.createElement("span", _extends({
    className: classes.join(' ')
  }, rest), dot && /*#__PURE__*/React.createElement("span", {
    className: "cb-badge__dot",
    "aria-hidden": "true"
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Breadcrumb.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.cb-bc { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; font-family: var(--font-body); font-size: var(--fs-body-sm); }
.cb-bc a, .cb-bc span { color: var(--text-muted); text-decoration: none; }
.cb-bc a { transition: color var(--dur-fast) var(--ease-out); }
.cb-bc a:hover { color: var(--red-500); }
.cb-bc__sep { color: var(--border-strong); display: inline-flex; }
.cb-bc__cur { color: var(--text-strong); font-weight: var(--fw-medium); }
`;
function inject() {
  if (typeof document === 'undefined' || document.getElementById('cb-bc-css')) return;
  const s = document.createElement('style');
  s.id = 'cb-bc-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Breadcrumb trail. The last item renders as the current page (non-link).
 */
function Breadcrumb({
  items = [],
  className = '',
  ...rest
}) {
  inject();
  return /*#__PURE__*/React.createElement("nav", _extends({
    className: 'cb-bc ' + className,
    "aria-label": "Breadcrumb"
  }, rest), items.map((it, i) => {
    const last = i === items.length - 1;
    return /*#__PURE__*/React.createElement(React.Fragment, {
      key: i
    }, last ? /*#__PURE__*/React.createElement("span", {
      className: "cb-bc__cur",
      "aria-current": "page"
    }, it.label) : /*#__PURE__*/React.createElement("a", {
      href: it.href || '#',
      onClick: it.onClick
    }, it.label), !last && /*#__PURE__*/React.createElement("span", {
      className: "cb-bc__sep",
      "aria-hidden": "true"
    }, /*#__PURE__*/React.createElement("svg", {
      width: "15",
      height: "15",
      viewBox: "0 0 24 24",
      fill: "none"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M9 6l6 6-6 6",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }))));
  }));
}
Object.assign(__ds_scope, { Breadcrumb });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Breadcrumb.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.cb-btn {
  --_bg: var(--action-bg);
  --_fg: var(--action-fg);
  --_bg-hover: var(--action-bg-hover);
  --_bg-press: var(--action-bg-press);
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  font-family: var(--font-body); font-weight: var(--fw-bold);
  font-size: var(--fs-body-sm); line-height: 1.2; min-height: 48px;
  border: none; border-radius: var(--radius-pill); cursor: pointer;
  padding: 0 24px; text-decoration: none; white-space: nowrap;
  background: var(--_bg); color: var(--_fg);
  transition: background var(--dur-fast) var(--ease-out),
              transform var(--dur-fast) var(--ease-out),
              box-shadow var(--dur-fast) var(--ease-out);
}
.cb-btn:hover { background: var(--_bg-hover); text-decoration: none; color: var(--_fg); }
.cb-btn:active { background: var(--_bg-press); transform: translateY(1px); }
.cb-btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.cb-btn[disabled], .cb-btn[aria-disabled="true"] {
  opacity: .45; cursor: not-allowed; pointer-events: none;
}
.cb-btn--sm { font-size: var(--fs-caption); min-height: 38px; padding: 0 16px; gap: 6px; }
.cb-btn--lg { font-size: var(--fs-body); min-height: 56px; padding: 0 32px; }
.cb-btn--green { --_bg: var(--action-green-bg); --_bg-hover: var(--action-green-bg-hover); --_bg-press: var(--green-700); --_fg: #fff; }
.cb-btn--blue { --_bg: var(--blue-500); --_bg-hover: var(--blue-600); --_bg-press: var(--blue-700); --_fg: #fff; }
.cb-btn--primary { box-shadow: var(--shadow-brand); }
.cb-btn--primary:hover { box-shadow: 0 12px 30px color-mix(in srgb, var(--red-500) 34%, transparent); }
.cb-btn--outline {
  background: transparent; color: var(--text-strong);
  box-shadow: inset 0 0 0 var(--border-2) var(--border-strong);
}
.cb-btn--outline:hover { background: var(--surface-sunken); color: var(--text-strong); box-shadow: inset 0 0 0 var(--border-2) var(--text-strong); }
.cb-btn--outline:active { background: var(--surface-sunken); }
.cb-btn--ghost { background: transparent; color: var(--text-strong); }
.cb-btn--ghost:hover { background: var(--surface-sunken); color: var(--text-strong); }
.cb-btn--ghost:active { background: var(--surface-sunken); }
.cb-btn--link { background: transparent; color: var(--text-link); border-radius: var(--radius-xs); padding: 4px 6px; min-height: 0; }
.cb-btn--link:hover { background: transparent; color: var(--text-link-hover); text-decoration: underline; }
.cb-btn--full { width: 100%; }
`;
function inject() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('cb-btn-css')) return;
  const s = document.createElement('style');
  s.id = 'cb-btn-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Colaberry primary button. Cherry-red by default; supports green/blue
 * brand tones, outline/ghost/link variants, three sizes, and icons.
 */
function Button({
  variant = 'primary',
  tone,
  size = 'md',
  fullWidth = false,
  leadingIcon,
  trailingIcon,
  as,
  className = '',
  children,
  ...rest
}) {
  inject();
  const classes = ['cb-btn'];
  if (variant === 'primary') classes.push('cb-btn--primary');
  if (variant === 'outline') classes.push('cb-btn--outline');
  if (variant === 'ghost') classes.push('cb-btn--ghost');
  if (variant === 'link') classes.push('cb-btn--link');
  // tone overrides fill color for solid buttons
  if ((variant === 'primary' || variant === 'solid') && tone === 'green') classes.push('cb-btn--green');
  if ((variant === 'primary' || variant === 'solid') && tone === 'blue') classes.push('cb-btn--blue');
  if (size === 'sm') classes.push('cb-btn--sm');
  if (size === 'lg') classes.push('cb-btn--lg');
  if (fullWidth) classes.push('cb-btn--full');
  if (className) classes.push(className);

  // Only forward real DOM attributes to the host element (never component-only props).
  const dom = {};
  for (const k in rest) {
    if (k.startsWith('aria-') || k.startsWith('data-') || /^on[A-Z]/.test(k) || ['href', 'target', 'rel', 'type', 'name', 'value', 'id', 'title', 'role', 'tabIndex', 'disabled', 'form', 'autoFocus'].includes(k)) {
      dom[k] = rest[k];
    }
  }
  const Tag = rest.href || as === 'a' ? 'a' : as || 'button';
  if (Tag === 'button' && dom.type === undefined) dom.type = 'button';
  return /*#__PURE__*/React.createElement(Tag, _extends({
    className: classes.join(' ')
  }, dom), leadingIcon, children && /*#__PURE__*/React.createElement("span", null, children), trailingIcon);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.cb-card {
  display: flex; flex-direction: column;
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  transition: box-shadow var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out);
}
.cb-card--pad { padding: var(--space-6); }
.cb-card--hoverable { cursor: pointer; }
.cb-card--hoverable:hover { box-shadow: var(--shadow-lg); transform: translateY(-3px); }
.cb-card--flat { box-shadow: none; }
.cb-card--elevated { box-shadow: var(--shadow-md); border-color: transparent; }
.cb-card--accent { border-top: 4px solid var(--red-500); }
.cb-card--accent-green { border-top: 4px solid var(--green-500); }
.cb-card--accent-blue { border-top: 4px solid var(--blue-500); }
.cb-card__media { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; background: var(--surface-sunken); }
.cb-card__body { padding: var(--space-6); display: flex; flex-direction: column; gap: var(--space-3); }
`;
function inject() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('cb-card-css')) return;
  const s = document.createElement('style');
  s.id = 'cb-card-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Surface container with rounded corners and a soft shadow. Optional media
 * header, body padding, hover lift, and a colored accent top-border.
 */
function Card({
  elevation = 'sm',
  accent,
  hoverable = false,
  padded = false,
  media,
  className = '',
  children,
  ...rest
}) {
  inject();
  const classes = ['cb-card'];
  if (elevation === 'flat') classes.push('cb-card--flat');
  if (elevation === 'md') classes.push('cb-card--elevated');
  if (hoverable) classes.push('cb-card--hoverable');
  if (padded && !media) classes.push('cb-card--pad');
  if (accent === 'red') classes.push('cb-card--accent');
  if (accent === 'green') classes.push('cb-card--accent-green');
  if (accent === 'blue') classes.push('cb-card--accent-blue');
  if (className) classes.push(className);
  return /*#__PURE__*/React.createElement("div", _extends({
    className: classes.join(' ')
  }, rest), media && (typeof media === 'string' ? /*#__PURE__*/React.createElement("img", {
    className: "cb-card__media",
    src: media,
    alt: ""
  }) : /*#__PURE__*/React.createElement("div", {
    className: "cb-card__media"
  }, media)), media ? /*#__PURE__*/React.createElement("div", {
    className: "cb-card__body"
  }, children) : children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Carousel.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.cb-carousel { position: relative; border-radius: var(--radius-xl); overflow: hidden; background: var(--surface-sunken); }
.cb-carousel__viewport { overflow: hidden; }
.cb-carousel__track { display: flex; transition: transform var(--dur-slow) var(--ease-out); }
.cb-carousel__slide { flex: 0 0 100%; min-width: 0; }
.cb-carousel__nav { position: absolute; top: 50%; transform: translateY(-50%); width: 40px; height: 40px; border-radius: 50%; border: none; background: var(--surface-card); color: var(--text-strong); box-shadow: var(--shadow-md); cursor: pointer; display: grid; place-items: center; transition: background var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out); }
.cb-carousel__nav:hover { background: var(--surface-page); }
.cb-carousel__nav:active { transform: translateY(-50%) scale(.94); }
.cb-carousel__nav--prev { left: 14px; } .cb-carousel__nav--next { right: 14px; }
.cb-carousel__dots { position: absolute; left: 0; right: 0; bottom: 14px; display: flex; justify-content: center; gap: 8px; }
.cb-carousel__dot { width: 8px; height: 8px; border-radius: 50%; border: none; background: rgba(255,255,255,.55); cursor: pointer; padding: 0; transition: width var(--dur-base) var(--ease-out), background var(--dur-base) var(--ease-out); }
.cb-carousel__dot.is-active { width: 22px; border-radius: var(--radius-pill); background: #fff; }
@media (prefers-reduced-motion: reduce){ .cb-carousel__track { transition-duration: .001ms; } }
`;
function inject() {
  if (typeof document === 'undefined' || document.getElementById('cb-carousel-css')) return;
  const s = document.createElement('style');
  s.id = 'cb-carousel-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Sliding carousel with prev/next controls and dot indicators. `slides` is an
 * array of nodes. Set `loop` to wrap around at the ends.
 */
function Carousel({
  slides = [],
  loop = true,
  className = '',
  ...rest
}) {
  inject();
  const [i, setI] = React.useState(0);
  const n = slides.length;
  const go = to => setI(loop ? (to + n) % n : Math.max(0, Math.min(n - 1, to)));
  const Arrow = ({
    d
  }) => /*#__PURE__*/React.createElement("svg", {
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: d,
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }));
  return /*#__PURE__*/React.createElement("div", _extends({
    className: 'cb-carousel ' + className
  }, rest), /*#__PURE__*/React.createElement("div", {
    className: "cb-carousel__viewport"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cb-carousel__track",
    style: {
      transform: `translateX(-${i * 100}%)`
    }
  }, slides.map((s, idx) => /*#__PURE__*/React.createElement("div", {
    className: "cb-carousel__slide",
    key: idx,
    "aria-hidden": idx !== i
  }, s)))), n > 1 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
    className: "cb-carousel__nav cb-carousel__nav--prev",
    onClick: () => go(i - 1),
    disabled: !loop && i === 0,
    "aria-label": "Previous"
  }, /*#__PURE__*/React.createElement(Arrow, {
    d: "M15 6l-6 6 6 6"
  })), /*#__PURE__*/React.createElement("button", {
    className: "cb-carousel__nav cb-carousel__nav--next",
    onClick: () => go(i + 1),
    disabled: !loop && i === n - 1,
    "aria-label": "Next"
  }, /*#__PURE__*/React.createElement(Arrow, {
    d: "M9 6l6 6-6 6"
  })), /*#__PURE__*/React.createElement("div", {
    className: "cb-carousel__dots"
  }, slides.map((_, idx) => /*#__PURE__*/React.createElement("button", {
    key: idx,
    className: 'cb-carousel__dot' + (idx === i ? ' is-active' : ''),
    onClick: () => setI(idx),
    "aria-label": 'Go to slide ' + (idx + 1)
  })))));
}
Object.assign(__ds_scope, { Carousel });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Carousel.jsx", error: String((e && e.message) || e) }); }

// components/core/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.cb-check { display: inline-flex; align-items: flex-start; gap: 10px; font-family: var(--font-body); cursor: pointer; color: var(--text-body); font-size: var(--fs-body-sm); }
.cb-check input { position: absolute; opacity: 0; width: 0; height: 0; }
.cb-check__box {
  width: 22px; height: 22px; flex: none; border-radius: var(--radius-sm);
  border: var(--border-2) solid var(--border-strong); background: var(--surface-card);
  display: inline-flex; align-items: center; justify-content: center;
  transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
  margin-top: 1px;
}
.cb-check__box svg { width: 14px; height: 14px; opacity: 0; transform: scale(.6); transition: all var(--dur-fast) var(--ease-spring); }
.cb-check input:checked + .cb-check__box { background: var(--green-500); border-color: var(--green-500); }
.cb-check input:checked + .cb-check__box svg { opacity: 1; transform: scale(1); }
.cb-check input:focus-visible + .cb-check__box { box-shadow: var(--focus-ring); }
.cb-check:hover .cb-check__box { border-color: var(--green-500); }
.cb-check input:disabled + .cb-check__box { opacity: .45; }
.cb-check--disabled { cursor: not-allowed; color: var(--text-subtle); }
`;
function inject() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('cb-check-css')) return;
  const s = document.createElement('style');
  s.id = 'cb-check-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Checkbox with a leaf-green checked state and a soft spring-in tick.
 */
function Checkbox({
  label,
  disabled = false,
  className = '',
  children,
  ...rest
}) {
  inject();
  const classes = ['cb-check'];
  if (disabled) classes.push('cb-check--disabled');
  if (className) classes.push(className);
  return /*#__PURE__*/React.createElement("label", {
    className: classes.join(' ')
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox",
    disabled: disabled
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "cb-check__box",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 16 16",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 8.5l3.2 3.2L13 4.5",
    stroke: "#fff",
    strokeWidth: "2.4",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), (label || children) && /*#__PURE__*/React.createElement("span", null, label || children));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/core/Dialog.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.cb-dialog__scrim { position: fixed; inset: 0; z-index: var(--z-modal); background: rgba(15,15,15,0.5); display: grid; place-items: center; padding: 24px; opacity: 0; transition: opacity var(--dur-base) var(--ease-out); }
.cb-dialog__scrim.is-open { opacity: 1; }
.cb-dialog { width: min(520px, 100%); max-height: 90vh; overflow-y: auto; background: var(--surface-card); border-radius: var(--radius-xl); box-shadow: var(--shadow-xl); transform: translateY(10px) scale(.97); transition: transform var(--dur-base) var(--ease-spring); }
.cb-dialog__scrim.is-open .cb-dialog { transform: translateY(0) scale(1); }
.cb-dialog__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 22px 24px 0; }
.cb-dialog__title { font-family: var(--font-display); font-weight: var(--fw-bold); font-size: var(--fs-h4); color: var(--text-strong); margin: 0; }
.cb-dialog__close { flex: none; background: none; border: none; cursor: pointer; color: var(--text-subtle); padding: 4px; border-radius: var(--radius-sm); transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out); }
.cb-dialog__close:hover { background: var(--surface-sunken); color: var(--text-strong); }
.cb-dialog__body { padding: 12px 24px 8px; font-family: var(--font-body); font-size: var(--fs-body); color: var(--text-body); line-height: 1.6; }
.cb-dialog__foot { display: flex; justify-content: flex-end; gap: 12px; padding: 16px 24px 24px; }
@media (prefers-reduced-motion: reduce){ .cb-dialog__scrim, .cb-dialog { transition-duration: .001ms; } }
`;
function inject() {
  if (typeof document === 'undefined' || document.getElementById('cb-dialog-css')) return;
  const s = document.createElement('style');
  s.id = 'cb-dialog-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Centered modal dialog with scrim. Controlled via `open`; closes on scrim
 * click or Esc. Provide `footer` for action buttons.
 */
function Dialog({
  open = false,
  title,
  onClose,
  footer,
  children,
  className = '',
  ...rest
}) {
  inject();
  const [mounted, setMounted] = React.useState(open);
  const [shown, setShown] = React.useState(false);
  const panelRef = React.useRef(null);
  const lastFocus = React.useRef(null);
  const titleId = React.useMemo(() => 'cb-dlg-' + Math.random().toString(36).slice(2, 8), []);
  React.useEffect(() => {
    let t;
    if (open) {
      setMounted(true);
      t = requestAnimationFrame(() => setShown(true));
    } else {
      setShown(false);
      t = setTimeout(() => setMounted(false), 240);
    }
    return () => {
      cancelAnimationFrame(t);
      clearTimeout(t);
    };
  }, [open]);
  React.useEffect(() => {
    if (!open) return;
    const onKey = e => e.key === 'Escape' && onClose && onClose();
    document.addEventListener('keydown', onKey);
    // body scroll lock
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // focus management: remember, move focus in, restore on close
    lastFocus.current = document.activeElement;
    const f = requestAnimationFrame(() => {
      if (panelRef.current) panelRef.current.focus();
    });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      cancelAnimationFrame(f);
      if (lastFocus.current && lastFocus.current.focus) lastFocus.current.focus();
    };
  }, [open, onClose]);
  if (!mounted) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: 'cb-dialog__scrim ' + (shown ? 'is-open' : ''),
    onMouseDown: e => {
      if (e.target === e.currentTarget && onClose) onClose();
    }
  }, /*#__PURE__*/React.createElement("div", _extends({
    className: 'cb-dialog ' + className,
    role: "dialog",
    "aria-modal": "true",
    "aria-labelledby": title ? titleId : undefined,
    tabIndex: -1,
    ref: panelRef
  }, rest), (title || onClose) && /*#__PURE__*/React.createElement("div", {
    className: "cb-dialog__head"
  }, title && /*#__PURE__*/React.createElement("h2", {
    className: "cb-dialog__title",
    id: titleId
  }, title), onClose && /*#__PURE__*/React.createElement("button", {
    className: "cb-dialog__close",
    onClick: onClose,
    "aria-label": "Close"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M18 6 6 18M6 6l12 12",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "cb-dialog__body"
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    className: "cb-dialog__foot"
  }, footer)));
}
Object.assign(__ds_scope, { Dialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Dialog.jsx", error: String((e && e.message) || e) }); }

// components/core/Drawer.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.cb-drawer__scrim { position: fixed; inset: 0; z-index: var(--z-modal); background: rgba(15,15,15,0.5); opacity: 0; transition: opacity var(--dur-base) var(--ease-out); }
.cb-drawer__scrim.is-open { opacity: 1; }
.cb-drawer { position: fixed; z-index: var(--z-modal); top: 0; bottom: 0; width: min(380px, 88vw); background: var(--surface-card); box-shadow: var(--shadow-xl); display: flex; flex-direction: column; transition: transform var(--dur-base) var(--ease-out); }
.cb-drawer--right { right: 0; transform: translateX(100%); }
.cb-drawer--left { left: 0; transform: translateX(-100%); }
.cb-drawer.is-open { transform: translateX(0); }
.cb-drawer__head { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 20px 22px; border-bottom: 1px solid var(--border-subtle); }
.cb-drawer__title { font-family: var(--font-display); font-weight: var(--fw-bold); font-size: var(--fs-h4); color: var(--text-strong); margin: 0; }
.cb-drawer__close { background: none; border: none; cursor: pointer; color: var(--text-subtle); padding: 4px; border-radius: var(--radius-sm); transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out); }
.cb-drawer__close:hover { background: var(--surface-sunken); color: var(--text-strong); }
.cb-drawer__body { padding: 20px 22px; overflow-y: auto; font-family: var(--font-body); font-size: var(--fs-body); color: var(--text-body); line-height: 1.6; flex: 1; }
@media (prefers-reduced-motion: reduce){ .cb-drawer__scrim, .cb-drawer { transition-duration: .001ms; } }
`;
function inject() {
  if (typeof document === 'undefined' || document.getElementById('cb-drawer-css')) return;
  const s = document.createElement('style');
  s.id = 'cb-drawer-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Slide-in panel anchored to a screen edge. Controlled via `open`; `side` =
 * right|left. Closes on scrim click or Esc.
 */
function Drawer({
  open = false,
  side = 'right',
  title,
  onClose,
  children,
  className = '',
  ...rest
}) {
  inject();
  const [mounted, setMounted] = React.useState(open);
  const [shown, setShown] = React.useState(false);
  const panelRef = React.useRef(null);
  const lastFocus = React.useRef(null);
  const titleId = React.useMemo(() => 'cb-drw-' + Math.random().toString(36).slice(2, 8), []);
  React.useEffect(() => {
    let t;
    if (open) {
      setMounted(true);
      t = requestAnimationFrame(() => setShown(true));
    } else {
      setShown(false);
      t = setTimeout(() => setMounted(false), 240);
    }
    return () => {
      cancelAnimationFrame(t);
      clearTimeout(t);
    };
  }, [open]);
  React.useEffect(() => {
    if (!open) return;
    const onKey = e => e.key === 'Escape' && onClose && onClose();
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    lastFocus.current = document.activeElement;
    const f = requestAnimationFrame(() => {
      if (panelRef.current) panelRef.current.focus();
    });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      cancelAnimationFrame(f);
      if (lastFocus.current && lastFocus.current.focus) lastFocus.current.focus();
    };
  }, [open, onClose]);
  if (!mounted) return null;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: 'cb-drawer__scrim ' + (shown ? 'is-open' : ''),
    onMouseDown: () => onClose && onClose()
  }), /*#__PURE__*/React.createElement("aside", _extends({
    className: 'cb-drawer cb-drawer--' + side + ' ' + (shown ? 'is-open ' : '') + className,
    role: "dialog",
    "aria-modal": "true",
    "aria-labelledby": title ? titleId : undefined,
    tabIndex: -1,
    ref: panelRef
  }, rest), /*#__PURE__*/React.createElement("div", {
    className: "cb-drawer__head"
  }, title && /*#__PURE__*/React.createElement("h2", {
    className: "cb-drawer__title",
    id: titleId
  }, title), onClose && /*#__PURE__*/React.createElement("button", {
    className: "cb-drawer__close",
    onClick: onClose,
    "aria-label": "Close"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M18 6 6 18M6 6l12 12",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "cb-drawer__body"
  }, children)));
}
Object.assign(__ds_scope, { Drawer });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Drawer.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.cb-field { display: flex; flex-direction: column; gap: 6px; font-family: var(--font-body); }
.cb-field__label { font-size: var(--fs-body-sm); font-weight: var(--fw-medium); color: var(--text-strong); }
.cb-field__req { color: var(--red-500); margin-left: 2px; }
.cb-input {
  font-family: var(--font-body); font-size: var(--fs-body); color: var(--text-strong);
  background: var(--surface-card);
  border: var(--border-1) solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 12px 14px; width: 100%;
  transition: border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
}
.cb-input::placeholder { color: var(--text-subtle); }
.cb-input:hover { border-color: var(--border-strong); }
.cb-input:focus { outline: none; border-color: var(--blue-500); box-shadow: var(--focus-ring); }
.cb-input:disabled { background: var(--surface-sunken); color: var(--text-subtle); cursor: not-allowed; }
.cb-input--sm { padding: 8px 12px; font-size: var(--fs-body-sm); }
.cb-input--lg { padding: 15px 16px; font-size: var(--fs-body-lg); }
.cb-field--error .cb-input { border-color: var(--red-500); }
.cb-field--error .cb-input:focus { box-shadow: 0 0 0 3px color-mix(in srgb, var(--red-500) 35%, transparent); }
.cb-field__msg { font-size: var(--fs-caption); color: var(--text-muted); }
.cb-field--error .cb-field__msg { color: var(--red-600); }
`;
function inject() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('cb-input-css')) return;
  const s = document.createElement('style');
  s.id = 'cb-input-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
let _id = 0;

/**
 * Text input with optional label, helper / error message, and sizes.
 * Pass `multiline` to render a textarea.
 */
function Input({
  label,
  required = false,
  size = 'md',
  error,
  helperText,
  multiline = false,
  id,
  className = '',
  ...rest
}) {
  inject();
  const fieldId = id || 'cb-input-' + ++_id;
  const inputClasses = ['cb-input'];
  if (size === 'sm') inputClasses.push('cb-input--sm');
  if (size === 'lg') inputClasses.push('cb-input--lg');
  if (className) inputClasses.push(className);
  const msg = error || helperText;
  const Control = multiline ? 'textarea' : 'input';
  const msgId = msg ? fieldId + '-msg' : undefined;
  return /*#__PURE__*/React.createElement("div", {
    className: 'cb-field' + (error ? ' cb-field--error' : '')
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "cb-field__label",
    htmlFor: fieldId
  }, label, required && /*#__PURE__*/React.createElement("span", {
    className: "cb-field__req",
    "aria-hidden": "true"
  }, "*")), /*#__PURE__*/React.createElement(Control, _extends({
    id: fieldId,
    className: inputClasses.join(' '),
    "aria-invalid": !!error,
    "aria-describedby": msgId
  }, rest)), msg && /*#__PURE__*/React.createElement("span", {
    className: "cb-field__msg",
    id: msgId
  }, msg));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// components/core/Pagination.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.cb-pag { display: inline-flex; align-items: center; gap: 6px; font-family: var(--font-body); }
.cb-pag button { min-width: 38px; height: 38px; padding: 0 10px; border: 1px solid var(--border-default); background: var(--surface-card); color: var(--text-body); border-radius: var(--radius-md); cursor: pointer; font-family: var(--font-body); font-size: var(--fs-body-sm); font-weight: var(--fw-medium); display: inline-flex; align-items: center; justify-content: center; transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out); }
.cb-pag button:hover:not(:disabled):not(.is-current) { background: var(--surface-sunken); border-color: var(--border-strong); }
.cb-pag button:active:not(:disabled) { transform: translateY(1px); }
.cb-pag button:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.cb-pag button.is-current { background: var(--red-500); border-color: var(--red-500); color: #fff; }
.cb-pag button:disabled { opacity: .4; cursor: not-allowed; }
.cb-pag__ellipsis { min-width: 24px; text-align: center; color: var(--text-subtle); }
`;
function inject() {
  if (typeof document === 'undefined' || document.getElementById('cb-pag-css')) return;
  const s = document.createElement('style');
  s.id = 'cb-pag-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
function range(start, end) {
  const a = [];
  for (let i = start; i <= end; i++) a.push(i);
  return a;
}

/**
 * Page navigation with prev/next and truncated number pills (current = cherry).
 */
function Pagination({
  page = 1,
  total = 1,
  siblings = 1,
  onChange = () => {},
  className = '',
  ...rest
}) {
  inject();
  const pages = [];
  const left = Math.max(2, page - siblings);
  const right = Math.min(total - 1, page + siblings);
  pages.push(1);
  if (left > 2) pages.push('…l');
  pages.push(...range(left, right));
  if (right < total - 1) pages.push('…r');
  if (total > 1) pages.push(total);
  const go = p => p >= 1 && p <= total && p !== page && onChange(p);
  const Arrow = ({
    d
  }) => /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: d,
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }));
  return /*#__PURE__*/React.createElement("nav", _extends({
    className: 'cb-pag ' + className,
    "aria-label": "Pagination"
  }, rest), /*#__PURE__*/React.createElement("button", {
    onClick: () => go(page - 1),
    disabled: page <= 1,
    "aria-label": "Previous"
  }, /*#__PURE__*/React.createElement(Arrow, {
    d: "M15 6l-6 6 6 6"
  })), pages.map((p, i) => typeof p === 'string' ? /*#__PURE__*/React.createElement("span", {
    className: "cb-pag__ellipsis",
    key: p + i
  }, "\u2026") : /*#__PURE__*/React.createElement("button", {
    key: p,
    className: p === page ? 'is-current' : '',
    "aria-current": p === page ? 'page' : undefined,
    onClick: () => go(p)
  }, p)), /*#__PURE__*/React.createElement("button", {
    onClick: () => go(page + 1),
    disabled: page >= total,
    "aria-label": "Next"
  }, /*#__PURE__*/React.createElement(Arrow, {
    d: "M9 6l6 6-6 6"
  })));
}
Object.assign(__ds_scope, { Pagination });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Pagination.jsx", error: String((e && e.message) || e) }); }

// components/core/Popover.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.cb-pop { position: relative; display: inline-flex; }
.cb-pop__panel { position: absolute; z-index: var(--z-overlay); min-width: 200px; background: var(--surface-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); padding: 14px 16px; font-family: var(--font-body); font-size: var(--fs-body-sm); color: var(--text-body); opacity: 0; transform: translateY(6px) scale(.98); transform-origin: top center; transition: opacity var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out); pointer-events: none; }
.cb-pop__panel[data-p="top"] { bottom: calc(100% + 8px); left: 0; transform-origin: bottom center; }
.cb-pop__panel[data-p="bottom"] { top: calc(100% + 8px); left: 0; }
.cb-pop__panel[data-p="right"] { top: 0; left: calc(100% + 8px); }
.cb-pop.is-open .cb-pop__panel { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }
@media (prefers-reduced-motion: reduce){ .cb-pop__panel { transition-duration: .001ms; } }
`;
function inject() {
  if (typeof document === 'undefined' || document.getElementById('cb-pop-css')) return;
  const s = document.createElement('style');
  s.id = 'cb-pop-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Click-triggered floating panel that closes on outside-click or Esc.
 * `trigger` is the clickable node; children are the panel content.
 */
function Popover({
  trigger,
  placement = 'bottom',
  children,
  className = '',
  ...rest
}) {
  inject();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = e => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return /*#__PURE__*/React.createElement("span", _extends({
    className: 'cb-pop ' + (open ? 'is-open ' : '') + className,
    ref: ref
  }, rest), /*#__PURE__*/React.createElement("span", {
    onClick: () => setOpen(o => !o),
    style: {
      display: 'inline-flex'
    }
  }, trigger), /*#__PURE__*/React.createElement("span", {
    className: "cb-pop__panel",
    "data-p": placement,
    role: "dialog"
  }, children));
}
Object.assign(__ds_scope, { Popover });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Popover.jsx", error: String((e && e.message) || e) }); }

// components/core/Progress.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.cb-prog { width: 100%; }
.cb-prog__track { height: 10px; background: var(--surface-sunken); border-radius: var(--radius-pill); overflow: hidden; }
.cb-prog__bar { height: 100%; border-radius: var(--radius-pill); background: var(--red-500); width: 0; transition: width var(--dur-slow) var(--ease-out); }
.cb-prog__bar.green { background: var(--green-600); } .cb-prog__bar.blue { background: var(--blue-500); }
.cb-prog__bar.indet { width: 40% !important; animation: cb-indet 1.3s var(--ease-in-out) infinite; }
.cb-prog__head { display: flex; justify-content: space-between; margin-bottom: 8px; font-family: var(--font-body); font-size: var(--fs-caption); }
.cb-prog__label { color: var(--text-strong); font-weight: var(--fw-medium); }
.cb-prog__val { color: var(--text-muted); font-family: var(--font-mono); }
@keyframes cb-indet { 0% { margin-left: -40%; } 100% { margin-left: 100%; } }
@media (prefers-reduced-motion: reduce){ .cb-prog__bar { transition-duration: .001ms; } .cb-prog__bar.indet { animation: none; width: 100% !important; } }
`;
function inject() {
  if (typeof document === 'undefined' || document.getElementById('cb-prog-css')) return;
  const s = document.createElement('style');
  s.id = 'cb-prog-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Progress bar with an animated fill. Pass `value`/`max` for determinate, or
 * `indeterminate` for an in-flight loop. `tone` = red|green|blue.
 */
function Progress({
  value = 0,
  max = 100,
  tone = 'red',
  indeterminate = false,
  label,
  showValue = false,
  className = '',
  ...rest
}) {
  inject();
  const pct = Math.max(0, Math.min(100, value / max * 100));
  return /*#__PURE__*/React.createElement("div", _extends({
    className: 'cb-prog ' + className
  }, rest), (label || showValue) && /*#__PURE__*/React.createElement("div", {
    className: "cb-prog__head"
  }, label && /*#__PURE__*/React.createElement("span", {
    className: "cb-prog__label"
  }, label), showValue && !indeterminate && /*#__PURE__*/React.createElement("span", {
    className: "cb-prog__val"
  }, Math.round(pct), "%")), /*#__PURE__*/React.createElement("div", {
    className: "cb-prog__track",
    role: "progressbar",
    "aria-valuenow": indeterminate ? undefined : Math.round(pct),
    "aria-valuemin": 0,
    "aria-valuemax": 100
  }, /*#__PURE__*/React.createElement("div", {
    className: 'cb-prog__bar ' + (tone !== 'red' ? tone : '') + (indeterminate ? ' indet' : ''),
    style: indeterminate ? undefined : {
      width: pct + '%'
    }
  })));
}
Object.assign(__ds_scope, { Progress });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Progress.jsx", error: String((e && e.message) || e) }); }

// components/core/Skeleton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.cb-skel { display: block; background: var(--surface-sunken); border-radius: var(--radius-sm); position: relative; overflow: hidden; }
.cb-skel--text { height: 0.85em; border-radius: var(--radius-xs); margin: 0.2em 0; }
.cb-skel--circle { border-radius: 50%; }
.cb-skel::after { content: ''; position: absolute; inset: 0; transform: translateX(-100%); background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--neutral-0) 60%, transparent), transparent); animation: cb-shimmer 1.4s var(--ease-in-out) infinite; }
[data-theme="dark"] .cb-skel::after { background: linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent); }
@keyframes cb-shimmer { 100% { transform: translateX(100%); } }
@media (prefers-reduced-motion: reduce){ .cb-skel::after { animation: none; } }
`;
function inject() {
  if (typeof document === 'undefined' || document.getElementById('cb-skel-css')) return;
  const s = document.createElement('style');
  s.id = 'cb-skel-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Loading placeholder with a soft shimmer. `variant` = rect|text|circle.
 * Size with `width`/`height` (numbers → px) or CSS.
 */
function Skeleton({
  variant = 'rect',
  width,
  height,
  radius,
  className = '',
  style,
  ...rest
}) {
  inject();
  const dim = v => typeof v === 'number' ? v + 'px' : v;
  return /*#__PURE__*/React.createElement("span", _extends({
    className: 'cb-skel cb-skel--' + variant + ' ' + className,
    style: {
      width: dim(width),
      height: dim(height),
      borderRadius: dim(radius),
      ...style
    },
    "aria-hidden": "true"
  }, rest));
}
Object.assign(__ds_scope, { Skeleton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Skeleton.jsx", error: String((e && e.message) || e) }); }

// components/core/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.cb-switch { display: inline-flex; align-items: center; gap: 10px; cursor: pointer; font-family: var(--font-body); font-size: var(--fs-body-sm); color: var(--text-body); }
.cb-switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.cb-switch__track { width: 44px; height: 26px; border-radius: var(--radius-pill); background: var(--neutral-300); position: relative; flex: none; transition: background var(--dur-base) var(--ease-out); }
.cb-switch__knob { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: var(--shadow-sm); transition: transform var(--dur-base) var(--ease-spring); }
.cb-switch input:checked + .cb-switch__track { background: var(--green-600); }
.cb-switch input:checked + .cb-switch__track .cb-switch__knob { transform: translateX(18px); }
.cb-switch input:focus-visible + .cb-switch__track { box-shadow: var(--focus-ring); }
.cb-switch:hover .cb-switch__track { filter: brightness(0.97); }
.cb-switch--disabled { opacity: .45; cursor: not-allowed; }
@media (prefers-reduced-motion: reduce){ .cb-switch__track, .cb-switch__knob { transition-duration: .001ms; } }
`;
function inject() {
  if (typeof document === 'undefined' || document.getElementById('cb-switch-css')) return;
  const s = document.createElement('style');
  s.id = 'cb-switch-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * On/off toggle switch with a soft spring knob (leaf-green when on).
 */
function Switch({
  label,
  disabled = false,
  className = '',
  children,
  ...rest
}) {
  inject();
  return /*#__PURE__*/React.createElement("label", {
    className: 'cb-switch ' + (disabled ? 'cb-switch--disabled ' : '') + className
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox",
    role: "switch",
    disabled: disabled
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "cb-switch__track"
  }, /*#__PURE__*/React.createElement("span", {
    className: "cb-switch__knob"
  })), (label || children) && /*#__PURE__*/React.createElement("span", null, label || children));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Switch.jsx", error: String((e && e.message) || e) }); }

// components/core/Table.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.cb-table-wrap { width: 100%; overflow-x: auto; border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); }
.cb-table { width: 100%; border-collapse: collapse; font-family: var(--font-body); font-size: var(--fs-body-sm); }
.cb-table thead th { text-align: left; padding: 13px 16px; background: var(--surface-subtle); color: var(--text-muted); font-size: var(--fs-caption); font-weight: var(--fw-bold); text-transform: uppercase; letter-spacing: var(--ls-wide); white-space: nowrap; border-bottom: 1px solid var(--border-subtle); }
.cb-table tbody td { padding: 13px 16px; color: var(--text-body); border-bottom: 1px solid var(--border-subtle); }
.cb-table tbody tr:last-child td { border-bottom: none; }
.cb-table tbody tr { transition: background var(--dur-fast) var(--ease-out); }
.cb-table--hover tbody tr:hover { background: var(--surface-sunken); }
.cb-table--striped tbody tr:nth-child(even) { background: color-mix(in srgb, var(--surface-sunken) 55%, transparent); }
.cb-table td.num, .cb-table th.num { text-align: right; font-variant-numeric: tabular-nums; }
`;
function inject() {
  if (typeof document === 'undefined' || document.getElementById('cb-table-css')) return;
  const s = document.createElement('style');
  s.id = 'cb-table-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Data table. `columns` = [{ key, header, align, render }]; `data` = row objects.
 * `hover` highlights rows; `striped` zebra-stripes them.
 */
function Table({
  columns = [],
  data = [],
  hover = true,
  striped = false,
  className = '',
  ...rest
}) {
  inject();
  const cls = ['cb-table'];
  if (hover) cls.push('cb-table--hover');
  if (striped) cls.push('cb-table--striped');
  if (className) cls.push(className);
  return /*#__PURE__*/React.createElement("div", {
    className: "cb-table-wrap"
  }, /*#__PURE__*/React.createElement("table", _extends({
    className: cls.join(' ')
  }, rest), /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, columns.map((c, i) => /*#__PURE__*/React.createElement("th", {
    key: i,
    className: c.align === 'right' ? 'num' : ''
  }, c.header)))), /*#__PURE__*/React.createElement("tbody", null, data.map((row, ri) => /*#__PURE__*/React.createElement("tr", {
    key: ri
  }, columns.map((c, ci) => /*#__PURE__*/React.createElement("td", {
    key: ci,
    className: c.align === 'right' ? 'num' : ''
  }, c.render ? c.render(row[c.key], row) : row[c.key])))))));
}
Object.assign(__ds_scope, { Table });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Table.jsx", error: String((e && e.message) || e) }); }

// components/core/Textarea.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.cb-ta-field { display: flex; flex-direction: column; gap: 6px; font-family: var(--font-body); }
.cb-ta-field__label { font-size: var(--fs-body-sm); font-weight: var(--fw-medium); color: var(--text-strong); }
.cb-ta-field__req { color: var(--red-500); margin-left: 2px; }
.cb-ta { font-family: var(--font-body); font-size: var(--fs-body); color: var(--text-strong); background: var(--surface-card); border: 1px solid var(--border-default); border-radius: var(--radius-md); padding: 12px 14px; width: 100%; resize: vertical; min-height: 96px; line-height: 1.5; transition: border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out); }
.cb-ta::placeholder { color: var(--text-subtle); }
.cb-ta:hover { border-color: var(--border-strong); }
.cb-ta:focus { outline: none; border-color: var(--blue-500); box-shadow: var(--focus-ring); }
.cb-ta:disabled { background: var(--surface-sunken); color: var(--text-subtle); cursor: not-allowed; }
.cb-ta-field--error .cb-ta { border-color: var(--red-500); }
.cb-ta-field__foot { display: flex; justify-content: space-between; font-size: var(--fs-caption); color: var(--text-muted); }
.cb-ta-field--error .cb-ta-field__msg { color: var(--red-600); }
.cb-ta-field__count { font-family: var(--font-mono); margin-left: auto; }
`;
function inject() {
  if (typeof document === 'undefined' || document.getElementById('cb-ta-css')) return;
  const s = document.createElement('style');
  s.id = 'cb-ta-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
let _taid = 0;

/**
 * Multi-line text field with optional label, error/helper text, and a live
 * character counter when `maxLength` is set.
 */
function Textarea({
  label,
  required = false,
  error,
  helperText,
  maxLength,
  id,
  value,
  defaultValue,
  onChange,
  className = '',
  ...rest
}) {
  inject();
  const fid = id || 'cb-ta-' + ++_taid;
  const [len, setLen] = React.useState((value ?? defaultValue ?? '').length);
  const msg = error || helperText;
  const msgId = msg ? fid + '-msg' : undefined;
  return /*#__PURE__*/React.createElement("div", {
    className: 'cb-ta-field' + (error ? ' cb-ta-field--error' : '')
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "cb-ta-field__label",
    htmlFor: fid
  }, label, required && /*#__PURE__*/React.createElement("span", {
    className: "cb-ta-field__req"
  }, "*")), /*#__PURE__*/React.createElement("textarea", _extends({
    id: fid,
    className: 'cb-ta ' + className,
    maxLength: maxLength,
    value: value,
    defaultValue: defaultValue,
    "aria-invalid": !!error,
    "aria-describedby": msgId,
    onChange: e => {
      setLen(e.target.value.length);
      onChange && onChange(e);
    }
  }, rest)), (msg || maxLength) && /*#__PURE__*/React.createElement("div", {
    className: "cb-ta-field__foot"
  }, msg && /*#__PURE__*/React.createElement("span", {
    className: "cb-ta-field__msg",
    id: msgId
  }, msg), maxLength && /*#__PURE__*/React.createElement("span", {
    className: "cb-ta-field__count"
  }, len, "/", maxLength)));
}
Object.assign(__ds_scope, { Textarea });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Textarea.jsx", error: String((e && e.message) || e) }); }

// components/core/Toast.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.cb-toast { display: flex; align-items: flex-start; gap: 12px; width: min(380px, calc(100vw - 32px)); background: var(--surface-card); border: 1px solid var(--border-subtle); border-left: 4px solid var(--neutral-400); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); padding: 14px 16px; font-family: var(--font-body); }
.cb-toast--fixed { position: fixed; left: 50%; bottom: 24px; z-index: var(--z-toast); transform: translateX(-50%) translateY(16px); opacity: 0; transition: opacity var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-spring); pointer-events: none; }
.cb-toast--fixed.is-open { opacity: 1; transform: translateX(-50%) translateY(0); pointer-events: auto; }
.cb-toast--success { border-left-color: var(--green-600); } .cb-toast--success .cb-toast__ic { color: var(--green-600); }
.cb-toast--danger { border-left-color: var(--red-500); } .cb-toast--danger .cb-toast__ic { color: var(--red-500); }
.cb-toast--info { border-left-color: var(--blue-500); } .cb-toast--info .cb-toast__ic { color: var(--blue-500); }
.cb-toast__ic { flex: none; margin-top: 1px; color: var(--text-muted); }
.cb-toast__body { flex: 1; min-width: 0; }
.cb-toast__title { font-weight: var(--fw-bold); font-size: var(--fs-body-sm); color: var(--text-strong); }
.cb-toast__msg { font-size: var(--fs-caption); color: var(--text-muted); margin-top: 2px; line-height: 1.45; }
.cb-toast__close { flex: none; background: none; border: none; cursor: pointer; color: var(--text-subtle); padding: 2px; border-radius: var(--radius-xs); transition: color var(--dur-fast) var(--ease-out); }
.cb-toast__close:hover { color: var(--text-strong); }
@media (prefers-reduced-motion: reduce){ .cb-toast--fixed { transition-duration: .001ms; } }
`;
function inject() {
  if (typeof document === 'undefined' || document.getElementById('cb-toast-css')) return;
  const s = document.createElement('style');
  s.id = 'cb-toast-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
const ICONS = {
  success: 'M20 6L9 17l-5-5',
  danger: 'M12 8v5M12 16.5v.5M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  info: 'M12 16v-5M12 8v.5M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  neutral: 'M12 16v-5M12 8v.5M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z'
};

/**
 * Notification toast. `variant` = neutral|success|danger|info. Renders
 * fixed-bottom-center by default; pass `static` to place it in normal flow.
 */
function Toast({
  open = true,
  variant = 'neutral',
  title,
  children,
  onClose,
  static: inFlow = false,
  className = '',
  ...rest
}) {
  inject();
  const cls = ['cb-toast', 'cb-toast--' + variant];
  if (!inFlow) {
    cls.push('cb-toast--fixed');
    if (open) cls.push('is-open');
  }
  if (className) cls.push(className);
  if (inFlow && !open) return null;
  return /*#__PURE__*/React.createElement("div", _extends({
    className: cls.join(' '),
    role: "status"
  }, rest), /*#__PURE__*/React.createElement("svg", {
    className: "cb-toast__ic",
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: ICONS[variant],
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })), /*#__PURE__*/React.createElement("div", {
    className: "cb-toast__body"
  }, title && /*#__PURE__*/React.createElement("div", {
    className: "cb-toast__title"
  }, title), children && /*#__PURE__*/React.createElement("div", {
    className: "cb-toast__msg"
  }, children)), onClose && /*#__PURE__*/React.createElement("button", {
    className: "cb-toast__close",
    onClick: onClose,
    "aria-label": "Dismiss"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M18 6 6 18M6 6l12 12",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round"
  }))));
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Toast.jsx", error: String((e && e.message) || e) }); }

// components/core/Tooltip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.cb-tip { position: relative; display: inline-flex; }
.cb-tip__pop { position: absolute; z-index: var(--z-overlay); pointer-events: none; background: var(--neutral-900); color: #fff; font-family: var(--font-body); font-size: var(--fs-caption); font-weight: var(--fw-medium); line-height: 1.3; padding: 7px 11px; border-radius: var(--radius-sm); white-space: nowrap; box-shadow: var(--shadow-md); opacity: 0; transform: translateY(4px); transition: opacity var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out); }
.cb-tip:hover .cb-tip__pop, .cb-tip:focus-within .cb-tip__pop { opacity: 1; transform: translateY(0); }
.cb-tip__pop::after { content: ''; position: absolute; width: 8px; height: 8px; background: var(--neutral-900); transform: rotate(45deg); }
.cb-tip__pop[data-p="top"] { bottom: calc(100% + 8px); left: 50%; translate: -50% 0; }
.cb-tip__pop[data-p="top"]::after { bottom: -4px; left: 50%; margin-left: -4px; }
.cb-tip__pop[data-p="bottom"] { top: calc(100% + 8px); left: 50%; translate: -50% 0; }
.cb-tip__pop[data-p="bottom"]::after { top: -4px; left: 50%; margin-left: -4px; }
.cb-tip__pop[data-p="left"] { right: calc(100% + 8px); top: 50%; translate: 0 -50%; }
.cb-tip__pop[data-p="left"]::after { right: -4px; top: 50%; margin-top: -4px; }
.cb-tip__pop[data-p="right"] { left: calc(100% + 8px); top: 50%; translate: 0 -50%; }
.cb-tip__pop[data-p="right"]::after { left: -4px; top: 50%; margin-top: -4px; }
@media (prefers-reduced-motion: reduce){ .cb-tip__pop { transition-duration: .001ms; } }
`;
function inject() {
  if (typeof document === 'undefined' || document.getElementById('cb-tip-css')) return;
  const s = document.createElement('style');
  s.id = 'cb-tip-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Hover/focus tooltip. Wraps a single trigger; `placement` = top|bottom|left|right.
 */
function Tooltip({
  label,
  placement = 'top',
  children,
  className = '',
  ...rest
}) {
  inject();
  return /*#__PURE__*/React.createElement("span", _extends({
    className: 'cb-tip ' + className,
    tabIndex: 0
  }, rest), children, /*#__PURE__*/React.createElement("span", {
    className: "cb-tip__pop",
    "data-p": placement,
    role: "tooltip"
  }, label));
}
Object.assign(__ds_scope, { Tooltip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tooltip.jsx", error: String((e && e.message) || e) }); }

// guidelines/showcase.jsx
try { (() => {
/* Live component gallery + example layouts for design-system.html.
   Reads the components off the standalone build's window namespace. */
const C = window.ColaberryDesignSystem_098454 || {};
const {
  Button,
  Badge,
  Card,
  Avatar,
  Input,
  Textarea,
  Checkbox,
  Switch,
  Accordion,
  Breadcrumb,
  Pagination,
  Tooltip,
  Popover,
  Progress,
  Skeleton,
  Toast,
  Table,
  Dialog,
  Drawer,
  Carousel
} = C;
function Tile({
  name,
  wide,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: 'ds-tile' + (wide ? ' ds-tile--wide' : '')
  }, /*#__PURE__*/React.createElement("p", {
    className: "ds-tile__name"
  }, name), children);
}
function OverlayDemo() {
  const [dlg, setDlg] = React.useState(false);
  const [drw, setDrw] = React.useState(false);
  const [tst, setTst] = React.useState(false);
  React.useEffect(() => {
    if (!tst) return;
    const t = setTimeout(() => setTst(false), 3200);
    return () => clearTimeout(t);
  }, [tst]);
  return /*#__PURE__*/React.createElement(Tile, {
    name: "Dialog \xB7 Drawer \xB7 Toast",
    wide: true
  }, /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    onClick: () => setDlg(true)
  }, "Open dialog"), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "outline",
    onClick: () => setDrw(true)
  }, "Open drawer"), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "ghost",
    onClick: () => setTst(true)
  }, "Show toast")), /*#__PURE__*/React.createElement(Dialog, {
    open: dlg,
    title: "Confirm enrollment",
    onClose: () => setDlg(false),
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "sm",
      onClick: () => setDlg(false)
    }, "Cancel"), /*#__PURE__*/React.createElement(Button, {
      size: "sm",
      onClick: () => setDlg(false)
    }, "Confirm"))
  }, "Ready to start the Data Analytics program? You can change your cohort later."), /*#__PURE__*/React.createElement(Drawer, {
    open: drw,
    title: "Filters",
    onClose: () => setDrw(false)
  }, /*#__PURE__*/React.createElement("div", {
    className: "stack"
  }, /*#__PURE__*/React.createElement(Checkbox, {
    label: "Online",
    defaultChecked: true
  }), /*#__PURE__*/React.createElement(Checkbox, {
    label: "On campus"
  }), /*#__PURE__*/React.createElement(Switch, {
    label: "Scholarships only"
  }))), /*#__PURE__*/React.createElement(Toast, {
    open: tst,
    variant: "success",
    title: "Application sent",
    onClose: () => setTst(false)
  }, "We'll be in touch within a day."));
}
function Gallery() {
  const [page, setPage] = React.useState(3);
  const slide = (label, a, b) => /*#__PURE__*/React.createElement("div", {
    style: {
      height: 150,
      display: 'grid',
      placeItems: 'center',
      color: '#fff',
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 24,
      background: `linear-gradient(135deg, var(--${a}), var(--${b}))`
    }
  }, label);
  return /*#__PURE__*/React.createElement("div", {
    className: "ds-gal"
  }, /*#__PURE__*/React.createElement(Tile, {
    name: "Button"
  }, /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement(Button, null, "Apply now"), /*#__PURE__*/React.createElement(Button, {
    tone: "green"
  }, "Enroll"), /*#__PURE__*/React.createElement(Button, {
    tone: "blue"
  }, "Book a call")), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "outline"
  }, "Outline"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost"
  }, "Ghost"), /*#__PURE__*/React.createElement(Button, {
    variant: "link"
  }, "Link")), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement(Button, {
    size: "lg"
  }, "Large"), /*#__PURE__*/React.createElement(Button, {
    size: "sm"
  }, "Small"), /*#__PURE__*/React.createElement(Button, {
    disabled: true
  }, "Disabled"))), /*#__PURE__*/React.createElement(Tile, {
    name: "Badge \xB7 Avatar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "green",
    dot: true
  }, "Enrolling"), /*#__PURE__*/React.createElement(Badge, {
    tone: "blue"
  }, "Data Science"), /*#__PURE__*/React.createElement(Badge, {
    tone: "red",
    dot: true
  }, "Closing"), /*#__PURE__*/React.createElement(Badge, {
    solid: true
  }, "New"), /*#__PURE__*/React.createElement(Badge, {
    outline: true
  }, "Self-paced")), /*#__PURE__*/React.createElement("div", {
    className: "row",
    style: {
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    src: "assets/avatars/person-1.png",
    name: "Mika Rivera",
    size: "lg",
    ring: true
  }), /*#__PURE__*/React.createElement(Avatar, {
    src: "assets/avatars/person-2.png",
    name: "Owen Brooks",
    size: "lg"
  }), /*#__PURE__*/React.createElement(Avatar, {
    src: "assets/avatars/person-3.png",
    name: "Sam Okafor",
    size: "lg"
  }), /*#__PURE__*/React.createElement(Avatar, {
    name: "Ada Lovelace",
    size: "lg"
  }), /*#__PURE__*/React.createElement("div", {
    className: "cb-avatar-group"
  }, /*#__PURE__*/React.createElement(Avatar, {
    src: "assets/avatars/person-2.png",
    name: "Owen Brooks"
  }), /*#__PURE__*/React.createElement(Avatar, {
    src: "assets/avatars/person-1.png",
    name: "Mika Rivera"
  }), /*#__PURE__*/React.createElement(Avatar, {
    name: "Ada Lovelace"
  }), /*#__PURE__*/React.createElement(Avatar, {
    name: "Lee Park"
  })))), /*#__PURE__*/React.createElement(Tile, {
    name: "Input \xB7 Textarea"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stack"
  }, /*#__PURE__*/React.createElement(Input, {
    label: "Email",
    type: "email",
    placeholder: "ada@email.com"
  }), /*#__PURE__*/React.createElement(Textarea, {
    label: "Why data?",
    placeholder: "A sentence or two\u2026",
    maxLength: 120
  }))), /*#__PURE__*/React.createElement(Tile, {
    name: "Checkbox \xB7 Switch"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stack"
  }, /*#__PURE__*/React.createElement(Checkbox, {
    label: "Email me about new cohorts",
    defaultChecked: true
  }), /*#__PURE__*/React.createElement(Checkbox, {
    label: "I agree to the terms"
  }), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement(Switch, {
    label: "Notifications",
    defaultChecked: true
  }), /*#__PURE__*/React.createElement(Switch, {
    label: "SMS"
  })))), /*#__PURE__*/React.createElement(Tile, {
    name: "Accordion"
  }, /*#__PURE__*/React.createElement(Accordion, {
    defaultOpen: [0],
    items: [{
      title: 'What is included?',
      content: 'Live classes, 1:1 mentorship, a portfolio project, and a year of job support.'
    }, {
      title: 'Do I need a degree?',
      content: 'No — a GED or diploma is all you need. No admissions tests.'
    }]
  })), /*#__PURE__*/React.createElement(Tile, {
    name: "Breadcrumb \xB7 Pagination"
  }, /*#__PURE__*/React.createElement(Breadcrumb, {
    items: [{
      label: 'Home'
    }, {
      label: 'Programs'
    }, {
      label: 'Data Analytics'
    }]
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement(Pagination, {
    page: page,
    total: 9,
    onChange: setPage
  }))), /*#__PURE__*/React.createElement(Tile, {
    name: "Tooltip \xB7 Popover"
  }, /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement(Tooltip, {
    label: "Closes the menu"
  }, /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "outline"
  }, "Hover me")), /*#__PURE__*/React.createElement(Popover, {
    placement: "bottom",
    trigger: /*#__PURE__*/React.createElement(Button, {
      size: "sm"
    }, "Open popover")
  }, /*#__PURE__*/React.createElement("strong", null, "Need help?"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6,
      color: 'var(--text-muted)',
      fontSize: 13
    }
  }, "Talk to an advisor \u2014 no pressure.")))), /*#__PURE__*/React.createElement(Tile, {
    name: "Progress \xB7 Skeleton"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stack"
  }, /*#__PURE__*/React.createElement(Progress, {
    label: "Course progress",
    value: 68,
    showValue: true
  }), /*#__PURE__*/React.createElement(Progress, {
    tone: "blue",
    indeterminate: true
  }), /*#__PURE__*/React.createElement("div", {
    className: "row",
    style: {
      alignItems: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement(Skeleton, {
    variant: "circle",
    width: 42,
    height: 42
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(Skeleton, {
    variant: "text",
    width: "80%"
  }), /*#__PURE__*/React.createElement(Skeleton, {
    variant: "text",
    width: "55%"
  }))))), /*#__PURE__*/React.createElement(Tile, {
    name: "Table",
    wide: true
  }, /*#__PURE__*/React.createElement(Table, {
    columns: [{
      key: 'name',
      header: 'Cohort'
    }, {
      key: 'start',
      header: 'Starts'
    }, {
      key: 'wk',
      header: 'Weeks',
      align: 'right'
    }, {
      key: 'st',
      header: 'Status',
      render: v => /*#__PURE__*/React.createElement(Badge, {
        tone: v === 'Open' ? 'green' : 'neutral',
        dot: v === 'Open'
      }, v)
    }],
    data: [{
      name: 'Data Analytics',
      start: 'Apr 8',
      wk: 12,
      st: 'Open'
    }, {
      name: 'Data Science',
      start: 'May 6',
      wk: 24,
      st: 'Open'
    }, {
      name: 'Intro Seminar',
      start: 'Mar 18',
      wk: 2,
      st: 'Closed'
    }]
  })), /*#__PURE__*/React.createElement(OverlayDemo, null), /*#__PURE__*/React.createElement(Tile, {
    name: "Carousel",
    wide: true
  }, /*#__PURE__*/React.createElement(Carousel, {
    slides: [slide('Mentorship', 'blue-500', 'blue-700'), slide('Real projects', 'green-500', 'green-700'), slide('Get hired', 'red-400', 'red-600')]
  })));
}

/* ---------------- Example layouts ---------------- */

function Frame({
  title,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "ds-ex__frame"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ds-ex__bar"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ds-ex__dot"
  }), /*#__PURE__*/React.createElement("span", {
    className: "ds-ex__dot"
  }), /*#__PURE__*/React.createElement("span", {
    className: "ds-ex__dot"
  }), /*#__PURE__*/React.createElement("span", {
    className: "ds-ex__title"
  }, title)), /*#__PURE__*/React.createElement("div", {
    className: "ds-ex__body"
  }, children));
}
function SignIn() {
  return /*#__PURE__*/React.createElement(Frame, {
    title: "sign-in.html"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 380,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "assets/logo/colaberry-horizontal.png",
    alt: "Colaberry",
    style: {
      height: 34,
      display: 'block',
      margin: '0 auto 22px'
    }
  }), /*#__PURE__*/React.createElement("h2", {
    style: {
      textAlign: 'center',
      fontSize: 26,
      margin: '0 0 6px'
    }
  }, "Welcome back"), /*#__PURE__*/React.createElement("p", {
    style: {
      textAlign: 'center',
      color: 'var(--text-muted)',
      margin: '0 0 24px'
    }
  }, "Sign in to continue your data journey."), /*#__PURE__*/React.createElement("div", {
    className: "stack"
  }, /*#__PURE__*/React.createElement(Input, {
    label: "Email",
    type: "email",
    placeholder: "ada@email.com"
  }), /*#__PURE__*/React.createElement(Input, {
    label: "Password",
    type: "password",
    placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 2
    }
  }, /*#__PURE__*/React.createElement(Checkbox, {
    label: "Remember me",
    defaultChecked: true
  }), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      fontSize: 14
    }
  }, "Forgot password?")), /*#__PURE__*/React.createElement(Button, {
    fullWidth: true
  }, "Sign in")), /*#__PURE__*/React.createElement("p", {
    style: {
      textAlign: 'center',
      fontSize: 14,
      color: 'var(--text-muted)',
      marginTop: 20
    }
  }, "New here? ", /*#__PURE__*/React.createElement("a", {
    href: "#"
  }, "Apply now"))));
}
function Pricing() {
  const plans = [{
    tone: 'blue',
    tag: '12 weeks',
    name: 'Data Analytics',
    price: '$1,999',
    feats: ['SQL & reporting', 'Dashboards', 'Portfolio project'],
    cta: 'blue'
  }, {
    tone: 'red',
    tag: 'Most popular',
    name: 'Analytics + Accelerator',
    price: '$12,000',
    feats: ['Everything in Analytics', '1:1 mentorship', '1-year job support'],
    featured: true,
    cta: 'red'
  }, {
    tone: 'green',
    tag: '24 weeks',
    name: 'Data Science',
    price: '$4,500',
    feats: ['Python & ML', 'Statistics', 'Capstone project'],
    cta: 'green'
  }];
  return /*#__PURE__*/React.createElement(Frame, {
    title: "pricing.html"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 18
    }
  }, plans.map((p, i) => /*#__PURE__*/React.createElement(Card, {
    key: i,
    padded: true,
    elevation: p.featured ? 'md' : 'sm',
    accent: p.featured ? 'red' : undefined,
    style: p.featured ? {
      outline: '2px solid var(--red-500)'
    } : undefined
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: p.tone,
    solid: p.featured
  }, p.tag), /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '4px 0 0',
      fontSize: 20
    }
  }, p.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 900,
      fontSize: 34,
      color: 'var(--text-strong)'
    }
  }, p.price), /*#__PURE__*/React.createElement("div", {
    className: "stack",
    style: {
      gap: 9,
      margin: '4px 0 8px'
    }
  }, p.feats.map((f, j) => /*#__PURE__*/React.createElement("div", {
    key: j,
    style: {
      display: 'flex',
      gap: 9,
      alignItems: 'center',
      fontSize: 14,
      color: 'var(--text-body)'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20 6 9 17l-5-5",
    stroke: "var(--green-600)",
    strokeWidth: "2.4",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })), f))), /*#__PURE__*/React.createElement(Button, {
    fullWidth: true,
    tone: p.cta,
    variant: p.featured ? 'primary' : 'outline'
  }, "Choose plan")))));
}
function Dashboard() {
  const stats = [['68%', 'Course complete'], ['12', 'Lessons left'], ['4.9', 'Avg. score'], ['Apr 30', 'Cohort ends']];
  return /*#__PURE__*/React.createElement(Frame, {
    title: "dashboard.html"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 14,
      marginBottom: 22
    }
  }, stats.map((s, i) => /*#__PURE__*/React.createElement(Card, {
    key: i,
    padded: true
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 900,
      fontSize: 28,
      color: 'var(--red-500)'
    }
  }, s[0]), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--text-muted)'
    }
  }, s[1])))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.6fr 1fr',
      gap: 18,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padded: true
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: 18
    }
  }, "Upcoming cohorts"), /*#__PURE__*/React.createElement(Badge, {
    tone: "green",
    dot: true
  }, "Live")), /*#__PURE__*/React.createElement(Table, {
    columns: [{
      key: 'name',
      header: 'Program'
    }, {
      key: 'wk',
      header: 'Weeks',
      align: 'right'
    }, {
      key: 'st',
      header: 'Status',
      render: v => /*#__PURE__*/React.createElement(Badge, {
        tone: v === 'Open' ? 'green' : 'neutral'
      }, v)
    }],
    data: [{
      name: 'Data Analytics',
      wk: 12,
      st: 'Open'
    }, {
      name: 'Data Science',
      wk: 24,
      st: 'Open'
    }, {
      name: 'Intro Seminar',
      wk: 2,
      st: 'Closed'
    }]
  })), /*#__PURE__*/React.createElement(Card, {
    padded: true
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '0 0 16px',
      fontSize: 18
    }
  }, "This week"), /*#__PURE__*/React.createElement("div", {
    className: "stack"
  }, /*#__PURE__*/React.createElement(Progress, {
    label: "SQL fundamentals",
    value: 90,
    showValue: true,
    tone: "green"
  }), /*#__PURE__*/React.createElement(Progress, {
    label: "Dashboards",
    value: 55,
    showValue: true
  }), /*#__PURE__*/React.createElement(Progress, {
    label: "Capstone",
    value: 20,
    showValue: true,
    tone: "blue"
  })))));
}
function Examples() {
  return /*#__PURE__*/React.createElement("div", {
    className: "ds-ex"
  }, /*#__PURE__*/React.createElement(SignIn, null), /*#__PURE__*/React.createElement(Pricing, null), /*#__PURE__*/React.createElement(Dashboard, null));
}
if (C.Button) {
  const cmp = document.getElementById('cmp-root');
  const lay = document.getElementById('lay-root');
  cmp.classList.remove('ds-loading');
  lay.classList.remove('ds-loading');
  ReactDOM.createRoot(cmp).render(/*#__PURE__*/React.createElement(Gallery, null));
  ReactDOM.createRoot(lay).render(/*#__PURE__*/React.createElement(Examples, null));
} else {
  document.getElementById('cmp-root').textContent = 'Component bundle failed to load.';
}
})(); } catch (e) { __ds_ns.__errors.push({ path: "guidelines/showcase.jsx", error: String((e && e.message) || e) }); }

// landing.js
try { (() => {
/* Colaberry DS landing — Three.js hero + GSAP choreography.
   Motion tiers:
   - FULL  (motion OK, rAF alive): masked headline, parallax, scrubs, counters, pin.
   - LITE  (reduced motion, rAF alive): opacity-only fades — reduce, don't remove.
   - STATIC (rAF unavailable, e.g. hidden iframe): final states, zero tweens. */
(function () {
  'use strict';

  var RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Toast ---------- */
  var toastEl = document.getElementById('ltoast');
  var toastT;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () {
      toastEl.classList.remove('show');
    }, 1500);
  }

  /* ---------- Nav scrolled state ---------- */
  var nav = document.querySelector('.lnav');
  function onScroll() {
    if (nav) nav.classList.toggle('is-scrolled', window.scrollY > 10);
  }
  window.addEventListener('scroll', onScroll, {
    passive: true
  });
  onScroll();

  /* ---------- Color ramps (generated) ---------- */
  var RAMPS = [{
    name: 'Cherry Red',
    base: '#FB2832',
    hex: ['#FFF0F1', '#FFDBDD', '#FFB8BC', '#FE8A90', '#FD5760', '#FB2832', '#E5121D', '#C20E1E', '#9B0E18', '#7A1016']
  }, {
    name: 'Leaf Green',
    base: '#77BB4A',
    hex: ['#F1F9EA', '#DEF0CC', '#C2E3A1', '#A2D375', '#8AC759', '#77BB4A', '#5BA63C', '#468A2E', '#356A24', '#2A521E']
  }, {
    name: 'Berry Blue',
    base: '#367895',
    hex: ['#EAF2F6', '#CFE0E9', '#A6C5D5', '#6F9DB6', '#4A86A2', '#367895', '#2E6A86', '#265A72', '#20485C', '#1A3947']
  }];
  var rampsRoot = document.getElementById('ramps');
  if (rampsRoot) {
    RAMPS.forEach(function (r) {
      var block = document.createElement('div');
      block.className = 'lr-block';
      var name = document.createElement('div');
      name.className = 'lr-name';
      name.innerHTML = '<b>' + r.name + '</b><code>' + r.base + '</code>';
      var ramp = document.createElement('div');
      ramp.className = 'lr-ramp';
      r.hex.forEach(function (h) {
        var b = document.createElement('button');
        b.className = 'lr-sw';
        b.style.background = h;
        b.setAttribute('aria-label', 'Copy ' + h);
        b.dataset.hex = h;
        ramp.appendChild(b);
      });
      block.appendChild(name);
      block.appendChild(ramp);
      rampsRoot.appendChild(block);
    });
    rampsRoot.addEventListener('click', function (e) {
      var sw = e.target.closest('.lr-sw');
      if (!sw) return;
      if (navigator.clipboard) navigator.clipboard.writeText(sw.dataset.hex);
      toast('Copied ' + sw.dataset.hex);
    });
  }

  /* ---------- Copy snippets ---------- */
  var SNIPS = {
    prompt: 'Using the Colaberry design system, create a [social post / flyer / email header / slide] at [size] for [topic]. Headline: [your headline]. Add a [call-to-action] button and the logo. Keep it warm and on-brand, no emoji — and give me 3 options.',
    install: '<link rel="stylesheet" href="colaberry/styles.css">\n<scr' + 'ipt src="colaberry/_ds_bundle.js"></scr' + 'ipt>\n/* var(--brand-accent) · window.ColaberryDesignSystem_098454 */'
  };
  document.querySelectorAll('[data-snip]').forEach(function (el) {
    el.addEventListener('click', function () {
      var t = SNIPS[el.dataset.snip] || '';
      if (navigator.clipboard) navigator.clipboard.writeText(t);
      toast('Copied to clipboard');
    });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el.click();
      }
    });
  });

  /* ---------- Switch demo ---------- */
  document.querySelectorAll('.r-switch').forEach(function (s) {
    s.addEventListener('click', function () {
      s.setAttribute('aria-checked', s.getAttribute('aria-checked') === 'true' ? 'false' : 'true');
    });
  });

  /* ---------- Card tilt (fine pointers, motion OK) ---------- */
  if (!RM && window.matchMedia('(pointer: fine)').matches) {
    document.querySelectorAll('.cmp-card').forEach(function (c) {
      c.addEventListener('pointermove', function (e) {
        var r = c.getBoundingClientRect();
        var rx = ((e.clientY - r.top) / r.height - 0.5) * -5;
        var ry = ((e.clientX - r.left) / r.width - 0.5) * 5;
        c.style.transform = 'perspective(900px) rotateX(' + rx + 'deg) rotateY(' + ry + 'deg) translateY(-3px)';
      });
      c.addEventListener('pointerleave', function () {
        c.style.transform = '';
      });
    });
  }

  /* ---------- Interactive data constellation (canvas 2D) ---------- */
  function initHeroFx() {
    var canvas = document.getElementById('hero-fx');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var hero = document.querySelector('.hero');

    // Brand palette (cherry / leaf / berry + tints), weighted toward cherry
    var PAL = ['#FB2832', '#FB2832', '#77BB4A', '#367895', '#FD5760', '#8AC759', '#4A86A2'];
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0,
      H = 0;
    var nodes = [];
    var ripples = [];
    var pointer = {
      x: -9999,
      y: -9999,
      active: false
    };
    function rgba(hex, a) {
      var n = parseInt(hex.slice(1), 16);
      return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
    }
    function build() {
      var r = canvas.getBoundingClientRect();
      W = r.width || canvas.clientWidth || (hero ? hero.clientWidth : 0) || window.innerWidth;
      H = r.height || canvas.clientHeight || (hero ? hero.clientHeight : 0) || window.innerHeight;
      if (!W || !H) return false;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // density scales with area, capped for performance
      var count = Math.max(28, Math.min(110, Math.round(W * H / 15000)));
      nodes = [];
      for (var i = 0; i < count; i++) {
        nodes.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.22,
          vy: (Math.random() - 0.5) * 0.22,
          r: 1.6 + Math.random() * 2.6,
          c: PAL[Math.random() * PAL.length | 0],
          tw: Math.random() * Math.PI * 2 // twinkle phase
        });
      }
      return true;
    }
    var LINK = 132; // node-to-node link distance
    var MOUSE = 188; // cursor influence radius

    function draw(t) {
      if (!W || !H || !nodes.length) return;
      ctx.clearRect(0, 0, W, H);

      // update + integrate ripple forces
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        n.x += n.vx;
        n.y += n.vy;
        // gentle wrap
        if (n.x < -20) n.x = W + 20;else if (n.x > W + 20) n.x = -20;
        if (n.y < -20) n.y = H + 20;else if (n.y > H + 20) n.y = -20;

        // cursor: soft attraction so the web gathers toward the pointer
        if (pointer.active) {
          var dx = pointer.x - n.x,
            dy = pointer.y - n.y;
          var d2 = dx * dx + dy * dy;
          if (d2 < MOUSE * MOUSE) {
            var d = Math.sqrt(d2) || 1;
            var f = (1 - d / MOUSE) * 0.45;
            n.vx += dx / d * f * 0.06;
            n.vy += dy / d * f * 0.06;
          }
        }
        // ripple push
        for (var k = 0; k < ripples.length; k++) {
          var rp = ripples[k];
          var rdx = n.x - rp.x,
            rdy = n.y - rp.y;
          var rd = Math.sqrt(rdx * rdx + rdy * rdy) || 1;
          var band = Math.abs(rd - rp.rad);
          if (band < 46) {
            var push = (1 - band / 46) * rp.power;
            n.vx += rdx / rd * push;
            n.vy += rdy / rd * push;
          }
        }
        // friction + speed clamp
        n.vx *= 0.985;
        n.vy *= 0.985;
        var sp = Math.hypot(n.vx, n.vy);
        if (sp > 1.7) {
          n.vx = n.vx / sp * 1.7;
          n.vy = n.vy / sp * 1.7;
        }
      }

      // links between nearby nodes
      for (var a = 0; a < nodes.length; a++) {
        var na = nodes[a];
        for (var b = a + 1; b < nodes.length; b++) {
          var nb = nodes[b];
          var lx = na.x - nb.x,
            ly = na.y - nb.y;
          var ld = Math.sqrt(lx * lx + ly * ly);
          if (ld < LINK) {
            var al = (1 - ld / LINK) * 0.20;
            ctx.strokeStyle = rgba('#367895', al);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(na.x, na.y);
            ctx.lineTo(nb.x, nb.y);
            ctx.stroke();
          }
        }
      }

      // cursor "lens": bright cherry links from pointer to nearby nodes
      if (pointer.active) {
        for (var c = 0; c < nodes.length; c++) {
          var nc = nodes[c];
          var mdx = pointer.x - nc.x,
            mdy = pointer.y - nc.y;
          var md = Math.sqrt(mdx * mdx + mdy * mdy);
          if (md < MOUSE) {
            var ma = (1 - md / MOUSE) * 0.55;
            ctx.strokeStyle = rgba('#FB2832', ma);
            ctx.lineWidth = 1.3;
            ctx.beginPath();
            ctx.moveTo(pointer.x, pointer.y);
            ctx.lineTo(nc.x, nc.y);
            ctx.stroke();
          }
        }
      }

      // nodes (with subtle twinkle + glow near cursor)
      for (var p = 0; p < nodes.length; p++) {
        var nn = nodes[p];
        var tw = 0.7 + Math.sin(t * 0.002 + nn.tw) * 0.3;
        var near = 0;
        if (pointer.active) {
          var ex = pointer.x - nn.x,
            ey = pointer.y - nn.y;
          var ed = Math.sqrt(ex * ex + ey * ey);
          if (ed < MOUSE) near = 1 - ed / MOUSE;
        }
        var rad = nn.r * (1 + near * 0.9);
        if (near > 0.15) {
          ctx.fillStyle = rgba(nn.c, 0.16 * near);
          ctx.beginPath();
          ctx.arc(nn.x, nn.y, rad * 3.4, 0, 6.2832);
          ctx.fill();
        }
        ctx.fillStyle = rgba(nn.c, (0.5 + near * 0.5) * tw);
        ctx.beginPath();
        ctx.arc(nn.x, nn.y, rad, 0, 6.2832);
        ctx.fill();
      }

      // ripple rings
      for (var q = ripples.length - 1; q >= 0; q--) {
        var r2 = ripples[q];
        r2.rad += 7;
        r2.power *= 0.94;
        r2.alpha *= 0.95;
        ctx.strokeStyle = rgba('#FB2832', r2.alpha);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(r2.x, r2.y, r2.rad, 0, 6.2832);
        ctx.stroke();
        if (r2.rad > Math.max(W, H) || r2.alpha < 0.02) ripples.splice(q, 1);
      }
    }

    // Build once layout exists; retry across frames until the canvas has real size.
    var built = build();
    if (built) draw(0); // static first frame (visible under reduced motion / no rAF)

    function ensureBuilt() {
      if (built) return;
      if (build()) {
        built = true;
        draw(0);
      }
    }
    // Repair paths: rAF (next frame), window load, and a ResizeObserver — covers
    // first-paint-before-layout AND the reduced-motion path that has no render loop.
    if (!built) {
      requestAnimationFrame(ensureBuilt);
      window.addEventListener('load', ensureBuilt);
      setTimeout(ensureBuilt, 120);
      setTimeout(ensureBuilt, 400);
    }
    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(function () {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        if (build()) {
          built = true;
          draw(0);
        }
      });
      ro.observe(canvas);
    }
    window.addEventListener('resize', function () {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (build()) {
        built = true;
        draw(0);
      }
    });

    // Pointer interaction (always on — user-initiated)
    function toLocal(e) {
      var r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
      pointer.active = true;
    }
    window.addEventListener('pointermove', toLocal, {
      passive: true
    });
    window.addEventListener('pointerleave', function () {
      pointer.active = false;
      pointer.x = -9999;
      pointer.y = -9999;
    });
    if (hero) hero.addEventListener('pointerdown', function (e) {
      toLocal(e);
      ripples.push({
        x: pointer.x,
        y: pointer.y,
        rad: 6,
        power: 0.9,
        alpha: 0.5
      });
    });

    // Continuous ambient animation — runs for everyone so the field is always alive.
    var visible = true;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
      }).observe(canvas);
    }
    heroFxLoop = function tick(ts) {
      requestAnimationFrame(tick);
      if (!visible || document.hidden) return;
      if (!built) ensureBuilt();
      draw(ts || 0);
    };
    heroFxLoop(0);
    window.__heroFx = {
      nodes: function () {
        return nodes.length;
      },
      sized: function () {
        return W + 'x' + H + ' buf ' + canvas.width + 'x' + canvas.height;
      }
    };
  }
  var heroFxLoop = null;
  initHeroFx();

  /* ---------- Final-state fallback (no animation possible) ---------- */
  function staticFinalize() {
    document.querySelectorAll('.r-prog i').forEach(function (bar) {
      bar.style.width = (bar.dataset.val || 70) + '%';
    });
    document.querySelectorAll('[data-count]').forEach(function (el) {
      el.textContent = Math.round(parseFloat(el.dataset.count)) + (el.dataset.suffix || '');
    });
  }

  /* ---------- FULL motion choreography ---------- */
  function startFull() {
    gsap.registerPlugin(ScrollTrigger);

    // Hero entrance: masked line reveal — uses the brand "emphasized" curve.
    var EMPH = '0.16,1,0.3,1';
    var tl = gsap.timeline({
      defaults: {
        ease: 'cubic-bezier(' + EMPH + ')'
      }
    });
    tl.from('.hero__pill', {
      y: 22,
      opacity: 0,
      duration: 0.6
    }, 0.05).from('.hl__i', {
      yPercent: 115,
      duration: 1.1,
      stagger: 0.1,
      ease: 'cubic-bezier(' + EMPH + ')'
    }, 0.18).from('.hero__sub', {
      y: 22,
      opacity: 0,
      duration: 0.7
    }, '-=0.55').from('.hero__cta', {
      y: 22,
      opacity: 0,
      duration: 0.7
    }, '-=0.5').from('.hero__meta', {
      y: 18,
      opacity: 0,
      duration: 0.7
    }, '-=0.5').from('.hero__fxhint', {
      opacity: 0,
      duration: 0.6
    }, '-=0.4');

    // Cursor glow follows pointer in the hero (fine pointers)
    if (window.matchMedia('(pointer: fine)').matches) {
      var glow = document.getElementById('heroGlow');
      var hero = document.querySelector('.hero');
      if (glow && hero) {
        var qx = gsap.quickTo(glow, 'left', {
          duration: 0.7,
          ease: 'power3'
        });
        var qy = gsap.quickTo(glow, 'top', {
          duration: 0.7,
          ease: 'power3'
        });
        hero.addEventListener('pointermove', function (e) {
          qx(e.clientX);
          qy(e.clientY);
        }, {
          passive: true
        });
      }
    }

    // Hero constellation fades + drifts as you scroll away
    gsap.to('#hero-fx', {
      yPercent: 12,
      opacity: 0.32,
      ease: 'none',
      scrollTrigger: {
        trigger: '.hero',
        start: 'bottom 92%',
        end: 'bottom 30%',
        scrub: true
      }
    });

    // Generic reveals
    document.querySelectorAll('[data-reveal]').forEach(function (el) {
      gsap.from(el, {
        y: 48,
        opacity: 0,
        duration: 0.95,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 86%'
        }
      });
    });
    document.querySelectorAll('[data-reveal-group]').forEach(function (g) {
      gsap.from(g.children, {
        y: 48,
        opacity: 0,
        scale: 0.97,
        duration: 0.85,
        ease: 'power3.out',
        stagger: 0.09,
        scrollTrigger: {
          trigger: g,
          start: 'top 85%'
        }
      });
    });

    // Ramps grow in
    document.querySelectorAll('.lr-ramp').forEach(function (r) {
      gsap.from(r.children, {
        scaleY: 0,
        transformOrigin: 'bottom',
        duration: 0.55,
        ease: 'power2.out',
        stagger: 0.045,
        scrollTrigger: {
          trigger: r,
          start: 'top 88%'
        }
      });
    });

    // Big type drifts sideways on scrub
    gsap.fromTo('.type-aa', {
      xPercent: -5
    }, {
      xPercent: 3,
      ease: 'none',
      scrollTrigger: {
        trigger: '.bt--type',
        start: 'top bottom',
        end: 'bottom top',
        scrub: 1
      }
    });

    // Counters
    document.querySelectorAll('[data-count]').forEach(function (el) {
      var end = parseFloat(el.dataset.count);
      var suffix = el.dataset.suffix || '';
      var obj = {
        v: 0
      };
      gsap.to(obj, {
        v: end,
        duration: 1.6,
        ease: 'power1.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 92%'
        },
        onUpdate: function () {
          el.textContent = Math.round(obj.v) + suffix;
        }
      });
    });

    // Progress bars
    document.querySelectorAll('.r-prog i').forEach(function (bar) {
      gsap.to(bar, {
        width: (bar.dataset.val || 70) + '%',
        duration: 1.2,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: bar,
          start: 'top 92%'
        }
      });
    });

    // Example groups reveal as you scroll (decks / social / web)
    gsap.utils.toArray('.ex-group').forEach(function (g) {
      gsap.from(g.querySelectorAll('.ex-gh, .ex-row > *'), {
        y: 28,
        opacity: 0,
        duration: 0.7,
        stagger: 0.08,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: g,
          start: 'top 80%'
        }
      });
    });

    // CTA band scales in
    gsap.from('.cta__in', {
      scale: 0.94,
      opacity: 0,
      duration: 1,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: '.cta',
        start: 'top 82%'
      }
    });
  }

  /* ---------- LITE motion (reduced motion: opacity-only) ---------- */
  function startLite() {
    gsap.registerPlugin(ScrollTrigger);
    gsap.from('.hero__in > *', {
      opacity: 0,
      duration: 0.7,
      stagger: 0.08
    });
    document.querySelectorAll('[data-reveal], [data-reveal-group]').forEach(function (el) {
      gsap.from(el, {
        opacity: 0,
        duration: 0.6,
        scrollTrigger: {
          trigger: el,
          start: 'top 88%'
        }
      });
    });
    staticFinalize();
  }

  /* ---------- Boot: probe rAF, then pick a tier ---------- */
  var rafOk = false;
  requestAnimationFrame(function () {
    rafOk = true;
  });
  setTimeout(function () {
    if (window.gsap && rafOk) {
      if (RM) startLite();else startFull();
    } else {
      staticFinalize();
    }
  }, 300);

  /* ---------- Footer year ---------- */
  var y = document.getElementById('yr');
  if (y) y.textContent = String(new Date().getFullYear());
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "landing.js", error: String((e && e.message) || e) }); }

// ui_kits/marketing-website/home.jsx
try { (() => {
/* Colaberry marketing site — Home view */
const {
  Button: HButton,
  Card: HCard,
  Badge: HBadge,
  Avatar: HAvatar
} = window.ColaberryDesignSystem_098454;
function Photo({
  label,
  tone = 'blue',
  tall = false,
  children
}) {
  const grad = {
    blue: 'linear-gradient(135deg, var(--blue-400), var(--blue-700))',
    green: 'linear-gradient(135deg, var(--green-400), var(--green-700))',
    red: 'linear-gradient(135deg, var(--red-400), var(--red-700))',
    mix: 'linear-gradient(135deg, var(--blue-500), var(--green-600))'
  }[tone];
  return /*#__PURE__*/React.createElement("div", {
    className: "cbsite-photo",
    style: {
      background: grad,
      minHeight: tall ? 380 : 220
    }
  }, children, /*#__PURE__*/React.createElement("span", {
    className: "cbsite-photo__tag"
  }, /*#__PURE__*/React.createElement(I, {
    n: "image"
  }), label));
}
function HomeView({
  go
}) {
  const programs = [{
    tone: 'blue',
    tag: '12 weeks · Beginner-friendly',
    title: 'Data Analytics',
    desc: 'Master SQL, reporting and data storytelling with dashboards. No degree required.',
    icon: 'bar-chart-3'
  }, {
    tone: 'green',
    tag: '24 weeks · Intermediate',
    title: 'Data Science',
    desc: 'Python, machine learning and the statistics behind modern AI systems.',
    icon: 'brain-circuit'
  }, {
    tone: 'red',
    tag: 'Add-on · 1 year support',
    title: 'Career Accelerator',
    desc: 'Mentorship, interview prep and job coaching until you are hired.',
    icon: 'rocket'
  }];
  const steps = [{
    n: '01',
    icon: 'phone-call',
    h: 'Talk to admissions',
    p: 'No tests. Discuss your goals and flexible payment options.'
  }, {
    n: '02',
    icon: 'laptop',
    h: 'Learn by doing',
    p: 'Instructor-led, project-based lessons with real-world data.'
  }, {
    n: '03',
    icon: 'badge-check',
    h: 'Get hired',
    p: 'Build a portfolio, earn badges, and land a data role.'
  }];
  return /*#__PURE__*/React.createElement("main", null, /*#__PURE__*/React.createElement("section", {
    className: "cbsite-hero"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cbsite-hero__copy"
  }, /*#__PURE__*/React.createElement(HBadge, {
    tone: "green",
    dot: true
  }, "Texas Workforce Commission approved"), /*#__PURE__*/React.createElement("h1", null, "Future-proof your career in ", /*#__PURE__*/React.createElement("span", {
    className: "cb-grad"
  }, "data & AI")), /*#__PURE__*/React.createElement("p", null, "Colaberry turns ambition into a data career \u2014 through hands-on projects, mentorship, and a community built on tenacity. No degree required."), /*#__PURE__*/React.createElement("div", {
    className: "cbsite-hero__cta"
  }, /*#__PURE__*/React.createElement(HButton, {
    size: "lg",
    onClick: () => go('enroll')
  }, "Apply now"), /*#__PURE__*/React.createElement(HButton, {
    size: "lg",
    variant: "outline",
    onClick: () => go('program'),
    trailingIcon: /*#__PURE__*/React.createElement(I, {
      n: "arrow-right"
    })
  }, "See the program")), /*#__PURE__*/React.createElement("div", {
    className: "cbsite-trust"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cb-avatar-group"
  }, /*#__PURE__*/React.createElement(HAvatar, {
    name: "Mika Rivera",
    size: "sm"
  }), /*#__PURE__*/React.createElement(HAvatar, {
    name: "Owen Brooks",
    size: "sm"
  }), /*#__PURE__*/React.createElement(HAvatar, {
    name: "Ada Lovelace",
    size: "sm"
  }), /*#__PURE__*/React.createElement(HAvatar, {
    name: "Sam Okafor",
    size: "sm"
  })), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("strong", null, "5,000+"), " careers changed since 2012"))), /*#__PURE__*/React.createElement("div", {
    className: "cbsite-hero__media"
  }, /*#__PURE__*/React.createElement(Photo, {
    label: "Students collaborating",
    tone: "mix",
    tall: true
  }, /*#__PURE__*/React.createElement("div", {
    className: "cbsite-floatchip cbsite-floatchip--tl"
  }, /*#__PURE__*/React.createElement(I, {
    n: "trending-up"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "$74k"), /*#__PURE__*/React.createElement("span", null, "median starting salary"))), /*#__PURE__*/React.createElement("div", {
    className: "cbsite-floatchip cbsite-floatchip--br"
  }, /*#__PURE__*/React.createElement(I, {
    n: "users"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "49"), /*#__PURE__*/React.createElement("span", null, "countries served")))))), /*#__PURE__*/React.createElement("section", {
    className: "cbsite-stats"
  }, [['5,000+', 'Graduates placed'], ['2012', 'Founded for veterans'], ['1:1', 'Mentor support'], ['12 wks', 'To job-ready']].map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "cbsite-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cbsite-stat__n"
  }, s[0]), /*#__PURE__*/React.createElement("div", {
    className: "cbsite-stat__l"
  }, s[1])))), /*#__PURE__*/React.createElement("section", {
    className: "cbsite-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cbsite-section__head"
  }, /*#__PURE__*/React.createElement(HBadge, {
    tone: "blue"
  }, "Programs"), /*#__PURE__*/React.createElement("h2", null, "Two proven paths into tech"), /*#__PURE__*/React.createElement("p", null, "Both bootcamps blend technical depth with the human skills employers actually hire for.")), /*#__PURE__*/React.createElement("div", {
    className: "cbsite-prog"
  }, programs.map((p, i) => /*#__PURE__*/React.createElement(HCard, {
    key: i,
    hoverable: true,
    media: /*#__PURE__*/React.createElement("div", {
      className: "cbsite-prog__media",
      style: {
        ['--g']: `var(--${p.tone}-500)`
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: p.icon
    }))
  }, /*#__PURE__*/React.createElement(HBadge, {
    tone: p.tone
  }, p.tag), /*#__PURE__*/React.createElement("h3", null, p.title), /*#__PURE__*/React.createElement("p", null, p.desc), /*#__PURE__*/React.createElement(HButton, {
    variant: "link",
    onClick: () => go('program'),
    trailingIcon: /*#__PURE__*/React.createElement(I, {
      n: "arrow-right"
    })
  }, "Course details"))))), /*#__PURE__*/React.createElement("section", {
    className: "cbsite-section cbsite-section--subtle"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cbsite-section__head"
  }, /*#__PURE__*/React.createElement(HBadge, {
    tone: "green"
  }, "How it works"), /*#__PURE__*/React.createElement("h2", null, "From day one to hired")), /*#__PURE__*/React.createElement("div", {
    className: "cbsite-steps"
  }, steps.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "cbsite-step"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cbsite-step__icon"
  }, /*#__PURE__*/React.createElement(I, {
    n: s.icon
  })), /*#__PURE__*/React.createElement("span", {
    className: "cbsite-step__n"
  }, s.n), /*#__PURE__*/React.createElement("h3", null, s.h), /*#__PURE__*/React.createElement("p", null, s.p))))), /*#__PURE__*/React.createElement("section", {
    className: "cbsite-quote"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cbsite-quote__mark"
  }, /*#__PURE__*/React.createElement(I, {
    n: "quote"
  })), /*#__PURE__*/React.createElement("blockquote", null, "I had no tech experience before Colaberry. I now lead the team of mentors serving trainees in over 49 countries. This program is a seed \u2014 you decide how far it grows."), /*#__PURE__*/React.createElement("div", {
    className: "cbsite-quote__by"
  }, /*#__PURE__*/React.createElement(HAvatar, {
    name: "Mika Rivera",
    size: "lg",
    ring: true
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "Mika Rivera"), /*#__PURE__*/React.createElement("span", null, "Program Success Manager \xB7 Data Analytics grad")))), /*#__PURE__*/React.createElement("section", {
    className: "cbsite-cta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cbsite-cta__inner"
  }, /*#__PURE__*/React.createElement("h2", null, "Your data career starts with one conversation."), /*#__PURE__*/React.createElement("p", null, "Everyone with a high-school diploma or GED is welcome. Scholarships and flexible payment plans available."), /*#__PURE__*/React.createElement("div", {
    className: "cbsite-cta__btns"
  }, /*#__PURE__*/React.createElement(HButton, {
    size: "lg",
    tone: "green",
    onClick: () => go('enroll')
  }, "Apply now"), /*#__PURE__*/React.createElement(HButton, {
    size: "lg",
    variant: "outline",
    onClick: () => go('enroll')
  }, "Download catalog")))));
}
Object.assign(window, {
  HomeView,
  Photo
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing-website/home.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing-website/parts.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Colaberry marketing site — shared parts: Logo, Header, Footer, helpers.
   Exposes to window for the other script files. */
const {
  Button: CBButton,
  Avatar: CBAvatar,
  Badge: CBBadge
} = window.ColaberryDesignSystem_098454;

/* React-safe Lucide icon. React owns the <span>; Lucide mutates only the
   inner <i>→<svg>, so re-renders never touch the swapped node. Size = font-size
   (1em), color = currentColor — both driven by CSS/parent. */
function I({
  n,
  s,
  c,
  className = '',
  style
}) {
  const st = {
    fontSize: s ? s + 'px' : undefined,
    color: c,
    ...style
  };
  return /*#__PURE__*/React.createElement("span", {
    className: 'cb-i ' + className,
    style: st,
    dangerouslySetInnerHTML: {
      __html: `<i data-lucide="${n}"></i>`
    }
  });
}
// Back-compat alias
function Icon({
  name,
  size,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement(I, _extends({
    n: name,
    s: size,
    style: style
  }, rest));
}
function Logo({
  height = 34,
  variant = 'default'
}) {
  const src = variant === 'white' ? '../../assets/logo/colaberry-horizontal-white.png?v=2' : '../../assets/logo/colaberry-horizontal.png';
  return /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: "Colaberry",
    style: {
      height,
      display: 'block'
    }
  });
}
const NAV = [{
  label: 'Programs',
  view: 'program'
}, {
  label: 'Outcomes',
  view: 'home'
}, {
  label: 'Scholarships',
  view: 'home'
}, {
  label: 'About',
  view: 'home'
}];
function Header({
  go,
  current
}) {
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const el = document.querySelector('.cbsite-scroll');
    const onScroll = () => setScrolled((el ? el.scrollTop : window.scrollY) > 8);
    const target = el || window;
    target.addEventListener('scroll', onScroll);
    return () => target.removeEventListener('scroll', onScroll);
  }, []);
  return /*#__PURE__*/React.createElement("header", {
    className: "cbsite-header",
    "data-scrolled": scrolled
  }, /*#__PURE__*/React.createElement("div", {
    className: "cbsite-header__inner"
  }, /*#__PURE__*/React.createElement("a", {
    className: "cbsite-logo",
    onClick: () => go('home')
  }, /*#__PURE__*/React.createElement(Logo, null)), /*#__PURE__*/React.createElement("nav", {
    className: "cbsite-nav"
  }, NAV.map((n, i) => /*#__PURE__*/React.createElement("a", {
    key: i,
    className: "cbsite-nav__link",
    onClick: () => go(n.view)
  }, n.label))), /*#__PURE__*/React.createElement("div", {
    className: "cbsite-header__actions"
  }, /*#__PURE__*/React.createElement("a", {
    className: "cbsite-nav__link cbsite-nav__link--ghost",
    onClick: () => go('enroll')
  }, "Sign in"), /*#__PURE__*/React.createElement(CBButton, {
    size: "sm",
    onClick: () => go('enroll')
  }, "Apply now"))));
}
function Footer({
  go
}) {
  const cols = [{
    h: 'Programs',
    items: ['Data Analytics', 'Data Science', 'Intro Seminar', 'Career Accelerator']
  }, {
    h: 'School',
    items: ['About us', 'Outcomes', 'Mentors', 'Reviews']
  }, {
    h: 'Support',
    items: ['Scholarships', 'Payment options', 'FAQ', 'Contact']
  }];
  return /*#__PURE__*/React.createElement("footer", {
    className: "cbsite-footer"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cbsite-footer__inner"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cbsite-footer__brand"
  }, /*#__PURE__*/React.createElement(Logo, {
    variant: "white",
    height: 32
  }), /*#__PURE__*/React.createElement("p", null, "Build amazing, local, diverse, and job-ready talent in Data Analytics & Data Science. Since 2012."), /*#__PURE__*/React.createElement("div", {
    className: "cbsite-footer__loc"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(Icon, {
    name: "map-pin",
    size: 15
  }), " Plano, TX"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(Icon, {
    name: "map-pin",
    size: 15
  }), " Boston, MA"))), /*#__PURE__*/React.createElement("div", {
    className: "cbsite-footer__cols"
  }, cols.map((c, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "cbsite-footer__col"
  }, /*#__PURE__*/React.createElement("h4", null, c.h), c.items.map((it, j) => /*#__PURE__*/React.createElement("a", {
    key: j,
    onClick: () => go('home')
  }, it)))))), /*#__PURE__*/React.createElement("div", {
    className: "cbsite-footer__bar"
  }, /*#__PURE__*/React.createElement("span", null, "\xA9 2026 Colaberry, Inc. \xB7 Texas Workforce Commission approved"), /*#__PURE__*/React.createElement("span", {
    className: "cbsite-footer__legal"
  }, /*#__PURE__*/React.createElement("a", {
    onClick: () => go('home')
  }, "Privacy"), /*#__PURE__*/React.createElement("a", {
    onClick: () => go('home')
  }, "Terms"), /*#__PURE__*/React.createElement("a", {
    onClick: () => go('home')
  }, "Accreditation"))));
}
Object.assign(window, {
  Icon,
  I,
  Logo,
  Header,
  Footer
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing-website/parts.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing-website/program-enroll.jsx
try { (() => {
/* Colaberry marketing site — Program detail + Enroll views */
const {
  Button: PButton,
  Card: PCard,
  Badge: PBadge,
  Input: PInput,
  Checkbox: PCheckbox
} = window.ColaberryDesignSystem_098454;
function ProgramView({
  go
}) {
  const [open, setOpen] = React.useState(0);
  const modules = [{
    h: 'Foundations of Data Analytics',
    d: 'How data drives decisions, the analyst workflow, and reading real datasets.',
    wk: 'Weeks 1–2'
  }, {
    h: 'SQL & SQL Server',
    d: 'Querying, joins, aggregation and building reporting tables with SSDT.',
    wk: 'Weeks 3–6'
  }, {
    h: 'Reporting with SSRS & SSIS',
    d: 'ETL pipelines, report architecture and automated delivery.',
    wk: 'Weeks 7–9'
  }, {
    h: 'Dashboards & Storytelling',
    d: 'Turn analysis into compelling dashboards and a portfolio project.',
    wk: 'Weeks 10–12'
  }];
  const faqs = [{
    q: 'Do I need a degree or experience?',
    a: 'No. Everyone with a high-school diploma or GED is welcome — there are no tests in admissions.'
  }, {
    q: 'Is it online or in person?',
    a: 'Both. Join live online from anywhere, or on campus in Plano, TX. Sessions are instructor-led.'
  }, {
    q: 'How do I pay for it?',
    a: 'Scholarships, military grants, loan options and Income Share Agreements are available to fit your situation.'
  }, {
    q: 'What happens after I finish?',
    a: 'The Career Accelerator adds mentorship, interview prep and job coaching with one year of on-the-job support.'
  }];
  const tools = ['SQL Server', 'SSRS', 'SSIS', 'Power BI', 'Excel', 'Git'];
  return /*#__PURE__*/React.createElement("main", null, /*#__PURE__*/React.createElement("div", {
    className: "cbsite-prog-hero"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cbsite-prog-hero__inner"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cbsite-bc"
  }, /*#__PURE__*/React.createElement("a", {
    onClick: () => go('home')
  }, "Home"), " ", /*#__PURE__*/React.createElement(I, {
    n: "chevron-right"
  }), " ", /*#__PURE__*/React.createElement("a", {
    onClick: () => go('home')
  }, "Programs"), " ", /*#__PURE__*/React.createElement(I, {
    n: "chevron-right"
  }), " ", /*#__PURE__*/React.createElement("span", null, "Data Analytics")), /*#__PURE__*/React.createElement("div", {
    className: "cbsite-prog-hero__grid"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(PBadge, {
    tone: "blue",
    dot: true
  }, "Now enrolling \xB7 Spring cohort"), /*#__PURE__*/React.createElement("h1", null, "Data Analytics Bootcamp"), /*#__PURE__*/React.createElement("p", null, "Become job-ready in 12 weeks. Learn the exact SQL, reporting and dashboard skills employers hire for \u2014 guided by industry mentors, start to finish."), /*#__PURE__*/React.createElement("div", {
    className: "cbsite-meta"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(I, {
    n: "clock"
  }), " 12 weeks"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(I, {
    n: "monitor"
  }), " Online or Plano, TX"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(I, {
    n: "signal"
  }), " Beginner-friendly"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(I, {
    n: "globe"
  }), " 49 countries")), /*#__PURE__*/React.createElement("div", {
    className: "cbsite-prog-hero__cta"
  }, /*#__PURE__*/React.createElement(PButton, {
    size: "lg",
    onClick: () => go('enroll')
  }, "Apply for this cohort"), /*#__PURE__*/React.createElement(PButton, {
    size: "lg",
    variant: "ghost",
    onClick: () => go('enroll'),
    leadingIcon: /*#__PURE__*/React.createElement(I, {
      n: "download"
    })
  }, "Syllabus"))), /*#__PURE__*/React.createElement(PCard, {
    elevation: "md",
    padded: true,
    className: "cbsite-pricecard"
  }, /*#__PURE__*/React.createElement("span", {
    className: "cbsite-pricecard__label"
  }, "Tuition from"), /*#__PURE__*/React.createElement("div", {
    className: "cbsite-pricecard__price"
  }, "$1,999", /*#__PURE__*/React.createElement("small", null, "/ session")), /*#__PURE__*/React.createElement("ul", null, /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement(I, {
    n: "check"
  }), /*#__PURE__*/React.createElement("span", null, "Live instructor-led classes")), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement(I, {
    n: "check"
  }), /*#__PURE__*/React.createElement("span", null, "1:1 mentorship")), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement(I, {
    n: "check"
  }), /*#__PURE__*/React.createElement("span", null, "Portfolio project & badge")), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement(I, {
    n: "check"
  }), /*#__PURE__*/React.createElement("span", null, "Scholarships available"))), /*#__PURE__*/React.createElement(PButton, {
    fullWidth: true,
    onClick: () => go('enroll')
  }, "Apply now"), /*#__PURE__*/React.createElement("span", {
    className: "cbsite-pricecard__note"
  }, "Deferred & ISA payment options available"))))), /*#__PURE__*/React.createElement("section", {
    className: "cbsite-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cbsite-section__head cbsite-section__head--left"
  }, /*#__PURE__*/React.createElement(PBadge, {
    tone: "green"
  }, "Curriculum"), /*#__PURE__*/React.createElement("h2", null, "What you'll learn")), /*#__PURE__*/React.createElement("div", {
    className: "cbsite-modules"
  }, modules.map((m, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: 'cbsite-module' + (open === i ? ' is-open' : ''),
    onClick: () => setOpen(open === i ? -1 : i)
  }, /*#__PURE__*/React.createElement("div", {
    className: "cbsite-module__top"
  }, /*#__PURE__*/React.createElement("span", {
    className: "cbsite-module__wk"
  }, m.wk), /*#__PURE__*/React.createElement("h3", null, m.h), /*#__PURE__*/React.createElement(I, {
    n: open === i ? 'minus' : 'plus'
  })), open === i && /*#__PURE__*/React.createElement("p", null, m.d)))), /*#__PURE__*/React.createElement("div", {
    className: "cbsite-tools"
  }, /*#__PURE__*/React.createElement("span", null, "Tools you'll master"), /*#__PURE__*/React.createElement("div", null, tools.map((t, i) => /*#__PURE__*/React.createElement(PBadge, {
    key: i,
    outline: true
  }, t))))), /*#__PURE__*/React.createElement("section", {
    className: "cbsite-section cbsite-section--subtle"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cbsite-section__head cbsite-section__head--left"
  }, /*#__PURE__*/React.createElement(PBadge, {
    tone: "blue"
  }, "FAQ"), /*#__PURE__*/React.createElement("h2", null, "Questions, answered")), /*#__PURE__*/React.createElement("div", {
    className: "cbsite-faq"
  }, faqs.map((f, i) => /*#__PURE__*/React.createElement("details", {
    key: i,
    className: "cbsite-faqitem"
  }, /*#__PURE__*/React.createElement("summary", null, f.q, /*#__PURE__*/React.createElement(I, {
    n: "plus"
  })), /*#__PURE__*/React.createElement("p", null, f.a))))), /*#__PURE__*/React.createElement("section", {
    className: "cbsite-cta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cbsite-cta__inner"
  }, /*#__PURE__*/React.createElement("h2", null, "Ready to start your data career?"), /*#__PURE__*/React.createElement("p", null, "Apply in minutes. Our admissions team will help you find the right path and payment plan."), /*#__PURE__*/React.createElement("div", {
    className: "cbsite-cta__btns"
  }, /*#__PURE__*/React.createElement(PButton, {
    size: "lg",
    tone: "green",
    onClick: () => go('enroll')
  }, "Apply now")))));
}
function EnrollView({
  go
}) {
  const [program, setProgram] = React.useState('analytics');
  const [done, setDone] = React.useState(false);
  const progs = {
    analytics: {
      name: 'Data Analytics',
      price: '$1,999',
      tone: 'blue',
      len: '12 weeks'
    },
    science: {
      name: 'Data Science',
      price: '$4,500',
      tone: 'green',
      len: '24 weeks'
    }
  };
  const p = progs[program];
  if (done) {
    return /*#__PURE__*/React.createElement("main", {
      className: "cbsite-enroll"
    }, /*#__PURE__*/React.createElement("div", {
      className: "cbsite-success"
    }, /*#__PURE__*/React.createElement("div", {
      className: "cbsite-success__icon"
    }, /*#__PURE__*/React.createElement(I, {
      n: "check"
    })), /*#__PURE__*/React.createElement("h1", null, "You're on the list!"), /*#__PURE__*/React.createElement("p", null, "Thanks for applying to the ", /*#__PURE__*/React.createElement("strong", null, p.name), " program. An admissions advisor will reach out within one business day to talk goals and payment options."), /*#__PURE__*/React.createElement("div", {
      className: "cbsite-success__btns"
    }, /*#__PURE__*/React.createElement(PButton, {
      onClick: () => {
        setDone(false);
        go('home');
      }
    }, "Back to home"), /*#__PURE__*/React.createElement(PButton, {
      variant: "outline",
      onClick: () => go('program')
    }, "Explore the curriculum"))));
  }
  return /*#__PURE__*/React.createElement("main", {
    className: "cbsite-enroll"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cbsite-enroll__grid"
  }, /*#__PURE__*/React.createElement("form", {
    className: "cbsite-form",
    onSubmit: e => {
      e.preventDefault();
      setDone(true);
    }
  }, /*#__PURE__*/React.createElement("h1", null, "Apply to Colaberry"), /*#__PURE__*/React.createElement("p", {
    className: "cbsite-form__sub"
  }, "No tests, no degree required. Takes about 2 minutes."), /*#__PURE__*/React.createElement("div", {
    className: "cbsite-form__choice"
  }, /*#__PURE__*/React.createElement("span", {
    className: "cbsite-form__legend"
  }, "Choose your program"), /*#__PURE__*/React.createElement("div", {
    className: "cbsite-choice"
  }, Object.entries(progs).map(([k, v]) => /*#__PURE__*/React.createElement("button", {
    type: "button",
    key: k,
    className: 'cbsite-choice__opt' + (program === k ? ' is-sel' : ''),
    onClick: () => setProgram(k)
  }, /*#__PURE__*/React.createElement("span", {
    className: "cbsite-choice__check"
  }, /*#__PURE__*/React.createElement(I, {
    n: "check"
  })), /*#__PURE__*/React.createElement("strong", null, v.name), /*#__PURE__*/React.createElement("span", null, v.len, " \xB7 from ", v.price))))), /*#__PURE__*/React.createElement("div", {
    className: "cbsite-form__row"
  }, /*#__PURE__*/React.createElement(PInput, {
    label: "First name",
    placeholder: "Ada",
    required: true
  }), /*#__PURE__*/React.createElement(PInput, {
    label: "Last name",
    placeholder: "Lovelace",
    required: true
  })), /*#__PURE__*/React.createElement(PInput, {
    label: "Email",
    type: "email",
    placeholder: "ada@email.com",
    required: true
  }), /*#__PURE__*/React.createElement(PInput, {
    label: "Phone",
    type: "tel",
    placeholder: "(972) 992-1024",
    helperText: "We'll only call about your application."
  }), /*#__PURE__*/React.createElement(PInput, {
    label: "Why do you want to learn data?",
    multiline: true,
    rows: 3,
    placeholder: "A sentence or two about your goals\u2026"
  }), /*#__PURE__*/React.createElement("div", {
    className: "cbsite-form__checks"
  }, /*#__PURE__*/React.createElement(PCheckbox, {
    label: "I'd like to hear about scholarships and upcoming cohorts",
    defaultChecked: true
  }), /*#__PURE__*/React.createElement(PCheckbox, {
    label: "I agree to be contacted by Colaberry's admissions team",
    required: true
  })), /*#__PURE__*/React.createElement(PButton, {
    type: "submit",
    size: "lg",
    fullWidth: true
  }, "Submit application")), /*#__PURE__*/React.createElement("aside", {
    className: "cbsite-summary"
  }, /*#__PURE__*/React.createElement(PCard, {
    elevation: "md",
    padded: true
  }, /*#__PURE__*/React.createElement(PBadge, {
    tone: p.tone,
    dot: true
  }, "Selected program"), /*#__PURE__*/React.createElement("h3", null, p.name), /*#__PURE__*/React.createElement("div", {
    className: "cbsite-summary__price"
  }, p.price, /*#__PURE__*/React.createElement("small", null, "from / session")), /*#__PURE__*/React.createElement("ul", null, /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement(I, {
    n: "calendar"
  }), /*#__PURE__*/React.createElement("span", null, p.len, ", instructor-led")), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement(I, {
    n: "users"
  }), /*#__PURE__*/React.createElement("span", null, "1:1 mentorship included")), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement(I, {
    n: "award"
  }), /*#__PURE__*/React.createElement("span", null, "Verifiable digital badge")), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement(I, {
    n: "shield-check"
  }), /*#__PURE__*/React.createElement("span", null, "1-year job support")))), /*#__PURE__*/React.createElement("div", {
    className: "cbsite-summary__trust"
  }, /*#__PURE__*/React.createElement(I, {
    n: "heart-handshake"
  }), /*#__PURE__*/React.createElement("p", null, "Built on inclusivity since 2012 \u2014 proudly supporting veterans and career-changers.")))));
}
Object.assign(window, {
  ProgramView,
  EnrollView
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing-website/program-enroll.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Accordion = __ds_scope.Accordion;

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Breadcrumb = __ds_scope.Breadcrumb;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Carousel = __ds_scope.Carousel;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Dialog = __ds_scope.Dialog;

__ds_ns.Drawer = __ds_scope.Drawer;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Pagination = __ds_scope.Pagination;

__ds_ns.Popover = __ds_scope.Popover;

__ds_ns.Progress = __ds_scope.Progress;

__ds_ns.Skeleton = __ds_scope.Skeleton;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Table = __ds_scope.Table;

__ds_ns.Textarea = __ds_scope.Textarea;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Tooltip = __ds_scope.Tooltip;

})();
