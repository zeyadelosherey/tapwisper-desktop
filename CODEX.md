# CODEX.md -- TapWisper Desktop

This file provides context for OpenAI Codex and other AI agents working on this project.

## Project Summary

TapWisper Desktop is an open-source, system-wide voice dictation tool with AI. It is an Electron 33 desktop app with a React 19 renderer, TypeScript, and Tailwind CSS. Features include voice dictation, AI text transformations, custom actions, voice triggers, text snippets, and voice notes.

## Tech Stack

- Electron 33 (main process + preload + renderer)
- React 19 with functional components and hooks
- TypeScript 5.7 (strict, no `any`)
- Tailwind CSS 3.4 for styling
- Zustand 5 for state management
- electron-store for config persistence
- better-sqlite3 for SQLite database
- Framer Motion for animations
- i18next for internationalization (6 languages)
- electron-vite (Vite 6) for builds
- uiohook-napi for global keyboard shortcuts

## Directory Structure

```
src/
  main/              # Electron main process
    index.ts         # App entry, tray, lifecycle
    windows.ts       # Window creation and management
    shortcuts.ts     # Global keyboard shortcuts (uiohook-napi)
    ipc-handlers.ts  # IPC communication handlers
    clipboard.ts     # Clipboard operations
    audio.ts         # Audio recording/encoding
    database.ts      # SQLite operations (better-sqlite3)
    store.ts         # Config storage (electron-store)
    permissions.ts   # Platform-aware permission checking (mic, accessibility, screen recording)
    trigger-actions.ts  # Voice trigger execution
    constants.ts     # Timing constants
  preload/
    index.ts         # contextBridge: exposes window.tapwisper.* to renderer
  renderer/
    components/      # Overlay UI (recording-pill, pinned-panel, command-popup, ai-suggestion-panel)
    pages/           # Settings pages (onboarding, home, settings, triggers, notes, snippets, actions-config)
    services/        # AI clients: gemini.ts, openai.ts, claude.ts, together.ts, whisper.ts, soniox.ts, ai-router.ts
    hooks/           # use-audio.ts, use-ai-action.ts, use-shortcuts.ts
    store/           # Zustand stores: stats.ts, activity.ts
    models/          # TypeScript interfaces: trigger.ts, note.ts, snippet.ts, actions-config.ts
    constants/       # colors.ts, providers.ts
    utils/           # formatting.ts
    i18n/            # Locale files: en.ts, ar.ts, de.ts, es.ts, fr.ts, it.ts
    styles/          # globals.css (CSS variables for theming)
    types/           # global.d.ts
    assets/          # Provider logos
```

## Commands

```bash
npm run dev          # Start dev server with hot reload
npm run build        # Production build
npm run typecheck    # TypeScript type check
npm run lint         # ESLint
npm run format       # Prettier format
npm run dist:mac     # Package macOS (DMG + ZIP)
npm run dist:win     # Package Windows (NSIS)
npm run dist:linux   # Package Linux (AppImage)
```

Run `npm run typecheck && npm run lint` before every commit.

## Coding Standards

### Naming
- Files: kebab-case (`my-component.tsx`, `use-audio.ts`)
- Component exports: PascalCase (`MyComponent`)
- Hooks/utils/variables: camelCase (`useAudio`, `formatDuration`)

### TypeScript
- No `any` types -- use proper interfaces and types
- `interface` for object shapes; `type` for unions and intersections
- Shared types in `src/renderer/models/` or `src/renderer/types/`
- Unused parameters prefixed with `_`

### React
- Functional components with hooks only
- Overlay components loaded via `React.lazy()`
- Hash-based routing for multi-window rendering
- Custom hooks in `src/renderer/hooks/`

### Styling
- Tailwind CSS utility classes
- Theme colors via CSS variables in `src/renderer/styles/globals.css`
- Custom theme config in `tailwind.config.js`

### Internationalization
- All user-facing strings use `useTranslation()` from react-i18next
- Translations must be added to all 6 locale files in `src/renderer/i18n/`

## Formatting (Prettier)

- No semicolons
- Single quotes
- No trailing commas
- 100 char print width
- 2-space indent
- LF line endings

## Linting (ESLint)

- `@typescript-eslint/no-explicit-any`: warn
- `@typescript-eslint/no-unused-vars`: warn (`_` prefix ignored)
- `no-console`: warn

## Architecture Patterns

### IPC
Renderer communicates with main process exclusively via `window.tapwisper.*`, exposed through contextBridge in `src/preload/index.ts`. Never use `ipcRenderer` directly in renderer code.

### AI Router
`src/renderer/services/ai-router.ts` reads the user's configured provider from electron-store and dispatches to the correct provider module. Each provider exports a single async function.

### Multi-Window
5 windows: 1 main settings window + 4 overlay windows (recording pill, pinned panel, command popup, AI panel). Overlays are pre-created at startup and shown/hidden as needed.

### Onboarding & Permissions
On first launch, the main window shows an onboarding screen (`src/renderer/pages/onboarding.tsx`) listing required system permissions. The list is platform-aware: macOS shows microphone, accessibility, and screen recording; Windows/Linux shows only microphone. Permission logic lives in `src/main/permissions.ts`, exposed via `window.tapwisper.permissions.check()` and `window.tapwisper.permissions.request(type)`. Onboarding completion is stored as `onboardingCompleted` in electron-store.

### State
- Zustand stores in `src/renderer/store/` for UI state
- electron-store (via IPC) for persistent config (API keys, preferences)

### Path Alias
`@/` resolves to `src/renderer/` (configured in `electron.vite.config.ts`).

## Important Notes

- Never use `any` -- the linter warns on it
- Avoid `console.log` -- it is stripped in production builds and linted as a warning
- Always add translations to all 6 locale files when adding user-facing text
- API keys are stored in electron-store; never log or expose them
- `better-sqlite3` is a native module externalized from the bundle
- Overlay windows are frameless and transparent
- Git branches: `feat/`, `fix/`, `refactor/`, `docs/` prefixes
- Commits: conventional format (`feat: ...`, `fix: ...`, `refactor: ...`)
