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
        bg: '#0f1419',
        panel: '#1a2332',
        panelSoft: '#22303f',
        line: 'rgba(148, 163, 184, 0.18)',
        accent: '#60a5fa',
        accentStrong: '#93c5fd',
        text: '#e2e8f0',
        muted: '#94a3b8',
      },
      boxShadow: {},
      backgroundImage: {},
    },
  },
  plugins: [typography],
};

module.exports = config;
