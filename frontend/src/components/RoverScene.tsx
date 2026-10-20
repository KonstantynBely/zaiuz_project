export function RoverScene() {
  return (
    <svg className="rover-scene" viewBox="0 0 690 360" role="img" aria-label="Ilustracja łazika na tle marsjańskiego krajobrazu">
      <defs>
        <linearGradient id="mars-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6f5553" />
          <stop offset="55%" stopColor="#ce8e69" />
          <stop offset="100%" stopColor="#f5bd82" />
        </linearGradient>
        <linearGradient id="mars-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9c603c" />
          <stop offset="100%" stopColor="#493024" />
        </linearGradient>
        <linearGradient id="rover-metal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e4ded1" />
          <stop offset="53%" stopColor="#97958b" />
          <stop offset="100%" stopColor="#5b625e" />
        </linearGradient>
        <radialGradient id="mars-light" cx="0.72" cy="0.35" r="0.7">
          <stop offset="0%" stopColor="#ffcc96" stopOpacity=".48" />
          <stop offset="100%" stopColor="#ffcc96" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="690" height="360" fill="url(#mars-sky)" />
      <rect width="690" height="360" fill="url(#mars-light)" />
      <g opacity=".27" fill="#ffe0b6">
        <path d="M78 76l46-8 41 5 15 6-57-1zM383 51l41-6 33 6-25 3zM542 95l39-6 52 5-62 5z" />
        <path d="M224 110l33-3 31 4-31 3zM43 126l51-4 34 4-46 2z" />
      </g>
      <path d="M0 223L42 205l59 9 72-15 65 8 81-19 82 9 69-22 74 12 70-42 76-3v218H0z" fill="#985f46" opacity=".68"/>
      <path d="M0 239l69-10 60 3 100-23 74 16 72-12 77 14 75-31 89 1 74-12v175H0z" fill="#855039"/>
      <path d="M0 272l72-12 104 4 88-13 77 9 116-17 83 13 91-18 59 7v115H0z" fill="url(#mars-ground)"/>
      <path d="M0 304q140-19 270-4t420-11v71H0z" fill="#65402c" opacity=".8"/>
      <g opacity=".38" fill="#d28b52">
        <ellipse cx="57" cy="300" rx="19" ry="3"/><ellipse cx="167" cy="287" rx="15" ry="2"/>
        <ellipse cx="527" cy="315" rx="30" ry="4"/><ellipse cx="631" cy="283" rx="13" ry="3"/>
        <ellipse cx="391" cy="331" rx="27" ry="4"/>
      </g>
      <g transform="translate(153 105)">
        <ellipse cx="208" cy="218" rx="169" ry="24" fill="#2b1f1b" opacity=".27"/>
        <g stroke="#444945" strokeWidth="9" strokeLinecap="round" fill="none">
          <path d="M109 132l-34 54 32 20 91-54 90 54 34-21-35-54"/>
          <path d="M96 186l89-39 116 40"/>
        </g>
        <g fill="#292e2a" stroke="#555e59" strokeWidth="5">
          <ellipse cx="80" cy="203" rx="30" ry="41"/>
          <ellipse cx="184" cy="210" rx="30" ry="40"/>
          <ellipse cx="311" cy="203" rx="31" ry="42"/>
        </g>
        <g stroke="#69716b" strokeWidth="3" opacity=".8">
          <path d="M60 180l37 49M57 198l43 22M163 191l40 44M160 211l43 7M291 182l42 48M290 201l44 17"/>
        </g>
        <g fill="url(#rover-metal)" stroke="#525b56" strokeWidth="4" strokeLinejoin="round">
          <path d="M101 105l71-32 127 15 23 55-76 22-112-10z"/>
          <path d="M132 103l41-18 92 11-12 46-100 4z" fill="#a4a79e"/>
          <path d="M103 108l38-7 9 54-42-10z"/>
          <path d="M288 108l49 14-15 31-41-11z"/>
        </g>
        <g stroke="#747f77" strokeWidth="7" strokeLinecap="round">
          <path d="M207 86l-16-65-9-2"/>
          <path d="M191 22l-12-11"/>
          <path d="M242 86l31-45 33-7"/>
        </g>
        <g fill="#e4ded2" stroke="#636a64" strokeWidth="3">
          <rect x="158" y="-12" width="79" height="38" rx="5"/>
          <rect x="169" y="27" width="57" height="9" rx="2" fill="#858d86"/>
          <rect x="298" y="24" width="28" height="25" rx="3"/>
        </g>
        <g fill="#323936">
          <circle cx="179" cy="7" r="9"/><circle cx="208" cy="7" r="9"/>
          <circle cx="313" cy="36" r="5"/>
        </g>
        <g stroke="#555d58" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M139 137l-54 27-33 35-41 5"/>
          <path d="M82 169l29 19 49-12"/>
        </g>
        <g fill="#9da29a" stroke="#424b47" strokeWidth="3">
          <path d="M7 188l64-7 19 17-36 21-59-2z"/>
          <rect x="156" y="174" width="39" height="14" rx="4"/>
        </g>
        <path d="M134 124l155 8" stroke="#e2d2ba" strokeWidth="4" opacity=".8" />
      </g>
      <path d="M0 346q166-29 331-5t359-3v22H0z" fill="#3e2922" opacity=".75"/>
    </svg>
  );
}
