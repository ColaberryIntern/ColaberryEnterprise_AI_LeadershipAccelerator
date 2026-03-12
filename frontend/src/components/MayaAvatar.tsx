import React from 'react';

export type MayaExpression =
  | 'greeting'    // friendly smile — default/opening
  | 'thinking'    // looking up, processing
  | 'explaining'  // attentive, professional
  | 'excited'     // big smile, enthusiastic (enrollment, booking)
  | 'empathetic'; // warm, understanding

interface MayaAvatarProps {
  expression?: MayaExpression;
  size?: number;
}

/**
 * Professional female avatar for Maya — realistic style with brown hair
 * in updo, semi-rimless glasses, navy blazer. Refined shading and
 * proportions for a polished, non-cartoonish look.
 */
const MayaAvatar: React.FC<MayaAvatarProps> = ({ expression = 'greeting', size = 32 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ borderRadius: '50%', flexShrink: 0 }}
    >
      <defs>
        {/* Skin gradient — warm, natural */}
        <radialGradient id="m-skin" cx="48%" cy="38%" r="50%">
          <stop offset="0%" stopColor="#F5D0B0" />
          <stop offset="60%" stopColor="#EFBF9A" />
          <stop offset="100%" stopColor="#E0A87E" />
        </radialGradient>
        {/* Hair gradient — rich brown */}
        <linearGradient id="m-hair" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5C3317" />
          <stop offset="50%" stopColor="#6B3A1F" />
          <stop offset="100%" stopColor="#4A2710" />
        </linearGradient>
        {/* Hair highlight */}
        <linearGradient id="m-hair-hi" x1="30%" y1="0%" x2="70%" y2="100%">
          <stop offset="0%" stopColor="#8B5E3C" opacity="0.6" />
          <stop offset="100%" stopColor="#6B3A1F" opacity="0" />
        </linearGradient>
        {/* Blazer gradient — navy */}
        <linearGradient id="m-blazer" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#1E3A5F" />
          <stop offset="100%" stopColor="#152C4D" />
        </linearGradient>
        {/* Background */}
        <radialGradient id="m-bg" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#F0F4F8" />
          <stop offset="100%" stopColor="#D6DDE6" />
        </radialGradient>
        {/* Soft shadow */}
        <filter id="m-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#000" floodOpacity="0.08" />
        </filter>
        {/* Lens reflection */}
        <linearGradient id="m-lens" x1="30%" y1="20%" x2="70%" y2="80%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Background */}
      <circle cx="60" cy="60" r="60" fill="url(#m-bg)" />

      {/* Back hair volume */}
      <ellipse cx="60" cy="34" rx="32" ry="24" fill="url(#m-hair)" />

      {/* Side hair — frames the face naturally */}
      <path d="M32 42C30 48 29 56 30 62C33 58 34 50 33 44Z" fill="#5C3317" />
      <path d="M88 42C90 48 91 56 90 62C87 58 86 50 87 44Z" fill="#4A2710" />

      {/* Bun */}
      <ellipse cx="64" cy="18" rx="12" ry="10" fill="url(#m-hair)" />
      <ellipse cx="64" cy="17" rx="10" ry="8" fill="#6B3A1F" />
      <ellipse cx="62" cy="15" rx="5" ry="3.5" fill="url(#m-hair-hi)" />

      {/* Neck */}
      <rect x="52" y="76" width="16" height="10" rx="5" fill="url(#m-skin)" />
      {/* Neck shadow */}
      <ellipse cx="60" cy="77" rx="8" ry="2" fill="#D49A70" opacity="0.3" />

      {/* Navy blazer */}
      <path
        d="M32 94C32 86 42 80 60 80C78 80 88 86 88 94L90 120L30 120Z"
        fill="url(#m-blazer)"
      />
      {/* Blazer lapels */}
      <path d="M50 81L56 91L58 82" fill="#243F64" />
      <path d="M70 81L64 91L62 82" fill="#243F64" />
      {/* Lapel edges */}
      <path d="M50.5 81.5L56 90L57.5 82.5" stroke="#1A3050" strokeWidth="0.5" fill="none" opacity="0.4" />
      <path d="M69.5 81.5L64 90L62.5 82.5" stroke="#1A3050" strokeWidth="0.5" fill="none" opacity="0.4" />

      {/* White collar */}
      <path d="M52 81L60 90L68 81" fill="#FFFFFF" />
      <path d="M53 81.5L60 89L67 81.5" fill="#F5F5F5" />

      {/* Bow tie — small, elegant */}
      <path d="M56 84L60 86.5L64 84L60 82Z" fill="#1A365D" />
      <circle cx="60" cy="84.2" r="1.3" fill="#243F64" />

      {/* Face — natural proportions */}
      <ellipse cx="60" cy="56" rx="25" ry="28" fill="url(#m-skin)" />
      {/* Subtle jaw definition */}
      <ellipse cx="60" cy="66" rx="20" ry="16" fill="#EFBF9A" opacity="0.4" />
      {/* Cheek contour (subtle) */}
      <ellipse cx="42" cy="58" rx="5" ry="7" fill="#E8AE85" opacity="0.15" />
      <ellipse cx="78" cy="58" rx="5" ry="7" fill="#E8AE85" opacity="0.15" />

      {/* Ears */}
      <ellipse cx="35" cy="56" rx="3.5" ry="5" fill="#EFBF9A" />
      <ellipse cx="85" cy="56" rx="3.5" ry="5" fill="#EFBF9A" />

      {/* Front hair — side-swept bangs */}
      <path d="M36 40C38 30 46 24 58 23C50 27 42 34 40 44Z" fill="url(#m-hair)" />
      <path d="M84 40C82 30 74 24 62 23C70 27 78 34 80 44Z" fill="#4A2710" opacity="0.8" />
      {/* Hair shine */}
      <path d="M42 32C46 26 52 24 58 24C52 26 46 30 44 36Z" fill="url(#m-hair-hi)" />

      {/* Nose — refined */}
      <path d="M58 62C59 64 61 64 62 62" stroke="#D4A07A" strokeWidth="0.8" strokeLinecap="round" fill="none" />
      <path d="M57.5 63C58.5 64 61.5 64 62.5 63" stroke="#C89670" strokeWidth="0.5" strokeLinecap="round" fill="none" opacity="0.5" />

      {/* Glasses — thin, sophisticated frames */}
      <ellipse cx="48" cy="54" rx="10" ry="8" stroke="#3D2B1F" strokeWidth="1.2" fill="url(#m-lens)" filter="url(#m-shadow)" />
      <ellipse cx="72" cy="54" rx="10" ry="8" stroke="#3D2B1F" strokeWidth="1.2" fill="url(#m-lens)" filter="url(#m-shadow)" />
      {/* Bridge */}
      <path d="M58 53.5C59 52 61 52 62 53.5" stroke="#3D2B1F" strokeWidth="1" fill="none" />
      {/* Arms */}
      <line x1="38" y1="53" x2="35" y2="54" stroke="#3D2B1F" strokeWidth="0.8" />
      <line x1="82" y1="53" x2="85" y2="54" stroke="#3D2B1F" strokeWidth="0.8" />

      {/* ── Expression-dependent features ── */}

      {expression === 'greeting' && (
        <>
          {/* Warm open eyes */}
          <ellipse cx="48" cy="53.5" rx="3.5" ry="4" fill="#3D2B1F" />
          <ellipse cx="72" cy="53.5" rx="3.5" ry="4" fill="#3D2B1F" />
          <circle cx="48" cy="53.5" r="2.2" fill="#1A1A1A" />
          <circle cx="72" cy="53.5" r="2.2" fill="#1A1A1A" />
          <circle cx="49.5" cy="52" r="1.1" fill="#fff" />
          <circle cx="73.5" cy="52" r="1.1" fill="#fff" />
          <circle cx="47" cy="54.5" r="0.5" fill="#fff" opacity="0.4" />
          <circle cx="71" cy="54.5" r="0.5" fill="#fff" opacity="0.4" />
          {/* Upper lash line */}
          <path d="M42 50.5C44 48.5 52 48.5 54 50.5" stroke="#3D2B1F" strokeWidth="1" strokeLinecap="round" fill="none" />
          <path d="M66 50.5C68 48.5 76 48.5 78 50.5" stroke="#3D2B1F" strokeWidth="1" strokeLinecap="round" fill="none" />
          {/* Lashes */}
          <path d="M42 51L40.5 49.5" stroke="#3D2B1F" strokeWidth="0.6" strokeLinecap="round" />
          <path d="M54 51L55.5 49.5" stroke="#3D2B1F" strokeWidth="0.6" strokeLinecap="round" />
          <path d="M66 51L64.5 49.5" stroke="#3D2B1F" strokeWidth="0.6" strokeLinecap="round" />
          <path d="M78 51L79.5 49.5" stroke="#3D2B1F" strokeWidth="0.6" strokeLinecap="round" />
          {/* Friendly smile */}
          <path d="M50 70C53 74 67 74 70 70" stroke="#B85C4A" strokeWidth="1.4" strokeLinecap="round" fill="none" />
          <path d="M52 71C55 73.5 65 73.5 68 71" fill="#C46854" opacity="0.3" />
          {/* Light blush */}
          <circle cx="40" cy="64" r="5" fill="#FFB5B5" opacity="0.12" />
          <circle cx="80" cy="64" r="5" fill="#FFB5B5" opacity="0.12" />
          {/* Brows — natural arch */}
          <path d="M41 46C44 43.5 52 43.5 55 46" stroke="#4A2F1A" strokeWidth="1.1" strokeLinecap="round" fill="none" />
          <path d="M65 46C68 43.5 76 43.5 79 46" stroke="#4A2F1A" strokeWidth="1.1" strokeLinecap="round" fill="none" />
        </>
      )}

      {expression === 'thinking' && (
        <>
          {/* Eyes glancing up-right */}
          <ellipse cx="49" cy="52.5" rx="3.5" ry="4" fill="#3D2B1F" />
          <ellipse cx="73" cy="52.5" rx="3.5" ry="4" fill="#3D2B1F" />
          <circle cx="49" cy="52.5" r="2.2" fill="#1A1A1A" />
          <circle cx="73" cy="52.5" r="2.2" fill="#1A1A1A" />
          <circle cx="50.5" cy="51" r="1.1" fill="#fff" />
          <circle cx="74.5" cy="51" r="1.1" fill="#fff" />
          {/* Upper lash line */}
          <path d="M42 50C44 48 52 48 54 50" stroke="#3D2B1F" strokeWidth="1" strokeLinecap="round" fill="none" />
          <path d="M66 50C68 48 76 48 78 50" stroke="#3D2B1F" strokeWidth="1" strokeLinecap="round" fill="none" />
          {/* Lashes */}
          <path d="M42 50.5L40.5 49" stroke="#3D2B1F" strokeWidth="0.6" strokeLinecap="round" />
          <path d="M54 50.5L55.5 49" stroke="#3D2B1F" strokeWidth="0.6" strokeLinecap="round" />
          <path d="M66 50.5L64.5 49" stroke="#3D2B1F" strokeWidth="0.6" strokeLinecap="round" />
          <path d="M78 50.5L79.5 49" stroke="#3D2B1F" strokeWidth="0.6" strokeLinecap="round" />
          {/* Thoughtful small mouth */}
          <ellipse cx="60" cy="70.5" rx="4" ry="2.5" fill="#C46854" opacity="0.5" />
          <path d="M57 70C58.5 69 61.5 69 63 70" stroke="#B85C4A" strokeWidth="0.8" strokeLinecap="round" fill="none" />
          {/* One brow slightly raised */}
          <path d="M41 44.5C44 42 52 42 55 45" stroke="#4A2F1A" strokeWidth="1.1" strokeLinecap="round" fill="none" />
          <path d="M65 45.5C68 42.5 76 42.5 79 45" stroke="#4A2F1A" strokeWidth="1.1" strokeLinecap="round" fill="none" />
        </>
      )}

      {expression === 'explaining' && (
        <>
          {/* Engaged, slightly wider eyes */}
          <ellipse cx="48" cy="53.5" rx="3.8" ry="4.3" fill="#3D2B1F" />
          <ellipse cx="72" cy="53.5" rx="3.8" ry="4.3" fill="#3D2B1F" />
          <circle cx="48" cy="53.5" r="2.3" fill="#1A1A1A" />
          <circle cx="72" cy="53.5" r="2.3" fill="#1A1A1A" />
          <circle cx="49.5" cy="52" r="1.2" fill="#fff" />
          <circle cx="73.5" cy="52" r="1.2" fill="#fff" />
          <circle cx="47" cy="54.5" r="0.5" fill="#fff" opacity="0.4" />
          <circle cx="71" cy="54.5" r="0.5" fill="#fff" opacity="0.4" />
          {/* Upper lash line */}
          <path d="M42 50C44 47.5 52 47.5 54 50" stroke="#3D2B1F" strokeWidth="1" strokeLinecap="round" fill="none" />
          <path d="M66 50C68 47.5 76 47.5 78 50" stroke="#3D2B1F" strokeWidth="1" strokeLinecap="round" fill="none" />
          {/* Lashes */}
          <path d="M42 50.5L40.5 49" stroke="#3D2B1F" strokeWidth="0.6" strokeLinecap="round" />
          <path d="M54 50.5L55.5 49" stroke="#3D2B1F" strokeWidth="0.6" strokeLinecap="round" />
          <path d="M66 50.5L64.5 49" stroke="#3D2B1F" strokeWidth="0.6" strokeLinecap="round" />
          <path d="M78 50.5L79.5 49" stroke="#3D2B1F" strokeWidth="0.6" strokeLinecap="round" />
          {/* Open, confident smile — teeth showing */}
          <path d="M50 69C53 74 67 74 70 69" stroke="#B85C4A" strokeWidth="1.4" strokeLinecap="round" fill="none" />
          <path d="M52 70C55 73 65 73 68 70" fill="#FFFFFF" />
          <path d="M52 70.5C55 72.5 65 72.5 68 70.5" fill="#F5F5F5" opacity="0.6" />
          {/* Subtle blush */}
          <circle cx="40" cy="64" r="4.5" fill="#FFB5B5" opacity="0.1" />
          <circle cx="80" cy="64" r="4.5" fill="#FFB5B5" opacity="0.1" />
          {/* Brows slightly raised — engaged */}
          <path d="M41 45C44 42.5 52 42.5 55 45" stroke="#4A2F1A" strokeWidth="1.1" strokeLinecap="round" fill="none" />
          <path d="M65 45C68 42.5 76 42.5 79 45" stroke="#4A2F1A" strokeWidth="1.1" strokeLinecap="round" fill="none" />
        </>
      )}

      {expression === 'excited' && (
        <>
          {/* Happy crescent eyes */}
          <path d="M43 54.5C45 50 51 50 53 54.5" stroke="#3D2B1F" strokeWidth="1.8" strokeLinecap="round" fill="none" />
          <path d="M67 54.5C69 50 75 50 77 54.5" stroke="#3D2B1F" strokeWidth="1.8" strokeLinecap="round" fill="none" />
          {/* Lash accents */}
          <path d="M42.5 55L41 53" stroke="#3D2B1F" strokeWidth="0.6" strokeLinecap="round" />
          <path d="M53.5 55L55 53" stroke="#3D2B1F" strokeWidth="0.6" strokeLinecap="round" />
          <path d="M66.5 55L65 53" stroke="#3D2B1F" strokeWidth="0.6" strokeLinecap="round" />
          <path d="M77.5 55L79 53" stroke="#3D2B1F" strokeWidth="0.6" strokeLinecap="round" />
          {/* Big genuine smile */}
          <path d="M48 69C52 76 68 76 72 69" stroke="#B85C4A" strokeWidth="1.4" strokeLinecap="round" fill="none" />
          <path d="M50 70C53 75 67 75 70 70" fill="#FFFFFF" />
          {/* Rosy cheeks */}
          <circle cx="39" cy="64" r="6" fill="#FFAAAA" opacity="0.18" />
          <circle cx="81" cy="64" r="6" fill="#FFAAAA" opacity="0.18" />
          {/* Raised joyful brows */}
          <path d="M41 43.5C44 41 52 41 55 43.5" stroke="#4A2F1A" strokeWidth="1.1" strokeLinecap="round" fill="none" />
          <path d="M65 43.5C68 41 76 41 79 43.5" stroke="#4A2F1A" strokeWidth="1.1" strokeLinecap="round" fill="none" />
        </>
      )}

      {expression === 'empathetic' && (
        <>
          {/* Gentle, soft eyes */}
          <ellipse cx="48" cy="54" rx="3.5" ry="3.8" fill="#3D2B1F" />
          <ellipse cx="72" cy="54" rx="3.5" ry="3.8" fill="#3D2B1F" />
          <circle cx="48" cy="54" r="2.2" fill="#1A1A1A" />
          <circle cx="72" cy="54" r="2.2" fill="#1A1A1A" />
          <circle cx="49.3" cy="52.8" r="1" fill="#fff" />
          <circle cx="73.3" cy="52.8" r="1" fill="#fff" />
          {/* Slightly lowered lids — caring look */}
          <path d="M42 51C44 49.5 52 49.5 54 51" stroke="#3D2B1F" strokeWidth="1.2" strokeLinecap="round" fill="none" />
          <path d="M66 51C68 49.5 76 49.5 78 51" stroke="#3D2B1F" strokeWidth="1.2" strokeLinecap="round" fill="none" />
          {/* Lashes */}
          <path d="M42 51.5L40.5 50" stroke="#3D2B1F" strokeWidth="0.6" strokeLinecap="round" />
          <path d="M54 51.5L55.5 50" stroke="#3D2B1F" strokeWidth="0.6" strokeLinecap="round" />
          <path d="M66 51.5L64.5 50" stroke="#3D2B1F" strokeWidth="0.6" strokeLinecap="round" />
          <path d="M78 51.5L79.5 50" stroke="#3D2B1F" strokeWidth="0.6" strokeLinecap="round" />
          {/* Gentle understanding smile */}
          <path d="M52 70C55 73 65 73 68 70" stroke="#B85C4A" strokeWidth="1.3" strokeLinecap="round" fill="none" />
          <path d="M54 71C56.5 72.5 63.5 72.5 66 71" fill="#C46854" opacity="0.2" />
          {/* Warm blush */}
          <circle cx="40" cy="64" r="5" fill="#FFB5B5" opacity="0.14" />
          <circle cx="80" cy="64" r="5" fill="#FFB5B5" opacity="0.14" />
          {/* Empathetic brows — inner edges slightly raised */}
          <path d="M41 46.5C44 44 51 43 55 45.5" stroke="#4A2F1A" strokeWidth="1.1" strokeLinecap="round" fill="none" />
          <path d="M65 45.5C69 43 76 44 79 46.5" stroke="#4A2F1A" strokeWidth="1.1" strokeLinecap="round" fill="none" />
        </>
      )}
    </svg>
  );
};

export default MayaAvatar;
