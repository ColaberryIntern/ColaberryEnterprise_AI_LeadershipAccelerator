import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { initGA } from './utils/analytics';
// Self-hosted faces. Must load before the design-system stylesheets so the
// families are declared by the time anything asks for them.
import './fonts/fonts.css';
import 'bootstrap/dist/css/bootstrap.min.css';
// The ICON font is a separate package from the Bootstrap CSS framework above,
// and it was never installed — so all 546 `bi bi-*` usages across 88 files
// rendered as nothing, for as long as they have existed. A missing glyph reads
// as whitespace, which is why it went unnoticed until an attach button with no
// label appeared as an empty square in production.
//
// Imported from npm rather than a CDN, deliberately: it is the same reason the
// web fonts were moved off fonts.googleapis.com (see the comment in
// public/index.html) — a third-party request on every page load, and a
// third-party outage that silently erases the UI's iconography.
import 'bootstrap-icons/font/bootstrap-icons.css';
import './styles/global.css';
import './styles/responsive.css';
import './colaberry/styles.css';
import './styles/brand-bridge.css';
import './styles/admin-shell.css';

initGA();

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
