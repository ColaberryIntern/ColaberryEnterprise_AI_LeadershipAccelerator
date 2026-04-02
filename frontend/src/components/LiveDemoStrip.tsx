import React from 'react';
import InlineDemoPlayer from './InlineDemoPlayer';

export default function LiveDemoStrip() {
  return (
    <div className="py-4" style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
      <div className="container">
        <InlineDemoPlayer trackContext="homepage_strip" />
      </div>
    </div>
  );
}
