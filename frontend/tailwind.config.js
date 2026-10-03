/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        wood: { 50: '#faf6f1', 100: '#f2e8dc', 500: '#a9743f', 700: '#6f4a26', 900: '#3d2814' }
      }
    }
  },
  plugins: []
}
