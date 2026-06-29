/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Base
        base: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
        surface: {
          DEFAULT: '#141720',
          elevated: '#1c2030',
          hover: '#232840',
        },
        border: {
          DEFAULT: '#2a2f45',
          subtle: '#1e2338',
        },
        text: {
          primary: '#e8eaf0',
          secondary: '#8b91a8',
          muted: '#565c78',
        },
        accent: {
          DEFAULT: '#4f6ef7',
          hover: '#6b84ff',
          glow: 'rgba(79, 110, 247, 0.15)',
        },
        error: '#f7614f',
        warning: '#f7a84f',
        success: '#4ff7a1',
        circular: '#c44fff',
        // Language colors
        lang: {
          js: '#f7d94f',
          ts: '#4f8ef7',
          py: '#4fbbf7',
          css: '#f74f9e',
          other: '#8b91a8',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'monospace'],
        ui: ['Inter', 'system-ui', 'sans-serif'],
      },
      spacing: {
        'sidebar': '240px',
        'inspector': '320px',
      },
      borderRadius: {
        'sm': '4px',
        'md': '8px',
        'lg': '12px',
      },
      boxShadow: {
        'glow': '0 0 20px rgba(79, 110, 247, 0.15)',
        'glow-error': '0 0 20px rgba(247, 97, 79, 0.15)',
      },
      animation: {
        'spin': 'spin 0.8s linear infinite',
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
      },
      keyframes: {
        spin: {
          to: { transform: 'rotate(360deg)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideIn: {
          from: { transform: 'translateX(20px)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}