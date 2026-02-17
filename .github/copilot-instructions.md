# Copilot Instructions -- TapWisper Desktop

This file provides context for GitHub Copilot and GPT-based coding assistants.

## Project Summary

TapWisper Desktop is an open-source, system-wide voice dictation tool with AI, built with **Electron 33**, **React 19**, **TypeScript 5.7**, and **Tailwind CSS 3.4**. It supports multiple AI providers (Gemini, Together AI, OpenAI, Claude) and voice providers (Together Whisper, Soniox).

## Architecture

Three Electron processes:

- **Main** (`src/main/`) -- system tray, global shortcuts, window management, IPC handlers, clipboard, audio recording, permission checking, SQLite database, config store
- **Preload** (`src/preload/`) -- context bridge exposing `window.tapwisper.*` API to the renderer
- **Renderer** (`src/renderer/`) -- React UI with Tailwind CSS, Zustand state, Framer Motion animations

Path alias: `@/` maps to `src/renderer/`.

## Coding Conventions

### File Naming

- **kebab-case** for all files: `my-component.tsx`, `use-audio.ts`
- **PascalCase** for component exports: `export function MyComponent()`
- **camelCase** for hooks, utilities, variables: `useAudio`, `formatDuration`

### TypeScript

- Never use `any` -- use proper type definitions
- `interface` for object shapes, `type` for unions and intersections
- Shared types in `src/renderer/models/` or `src/renderer/types/`
- Prefix unused parameters with `_`

### React

- Functional components only -- no class components
- Extract reusable logic into hooks in `src/renderer/hooks/`
- Use `React.lazy()` for overlay components
- Hash-based routing for multi-window rendering

### Styling

- Tailwind CSS utility classes only -- no custom CSS unless necessary
- Theme colors via CSS variables from `src/renderer/styles/globals.css`

### Internationalization

- All user-facing strings use `useTranslation()` from react-i18next
- Add translations to all 6 locale files in `src/renderer/i18n/` (en, ar, de, es, fr, it)

### Formatting (Prettier)

- No semicolons
- Single quotes
- No trailing commas
- 100 character print width
- 2-space indentation
- LF line endings
- Always use parentheses around arrow function parameters

### Linting (ESLint)

- `@typescript-eslint/no-explicit-any`: warn
- `@typescript-eslint/no-unused-vars`: warn (ignored with `_` prefix)
- `no-console`: warn

## Git Branching Strategy (Git Flow)

### Primary Branches

| Branch | Purpose |
|--------|---------|
| `main` | Production-ready releases. Always stable and tagged with `vX.Y.Z`. |
| `develop` | Integration branch. All feature work branches from here and merges back here. |

### Supporting Branches

| Prefix | Branch From | Merge Into | Example |
|--------|-------------|------------|---------|
| `feat/` | `develop` | `develop` | `feat/voice-trigger-editing` |
| `fix/` | `develop` | `develop` | `fix/audio-recording-crash` |
| `refactor/` | `develop` | `develop` | `refactor/extract-audio-utility` |
| `docs/` | `develop` | `develop` | `docs/update-api-guide` |
| `release/vX.Y.Z` | `develop` | `main` + `develop` | `release/v1.2.0` |
| `hotfix/` | `main` | `main` + `develop` | `hotfix/critical-crash` |

### Workflow

1. Create feature branch from `develop`: `git checkout -b feat/my-feature develop`
2. Commit with conventional messages (see below)
3. Open a PR targeting `develop`
4. After review and CI pass, merge into `develop`
5. For releases: create `release/vX.Y.Z` from `develop`, QA, merge into `main`, tag, merge back to `develop`
6. For hotfixes: branch from `main`, fix, merge into both `main` and `develop`

### Commit Message Format

Format: `type: short description`

| Type | When to Use |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Restructuring without behavior change |
| `docs` | Documentation only |
| `chore` | Tooling, dependencies, config |
| `style` | Formatting, whitespace |
| `test` | Adding or fixing tests |
| `perf` | Performance improvement |

### Rules

- Never force-push to `main` or `develop`
- Always open a PR -- no direct pushes to `main` or `develop`
- Run `npm run typecheck && npm run lint` before pushing
- Delete feature branches after merging
- Tag every production release on `main`: `vX.Y.Z`

## Key Patterns

- **IPC**: All renderer-to-main communication goes through `window.tapwisper.*` (defined in preload). Never use `ipcRenderer` directly.
- **AI Router**: `src/renderer/services/ai-router.ts` routes requests to the configured LLM/voice provider.
- **Multi-Window**: 5 windows total -- main settings + 4 overlay windows (recording pill, pinned panel, command popup, AI panel). Overlays are pre-warmed.
- **State**: Zustand stores in `src/renderer/store/`. Config lives in electron-store via `window.tapwisper.store.*`.

## Common Pitfalls

- Do not use `any` -- the linter will warn
- Do not leave `console.log` -- stripped in production and linted as warning
- Always add i18n translations to all 6 locale files
- Overlay windows are frameless and transparent -- test visual changes carefully
- API keys are stored in electron-store; never log or expose them
- `better-sqlite3` is a native module -- it is externalized, not bundled
- Always branch from `develop` for new work, never from `main` (unless hotfix)
