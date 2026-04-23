/**
 * Manejarr Logo — Digital Parrot SVG
 * 
 * A stylized geometric/digital parrot rendered as inline SVG.
 */

export function logoSVG(size = 36) {
  return `
  <svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- Body -->
    <path d="M20 58 C16 58 14 54 14 50 L14 36 C14 28 20 22 28 20 L28 16 C28 10 34 6 40 8 C44 9.5 46 13 46 17 L46 20 C50 22 52 26 52 30 L52 42 C52 50 46 56 38 58 Z" 
          fill="url(#bodyGrad)" />
    
    <!-- Wing -->
    <path d="M18 36 C18 32 22 28 28 28 L28 48 C22 48 18 44 18 40 Z" 
          fill="url(#wingGrad)" opacity="0.85" />
    
    <!-- Wing detail lines -->
    <line x1="22" y1="32" x2="28" y2="32" stroke="rgba(255,255,255,0.15)" stroke-width="0.8"/>
    <line x1="20" y1="36" x2="28" y2="36" stroke="rgba(255,255,255,0.12)" stroke-width="0.8"/>
    <line x1="20" y1="40" x2="28" y2="40" stroke="rgba(255,255,255,0.1)" stroke-width="0.8"/>
    <line x1="22" y1="44" x2="28" y2="44" stroke="rgba(255,255,255,0.08)" stroke-width="0.8"/>

    <!-- Head -->
    <ellipse cx="40" cy="16" rx="10" ry="11" fill="url(#headGrad)" />
    
    <!-- Digital circuit pattern on head -->
    <path d="M34 12 L37 12 L37 10 L40 10" stroke="rgba(255,255,255,0.2)" stroke-width="0.6" fill="none"/>
    <path d="M36 18 L39 18 L39 20" stroke="rgba(255,255,255,0.15)" stroke-width="0.6" fill="none"/>
    <circle cx="34" cy="12" r="0.8" fill="rgba(255,255,255,0.3)"/>
    <circle cx="40" cy="10" r="0.8" fill="rgba(255,255,255,0.3)"/>
    
    <!-- Eye -->
    <circle cx="43" cy="14" r="3.5" fill="#0f172a" />
    <circle cx="43" cy="14" r="2.5" fill="#e2e8f0" />
    <circle cx="43" cy="14" r="1.5" fill="#0f172a" />
    <circle cx="44" cy="13" r="0.7" fill="#fff" />
    
    <!-- Beak -->
    <path d="M48 15 L56 13 L54 17 L48 17 Z" fill="url(#beakGrad)" />
    <line x1="48" y1="16" x2="54" y2="15.5" stroke="rgba(0,0,0,0.2)" stroke-width="0.5"/>

    <!-- Crest / digital mohawk -->
    <path d="M34 7 L32 2 L36 5 L34 1 L38 4 L37 0 L40 5" 
          stroke="url(#crestGrad)" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    
    <!-- Tail feathers -->
    <path d="M22 54 L16 62 L20 56" fill="url(#tailGrad1)" opacity="0.9"/>
    <path d="M26 56 L22 64 L26 58" fill="url(#tailGrad2)" opacity="0.85"/>
    <path d="M30 56 L28 63 L31 57" fill="url(#tailGrad1)" opacity="0.75"/>
    
    <!-- Feet -->
    <path d="M30 56 L28 60 L26 60 M28 60 L30 61" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round" fill="none"/>
    <path d="M38 56 L36 60 L34 60 M36 60 L38 61" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round" fill="none"/>
    
    <!-- Digital glow pixels -->
    <rect x="16" y="30" width="1.5" height="1.5" rx="0.3" fill="#6366f1" opacity="0.6"/>
    <rect x="50" y="34" width="1.5" height="1.5" rx="0.3" fill="#8b5cf6" opacity="0.5"/>
    <rect x="24" y="50" width="1.5" height="1.5" rx="0.3" fill="#a78bfa" opacity="0.4"/>
    <rect x="44" y="46" width="1.5" height="1.5" rx="0.3" fill="#6366f1" opacity="0.4"/>
    
    <!-- Gradients -->
    <defs>
      <linearGradient id="bodyGrad" x1="14" y1="20" x2="52" y2="58">
        <stop offset="0%" stop-color="#6366f1" />
        <stop offset="50%" stop-color="#7c3aed" />
        <stop offset="100%" stop-color="#2dd4bf" />
      </linearGradient>
      <linearGradient id="headGrad" x1="30" y1="6" x2="50" y2="26">
        <stop offset="0%" stop-color="#818cf8" />
        <stop offset="100%" stop-color="#6366f1" />
      </linearGradient>
      <linearGradient id="wingGrad" x1="18" y1="28" x2="28" y2="48">
        <stop offset="0%" stop-color="#4f46e5" />
        <stop offset="100%" stop-color="#0d9488" />
      </linearGradient>
      <linearGradient id="beakGrad" x1="48" y1="13" x2="56" y2="17">
        <stop offset="0%" stop-color="#fbbf24" />
        <stop offset="100%" stop-color="#f59e0b" />
      </linearGradient>
      <linearGradient id="crestGrad" x1="32" y1="0" x2="40" y2="7">
        <stop offset="0%" stop-color="#f43f5e" />
        <stop offset="50%" stop-color="#f59e0b" />
        <stop offset="100%" stop-color="#6366f1" />
      </linearGradient>
      <linearGradient id="tailGrad1" x1="16" y1="54" x2="22" y2="64">
        <stop offset="0%" stop-color="#6366f1" />
        <stop offset="100%" stop-color="#2dd4bf" />
      </linearGradient>
      <linearGradient id="tailGrad2" x1="22" y1="56" x2="26" y2="64">
        <stop offset="0%" stop-color="#8b5cf6" />
        <stop offset="100%" stop-color="#f59e0b" />
      </linearGradient>
    </defs>
  </svg>`;
}

/**
 * Small logo mark for favicon-like usage.
 */
export function logoMark(size = 24) {
  return logoSVG(size);
}
