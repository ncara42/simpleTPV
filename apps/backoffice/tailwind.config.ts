import type { Config } from 'tailwindcss';

import { tailwindBasePreset } from '@simpletpv/web-config/tailwind';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  presets: [tailwindBasePreset as Config],
} satisfies Config;
