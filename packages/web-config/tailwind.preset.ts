import type { Config } from 'tailwindcss';

export const tailwindBasePreset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0ea5e9',
          foreground: '#ffffff',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
};
