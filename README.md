<p align="center">
  <img src="build/icon.png" alt="TapWisper" width="128" height="128" />
</p>

<h1 align="center">TapWisper Desktop</h1>

<p align="center">
  Open-source, system-wide voice dictation with AI.<br/>
  Bring Your Own API key. Download, configure, and start using it in seconds.
</p>

<p align="center">
  <a href="https://tapwisper.ai">tapwisper.ai</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg" alt="Platform" />
  <a href="https://www.electronjs.org/"><img src="https://img.shields.io/badge/Electron-33+-47848F.svg" alt="Electron" /></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-19-61DAFB.svg" alt="React" /></a>
  <a href="https://github.com/sponsors/zeyadelosherey"><img src="https://img.shields.io/badge/Sponsor-%E2%9D%A4-pink.svg" alt="Sponsor" /></a>
</p>

<p align="center">
  <img src="src/renderer/assets/google.png" alt="Google Gemini" width="36" height="36" />&nbsp;&nbsp;
  <img src="src/renderer/assets/openai.png" alt="OpenAI" width="36" height="36" />&nbsp;&nbsp;
  <img src="src/renderer/assets/claude.png" alt="Claude" width="36" height="36" />&nbsp;&nbsp;
  <img src="src/renderer/assets/together.png" alt="Together AI" width="36" height="36" />&nbsp;&nbsp;
  <img src="src/renderer/assets/soniox.png" alt="Soniox" width="36" height="36" />
</p>

<p align="center">
  <em>Supports Google Gemini, OpenAI, Claude, Together AI, and Soniox</em>
</p>

---

## Works Everywhere You Type

TapWisper runs system-wide -- just speak and your text appears in **any app** on your computer. No plugins, no integrations, no setup per app.

**Code Editors** -- Cursor, Windsurf, VS Code, Xcode, JetBrains (IntelliJ, WebStorm, PyCharm), Neovim, Terminal, etc.

**Communication** -- Slack, Discord, Microsoft Teams, Gmail, Outlook, Telegram, WhatsApp, iMessage, etc.

**Productivity** -- Notion, Obsidian, Google Docs, Microsoft Word, Linear, Jira, Confluence, etc.

**Browsers** -- Chrome, Safari, Firefox, Arc, Edge, Brave, etc. -- any website, any text field

**AI & Dev Tools** -- ChatGPT, Claude, Cursor Chat, GitHub, GitLab, any CLI or REPL, etc.

...and literally **every other app** on macOS, Windows, and Linux. If you can type in it, TapWisper works in it.

> Press **Option+Space** (Mac) or **Alt+Space** (Windows/Linux), speak, and your words appear wherever your cursor is. It's that simple.

---

## Why TapWisper?

TapWisper is a **free, open-source** alternative to tools like [WhisperFlow](https://whisperflow.com) and [SuperWhisper](https://superwhisper.com). Unlike closed-source alternatives, TapWisper gives you full control:

- **BYOAPI (Bring Your Own API)** -- Use your own API keys from any supported provider. No subscriptions, no middleman.
- **100% open source** -- Inspect, modify, and contribute to the code. MIT licensed.
- **Privacy first** -- Audio and text are sent directly to the provider you choose. Nothing passes through our servers.
- **Cross-platform** -- macOS, Windows, and Linux.

### Download

> **[Download TapWisper v1.1.0](https://github.com/zeyadelosherey/tapwisper-desktop/releases/latest)**

| Platform | Download | Architecture |
|----------|----------|--------------|
| macOS | [TapWisper-1.1.0-arm64.dmg](https://github.com/zeyadelosherey/tapwisper-desktop/releases/download/v1.1.0/tapwisper-desktop-1.1.0-arm64.dmg) | Apple Silicon (M1/M2/M3/M4) |
| macOS | [TapWisper-1.1.0-x64.dmg](https://github.com/zeyadelosherey/tapwisper-desktop/releases/download/v1.1.0/tapwisper-desktop-1.1.0-x64.dmg) | Intel |
| Windows | [TapWisper-1.1.0-setup.exe](https://github.com/zeyadelosherey/tapwisper-desktop/releases/download/v1.1.0/tapwisper-desktop-1.1.0-setup.exe) | x64 |

Or browse all versions on the [Releases page](https://github.com/zeyadelosherey/tapwisper-desktop/releases).

### Quick Start

1. **Download** the installer for your platform from the table above
2. **Open** the app and go to Settings > AI Provider
3. **Paste** your API key (Gemini, OpenAI, Claude, or Together AI)
4. **Start using it** -- press Option+Space (Mac) or Alt+Space (Windows/Linux) to record

No account needed. No sign-up. Just your API key and you're ready to go.

---

## Features

- **Voice Dictation** -- Push-to-talk or toggle recording from anywhere on your system
- **AI Text Transformations** -- Rewrite, summarize, translate, fix grammar, and more
- **Multiple AI Providers** -- Google Gemini, Together AI, OpenAI, Claude
- **Multiple Voice Providers** -- Together Whisper, Soniox
- **Custom Actions** -- Create your own AI action categories and prompts
- **Voice Triggers** -- Hands-free automation with fuzzy-matched voice commands
- **Text Snippets** -- Quick text expansion via trigger phrases
- **Voice Notes** -- Record and transcribe notes
- **Prompt Marketplace** -- Browse and install community prompt templates
- **Multi-Language** -- English, Arabic, German, Spanish, French, Italian
- **Dark Mode** -- System, dark, and light theme support
- **RTL Support** -- Full right-to-left layout for Arabic

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Option+Space (Mac) / Alt+Space (Win/Linux) | Hold to record (push-to-talk), tap to toggle |
| Option+Space+Space | Open pinned recording panel |
| Esc | Dismiss any panel |

---

## Getting Started (Development)

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- npm v9 or later
- macOS 12+, Windows 10+, or Linux

### Installation

```bash
# Clone the repository
git clone https://github.com/zeyadelosherey/tapwisper-desktop.git
cd tapwisper-desktop

# Install dependencies
npm install

# Run in development mode
npm run dev
```

### Build & Package

```bash
# Build for production
npm run build

# Package for your platform
npm run dist:mac     # macOS (DMG + ZIP)
npm run dist:win     # Windows (NSIS installer)
npm run dist:linux   # Linux (AppImage)
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start the app in development mode with hot reload |
| `npm run build` | Build for production |
| `npm run dist` | Build and package for distribution |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run lint` | Run ESLint |
| `npm run format` | Format code with Prettier |

---

## Tech Stack

- **Electron 33+** with TypeScript
- **React 19** + **Tailwind CSS** for UI
- **Vite** via electron-vite for fast dev builds
- **electron-store** for encrypted config storage
- **better-sqlite3** for activity database
- **Zustand** for state management
- **i18next** for 6-language localization
- **Framer Motion** for animations

## AI Providers

| Provider | Type | Description |
|----------|------|-------------|
| Google Gemini | LLM | Fast, versatile language model |
| Together AI | LLM + Voice | Language model and Whisper transcription |
| OpenAI | LLM | GPT models for text processing |
| Claude | LLM | Anthropic's Claude models |
| Soniox | Voice | High-accuracy speech-to-text |

## Project Structure

```
src/
  main/            # Electron main process (tray, shortcuts, windows, IPC)
  preload/         # Context bridge (secure API for renderer)
  renderer/        # React frontend
    components/    # Overlay UI (recording pill, pinned panel, command popup)
    pages/         # Settings window pages (home, settings, triggers, etc.)
    services/      # AI API clients (Gemini, OpenAI, Claude, Together, Soniox)
    hooks/         # React hooks (audio, shortcuts)
    store/         # Zustand state stores (stats, activity)
    models/        # TypeScript type definitions
    constants/     # Shared constants (colors, providers)
    utils/         # Shared utility functions (formatting)
    i18n/          # Translation files (en, ar, it, es, fr, de)
    assets/        # Static assets (logos, images)
    styles/        # Global CSS and theme
    types/         # Global type declarations
```

---

## AI Agent Guidelines

This project includes configuration files for AI coding assistants so they can understand the codebase:

| Tool | Config File | Description |
|------|-------------|-------------|
| [Cursor](https://cursor.com) | [`.cursor/rules/`](.cursor/rules/) | Project rules for Cursor AI (architecture, coding standards, patterns) |
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | [`CLAUDE.md`](CLAUDE.md) | Project context for Claude Code CLI agent |
| [OpenAI Codex](https://openai.com/codex) | [`CODEX.md`](CODEX.md) | Project context for OpenAI Codex agent |
| [GitHub Copilot](https://github.com/features/copilot) | [`.github/copilot-instructions.md`](.github/copilot-instructions.md) | Project context for GitHub Copilot |

---

## Sponsor TapWisper

TapWisper is free and open source. If you find it useful, please consider supporting its development:

### Individual Supporters

You can sponsor the project through GitHub Sponsors -- every contribution helps keep the project maintained and growing:

> **[Become a Sponsor on GitHub](https://github.com/sponsors/zeyadelosherey)**

### Corporate Sponsorship

If your company uses TapWisper and would like to sponsor the project, partner on features, or discuss enterprise support, we'd love to hear from you:

- **Email**: [support@tapwisper.ai](mailto:support@tapwisper.ai)
- **GitHub Discussions**: [Start a conversation](https://github.com/zeyadelosherey/tapwisper-desktop/discussions)

Corporate sponsors get visibility on this README and priority feature discussions.

---

## Support

Have a question, found a bug, or want to request a feature? Reach out to us:

- **Email**: [support@tapwisper.ai](mailto:support@tapwisper.ai)
- **Issues**: [GitHub Issues](https://github.com/zeyadelosherey/tapwisper-desktop/issues)

## Contributing

We welcome contributions! TapWisper is open source and community-driven. Please read our [Contributing Guide](CONTRIBUTING.md) to get started.

## Security

For reporting security vulnerabilities, please see our [Security Policy](SECURITY.md).

## License

This project is licensed under the MIT License -- see the [LICENSE](LICENSE) file for details.

## Acknowledgements

Built with [Electron](https://www.electronjs.org/), [React](https://react.dev/), [Tailwind CSS](https://tailwindcss.com/), [Vite](https://vite.dev/), and many other great open-source projects.
