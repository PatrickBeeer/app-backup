/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          gold: '#D4AF37',
          'gold-light': '#F3E5AB',
          'gold-dark': '#997A15',
          dark: '#0B0D12',
          panel: '#13161F',
          card: '#1A1D28',
        },
      },
    },
  },
  plugins: [],
};
