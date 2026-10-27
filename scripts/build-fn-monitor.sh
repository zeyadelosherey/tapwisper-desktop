#!/usr/bin/env bash
# Build the macOS fn/Globe key helper as a universal binary into
# resources/bin/fn-monitor (shipped unpacked; see asarUnpack in
# electron-builder.yml). No-op on other platforms.
set -euo pipefail

if [[ "$(uname)" != "Darwin" ]]; then
  echo "build-fn-monitor: not macOS, skipping"
  exit 0
fi
if ! command -v swiftc >/dev/null 2>&1; then
  echo "build-fn-monitor: swiftc not found (install Xcode Command Line Tools); fn shortcut will fall back to Ctrl+Option" >&2
  exit 0
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/native/fn-monitor/main.swift"
OUT_DIR="$ROOT/resources/bin"
TMP="$(mktemp -d)"
mkdir -p "$OUT_DIR"

swiftc -O -target arm64-apple-macos11 "$SRC" -o "$TMP/fn-monitor-arm64"
swiftc -O -target x86_64-apple-macos11 "$SRC" -o "$TMP/fn-monitor-x86_64"
lipo -create "$TMP/fn-monitor-arm64" "$TMP/fn-monitor-x86_64" -output "$OUT_DIR/fn-monitor"
chmod +x "$OUT_DIR/fn-monitor"
rm -rf "$TMP"
echo "build-fn-monitor: built $OUT_DIR/fn-monitor"
