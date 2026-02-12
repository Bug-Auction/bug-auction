/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bug: {
          primary: '#22c55e',
          accent: '#f97316',
          dark: '#020617'
        }
      }
    }
  },
  plugins: []
}
