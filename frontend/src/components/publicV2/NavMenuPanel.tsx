import React from 'react';
import { Link } from 'react-router-dom';
import type { NavMenu, NavMenuGroup, NavMenuLink } from './navMenus';

/**
 * One header menu panel (Proof or Government). Rendered on the server and
 * always present in the markup, hidden until opened, so its destinations are
 * real links for crawlers and for a visitor whose JavaScript fails.
 *
 * Desktop: a full-width panel under the bar. Under 1080px it becomes an inline
 * accordion inside the menu sheet. Same element, two layouts, from CSS.
 */
function MenuLink({ link }: { readonly link: NavMenuLink }): React.ReactElement {
  const inner = (
    <>
      <span>{link.label}</span>
      {typeof link.count === 'number' && <span className="cbv2-menu__n">{link.count}</span>}
    </>
  );
  /* A static file served beside the app (the government page) must be a plain
     anchor: a <Link> would let the router handle it and render the app's 404
     for a page that exists on disk. */
  return link.external ? (
    <a className="cbv2-menu__link" href={link.to}>{inner}</a>
  ) : (
    <Link className="cbv2-menu__link" to={link.to}>{inner}</Link>
  );
}

function Group({ group }: { readonly group: NavMenuGroup }): React.ReactElement {
  return (
    <div className={`cbv2-menu__grp${group.pending ? ' is-pending' : ''}`}>
      <p className="cbv2-menu__h">
        {group.heading}
        {group.pending && <span className="cbv2-menu__pendtag">{group.pending.tag}</span>}
      </p>
      {group.pending ? (
        <>
          {/* Not links: nothing is tagged yet, and a link that filters to zero
              results is a dead end dressed as a destination. */}
          <ul className="cbv2-menu__list" aria-label={`${group.heading}: ${group.pending.tag.toLowerCase()}`}>
            {group.pending.items.map((item) => (
              <li key={item} className="cbv2-menu__pending">{item}</li>
            ))}
          </ul>
          <p className="cbv2-menu__note">{group.pending.note}</p>
        </>
      ) : (
        <ul className="cbv2-menu__list">
          {group.links.map((link) => (
            <li key={`${link.to}|${link.label}`}><MenuLink link={link} /></li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface NavMenuPanelProps {
  readonly id: string;
  readonly menu: NavMenu;
  readonly open: boolean;
  /** 'proof' lays out three columns; 'government' a family grid plus a side column. */
  readonly kind: 'proof' | 'government';
}

export default function NavMenuPanel({ id, menu, open, kind }: NavMenuPanelProps): React.ReactElement {
  return (
    <div id={id} className={`cbv2-menu cbv2-menu--${kind}`} data-open={open ? 'true' : 'false'}>
      <div className="cbv2-menu__in">
        <div className="cbv2-menu__groups">
          {menu.groups.map((g) => <Group key={g.heading} group={g} />)}
        </div>
        {menu.aside && (
          <div className="cbv2-menu__aside">
            <Group group={menu.aside} />
          </div>
        )}
        <div className="cbv2-menu__foot">
          <MenuLink link={{ ...menu.all, label: `${menu.all.label} →` }} />
          <span>{menu.footNote}</span>
        </div>
      </div>
    </div>
  );
}
