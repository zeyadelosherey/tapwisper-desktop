/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        sky: {
          accent: '#7EB6E0'
        },
        cream: '#F8F6F1',
        dark: {
          bg: '#000000',
          surface: '#202020',
          card: '#0E0E0E',
          border: '#262626',
          primary: '#000000'
        },
        green: {
          accent: '#4DC778'
        },
        recording: {
          red: '#F04545'
        },
        input: {
          bg: '#F5F5F5'
        },
        // Theme-aware colors (switch automatically between light/dark)
        // Uses rgb channel format for Tailwind opacity modifier support (e.g. bg-theme-bg/50)
        theme: {
          bg: 'rgb(var(--color-theme-bg) / <alpha-value>)',
          surface: 'rgb(var(--color-theme-surface) / <alpha-value>)',
          card: 'rgb(var(--color-theme-card) / <alpha-value>)',
          border: 'rgb(var(--color-theme-border) / <alpha-value>)',
          text: 'rgb(var(--color-theme-text) / <alpha-value>)',
          'text-secondary': 'rgb(var(--color-theme-text-secondary) / var(--tw-text-secondary-alpha))',
          'text-tertiary': 'rgb(var(--color-theme-text-tertiary) / var(--tw-text-tertiary-alpha))',
          'text-muted': 'rgb(var(--color-theme-text-muted) / var(--tw-text-muted-alpha))'
        }
      },
      borderRadius: {
        panel: '12px',
        pill: '20px'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        serif: ['Georgia', 'Cambria', 'Times New Roman', 'Times', 'serif'],
        arabic: ['SF Arabic', 'Geeza Pro', 'Arial', 'sans-serif']
      },
      animation: {
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'ripple': 'ripple 1.5s ease-out infinite',
        'waveform': 'waveform 0.5s ease-in-out infinite alternate',
        'fade-in': 'fade-in 0.2s ease-out',
        'fade-out': 'fade-out 0.2s ease-in',
        'scale-up': 'scale-up 0.2s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
        'breathe': 'breathe 2s ease-in-out infinite',
        'slide-down': 'slide-down 0.3s ease-out'
      },
      keyframes: {
        'pulse-ring': {
          '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%': { opacity: '0.2', transform: 'scale(1.15)' }
        },
        'ripple': {
          '0%': { transform: 'scale(0.8)', opacity: '0.6' },
          '100%': { transform: 'scale(2.5)', opacity: '0' }
        },
        'waveform': {
          '0%': { height: '20%' },
          '100%': { height: '80%' }
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        'fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' }
        },
        'scale-up': {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' }
        },
        'slide-up': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        },
        'breathe': {
          '0%, 100%': { opacity: '0.7' },
          '50%': { opacity: '1' }
        },
        'slide-down': {
          '0%': { transform: 'translateY(-8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        }
      }
    }
  },
  plugins: []
}
