import React from 'react';
import { Link } from 'react-router-dom';
import { FOOTER_LINKS, CONTACT_EMAIL } from '../../constants';

function PublicFooter() {
  return (
    <footer className="bg-dark text-light py-5" role="contentinfo">
      <div className="container">
        <div className="row">
          <div className="col-md-4 mb-4">
            <div className="d-flex align-items-center mb-2">
              <img
                src="/colaberry-icon.png"
                alt="Colaberry"
                width="32"
                height="32"
                className="me-2 logo-light"
              />
              <h5 className="text-light mb-0">Colaberry Enterprise AI Division</h5>
            </div>
            <p className="text-secondary">
              AI Leadership | Architecture | Implementation | Advisory
            </p>
          </div>
          <div className="col-md-4 mb-4">
            <h5 className="text-light">Quick Links</h5>
            <ul className="list-unstyled">
              {FOOTER_LINKS.map((link) => (
                <li key={link.path}>
                  <Link to={link.path} className="text-secondary">{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="col-md-4 mb-4">
            <h5 className="text-light">Connect</h5>
            <ul className="list-unstyled text-secondary">
              <li>Email: <a href={`mailto:${CONTACT_EMAIL}`} className="text-secondary">{CONTACT_EMAIL}</a></li>
              <li>LinkedIn: <a href="https://www.linkedin.com/company/colaberry" className="text-secondary" target="_blank" rel="noopener noreferrer">Colaberry Inc</a></li>
              <li>Twitter: <a href="https://twitter.com/Colaberry" className="text-secondary" target="_blank" rel="noopener noreferrer">@Colaberry</a></li>
            </ul>
          </div>
        </div>
        <hr className="border-secondary" />
        <p className="text-center text-secondary mb-0">
          &copy; {new Date().getFullYear()} Colaberry Inc. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

export default PublicFooter;
