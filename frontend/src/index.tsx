import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { initGA } from './utils/analytics';
// Self-hosted faces. Must load before the design-system stylesheets so the
// families are declared by the time anything asks for them.
import './fonts/fonts.css';
import 'bootstrap/dist/css/bootstrap.min.css';
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
