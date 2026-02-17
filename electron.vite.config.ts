import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const isProduction = process.env.NODE_ENV === 'production'

// Strip console.log/warn in production builds to reduce I/O overhead.
// console.error is kept for genuine error reporting via pure_funcs
// (esbuild drop: ['console'] would remove console.error too).
const prodMinify = isProduction
  ? {
      minify: 'esbuild' as const,
      esbuild: {
        drop: ['debugger' as const],
        pure: ['console.log', 'console.warn', 'console.info', 'console.debug']
      }
    }
  : {}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: ['better-sqlite3']
      },
      ...prodMinify
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      ...prodMinify
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer')
      }
    },
    plugins: [react()],
    build: {
      ...prodMinify
    }
  }
})
