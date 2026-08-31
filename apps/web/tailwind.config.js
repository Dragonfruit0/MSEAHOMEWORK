/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // MS Education Academy brand palette, sampled directly from their logo/site.
        brand: {
          indigo: '#2F2483',
          'indigo-dark': '#221a5e',
          green: '#00963F',
          'green-dark': '#017a34',
          orange: '#EF7F1A',
        },
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(20, 20, 43, 0.04), 0 8px 24px -12px rgba(20, 20, 43, 0.12)',
      },
    },
  },
  plugins: [],
};
