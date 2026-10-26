import React from 'react';
import { sp } from '../interior/spots/spotParts';

/**
 * The desk surface under the monitors (v6 "Workstation surface", the prototype's .desksurface): lamp, plant, branded mug with
 * steam, keyboard, mouse, your name card, a phone showing Cory, headphones. Decorative only (aria-hidden): every control lives in
 * the monitors and the rail. Colors are art tokens; the same surface for every spot this round (v6: "don't vary it per spot").
 */
const F = "'DM Sans',system-ui,sans-serif";

export default function WorkstationDesk({ nameCard }: { nameCard: string }): React.ReactElement {
  return (
    <div className="cm-ws-desk" data-testid="cm-ws-desk" aria-hidden="true">
      <svg width="64" height="92" viewBox="0 0 64 92">
        <ellipse cx="30" cy="88" rx="22" ry="4" fill={sp('shadow')} />
        <rect x="20" y="82" width="22" height="6" rx="3" fill={sp('lamp-arm')} />
        <path d="M31 82 L22 40 L44 18" stroke={sp('lamp-arm')} strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M36 10 L58 22 L50 34 L30 22 Z" fill={sp('lamp')} />
        <ellipse cx="46" cy="30" rx="9" ry="4" fill={sp('lamp-glow')} />
      </svg>
      <svg width="46" height="70" viewBox="0 0 46 70">
        <path d="M10 46 h26 l-4 22 h-18 z" fill={sp('pot')} />
        <ellipse cx="16" cy="30" rx="8" ry="16" fill={sp('leaf-1')} transform="rotate(-25 16 30)" />
        <ellipse cx="30" cy="28" rx="8" ry="17" fill={sp('leaf-2')} transform="rotate(22 30 28)" />
        <ellipse cx="23" cy="22" rx="6" ry="18" fill={sp('leaf-3')} />
      </svg>
      <svg width="44" height="64" viewBox="0 0 44 64" className="steam">
        <path d="M14 18 q-6 -8 0 -16" stroke={sp('steam')} strokeWidth="2" fill="none" opacity=".7" />
        <path d="M24 18 q-6 -8 0 -16" stroke={sp('steam')} strokeWidth="2" fill="none" opacity=".7" />
        <rect x="6" y="22" width="26" height="36" rx="4" fill={sp('card')} />
        <path d="M32 30 q10 0 10 9 q0 9 -10 9" stroke={sp('card')} strokeWidth="4" fill="none" />
        <text x="19" y="46" textAnchor="middle" fontSize="14" fontWeight="800" fill={sp('red')} fontFamily={F}>C</text>
      </svg>
      <svg className="kb" viewBox="0 0 420 58" preserveAspectRatio="xMidYMax meet">
        <rect x="0" y="10" width="420" height="44" rx="8" fill={sp('keys')} />
        {Array.from({ length: 3 }, (_, r) => Array.from({ length: 14 }, (__, c) => (
          <rect key={`${r}-${c}`} x={10 + c * 29} y={16 + r * 12} width="25" height="9" rx="2" fill={sp('key')} />
        )))}
      </svg>
      <svg width="34" height="50" viewBox="0 0 34 50">
        <rect x="5" y="8" width="24" height="38" rx="12" fill={sp('keys')} />
        <line x1="17" y1="10" x2="17" y2="22" stroke={sp('key')} strokeWidth="2" />
      </svg>
      <svg width="108" height="46" viewBox="0 0 108 46" data-testid="cm-ws-namecard">
        <polygon points="4,44 104,44 96,6 12,6" fill={sp('card')} stroke={sp('card-edge')} />
        <text x="54" y="31" textAnchor="middle" fontSize="13" fontWeight="800" fill={sp('red')} fontFamily={F} letterSpacing="1">{nameCard.slice(0, 14)}</text>
      </svg>
      <svg width="40" height="70" viewBox="0 0 40 70" className="opt">
        <rect x="4" y="4" width="32" height="62" rx="6" fill={sp('monitor')} />
        <rect x="7" y="10" width="26" height="48" rx="2" fill={sp('term')} />
        <circle cx="20" cy="24" r="7" fill={sp('live')} />
        <text x="20" y="27" textAnchor="middle" fontSize="7" fontWeight="800" fill={sp('steam')} fontFamily={F}>C</text>
        <rect x="11" y="36" width="18" height="3" rx="1.5" fill={sp('code-grey')} />
        <rect x="11" y="42" width="12" height="3" rx="1.5" fill={sp('code-green')} />
      </svg>
      <svg width="70" height="56" viewBox="0 0 70 56" className="opt">
        <path d="M10 40 q0 -32 25 -32 q25 0 25 32" stroke={sp('headset')} strokeWidth="6" fill="none" />
        <rect x="2" y="34" width="16" height="20" rx="6" fill={sp('headset')} />
        <rect x="52" y="34" width="16" height="20" rx="6" fill={sp('headset')} />
      </svg>
    </div>
  );
}
