import colors from 'tailwindcss/colors';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // One neutral scale for everything; one accent used sparingly.
        gray: colors.zinc,
        accent: {
          50: '#eff4ff',
          100: '#dbe6fe',
          500: '#3b6ef6',
          600: '#2557d6',
          700: '#1d45ad',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['11px', '16px'],
      },
    },
  },
  plugins: [],
};
