import type { Config } from 'tailwindcss';
import { posPreset } from '../../../packages/client-core/src/tailwind-preset';

/**
 * Till POS UI Tailwind config. The theme lives in @pos/client-core's shared
 * preset so the till and the admin web app can never drift. `content` MUST scan
 * the client-core source too, or the classes used by shared components
 * (Button/Modal/Spinner/AuthGate/RealtimeIndicator) get purged.
 */
const config: Config = {
  presets: [posPreset],
  content: [
    './src/**/*.{ts,tsx,mdx}',
    '../../../packages/client-core/src/**/*.{ts,tsx}',
  ],
  plugins: [],
};

export default config;
