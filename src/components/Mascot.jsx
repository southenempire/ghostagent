import React from 'react';

// Tiny 24x24 Ghost Icon for Headers & Badges
export function GhostIcon({ className = '', size = 22, style = {} }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="currentColor" 
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M5 22V10a7 7 0 0 1 14 0v12l-3-2.5-2 2.5-2-2.5-2 2.5-2-2.5z" />
      <circle cx="9.5" cy="10.5" r="1.4" style={{ fill: 'var(--bg)' }} />
      <circle cx="14.5" cy="10.5" r="1.4" style={{ fill: 'var(--bg)' }} />
    </svg>
  );
}

// Standalone Ghost Mascot Character
export function MascotGhost({ size = 180, sleeping = false, transparent = false, className = '' }) {
  const width = size;
  const height = size * 1.1;

  if (sleeping) {
    return (
      <div className={`relative inline-block ${className}`} style={{ width, height, position: 'relative' }}>
        <svg viewBox="0 0 200 220" width={width} height={height} fill="none">
          {/* Ghost Body */}
          <path 
            d="M30 205V95C30 52 62 20 100 20s70 32 70 75v110l-22-19-24 19-24-19-24 19-22-19z" 
            fill="var(--bg)" 
            stroke="var(--ink)" 
            strokeWidth="5" 
            strokeLinejoin="round" 
          />
          {/* Closed Eyes */}
          <path d="M66 106q10 8 20 0" stroke="var(--ink)" strokeWidth="4" strokeLinecap="round" fill="none" />
          <path d="M114 106q10 8 20 0" stroke="var(--ink)" strokeWidth="4" strokeLinecap="round" fill="none" />
          {/* Blush */}
          <ellipse cx="58" cy="118" rx="8" ry="4" fill="#FF4B1F" opacity="0.6" />
          <ellipse cx="142" cy="118" rx="8" ry="4" fill="#FF4B1F" opacity="0.6" />
          {/* Mouth */}
          <path d="M95 120q5 4 10 0" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" fill="none" />
        </svg>
        {/* Snoring z Z floating */}
        <div 
          style={{ 
            position: 'absolute', 
            top: -4, 
            right: 0, 
            color: '#FF4B1F', 
            fontFamily: '"IBM Plex Mono", monospace',
            fontWeight: 700,
            fontSize: '18px'
          }}
        >
          z <span style={{ fontSize: '24px' }}>Z</span>
        </div>
      </div>
    );
  }

  return (
    <svg 
      viewBox="0 0 200 220" 
      width={width} 
      height={height} 
      className={className} 
      style={{ opacity: transparent ? 0.35 : 1 }}
      aria-hidden="true"
    >
      {/* Ghost Outline */}
      <path 
        d="M30 205V95C30 52 62 20 100 20s70 32 70 75v110l-22-19-24 19-24-19-24 19-22-19z" 
        fill="#FBF9F3" 
        stroke="var(--ink)" 
        strokeWidth="5" 
        strokeLinejoin="round" 
      />
      {/* Left Eye */}
      <ellipse cx="76" cy="102" rx="15" ry="20" fill="var(--ink)" />
      <ellipse cx="76" cy="106" rx="10" ry="14" fill="#FF4B1F" />
      <ellipse cx="76" cy="107" rx="5" ry="8" fill="var(--ink)" />
      <circle cx="71" cy="97" r="4.5" fill="#fff" />
      <circle cx="81" cy="112" r="2" fill="#fff" />

      {/* Right Eye */}
      <ellipse cx="124" cy="102" rx="15" ry="20" fill="var(--ink)" />
      <ellipse cx="124" cy="106" rx="10" ry="14" fill="#FF4B1F" />
      <ellipse cx="124" cy="107" rx="5" ry="8" fill="var(--ink)" />
      <circle cx="119" cy="97" r="4.5" fill="#fff" />
      <circle cx="129" cy="112" r="2" fill="#fff" />

      {/* Cheeks */}
      <ellipse cx="56" cy="128" rx="9" ry="5" fill="#FF4B1F" opacity="0.5" />
      <ellipse cx="144" cy="128" rx="9" ry="5" fill="#FF4B1F" opacity="0.5" />

      {/* Cat Mouth */}
      <path d="M92 130q4 7 8 0q4 7 8 0" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// Hero Sunburst Emblem with "ドロン!" Manga Sound Effect & Anime Accents
export function HeroMascotEmblem({ size = 360 }) {
  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      {/* Anime Floating Sound Effect: フワッ... (fuwaa = floating softly) */}
      <div 
        style={{
          position: 'absolute',
          top: '-12px',
          left: '12px',
          fontFamily: '"Inter Tight", sans-serif',
          fontWeight: 800,
          fontSize: '18px',
          color: 'var(--mu)',
          letterSpacing: '0.1em',
          transform: 'rotate(-8deg)',
          userSelect: 'none',
          zIndex: 5
        }}
      >
        フワッ... ✦
      </div>

      {/* Anime Sparkle Star Top Right */}
      <div 
        style={{
          position: 'absolute',
          top: '8px',
          right: '24px',
          color: '#FF4B1F',
          fontSize: '22px',
          fontWeight: 900,
          transform: 'rotate(12deg)',
          userSelect: 'none',
          zIndex: 5
        }}
      >
        ✧ シュッ！
      </div>

      <svg viewBox="0 0 360 360" width={size} height={size}>
        {/* Sunburst Rays (Filtered to avoid intersecting bottom text) */}
        <g stroke="var(--ink)" strokeWidth="3" strokeLinecap="round">
          {Array.from({ length: 32 }).map((_, i) => {
            const angle = (i * 360) / 32;
            // Skip rays at the very bottom (angles roughly between 70° and 110°) to keep "ドロン！" 100% clean
            if (angle > 70 && angle < 110) return null;

            const rad = (angle * Math.PI) / 180;
            const x1 = 180 + 135 * Math.cos(rad);
            const y1 = 180 + 135 * Math.sin(rad);
            const x2 = 180 + (i % 2 === 0 ? 162 : 148) * Math.cos(rad);
            const y2 = 180 + (i % 2 === 0 ? 162 : 148) * Math.sin(rad);
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
          })}
        </g>

        {/* Hyper-Orange Sun Disc */}
        <circle cx="180" cy="180" r="115" fill="#FF4B1F" stroke="var(--ink)" strokeWidth="4" />
        
        {/* Manga Halftone Stipple Pattern */}
        <defs>
          <pattern id="stipplePattern" width="8" height="8" patternUnits="userSpaceOnUse">
            <circle cx="4" cy="4" r="1.5" fill="var(--ink)" opacity="0.3" />
          </pattern>
        </defs>
        <circle cx="180" cy="180" r="115" fill="url(#stipplePattern)" />

        {/* Small Anime Sparkle Diamonds */}
        <path d="M80 80 L86 86 L80 92 L74 86 Z" fill="var(--ink)" />
        <path d="M280 90 L285 95 L280 100 L275 95 Z" fill="var(--ink)" />
        <path d="M65 240 L70 245 L65 250 L60 245 Z" fill="var(--ink)" />
      </svg>

      {/* Ghost Centered Inside Circle */}
      <div 
        style={{ 
          position: 'absolute', 
          top: '50%', 
          left: '50%', 
          transform: 'translate(-50%, -48%)',
          zIndex: 3
        }}
      >
        <MascotGhost size={size * 0.52} />
      </div>

      {/* Japanese Manga Action Bubble: ドロン！ */}
      <div 
        style={{
          position: 'absolute',
          bottom: '10px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--bg)',
          border: '2px solid var(--ink)',
          padding: '4px 18px',
          boxShadow: '3px 3px 0px var(--ink)',
          zIndex: 6
        }}
      >
        <span 
          style={{
            fontFamily: '"Inter Tight", sans-serif',
            fontWeight: 900,
            fontSize: '26px',
            letterSpacing: '0.08em',
            color: 'var(--ink)'
          }}
        >
          ドロン！
        </span>
      </div>
    </div>
  );
}
