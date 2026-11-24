#!/usr/bin/env bash
# Regression cases for scripts/install.sh, run in temporary directories only.
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
installer="$script_dir/install.sh"
work="$(mktemp -d)"
trap 'rm -rf -- "$work"' EXIT
failures=0
skills=()
for d in "$script_dir"/../skills/*/; do [[ -f "$d/SKILL.md" ]] && skills+=("$(basename "$d")"); done

check() { # check <description> <command...>
  local description="$1"; shift
  if "$@"; then printf 'ok   %s\n' "$description"; else printf 'FAIL %s\n' "$description" >&2; failures=$((failures + 1)); fi
}
all_linked() { local s; for s in "${skills[@]}"; do [[ -L "$1/$s" ]] || return 1; done; }
all_copied() { local s; for s in "${skills[@]}"; do [[ -d "$1/$s" && ! -L "$1/$s" && -f "$1/$s/SKILL.md" && -f "$1/$s/.eval-toolkit-copy" ]] || return 1; done; }
none_present() { local s; for s in "${skills[@]}"; do [[ ! -e "$1/$s" && ! -L "$1/$s" ]] || return 1; done; }

# Global mode, redirected into the temporary directory.
export CLAUDE_SKILLS_DIR="$work/home/.claude/skills" CODEX_SKILLS_DIR="$work/home/.agents/skills"
bash "$installer" --dry-run >/dev/null
check 'global dry run creates nothing' test ! -e "$work/home"
bash "$installer" >/dev/null
check 'global install links every Skill for Claude Code' all_linked "$CLAUDE_SKILLS_DIR"
check 'global install links every Skill for Codex' all_linked "$CODEX_SKILLS_DIR"
check 'global rerun reports already linked' grep -q 'already linked' <(bash "$installer")
bash "$installer" --uninstall >/dev/null
check 'global uninstall removes the links' none_present "$CLAUDE_SKILLS_DIR"
unset CLAUDE_SKILLS_DIR CODEX_SKILLS_DIR

# Project mode.
project="$work/project"
mkdir -p "$project/.claude/skills/${skills[0]}"
printf 'someone else\n' >"$project/.claude/skills/${skills[0]}/SKILL.md"
bash "$installer" --project "$project" --dry-run >/dev/null 2>&1
check 'project dry run creates nothing' test ! -e "$project/.agents"
bash "$installer" --project "$project" >/dev/null 2>&1
check 'project install copies every Skill for Codex' all_copied "$project/.agents/skills"
check 'project install leaves an unrelated folder alone' grep -q 'someone else' "$project/.claude/skills/${skills[0]}/SKILL.md"
check 'copies are not symlinks to this machine' bash -c "! find '$project' -type l | grep -q ."
printf 'local edit\n' >>"$project/.agents/skills/${skills[0]}/SKILL.md"
bash "$installer" --project "$project" --codex-only >/dev/null 2>&1
check 'project rerun overwrites its own copies' bash -c "! grep -q 'local edit' '$project/.agents/skills/${skills[0]}/SKILL.md'"
check 'copy marker names the toolkit commit' grep -q 'Copied from ai-eval-toolkit' "$project/.agents/skills/${skills[0]}/.eval-toolkit-copy"
bash "$installer" --project "$project" --uninstall >/dev/null 2>&1
check 'project uninstall removes its copies' none_present "$project/.agents/skills"
check 'project uninstall keeps the unrelated folder' test -f "$project/.claude/skills/${skills[0]}/SKILL.md"

status=0; bash "$installer" --project "$work/missing" >/dev/null 2>&1 || status=$?
check 'a missing project directory is a usage error' test "$status" -eq 2
status=0; bash "$installer" --project "$script_dir/.." >/dev/null 2>&1 || status=$?
check 'the toolkit itself is refused as a project' test "$status" -eq 2

if [[ "$failures" -gt 0 ]]; then printf '%s installer case(s) failed.\n' "$failures" >&2; exit 1; fi
printf 'All installer cases passed.\n'
