/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // "Paper & Signal" semantic tokens (see src/renderer/styles/globals.css)
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        raised: 'rgb(var(--raised) / <alpha-value>)',
        panel: 'rgb(var(--panel) / <alpha-value>)',
        sunken: 'rgb(var(--sunken) / <alpha-value>)',
        hover: 'rgb(var(--hover) / <alpha-value>)',
        hairline: {
          DEFAULT: 'rgb(var(--hairline) / <alpha-value>)',
          strong: 'rgb(var(--hairline-strong) / <alpha-value>)'
        },
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          muted: 'rgb(var(--ink-muted) / <alpha-value>)',
          soft: 'rgb(var(--ink-soft) / <alpha-value>)',
          faint: 'rgb(var(--ink-faint) / <alpha-value>)'
        },
        signal: {
          DEFAULT: 'rgb(var(--signal) / <alpha-value>)',
          strong: 'rgb(var(--signal-strong) / <alpha-value>)',
          tint: 'rgb(var(--signal-tint) / <alpha-value>)'
        },
        'on-signal': 'rgb(var(--on-signal) / <alpha-value>)',
        ember: 'rgb(var(--ember) / <alpha-value>)',
        danger: {
          DEFAULT: 'rgb(var(--danger) / <alpha-value>)',
          tint: 'rgb(var(--danger-tint) / <alpha-value>)'
        },
        success: {
          DEFAULT: 'rgb(var(--success) / <alpha-value>)',
          tint: 'rgb(var(--success-tint) / <alpha-value>)'
        },
        warning: {
          DEFAULT: 'rgb(var(--warning) / <alpha-value>)',
          tint: 'rgb(var(--warning-tint) / <alpha-value>)'
        },
        capsule: {
          DEFAULT: 'rgb(var(--capsule) / <alpha-value>)',
          signal: 'rgb(var(--capsule-signal) / <alpha-value>)'
        },
        // Older names, kept as aliases of the tokens above
        sky: {
          accent: 'rgb(var(--signal) / <alpha-value>)'
        },
        green: {
          accent: 'rgb(var(--success) / <alpha-value>)'
        },
        recording: {
          red: 'rgb(var(--danger) / <alpha-value>)'
        },
        theme: {
          bg: 'rgb(var(--color-theme-bg) / <alpha-value>)',
          surface: 'rgb(var(--color-theme-surface) / <alpha-value>)',
          card: 'rgb(var(--color-theme-card) / <alpha-value>)',
          border: 'rgb(var(--color-theme-border) / <alpha-value>)',
          text: 'rgb(var(--color-theme-text) / <alpha-value>)',
          'text-secondary': 'rgb(var(--color-theme-text-secondary) / <alpha-value>)',
          'text-tertiary': 'rgb(var(--color-theme-text-tertiary) / <alpha-value>)',
          'text-muted': 'rgb(var(--color-theme-text-muted) / <alpha-value>)'
        }
      },
      // Extra steps used across the UI (e.g. bg-sky-accent/8, bg-white/12)
      // that aren't on Tailwind's default 5%-step opacity scale.
      opacity: {
        8: '0.08',
        12: '0.12',
        45: '0.45'
      },
      spacing: {
        4.5: '1.125rem'
      },
      borderRadius: {
        panel: '12px',
        pill: '20px',
        sheet: '20px'
      },
      fontFamily: {
        sans: [
          'Inter Variable',
          'IBM Plex Sans Arabic',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif'
        ],
        serif: ['Fraunces Variable', 'IBM Plex Sans Arabic', 'Georgia', 'serif'],
        arabic: ['IBM Plex Sans Arabic', 'Inter Variable', 'system-ui', 'sans-serif']
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
        'slide-down': 'slide-down 0.3s ease-out',
        rise: 'rise 0.32s cubic-bezier(0.2, 0.7, 0.2, 1) backwards',
        'wave-drift': 'wave-drift 6s linear infinite',
        'live-pulse': 'live-pulse 1.6s ease-in-out infinite'
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
        },
        rise: {
          '0%': { transform: 'translateY(6px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        },
        'wave-drift': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' }
        },
        'live-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' }
        }
      }
    }
  },
  plugins: []
}
