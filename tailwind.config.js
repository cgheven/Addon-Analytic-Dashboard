/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['DM Sans', 'sans-serif'] },
      colors: {
        dark: {
          900: '#0a0c12',
          800: '#0d0f17',
          700: '#12151f',
          600: '#161925',
          500: '#1a1d2e',
          400: '#1e2236',
          300: '#252840',
          200: '#2e3149',
        },
        brand: '#6366f1',
      },
    },
  },
  plugins: [],
}
