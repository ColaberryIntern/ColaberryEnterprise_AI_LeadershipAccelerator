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
 * 3D-style cartoon avatar for Maya — brown hair, glasses, headphones, blue shirt.
 * Each expression changes eyes/mouth/brows to match conversation mood.
 */
const MayaAvatar: React.FC<MayaAvatarProps> = ({ expression = 'greeting', size = 32 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ borderRadius: '50%', flexShrink: 0 }}
    >
      {/* Background circle */}
      <circle cx="50" cy="50" r="50" fill="#E8F4FD" />

      {/* Headphone band */}
      <path
        d="M22 48C22 32 34 18 50 18C66 18 78 32 78 48"
        stroke="#333"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Hair — brown, swept to side */}
      <ellipse cx="50" cy="30" rx="26" ry="18" fill="#6B4226" />
      <ellipse cx="50" cy="28" rx="24" ry="14" fill="#7B5232" />
      {/* Hair highlights */}
      <path d="M32 24C36 18 44 16 50 16C56 16 64 18 68 24" fill="#8B6242" opacity="0.6" />
      {/* Side hair */}
      <ellipse cx="28" cy="40" rx="6" ry="10" fill="#6B4226" />
      <ellipse cx="72" cy="40" rx="6" ry="10" fill="#6B4226" />

      {/* Face */}
      <ellipse cx="50" cy="50" rx="22" ry="24" fill="#FDDCB5" />

      {/* Ears */}
      <ellipse cx="28" cy="50" rx="4" ry="5" fill="#F5C99A" />
      <ellipse cx="72" cy="50" rx="4" ry="5" fill="#F5C99A" />

      {/* Headphone ear cups */}
      <rect x="20" y="43" width="10" height="14" rx="4" fill="#444" />
      <rect x="70" y="43" width="10" height="14" rx="4" fill="#444" />
      {/* Headphone cushion detail */}
      <rect x="22" y="45" width="6" height="10" rx="3" fill="#555" />
      <rect x="72" y="45" width="6" height="10" rx="3" fill="#555" />

      {/* Glasses frames */}
      <rect x="34" y="43" width="14" height="11" rx="5" stroke="#333" strokeWidth="2" fill="none" />
      <rect x="52" y="43" width="14" height="11" rx="5" stroke="#333" strokeWidth="2" fill="none" />
      {/* Glasses bridge */}
      <path d="M48 48C49 46 51 46 52 48" stroke="#333" strokeWidth="1.5" fill="none" />
      {/* Glasses arms (to headphones) */}
      <line x1="34" y1="48" x2="30" y2="48" stroke="#333" strokeWidth="1.5" />
      <line x1="66" y1="48" x2="70" y2="48" stroke="#333" strokeWidth="1.5" />

      {/* Expression-dependent features */}
      {expression === 'greeting' && (
        <>
          {/* Friendly eyes — open, warm */}
          <ellipse cx="41" cy="48" rx="3.5" ry="3.5" fill="#2D3748" />
          <ellipse cx="59" cy="48" rx="3.5" ry="3.5" fill="#2D3748" />
          <circle cx="42" cy="47" r="1.2" fill="#fff" />
          <circle cx="60" cy="47" r="1.2" fill="#fff" />
          {/* Friendly smile */}
          <path d="M42 59C44 63 56 63 58 59" stroke="#C05621" strokeWidth="2" strokeLinecap="round" fill="none" />
          {/* Light blush */}
          <circle cx="35" cy="56" r="4" fill="#FFBBBB" opacity="0.3" />
          <circle cx="65" cy="56" r="4" fill="#FFBBBB" opacity="0.3" />
          {/* Neutral brows */}
          <path d="M36 41C38 39 44 39 46 41" stroke="#5B3A1A" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          <path d="M54 41C56 39 62 39 64 41" stroke="#5B3A1A" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </>
      )}

      {expression === 'thinking' && (
        <>
          {/* Eyes looking up */}
          <ellipse cx="41" cy="47" rx="3.5" ry="3.5" fill="#2D3748" />
          <ellipse cx="59" cy="47" rx="3.5" ry="3.5" fill="#2D3748" />
          <circle cx="42" cy="45.5" r="1.4" fill="#fff" />
          <circle cx="60" cy="45.5" r="1.4" fill="#fff" />
          {/* Slight pursed mouth */}
          <ellipse cx="50" cy="60" rx="3" ry="2" fill="#D4845A" opacity="0.8" />
          {/* One raised brow */}
          <path d="M36 39C38 37 44 37 46 40" stroke="#5B3A1A" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          <path d="M54 40C56 37 62 37 64 39" stroke="#5B3A1A" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </>
      )}

      {expression === 'explaining' && (
        <>
          {/* Attentive eyes */}
          <ellipse cx="41" cy="48" rx="3.5" ry="4" fill="#2D3748" />
          <ellipse cx="59" cy="48" rx="3.5" ry="4" fill="#2D3748" />
          <circle cx="42" cy="47" r="1.3" fill="#fff" />
          <circle cx="60" cy="47" r="1.3" fill="#fff" />
          {/* Slight open smile */}
          <path d="M43 58C45 62 55 62 57 58" stroke="#C05621" strokeWidth="2" strokeLinecap="round" fill="none" />
          <path d="M45 59C47 61 53 61 55 59" fill="#fff" opacity="0.9" />
          {/* Engaged brows — slightly raised */}
          <path d="M36 40C38 38 44 38 46 40" stroke="#5B3A1A" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          <path d="M54 40C56 38 62 38 64 40" stroke="#5B3A1A" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </>
      )}

      {expression === 'excited' && (
        <>
          {/* Big happy eyes — slightly squished (smiling) */}
          <path d="M37 49C38 45 44 45 45 49" stroke="#2D3748" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          <path d="M55 49C56 45 62 45 63 49" stroke="#2D3748" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          {/* Big grin */}
          <path d="M40 58C43 65 57 65 60 58" stroke="#C05621" strokeWidth="2" strokeLinecap="round" fill="none" />
          <path d="M42 59C44 64 56 64 58 59" fill="#fff" />
          {/* Rosy cheeks */}
          <circle cx="34" cy="56" r="5" fill="#FFAAAA" opacity="0.35" />
          <circle cx="66" cy="56" r="5" fill="#FFAAAA" opacity="0.35" />
          {/* Raised happy brows */}
          <path d="M36 38C38 36 44 36 46 38" stroke="#5B3A1A" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          <path d="M54 38C56 36 62 36 64 38" stroke="#5B3A1A" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </>
      )}

      {expression === 'empathetic' && (
        <>
          {/* Soft eyes — slightly tilted */}
          <ellipse cx="41" cy="48" rx="3.5" ry="3.2" fill="#2D3748" />
          <ellipse cx="59" cy="48" rx="3.5" ry="3.2" fill="#2D3748" />
          <circle cx="42" cy="47.5" r="1.2" fill="#fff" />
          <circle cx="60" cy="47.5" r="1.2" fill="#fff" />
          {/* Gentle warm smile */}
          <path d="M43 59C46 62 54 62 57 59" stroke="#C05621" strokeWidth="1.8" strokeLinecap="round" fill="none" />
          {/* Soft blush */}
          <circle cx="35" cy="56" r="4.5" fill="#FFBBBB" opacity="0.25" />
          <circle cx="65" cy="56" r="4.5" fill="#FFBBBB" opacity="0.25" />
          {/* Slightly concerned/caring brows — inner edge raised */}
          <path d="M36 41C38 39 43 38 46 40" stroke="#5B3A1A" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          <path d="M54 40C57 38 62 39 64 41" stroke="#5B3A1A" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </>
      )}

      {/* Blue shirt / collar at bottom */}
      <path
        d="M30 72C30 68 38 65 50 65C62 65 70 68 70 72L72 85L28 85Z"
        fill="#3182CE"
      />
      {/* Collar detail */}
      <path d="M44 66L50 72L56 66" stroke="#2B6CB0" strokeWidth="1.5" fill="none" />

      {/* Neck */}
      <rect x="45" y="62" width="10" height="6" rx="2" fill="#FDDCB5" />
    </svg>
  );
};

export default MayaAvatar;
