#!/usr/bin/env node
/**
 * Build the local inference programs bundled with TapWisper — whisper.cpp's
 * whisper-server and parakeet-cli, and llama.cpp's llama-server — for the
 * current OS and CPU architecture, into resources/bin/{whisper,llama}/.
 *
 * Upstream releases don't cover every platform we ship (no macOS/Linux
 * whisper-server, macOS llama builds that need a recent macOS), so both are
 * built from source at the tags pinned in scripts/runtimes.json.
 *
 * Usage: node scripts/build-runtimes.mjs [--only whisper|llama] [--vulkan] [--force]
 *   --vulkan  add the Vulkan GPU backend to llama-server (Windows/Linux; needs the Vulkan SDK)
 *   --force   rebuild even if resources/bin already has this version
 *
 * Needs git, CMake ≥ 3.21 and a C++17 compiler (Xcode CLT, MSVC or GCC/Clang).
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { cpus } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(ROOT, '.cache', 'runtimes')
const OUT = join(ROOT, 'resources', 'bin')
const RUNTIMES = JSON.parse(readFileSync(join(ROOT, 'scripts', 'runtimes.json'), 'utf8'))

const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
const vulkan = args.includes('--vulkan')
const force = args.includes('--force')

const { platform, arch } = process
const target = `${platform}-${arch}`
// Keep in sync with SUPPORTED_TARGETS in src/main/local-ai/hardware.ts
const SUPPORTED = ['darwin-arm64', 'darwin-x64', 'win32-x64', 'linux-x64']
if (!SUPPORTED.includes(target)) {
  console.error(
    `Local runtimes are not built for ${target}; the app will offer Cloud/Self-hosted only.`
  )
  process.exit(0)
}

/**
 * CMake options per platform.
 * - Apple Silicon: one static binary with Metal and the shader library embedded.
 * - Everything else: CPU backends for every instruction-set level, loaded at
 *   runtime (GGML_BACKEND_DL), so old CPUs without AVX2 don't crash with SIGILL.
 *   That needs shared libraries, which sit next to the binary ($ORIGIN rpath).
 * - No OpenMP and a static MSVC runtime: nothing to install on the user's machine.
 */
function platformOptions(name) {
  const common = ['-DCMAKE_BUILD_TYPE=Release', '-DGGML_NATIVE=OFF', '-DGGML_OPENMP=OFF']
  if (target === 'darwin-arm64') {
    return [
      ...common,
      '-DBUILD_SHARED_LIBS=OFF',
      '-DGGML_METAL=ON',
      '-DGGML_METAL_EMBED_LIBRARY=ON',
      '-DCMAKE_OSX_ARCHITECTURES=arm64',
      '-DCMAKE_OSX_DEPLOYMENT_TARGET=11.0'
    ]
  }
  const dynamicCpu = [
    '-DBUILD_SHARED_LIBS=ON',
    '-DGGML_BACKEND_DL=ON',
    '-DGGML_CPU_ALL_VARIANTS=ON',
    '-DCMAKE_BUILD_WITH_INSTALL_RPATH=ON'
  ]
  if (target === 'darwin-x64') {
    return [
      ...common,
      ...dynamicCpu,
      '-DGGML_METAL=OFF',
      '-DCMAKE_INSTALL_RPATH=@loader_path',
      '-DCMAKE_OSX_ARCHITECTURES=x86_64',
      '-DCMAKE_OSX_DEPLOYMENT_TARGET=10.15'
    ]
  }
  const gpu = vulkan && name === 'llama' ? ['-DGGML_VULKAN=ON'] : []
  if (platform === 'win32') {
    return [...common, ...dynamicCpu, ...gpu, '-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded']
  }
  return [...common, ...dynamicCpu, ...gpu, '-DCMAKE_INSTALL_RPATH=$ORIGIN']
}

/**
 * Windows passes command-line arguments, and char* paths given to fopen, in the
 * legacy ANSI code page, so the runtimes can't open a model under a folder like
 * C:\Users\محمد\…. This manifest makes UTF-8 their code page (Windows 10 1903+).
 */
const UTF8_MANIFEST = join(ROOT, 'scripts', 'windows-utf8.manifest')

/** The Windows SDK's mt.exe, as found by CMake, or the newest one installed */
function manifestTool(buildDir) {
  const cache = readFileSync(join(buildDir, 'CMakeCache.txt'), 'utf8')
  const fromCache = cache.match(/^CMAKE_MT:FILEPATH=(.+)$/m)?.[1]?.trim()
  if (fromCache && existsSync(fromCache)) return fromCache
  const kits = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin'
  const versions = existsSync(kits) ? readdirSync(kits).filter((v) => /^10\./.test(v)) : []
  const latest = versions
    .map((v) => join(kits, v, 'x64', 'mt.exe'))
    .filter(existsSync)
    .sort()
    .at(-1)
  if (!latest) throw new Error('mt.exe not found: install the Windows 10/11 SDK')
  return latest
}

/** Merge the UTF-8 manifest into the one the linker embedded */
function embedUtf8Manifest(mt, exe) {
  const resource = `${exe};#1`
  run(mt, [
    '-nologo',
    `-inputresource:${resource}`,
    '-manifest',
    UTF8_MANIFEST,
    `-outputresource:${resource}`
  ])
}

function run(cmd, cmdArgs, cwd) {
  console.log(`$ ${cmd} ${cmdArgs.join(' ')}`)
  execFileSync(cmd, cmdArgs, { cwd, stdio: 'inherit' })
}

/** Every file under `dir` whose name matches `test` */
function findFiles(dir, test, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'CMakeFiles') findFiles(path, test, found)
    } else if (test(entry.name)) {
      found.push(path)
    }
  }
  return found
}

const SHARED_LIB = /\.(so(\.\d+)*|dylib|dll)$/

/**
 * Keep each shared library once, under the name the loader asks for:
 * libggml.so.0 / libggml.0.dylib (a symlink, copied as a file), not the
 * fully versioned file it points to or the unversioned link for linking.
 */
function isRuntimeLibrary(path) {
  const name = basename(path)
  if (lstatSync(path).isSymbolicLink()) return /\.so\.\d+$|[^.\d]\.\d+\.dylib$/.test(name)
  return !/\.so\.\d+\.\d+|\.\d+\.\d+\.\d+\.dylib$/.test(name)
}

function build(name, spec) {
  const options = [...spec.options, ...platformOptions(name)]
  const manifest = platform === 'win32' ? readFileSync(UTF8_MANIFEST, 'utf8') : null
  const stamp = JSON.stringify({
    tag: spec.tag,
    target,
    targets: spec.targets,
    options,
    ...(manifest && { manifest })
  })
  const outDir = join(OUT, name)
  const stampFile = join(outDir, 'build.json')
  if (!force && existsSync(stampFile) && readFileSync(stampFile, 'utf8') === stamp) {
    console.log(`${name}: ${spec.tag} already built for ${target}`)
    return
  }

  const src = join(CACHE, `${name}-src`)
  if (!existsSync(join(src, '.git'))) {
    run('git', ['clone', '--depth', '1', '--branch', spec.tag, spec.repo, src])
  } else {
    run('git', ['fetch', '--depth', '1', 'origin', 'tag', spec.tag], src)
    run('git', ['checkout', '--force', spec.tag], src)
  }

  // Kept between runs so CMake rebuilds only what changed; one directory per set of
  // options, so dropping e.g. --vulkan can't leave a stale backend library behind
  const optionsHash = createHash('sha1').update(stamp).digest('hex').slice(0, 8)
  const buildDir = join(CACHE, `${name}-build-${target}-${optionsHash}`)
  run('cmake', ['-S', src, '-B', buildDir, ...options])
  run('cmake', [
    '--build',
    buildDir,
    '--config',
    'Release',
    '--target',
    ...spec.targets,
    '--parallel',
    String(cpus().length)
  ])

  const binaries = spec.targets.map((name) => {
    const exe = platform === 'win32' ? `${name}.exe` : name
    const [binary] = findFiles(buildDir, (f) => f === exe)
    if (!binary) throw new Error(`${exe} was not produced`)
    return binary
  })

  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })
  const libraries = findFiles(buildDir, (f) => SHARED_LIB.test(f)).filter(isRuntimeLibrary)
  for (const file of [...binaries, ...libraries]) {
    copyFileSync(file, join(outDir, basename(file)))
  }
  if (manifest) {
    const mt = manifestTool(buildDir)
    for (const binary of binaries) embedUtf8Manifest(mt, join(outDir, basename(binary)))
  }
  writeFileSync(stampFile, stamp)
  console.log(`${name}: ${spec.tag} → ${outDir}`)
}

for (const [name, spec] of Object.entries(RUNTIMES)) {
  if (!only || only === name) build(name, spec)
}
