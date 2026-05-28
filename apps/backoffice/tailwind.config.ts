import { tailwindBasePreset } from '@simpletpv/web-config/tailwind';
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  presets: [tailwindBasePreset as Config],
} satisfies Config;
