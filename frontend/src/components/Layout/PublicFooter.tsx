import React from 'react';
import { Link } from 'react-router-dom';

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
              <li><Link to="/program" className="text-secondary">Program</Link></li>
              <li><Link to="/pricing" className="text-secondary">Pricing</Link></li>
              <li><Link to="/sponsorship" className="text-secondary">Corporate Sponsorship</Link></li>
              <li><Link to="/advisory" className="text-secondary">Enterprise AI Advisory</Link></li>
              <li><Link to="/case-studies" className="text-secondary">Case Studies</Link></li>
              <li><Link to="/enroll" className="text-secondary">Enroll</Link></li>
              <li><Link to="/contact" className="text-secondary">Contact</Link></li>
            </ul>
          </div>
          <div className="col-md-4 mb-4">
            <h5 className="text-light">Connect</h5>
            <ul className="list-unstyled text-secondary">
              <li>Email: info@colaberry.com</li>
              <li>LinkedIn: Colaberry Inc</li>
              <li>Twitter: @Colaberry</li>
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
