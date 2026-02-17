# CLAUDE.md -- TapWisper Desktop

This file provides context for Claude Code (the `claude` CLI agent) when working on this project.

## Project Summary

TapWisper Desktop is an open-source, system-wide voice dictation tool with AI, built with **Electron 33**, **React 19**, **TypeScript 5.7**, and **Tailwind CSS 3.4**. It provides voice dictation, AI text transformations, custom actions, voice triggers, text snippets, and voice notes. It supports multiple AI providers (Gemini, Together AI, OpenAI, Claude) and voice providers (Together Whisper, Soniox).

## Architecture

```
Electron Main Process (src/main/)
  ├── System tray, global shortcuts (uiohook-napi)
  ├── Window management (main window + 4 overlay windows)
  ├── IPC handlers (ipcMain.handle / ipcMain.on)
  ├── Clipboard operations
  ├── Audio recording/encoding
  ├── Permission checking (microphone, accessibility, screen recording)
  ├── SQLite database (better-sqlite3)
  └── Config store (electron-store)

Preload Script (src/preload/)
  └── contextBridge → exposes window.tapwisper.* API

Renderer Process (src/renderer/)
  ├── components/    Overlay UI (recording pill, pinned panel, command popup, AI panel)
  ├── pages/         Settings pages (onboarding, home, settings, triggers, notes, snippets, actions)
  ├── services/      AI provider clients + ai-router.ts
  ├── hooks/         use-audio.ts, use-ai-action.ts, use-shortcuts.ts
  ├── store/         Zustand stores (stats.ts, activity.ts)
  ├── models/        TypeScript type definitions
  ├── constants/     colors.ts, providers.ts
  ├── utils/         formatting.ts
  ├── i18n/          Translations (en, ar, de, es, fr, it)
  ├── assets/        Provider logos
  ├── styles/        globals.css (CSS variables for theming)
  └── types/         global.d.ts
```

## Commands

```bash
npm run dev          # Development mode with hot reload
npm run build        # Production build
npm run typecheck    # TypeScript type checking (run before committing)
npm run lint         # ESLint
npm run format       # Prettier formatting
npm run dist:mac     # Package for macOS
npm run dist:win     # Package for Windows
npm run dist:linux   # Package for Linux
```

Always run `npm run typecheck && npm run lint` before committing.

## Coding Conventions

### File Naming
- **kebab-case** for all files: `my-component.tsx`, `use-audio.ts`
- **PascalCase** for component exports: `export function MyComponent()`
- **camelCase** for hooks, utilities, variables: `useAudio`, `formatDuration`

### TypeScript
- Never use `any` -- use proper types
- `interface` for object shapes, `type` for unions/intersections
- Shared types go in `src/renderer/models/` or `src/renderer/types/`
- Prefix unused parameters with `_`

### React
- Functional components only
- Extract reusable logic into hooks in `src/renderer/hooks/`
- Use `React.lazy()` for overlay components
- Hash-based routing for multi-window rendering

### Styling
- Tailwind CSS utility classes only
- Theme colors use CSS variables from `src/renderer/styles/globals.css`
- Custom theme values in `tailwind.config.js`

### Internationalization
- All user-facing strings use `useTranslation()` from react-i18next
- Add translations to all 6 locale files in `src/renderer/i18n/`

## Formatting Rules

Enforced by Prettier (`.prettierrc`):
- No semicolons
- Single quotes
- No trailing commas
- 100 character print width
- 2-space indentation
- LF line endings

## ESLint Rules

From `.eslintrc.cjs`:
- `@typescript-eslint/no-explicit-any`: warn
- `@typescript-eslint/no-unused-vars`: warn (ignored with `_` prefix)
- `no-console`: warn

## Key Patterns

### IPC Communication
All renderer-to-main communication uses `window.tapwisper.*` (exposed via contextBridge in `src/preload/index.ts`). Never use `ipcRenderer` directly.

### AI Router
`src/renderer/services/ai-router.ts` is the central dispatch for AI requests. It reads the user's configured provider from electron-store and routes to the correct service module. Each provider exports a single async function (`processWithGemini`, `processWithOpenAI`, etc.).

### Multi-Window
The app has 5 windows: main settings window + 4 overlay windows (recording pill, pinned panel, command popup, AI panel). Overlays are pre-warmed at startup and use hash-based routing.

### Onboarding & Permissions
On first launch, the main window shows an onboarding screen (`src/renderer/pages/onboarding.tsx`) that lists required system permissions. The permission list is platform-aware: macOS shows microphone, accessibility, and screen recording; Windows/Linux shows only microphone. Permission checking is handled by `src/main/permissions.ts` and exposed via `window.tapwisper.permissions.*`. The onboarding state is stored in electron-store as `onboardingCompleted`.

### State Management
Zustand stores in `src/renderer/store/`. Config data lives in electron-store (accessed via `window.tapwisper.store.*`).

### Path Alias
`@/` maps to `src/renderer/` (configured in `electron.vite.config.ts`).

## Git Branching Strategy (Git Flow)

### Primary Branches

- **`main`** -- Production-ready releases. Always stable and tagged with `vX.Y.Z`.
- **`develop`** -- Integration branch. All feature work branches from here and merges back here.

### Supporting Branch Prefixes

| Prefix | Branch From | Merge Into | Example |
|--------|-------------|------------|---------|
| `feat/` | `develop` | `develop` | `feat/voice-trigger-editing` |
| `fix/` | `develop` | `develop` | `fix/audio-recording-crash` |
| `refactor/` | `develop` | `develop` | `refactor/extract-audio-utility` |
| `docs/` | `develop` | `develop` | `docs/update-api-guide` |
| `release/vX.Y.Z` | `develop` | `main` + `develop` | `release/v1.2.0` |
| `hotfix/` | `main` | `main` + `develop` | `hotfix/critical-crash` |

### Workflow

1. Branch from `develop`: `git checkout -b feat/my-feature develop`
2. Commit with conventional messages: `feat: add feature`, `fix: resolve bug`
3. Open PR targeting `develop`
4. After review, merge into `develop` (delete feature branch)
5. For releases: `release/vX.Y.Z` from `develop` -> merge into `main`, tag, merge back to `develop`
6. For hotfixes: `hotfix/description` from `main` -> merge into both `main` and `develop`

### Commit Message Format

`type: short description`

Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `style`, `test`, `perf`

### Rules

- Never force-push to `main` or `develop`
- Always open a PR -- no direct pushes to `main` or `develop`
- Run `npm run typecheck && npm run lint` before pushing
- Tag every production release on `main`

## Common Pitfalls

- Do not use `any` -- the linter will warn
- Do not leave `console.log` in code -- it is stripped in production and linted as a warning
- Always add i18n translations to all 6 locale files when adding user-facing strings
- Overlay windows are frameless and transparent -- test visual changes in all overlay contexts
- API keys are stored in electron-store; never log or expose them
- The main process externalizes `better-sqlite3` -- it must be a native module, not bundled
- Always branch from `develop` for new work, never from `main` (unless hotfix)
- Delete feature branches after merge to keep the repo clean