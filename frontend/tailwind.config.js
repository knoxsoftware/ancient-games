/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fef3e2',
          100: '#fde2b8',
          200: '#fbd089',
          300: '#f9be5a',
          400: '#f8b037',
          500: '#f7a214',
          600: '#f69a12',
          700: '#f48f0e',
          800: '#f3850b',
          900: '#f07406',
        },
        secondary: {
          50: '#e8f4f8',
          100: '#c5e3ed',
          200: '#9fd1e1',
          300: '#79bfd5',
          400: '#5cb1cc',
          500: '#3fa3c3',
          600: '#399bbd',
          700: '#3191b5',
          800: '#2988ad',
          900: '#1b779f',
        },
      },
    },
  },
  plugins: [],
};
