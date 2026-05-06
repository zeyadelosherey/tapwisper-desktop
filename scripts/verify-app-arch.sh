#!/usr/bin/env bash
# Verify that all active-load native modules inside a packaged macOS .app
# match the target architecture.
#
# Usage:
#   bash scripts/verify-app-arch.sh <appOutDir> <target-arch>
#
# Examples:
#   bash scripts/verify-app-arch.sh dist/mac        x64
#   bash scripts/verify-app-arch.sh dist/mac-arm64  arm64
#
# Notes:
#   - electron-builder writes x64 macOS builds to dist/mac and arm64 to dist/mac-arm64.
#   - We deliberately skip cross-platform/cross-arch prebuild siblings (e.g. linux-*,
#     win32-*, and the *opposite* darwin arch) because they are harmless fallbacks
#     that node-gyp-build never selects on the user's machine.
#   - We always require the matching darwin-${arch} prebuild + every build/Release
#     and lib/binding/*-darwin-unknown-${arch} .node file to match the target arch.

set -euo pipefail

APP_OUT_DIR="${1:?usage: $0 <appOutDir> <target-arch>}"
TARGET_ARCH="${2:?usage: $0 <appOutDir> <target-arch>}"

case "$TARGET_ARCH" in
  x64)   EXPECTED_FILE_ARCH="x86_64" ;;
  arm64) EXPECTED_FILE_ARCH="arm64" ;;
  *) echo "::error::Unsupported target arch: $TARGET_ARCH" >&2; exit 2 ;;
esac

APP_DIR=""
if [ -d "$APP_OUT_DIR" ]; then
  APP_DIR=$(find "$APP_OUT_DIR" -maxdepth 2 -type d -name "*.app" 2>/dev/null | head -n 1 || true)
fi
if [ -z "$APP_DIR" ] && [ -d dist ]; then
  APP_DIR=$(find dist -maxdepth 3 -type d -name "*.app" 2>/dev/null | head -n 1 || true)
fi
if [ -z "$APP_DIR" ] || [ ! -d "$APP_DIR" ]; then
  echo "::error::Could not locate packaged .app under $APP_OUT_DIR or dist/" >&2
  exit 1
fi

echo "Verifying .app: $APP_DIR"
echo "Target arch:    $TARGET_ARCH (expecting Mach-O '$EXPECTED_FILE_ARCH')"
echo ""

fail=0
checked=0

is_active_load_path() {
  case "$1" in
    */build/Release/*.node)                                     return 0 ;;
    */build-tmp-napi-*/Release/*.node)                          return 0 ;;
    */prebuilds/darwin-${TARGET_ARCH}/*.node)                   return 0 ;;
    */lib/binding/napi-*-darwin-unknown-${TARGET_ARCH}/*.node)  return 0 ;;
    *) return 1 ;;
  esac
}

is_skippable_cross_target() {
  case "$1" in
    */prebuilds/linux-*/*.node)                                 return 0 ;;
    */prebuilds/win32-*/*.node)                                 return 0 ;;
    */prebuilds/darwin-*/*.node)                                return 0 ;;
    */lib/binding/napi-*-linux-*/*.node)                        return 0 ;;
    */lib/binding/napi-*-win32-*/*.node)                        return 0 ;;
    */lib/binding/napi-*-darwin-unknown-*/*.node)               return 0 ;;
    *) return 1 ;;
  esac
}

while IFS= read -r f; do
  desc=$(file -b "$f" || echo "unknown")
  if is_active_load_path "$f"; then
    if printf '%s' "$desc" | grep -qw "$EXPECTED_FILE_ARCH"; then
      echo "  OK   [$TARGET_ARCH] $f"
    else
      echo "  FAIL [$TARGET_ARCH] $f -- $desc"
      echo "::error::Native module $f is not $EXPECTED_FILE_ARCH (got: $desc)"
      fail=1
    fi
    checked=$((checked + 1))
  elif is_skippable_cross_target "$f"; then
    echo "  skip (cross-target prebuild) $f"
  else
    if printf '%s' "$desc" | grep -qw "$EXPECTED_FILE_ARCH"; then
      echo "  OK   [misc]   $f"
    else
      echo "  FAIL [misc]   $f -- $desc"
      echo "::error::Native module $f is not $EXPECTED_FILE_ARCH (got: $desc)"
      fail=1
    fi
    checked=$((checked + 1))
  fi
done < <(find "$APP_DIR" -name "*.node")

echo ""
echo "Checked $checked active-load .node files."

if [ "$checked" -eq 0 ]; then
  echo "::error::No active-load .node files were found in $APP_DIR -- this is unexpected."
  exit 1
fi

if [ "$fail" -ne 0 ]; then
  echo "::error::One or more native modules have the wrong architecture for target $TARGET_ARCH."
  exit 1
fi

echo "All native modules verified for target $TARGET_ARCH."
