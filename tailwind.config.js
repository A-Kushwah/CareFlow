/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f7ff',
          100: '#e0effe',
          200: '#bae0fd',
          500: '#0284c7',
          600: '#0265d2',
          700: '#034ea2',
          800: '#074080',
          900: '#0c3566',
        },
        tealAccent: {
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
        },
        emeraldStatus: {
          500: '#10b981',
          600: '#059669',
        },
        roseAlert: {
          500: '#f43f5e',
          600: '#e11d48',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
