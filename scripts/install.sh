#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repo_dir="$(cd -- "$script_dir/.." && pwd -P)"
codex_dir="${CODEX_SKILLS_DIR:-$HOME/.agents/skills}"
claude_dir="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
install_codex=1
install_claude=1
dry_run=0
uninstall=0
project=''
marker_name='.eval-toolkit-copy'

usage() {
  cat <<'USAGE'
Usage: ./scripts/install.sh [--project DIR] [--codex-only | --claude-only] [--dry-run] [--uninstall]

Without --project: links this repository's evaluation skills into personal Codex and
Claude Code skill directories (~/.agents/skills, ~/.claude/skills). git pull updates them.
Override destinations with CODEX_SKILLS_DIR and CLAUDE_SKILLS_DIR.

With --project DIR: copies the skills into DIR/.agents/skills and DIR/.claude/skills,
so they travel with that repository to collaborators and other machines. Each copy holds
a .eval-toolkit-copy file naming the toolkit commit; rerun the same command to
update copies made by this installer.

Existing paths this installer did not create are left untouched.
--uninstall removes only links or copies created by this installer.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --codex-only) install_claude=0 ;;
    --claude-only) install_codex=0 ;;
    --dry-run) dry_run=1 ;;
    --uninstall) uninstall=1 ;;
    --project)
      [[ $# -ge 2 && -n "$2" ]] || { printf -- '--project needs a directory\n' >&2; exit 2; }
      project="$2"; shift ;;
    --help|-h) usage; exit 0 ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

if [[ -n "$project" ]]; then
  [[ -d "$project" ]] || { printf 'Project directory not found: %s\n' "$project" >&2; exit 2; }
  project="$(cd -- "$project" && pwd -P)"
  [[ "$project" != "$repo_dir" ]] || { printf 'Use --project with a target project, not this toolkit.\n' >&2; exit 2; }
  codex_dir="$project/.agents/skills"
  claude_dir="$project/.claude/skills"
fi

if [[ "$install_codex" -eq 0 && "$install_claude" -eq 0 ]]; then
  printf 'Choose only one of --codex-only and --claude-only.\n' >&2
  exit 2
fi

install_into() {
  local dest_dir="$1"
  local label="$2"
  local source dest skill_name

  if [[ "$dry_run" -eq 0 && "$uninstall" -eq 0 ]]; then
    mkdir -p -- "$dest_dir"
  fi

  for source in "$repo_dir"/skills/*; do
    [[ -d "$source" && -f "$source/SKILL.md" ]] || continue
    skill_name="${source##*/}"
    dest="$dest_dir/$skill_name"

    if [[ "$uninstall" -eq 1 ]]; then
      if [[ -L "$dest" && "$(readlink "$dest")" == "$source" ]]; then
        if [[ "$dry_run" -eq 1 ]]; then
          printf '%s: would remove %s\n' "$label" "$dest"
        else
          rm -- "$dest"
          printf '%s: removed %s\n' "$label" "$dest"
        fi
      elif [[ -e "$dest" || -L "$dest" ]]; then
        printf '%s: kept unrelated path %s\n' "$label" "$dest"
      fi
    elif [[ -L "$dest" && "$(readlink "$dest")" == "$source" ]]; then
      printf '%s: already linked %s\n' "$label" "$dest"
    elif [[ -e "$dest" || -L "$dest" ]]; then
      printf '%s: skipped existing path %s\n' "$label" "$dest" >&2
    elif [[ "$dry_run" -eq 1 ]]; then
      printf '%s: would link %s -> %s\n' "$label" "$dest" "$source"
    else
      ln -s -- "$source" "$dest"
      printf '%s: linked %s -> %s\n' "$label" "$dest" "$source"
    fi
  done
}

toolkit_commit="$(git -C "$repo_dir" rev-parse --short HEAD 2>/dev/null || echo uncommitted)"
if [[ -n "$(git -C "$repo_dir" status --porcelain -- skills 2>/dev/null)" ]]; then toolkit_commit="$toolkit_commit (modified)"; fi

is_our_copy() { [[ -d "$1" && ! -L "$1" && -f "$1/$marker_name" ]]; }

copy_into() {
  local dest_dir="$1"
  local label="$2"
  local source dest skill_name action

  if [[ "$dry_run" -eq 0 && "$uninstall" -eq 0 ]]; then
    mkdir -p -- "$dest_dir"
  fi

  for source in "$repo_dir"/skills/*; do
    [[ -d "$source" && -f "$source/SKILL.md" ]] || continue
    skill_name="${source##*/}"
    dest="$dest_dir/$skill_name"

    if [[ "$uninstall" -eq 1 ]]; then
      if is_our_copy "$dest"; then
        if [[ "$dry_run" -eq 1 ]]; then
          printf '%s: would remove copy %s\n' "$label" "$dest"
        else
          rm -rf -- "$dest"
          printf '%s: removed copy %s\n' "$label" "$dest"
        fi
      elif [[ -e "$dest" || -L "$dest" ]]; then
        printf '%s: kept unrelated path %s\n' "$label" "$dest"
      fi
      continue
    fi

    if is_our_copy "$dest"; then
      action='updated'
    elif [[ -e "$dest" || -L "$dest" ]]; then
      printf '%s: skipped existing path %s\n' "$label" "$dest" >&2
      continue
    else
      action='copied'
    fi
    if [[ "$dry_run" -eq 1 ]]; then
      printf '%s: would %s %s\n' "$label" "${action%ed}" "$dest"
      continue
    fi
    [[ "$action" != 'updated' ]] || rm -rf -- "$dest"
    cp -R -- "$source" "$dest"
    printf 'Copied from ai-eval-toolkit %s on %s.\nDo not edit: rerun scripts/install.sh --project from the toolkit to update; local edits are overwritten.\n' \
      "$toolkit_commit" "$(date +%Y-%m-%d)" >"$dest/$marker_name"
    printf '%s: %s %s (toolkit %s)\n' "$label" "$action" "$dest" "$toolkit_commit"
  done
}

if [[ -n "$project" ]]; then
  if [[ "$install_codex" -eq 1 ]]; then copy_into "$codex_dir" 'Codex'; fi
  if [[ "$install_claude" -eq 1 ]]; then copy_into "$claude_dir" 'Claude Code'; fi
else
  if [[ "$install_codex" -eq 1 ]]; then install_into "$codex_dir" 'Codex'; fi
  if [[ "$install_claude" -eq 1 ]]; then install_into "$claude_dir" 'Claude Code'; fi
fi
