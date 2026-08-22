import type { Config } from 'tailwindcss';

/**
 * Shared "Warm Hospitality" POS theme, consumed as a Tailwind preset by BOTH the
 * admin web app and the Electron till UI so the two can never drift on brand
 * (deep teal), accent (gold), sand (warm cream) colors, gradient/elevation
 * tokens, the 44px touch target, or the scale-in animation. Each app supplies
 * its own `content` globs — and each MUST include this package's `src` so the
 * classes used by shared components (Button/Modal/Spinner/etc.) survive purge.
 */
export const posPreset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        // Deep teal — the primary brand. Every `brand-*` class re-themes for free.
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

export default posPreset;
