# Local and self-hosted models

TapWisper can run speech-to-text and the language model in three ways. You choose separately for each, in **Settings → Speech-to-Text** and **Settings → Language Models**:

| Engine | Where it runs | Needs |
|---|---|---|
| **Cloud providers** | Gemini, OpenAI, Claude, Together AI, Soniox | Your API key |
| **Local** | On this computer, with open-source models | A one-time model download |
| **Self-hosted** | Your own OpenAI-compatible server (Ollama, LM Studio, vLLM, LocalAI, speaches, whisper.cpp) | The server's address |

Existing installs stay on Cloud until you change it.

## How the local engine works

```
Renderer  ai-router.ts ── cloud ──────► provider clients (fetch)
                       ├─ local ──────► window.tapwisper.localAi.*     ┐ IPC
                       └─ self-hosted ► window.tapwisper.selfHosted.*  ┘
Main      src/main/local-ai/
            index.ts        IPC handlers, picks the model, CPU fallback
            sidecar.ts      runs one inference server on 127.0.0.1:<random port>
            whisper.ts      whisper-server arguments + /inference
            llama.ts        llama-server arguments + /v1/chat/completions
            model-store.ts  downloads (resume, SHA-256 check), delete
            hardware.ts     RAM, disk, GPU, emulation, runtime probe
            self-hosted.ts  client for the user's own server
Shared    src/shared/local-ai/  types, model catalog (models.json), rating helpers
Binaries  resources/bin/{whisper,llama}/  built by scripts/build-runtimes.mjs
Models    <userData>/models/{stt,llm}/     or a folder the user picks
```

- **The servers.** whisper.cpp's `whisper-server` and llama.cpp's `llama-server` run as child processes.
  - A server starts on the first request, or when recording starts, so the model loads while you talk.
  - It handles one request at a time.
  - It stops after a period without use (10 minutes by default). "Keep models loaded" turns that off.
  - It restarts whenever the model or a runtime option changes.
- **Networking.** The servers only listen on `127.0.0.1`. Nothing is reachable from the network, and there's no firewall prompt.
- **Audio.** Recordings are WebM/Opus. The renderer converts them to 16 kHz mono WAV (`utils/audio-convert.ts`) before sending them to whisper.cpp or a self-hosted server.
- **Self-hosted requests** go through the main process (Electron's network stack). That way the system proxy and certificate store apply, and the renderer's Content-Security-Policy stays limited to the cloud APIs.
- **Context size.** Local models get an 8K-token context. `getMaxInputChars()` in the router tells meeting summaries and Q&A how much text fits, and long meetings are condensed in several rounds.

## Device support

| Computer | Local engine | Notes |
|---|---|---|
| Mac with Apple Silicon | ✅ Metal GPU | Best experience. Recommended: Whisper Large v3 Turbo (Q5) and Qwen3 4B with 16 GB RAM or more. |
| Intel Mac | ✅ CPU | Prefer Whisper Base/Small and a 1–2B language model. |
| Intel build on Apple Silicon (Rosetta) | ⚠️ slow | The settings page asks you to install the Apple Silicon build. |
| Windows x64 | ✅ CPU, Vulkan GPU for the language model | Uses the GPU on NVIDIA, AMD and Intel Arc. If the GPU fails to load a model, it falls back to the CPU for the rest of the session. |
| Linux x64 | ✅ CPU | |
| Windows on ARM, Linux ARM, 32-bit | ❌ | Not built yet. Use Cloud or Self-hosted. |

**Older CPUs.** On everything except Apple Silicon, the runtime contains one CPU backend per instruction-set level (SSE4.2 up to AVX-512) and loads the best one at startup. CPUs without AVX2 still work, just more slowly.

**How models are rated.** Each model is rated for the computer it would run on (`rateModel` in `src/shared/local-ai/catalog.ts`):

| Rating | Meaning |
|---|---|
| Recommended | The best fit for this computer's memory and GPU. |
| May be slow | A big model without a GPU, or less memory than recommended. |
| Needs N GB RAM | Below the model's minimum memory. Downloading asks for confirmation. |
| Not enough disk space | Downloading is blocked. |
| English only | A `.en` model while you dictate in other languages, or with auto-detect. |

## Models

The catalog lives in [`src/shared/local-ai/models.json`](../src/shared/local-ai/models.json). Every file downloads from Hugging Face without an account.

- **Speech-to-text:** whisper.cpp GGML models, all MIT-licensed: Tiny, Base, Small, Medium, Large v3 Turbo, Large v3, plus English-only variants.
- **Language models:** GGUF files, quantized to Q4_K_M:

  | Model | License |
  |---|---|
  | Qwen3 0.6B / 1.7B / 4B / 8B | Apache-2.0 |
  | Llama 3.2 1B / 3B | Llama 3.2 Community License |
  | Gemma 3 1B / 4B | Gemma Terms of Use |
  | Phi-4 Mini | MIT |
  | Mistral 7B v0.3 | Apache-2.0 |

  Each model's license is linked in the app before you download it.

**Download handling:**
- Downloads resume after an interruption.
- Each file is checked against the SHA-256 Hugging Face publishes for it. A damaged file is deleted and can be downloaded again.
- Partial files left for more than 7 days are cleaned up.

### Adding a model

1. Add an entry to `models.json` with a direct `resolve/main/…` URL from an ungated repository, plus its size, minimum and recommended RAM, license and speed/quality scores (1–5, relative within its kind).
2. Add `"thinking": true` for models that emit `<think>` blocks. The app then turns reasoning off with `chat_template_kwargs` and strips any leftover blocks.
3. Run `node scripts/check-model-urls.mjs` to check the URL and size.
4. Run `npm test`. The catalog test checks for unique ids and complete license links.

## Building the runtimes

The bundled servers are built from source at the tags pinned in [`scripts/runtimes.json`](../scripts/runtimes.json):

```bash
npm run build:runtimes            # whisper-server + llama-server for this OS/arch
npm run build:runtimes -- --vulkan   # add the Vulkan backend (Windows/Linux, needs the Vulkan SDK)
```

You need git, CMake 3.21 or newer, and a C++17 compiler (Xcode Command Line Tools, Visual Studio 2022, or GCC/Clang). The first build takes about 10 minutes. After that, builds are incremental, and the script skips a runtime whose version and options haven't changed.

**Development without runtimes.** You can develop without building them. The Local card then says the runtime isn't included in this build.

**Release builds.** The release workflow builds the runtimes for each platform and caches them. `.github/workflows/local-runtimes.yml` builds them on Linux, macOS and Windows, then runs real Whisper Tiny and Qwen3 0.6B models through the app's own code (`src/main/local-ai/__tests__/runtimes.smoke.test.ts`). To run that test locally:

```bash
LOCAL_AI_SMOKE_WHISPER_MODEL=/path/ggml-tiny.bin \
LOCAL_AI_SMOKE_LLM_MODEL=/path/Qwen3-0.6B-Q4_K_M.gguf \
LOCAL_AI_SMOKE_EXPECT_TEXT=1 \
npx vitest run src/main/local-ai/__tests__/runtimes.smoke.test.ts
```

## Self-hosted servers

| Server | Speech-to-Text | Language Models | Default address |
|---|---|---|---|
| [Ollama](https://ollama.com) | | ✅ | `http://localhost:11434` |
| [LM Studio](https://lmstudio.ai) | | ✅ | `http://localhost:1234` |
| [vLLM](https://docs.vllm.ai) | ✅ | ✅ | `http://localhost:8000` |
| [LocalAI](https://localai.io) | ✅ | ✅ | `http://localhost:8080` |
| [speaches](https://github.com/speaches-ai/speaches) | ✅ | | `http://localhost:8000` |
| whisper.cpp `whisper-server` | ✅ | | start it with `-l auto --inference-path /v1/audio/transcriptions` |

How to set one up:
- **Address.** Enter it with or without `/v1`.
- **Test connection.** This lists the server's models, so you can pick one.
- **API key.** Optional. It's stored encrypted with your other keys.
- **Plain http to a public address.** The app warns when the key would be sent over plain `http` to a public address. Local network addresses are fine.

**Context window.** Give language models at least 8K tokens of context. Ollama defaults lower, so set `num_ctx`, for example in a Modelfile or with `OLLAMA_CONTEXT_LENGTH=8192`.

## Troubleshooting

| Message | What to do |
|---|---|
| *Not included in this build* | A development build without runtimes. Run `npm run build:runtimes`. |
| *Blocked by your security software* | Antivirus or SmartScreen stopped `whisper-server.exe` / `llama-server.exe`. Allow TapWisper, then restart it. |
| *A system library is missing* | Reinstall TapWisper. On Linux, check that the AppImage isn't on a `noexec` mount. |
| *The local engine crashed on this processor* | A very old or unusual CPU. Use Cloud or Self-hosted. |
| *Running on the CPU (GPU unavailable)* | The GPU couldn't load the model (driver or video memory). Update the GPU driver, pick a smaller model, or turn off **Use the GPU**. |
| *The models folder path has non-English characters* | Some builds can't open such paths on Windows. Choose another folder under **Advanced → Models folder**. |
| *The model took too long to respond* | Pick a faster model. The rating marks slow ones for your computer. |
| A self-hosted server is unreachable on an unusual port | Chromium blocks a few "unsafe" ports (for example 6000 and 10080). Use a common port such as 8000 or 8080. |

If the app is force-quit, servers it left running are stopped on the next launch. Their PIDs are kept in `<userData>/local-ai-servers.json`.
