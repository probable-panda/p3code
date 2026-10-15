#!/usr/bin/env bash
set -euo pipefail

version=${1:-}
if [[ ! "$version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
  echo 'Usage: bash scripts/p3-release.sh <version>, for example 0.45.1' >&2
  exit 1
fi
if [[ $(uname -s) != Darwin || $(sysctl -n hw.optional.arm64) != 1 ]]; then
  echo 'P3 releases must be built on an Apple Silicon Mac.' >&2
  exit 1
fi
repo_root=$(git rev-parse --show-toplevel)
if [[ -n $(git -C "$repo_root" status --porcelain) ]]; then
  echo 'Commit changes before releasing; only committed source is packaged.' >&2
  exit 1
fi
commit=$(git -C "$repo_root" rev-parse HEAD)
repository=probable-panda/p3code
output_dir="$repo_root/release/p3-$version"
if [[ -e "$output_dir" ]]; then
  echo "Release output already exists: $output_dir" >&2
  exit 1
fi
if [[ ${P3_RELEASE_BUILD_ONLY:-0} != 1 ]]; then
  gh release view "v$version" --repo "$repository" >/dev/null 2>&1 && {
    echo "Release v$version already exists; choose a new version." >&2
    exit 1
  }
  git -C "$repo_root" fetch origin p3
  git -C "$repo_root" merge-base --is-ancestor "$commit" origin/p3 || {
    echo 'Push this commit to the fork p3 branch before publishing.' >&2
    exit 1
  }
fi
stage=$(mktemp -d "${TMPDIR:-/tmp}/p3-release.XXXXXX")
checkout="$stage/source"
cleanup() {
  git -C "$repo_root" worktree remove --force "$checkout" >/dev/null 2>&1 || true
  rm -rf "$stage"
}
trap cleanup EXIT
git -C "$repo_root" worktree add --detach "$checkout" "$commit"
cd "$checkout"
# These are public relay identifiers, never the development checkout's credentials.
cp .env.example .env
vp i
node scripts/update-release-package-versions.ts "$version"
export T3CODE_DESKTOP_UPDATE_REPOSITORY="$repository"
args=(--platform mac --target dmg --arch arm64 --build-version "$version" --output-dir "$output_dir" --verbose)
if [[ ${P3_RELEASE_BUILD_ONLY:-0} != 1 ]]; then
  args+=(--signed)
fi
node scripts/build-desktop-artifact.ts "${args[@]}"
zip="$output_dir/T3-Code-$version-arm64.zip"
dmg="$output_dir/T3-Code-$version-arm64.dmg"
manifest="$output_dir/latest-mac.yml"
test -s "$zip" && test -s "$dmg" && test -s "$manifest"
grep -Fx "version: $version" "$manifest"
if [[ ${P3_RELEASE_BUILD_ONLY:-0} == 1 ]]; then
  echo "Build artifacts: $output_dir (unsigned; not published to the update feed)"
  exit 0
fi
ditto -x -k "$zip" "$stage/verify"
app="$stage/verify/P3 Code.app"
codesign --verify --deep --strict "$app"
codesign -dv "$app" 2>&1 | grep -F 'Authority=Developer ID Application:'
test "$(plutil -extract CFBundleShortVersionString raw "$app/Contents/Info.plist")" = "$version"
grep -Fx "repo: p3code" "$app/Contents/Resources/app-update.yml"
grep -Fx "owner: probable-panda" "$app/Contents/Resources/app-update.yml"
cd "$output_dir"
assets=("T3-Code-$version-arm64.dmg" "T3-Code-$version-arm64.zip" latest-mac.yml ./*.blockmap)
shasum -a 256 "${assets[@]}" > SHA256SUMS
printf 'P3 Code %s for Apple Silicon Macs.\n\nSource commit: %s\n\nInstall the DMG once to enable updates from probable-panda/p3code. Subsequent releases are available through the app updater.\n' "$version" "$commit" > "$stage/notes.md"
gh release create "v$version" "${assets[@]}" SHA256SUMS \
  --repo "$repository" --target "$commit" --title "P3 Code $version" \
  --notes-file "$stage/notes.md" --latest
