#!/usr/bin/env bash
# Copies shared method files into each Skill that lists them in its shared.txt (decision 0003).
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repo_dir="$(cd -- "$script_dir/.." && pwd -P)"
shared_dir="$repo_dir/shared"
check=0

usage() {
  cat <<'USAGE'
Usage: ./scripts/sync-shared.sh [--check]

For every skills/<name>/shared.txt, writes each listed file from shared/ into the
Skill at the same relative path, with a generated-file marker.
--check  write nothing; exit 1 if any copy is missing or differs from its source.
USAGE
}

for arg in "$@"; do
  case "$arg" in
    --check) check=1 ;;
    --help|-h) usage; exit 0 ;;
    *) printf 'Unknown option: %s\n' "$arg" >&2; usage >&2; exit 2 ;;
  esac
done

# generate <relative path>: the source with a marker; Markdown gets an HTML comment,
# scripts get a comment after the shebang.
generate() {
  local rel="$1" src="$shared_dir/$1"
  local marker="Generated from shared/$rel by scripts/sync-shared.sh. Edit that file, then run the script."
  case "$rel" in
    *.md) printf '<!-- %s -->\n' "$marker"; cat "$src" ;;
    *.sh) head -n 1 "$src"; printf '# %s\n' "$marker"; tail -n +2 "$src" ;;
    *) printf 'Unsupported shared file type: %s\n' "$rel" >&2; return 1 ;;
  esac
}

drift=0
listed=0
for manifest in "$repo_dir"/skills/*/shared.txt; do
  [[ -e "$manifest" ]] || continue
  skill_dir="$(dirname "$manifest")"
  while IFS= read -r rel || [[ -n "$rel" ]]; do
    rel="${rel%%#*}"; rel="${rel//[[:space:]]/}"
    [[ -n "$rel" ]] || continue
    [[ -f "$shared_dir/$rel" ]] || { printf 'Missing shared file %s listed in %s\n' "$rel" "${manifest#"$repo_dir"/}" >&2; exit 1; }
    dest="$skill_dir/$rel"
    listed=$((listed + 1))
    if [[ "$check" -eq 1 ]]; then
      if ! cmp -s <(generate "$rel") "$dest"; then
        printf 'Out of sync: %s (edit shared/%s, then run ./scripts/sync-shared.sh)\n' "${dest#"$repo_dir"/}" "$rel" >&2
        drift=1
      fi
    else
      mkdir -p "$(dirname "$dest")"
      generate "$rel" >"$dest"
      [[ "$rel" != *.sh ]] || chmod +x "$dest"
    fi
  done <"$manifest"
done

if [[ "$check" -eq 1 && "$drift" -ne 0 ]]; then exit 1; fi
if [[ "$check" -eq 1 ]]; then
  printf 'Shared files in sync (%d copies).\n' "$listed"
else
  printf 'Synced %d shared file copies.\n' "$listed"
fi
