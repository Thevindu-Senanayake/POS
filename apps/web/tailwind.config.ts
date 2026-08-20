import type { Config } from 'tailwindcss';

/**
 * Touch-first "Warm Hospitality" POS theme: a warm cream surface with a deep
 * teal brand and gold accents (boutique-hotel feel). `brand` is teal so every
 * existing `brand-*` class re-themes for free; `accent` is gold for focus rings
 * and hero CTAs; `sand` is the warm neutral used for surfaces and hairlines. A
 * `min-h-touch`/`min-w-touch` token (44px) keeps finger targets comfortable.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Deep teal — the primary brand. Drop-in replacement for the old indigo
        // `brand` scale, so buttons, tabs, focus rings and the wordmark follow.
        brand: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
        // Gold — secondary accent for hero CTAs, highlights and "from" prices.
        accent: {
          50: '#fbf8ec',
          100: '#f6edc9',
          200: '#eedb96',
          300: '#e4c356',
          400: '#d9ae2f',
          500: '#d4a017',
          600: '#a97d12',
          700: '#855f13',
          800: '#6f4e16',
          900: '#5e4116',
        },
        // Warm cream neutral — app surface, cards and hairlines.
        sand: {
          50: '#faf7f2',
          100: '#f4efe6',
          200: '#e9e0d1',
          300: '#d8cab4',
          400: '#c2ad90',
        },
      },
      backgroundImage: {
        // Reusable gradient tokens (no ad-hoc gradients at call sites).
        'brand-gradient': 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)',
        'sand-gradient': 'linear-gradient(160deg, #faf7f2 0%, #f0fdfa 100%)',
        'accent-gradient': 'linear-gradient(135deg, #b7860b 0%, #d4a017 100%)',
      },
      boxShadow: {
        // Soft, warm-tinted elevation for cards and floating chrome.
        card: '0 1px 2px rgba(120, 100, 70, 0.06), 0 6px 16px -8px rgba(120, 100, 70, 0.18)',
        'card-hover': '0 2px 4px rgba(120, 100, 70, 0.08), 0 12px 28px -10px rgba(15, 118, 110, 0.28)',
      },
      spacing: {
        touch: '44px',
      },
      minHeight: {
        touch: '44px',
      },
      minWidth: {
        touch: '44px',
      },
      keyframes: {
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96) translateY(6px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
      },
      animation: {
        'scale-in': 'scale-in 0.16s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
