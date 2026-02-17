# Contributing to TapWisper

Thank you for your interest in contributing to TapWisper! This guide will help you get started.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- npm v9 or later
- macOS 12+ or Windows 10+ (for development and testing)

### Setup

```bash
# Clone the repository
git clone https://github.com/zeyadelosherey/tapwisper-desktop.git
cd tapwisper-desktop

# Install dependencies
npm install

# Start in development mode
npm run dev
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start the app in development mode with hot reload |
| `npm run build` | Build for production |
| `npm run dist` | Build and package for distribution |
| `npm run dist:mac` | Package for macOS |
| `npm run dist:win` | Package for Windows |
| `npm run dist:linux` | Package for Linux |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run lint` | Run ESLint |
| `npm run format` | Run Prettier to format code |

### Publishing Releases

Releases are built and published automatically via GitHub Actions:

1. Push a version tag: `git tag v1.0.0 && git push origin v1.0.0`
2. The [Release workflow](.github/workflows/release.yml) builds macOS and Windows apps and creates a GitHub release with all artifacts.

## Project Structure

```
src/
  main/          # Electron main process (tray, shortcuts, windows, IPC)
  preload/       # Context bridge (secure API for renderer)
  renderer/      # React frontend
    components/  # Overlay UI (Recording Pill, Pinned Panel, Command Popup)
    pages/       # Settings window pages
    services/    # AI API clients (Gemini, OpenAI, Claude, Together, Soniox)
    hooks/       # React hooks (audio, shortcuts)
    store/       # Zustand state stores
    models/      # TypeScript type definitions
    constants/   # Shared constants (colors, providers)
    utils/       # Shared utility functions
    i18n/        # Translation files (en, ar, it, es, fr, de)
```

## Coding Standards

### File Naming

- Use **kebab-case** for all file names: `my-component.tsx`, `use-audio.ts`
- Use **PascalCase** for React component exports: `export function MyComponent()`
- Use **camelCase** for hooks, utilities, and variables: `useAudio`, `formatDuration`

### TypeScript

- Avoid `any` types; use proper type definitions
- Define shared types in `src/renderer/models/` or `src/renderer/types/`
- Use `interface` for object shapes and `type` for unions/intersections

### React

- Use functional components with hooks
- Keep components focused; split large components into smaller ones
- Place shared utilities in `src/renderer/utils/` instead of duplicating

### Styling

- Use Tailwind CSS utility classes
- Define custom theme values in `tailwind.config.js`
- Use CSS variables for theme-aware colors (defined in `src/renderer/styles/globals.css`)

### Internationalization

- All user-facing strings should use `useTranslation()` from react-i18next
- Add translations to all locale files in `src/renderer/i18n/`

## Making Changes

### Workflow (Git Flow)

This project uses **Git Flow**. The `develop` branch is the integration branch for all new work. The `main` branch is reserved for production releases.

1. Fork the repository
2. Create a feature branch from `develop`: `git checkout -b feat/my-feature develop`
3. Make your changes
4. Run checks: `npm run typecheck && npm run lint`
5. Commit with a clear message (see below)
6. Push and open a Pull Request **targeting `develop`**

### Branch Naming

| Prefix | Purpose | Branch From | Merge Into |
|--------|---------|-------------|------------|
| `feat/` | New features | `develop` | `develop` |
| `fix/` | Bug fixes | `develop` | `develop` |
| `refactor/` | Code refactoring | `develop` | `develop` |
| `docs/` | Documentation changes | `develop` | `develop` |
| `hotfix/` | Urgent production fixes | `main` | `main` + `develop` |
| `release/vX.Y.Z` | Release preparation | `develop` | `main` + `develop` |

### Commit Messages (Conventional Commits)

Format: `type: short description`

```
feat: add speech-to-text provider selection
fix: resolve clipboard race condition on macOS
refactor: extract shared formatting utilities
docs: update README with new project structure
chore: bump electron to v33.2
perf: optimize overlay window preloading
```

Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `style`, `test`, `perf`

## Pull Request Guidelines

- Open PRs against `develop` (not `main`)
- Keep PRs focused on a single change
- Include a clear description of what and why
- Reference any related issues
- Ensure all checks pass (typecheck, lint)
- Add screenshots for UI changes

## Reporting Issues

- Use the GitHub issue templates for bug reports and feature requests
- Include your OS version and app version
- For bugs, include steps to reproduce

## Code of Conduct

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before contributing.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
