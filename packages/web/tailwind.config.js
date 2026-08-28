/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        ink: {
          950: '#0a0c12',
          900: '#0d0f16',
          850: '#12151f',
          800: '#171b28',
          700: '#222738',
          600: '#2f3547',
        },
      },
    },
  },
  plugins: [],
};
