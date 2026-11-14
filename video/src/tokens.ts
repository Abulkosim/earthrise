// Written with AI assistance (Claude); see the README.
// Earthrise design tokens, taken from app/src/index.css (interface version 2) (the product's own design system).
// Colour carries meaning and nothing else: gold is the Sun, blue is the Earth; the rest is regolith grey or true black.
export const C = {
  shadow: '#000000',
  ground1: '#1c1b1a',
  ground2: '#272624',
  ground3: '#3a3835',
  dust1: '#f2eee6',
  dust2: '#b8b3a9',
  dust3: '#7f7a72',
  sun: '#f5c96a',
  sunDim: '#8a7240',
  earth: '#7db8f0',
  earthDim: '#3f6488',
  both: '#f4f1e8',
} as const;

export const FONT = {
  ui: "'Archivo Variable', 'Helvetica Neue', Arial, sans-serif",
  place: "'Source Serif 4 Variable', Georgia, serif",
} as const;

// Caption sizes, measured in output pixels at 1080p (aesthetic rule Q11: caption >= 56 px, secondary >= 32 px;
// the team's own floor is 40 px for anything meant to be read).
export const T = {
  caption: 58,
  sub: 42,
  title: 76,
  kicker: 44,
  wordmark: 168,
} as const;

export const SAFE_X = 112; // left edge of the caption grid
