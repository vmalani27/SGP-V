const typography = require('@tailwindcss/typography');

/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#07111f',
        panel: '#0d1a2d',
        panelSoft: '#10233d',
        line: 'rgba(148, 163, 184, 0.14)',
        accent: '#60a5fa',
        accentStrong: '#60a5fa',
        text: '#e8f1ff',
        muted: '#9fb2cc',
      },
      boxShadow: {},
      backgroundImage: {},
    },
  },
  plugins: [typography],
};

module.exports = config;
