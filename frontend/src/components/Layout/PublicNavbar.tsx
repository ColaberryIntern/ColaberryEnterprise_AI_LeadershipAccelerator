import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { NAV_LINKS, NavItem } from '../../constants';

function PublicNavbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  const isChildActive = (item: NavItem) =>
    item.children?.some((c) => location.pathname === c.path) ?? false;

  const closeAll = useCallback(() => {
    setMenuOpen(false);
    setOpenDropdown(null);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenDropdown(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <nav ref={navRef} className="navbar navbar-expand-lg navbar-dark bg-dark sticky-top" role="navigation" aria-label="Main navigation">
      <div className="container">
        <Link className="navbar-brand fw-bold d-flex align-items-center" to="/">
          <img
            src="/colaberry-icon.png"
            alt=""
            width="30"
            height="30"
            className="me-2 logo-light"
          />
          Colaberry Enterprise AI
        </Link>
        <button
          className="navbar-toggler"
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-controls="mainNav"
          aria-expanded={menuOpen}
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon"></span>
        </button>
        <div className={`collapse navbar-collapse ${menuOpen ? 'show' : ''}`} id="mainNav">
          <ul className="navbar-nav ms-auto">
            {NAV_LINKS.map((item) =>
              item.children ? (
                <li className={`nav-item dropdown ${openDropdown === item.label ? 'show' : ''}`} key={item.label}>
                  <button
                    className={`nav-link dropdown-toggle bg-transparent border-0 ${isChildActive(item) ? 'active' : ''}`}
                    onClick={() => setOpenDropdown(openDropdown === item.label ? null : item.label)}
                    aria-expanded={openDropdown === item.label}
                  >
                    {item.label}
                  </button>
                  <ul className={`dropdown-menu dropdown-menu-dark ${openDropdown === item.label ? 'show' : ''}`}>
                    {item.children.map((child) => (
                      <li key={child.path}>
                        <Link
                          className={`dropdown-item ${location.pathname === child.path ? 'active' : ''}`}
                          to={child.path}
                          onClick={closeAll}
                          aria-current={location.pathname === child.path ? 'page' : undefined}
                        >
                          {child.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ) : (
                <li className="nav-item" key={item.path}>
                  <Link
                    className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
                    to={item.path!}
                    onClick={closeAll}
                    aria-current={location.pathname === item.path ? 'page' : undefined}
                  >
                    {item.label}
                  </Link>
                </li>
              )
            )}
          </ul>
          <Link
            className="btn btn-outline-light btn-sm ms-lg-3 mt-2 mt-lg-0"
            to="/portal/login"
            onClick={closeAll}
          >
            Participant Login
          </Link>
        </div>
      </div>
    </nav>
  );
}

export default PublicNavbar;
