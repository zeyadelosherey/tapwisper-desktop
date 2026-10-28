# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Onboarding is redesigned, with new steps to choose the speech engine and try a dictation.
- The record key always starts a dictation. AI Actions on the last dictation moved to the tray menu.

### Fixed

- **fn (Globe) record key on macOS:**
  - A quick fn tap no longer starts a hands-free recording that later pastes junk. Hold fn to talk, or use fn + Space for hands-free.
  - When macOS also uses fn to switch the keyboard language or show emoji, TapWisper says so and offers to turn that off.
- Transcripts that are only noise (one character or word repeated, or only punctuation) are no longer pasted.
- Meeting notes are no longer offered when a call app is open but no call is running.
- Tray "Start Recording" starts and stops a hands-free dictation.

## [1.2.0] - 2026-10-27

### Added

- **Engines for speech-to-text and language models**, chosen separately in Settings. Existing users stay on Cloud providers. The engines are:
  - Cloud providers (bring your own key)
  - Local (on-device)
  - Self-hosted (your own OpenAI-compatible server)
- Local models run on bundled whisper.cpp and llama.cpp programs:
  - **Speech (18 models):** Whisper, NVIDIA Parakeet TDT 0.6B v3, Qwen3-ASR 0.6B/1.7B and Voxtral Mini 3B.
  - **Language (24 models):** Qwen3.5/Qwen3, Gemma 4/3, Llama 3.x, Phi-4 Mini, Mistral 7B, LFM2/2.5, SmolLM2/3, Granite 3.3, Nemotron 3 Nano and gpt-oss 20B.
- **GPU acceleration:**
  - Metal on Apple Silicon.
  - Vulkan on Windows and Linux (NVIDIA, AMD, Intel Arc).
  - Automatic fallback to the CPU.
- **Model downloads from Hugging Face:**
  - Pinned to a fixed commit.
  - Each file is checked against its published SHA-256.
  - Downloads resume after an interruption, can be cancelled, and are refused up front when the disk is too full.
- **Per-device model ratings and recommendations.** The settings page explains when a computer can't run local models: unsupported platform, blocked by security software, missing library, old CPU, low memory or disk, or Rosetta.
- **Self-hosted servers:** presets for Ollama, LM Studio, vLLM, LocalAI and speaches, with a Test connection button. API keys are stored encrypted.
- **New Settings tabs:** Speech-to-Text and Language Models.
- **Meeting summaries and questions** fit a local model's context, condensing long meetings in several rounds.
- **CI:** the new `Local AI runtimes` workflow checks every catalog model on Hugging Face, and runs real models on Linux, macOS and Windows.

### Changed

- Voice triggers can use the engine selected in Settings.
- Windows builds use the shared Visual C++ runtime, bundled with the app.

### Fixed

- Local models now load from folders with non-English names on Windows (UTF-8 code page).
## [1.0.0] - 2025-02-17

### Added

- System-wide voice dictation with push-to-talk and toggle modes
- AI text transformations (rewrite, summarize, translate, and more)
- Multiple AI provider support: Google Gemini, Together AI, OpenAI, Claude
- Multiple voice provider support: Together Whisper, Soniox
- Custom action categories and toolbar configuration
- Voice triggers with fuzzy matching for hands-free automation
- Text snippets for quick text expansion
- Voice notes with recording and playback
- Activity dashboard with usage statistics
- Prompt template marketplace (Mini App Store)
- Multi-language support: English, Arabic, German, Spanish, French, Italian
- Dark mode and system theme support
- RTL language support
- SQLite database for activity records and statistics
- Cross-platform support: macOS and Windows
