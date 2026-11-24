#!/usr/bin/env bash
# Structural checks for the toolkit itself: Skills, links, scripts, shared copies, templates,
# example datasets and eval scenarios. Bash, standard Unix tools and Node; no network.
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repo_dir="$(cd -- "$script_dir/.." && pwd -P)"
count=0

fail() { printf '%s\n' "$*" >&2; exit 1; }

# Skills: frontmatter that both Claude Code and Codex accept, and every bundled file they name.
for skill_dir in "$repo_dir"/skills/*; do
  [[ -d "$skill_dir" ]] || continue
  skill="$skill_dir/SKILL.md"
  name="${skill_dir##*/}"

  [[ -f "$skill" && "$(head -n 1 "$skill")" == '---' ]] || fail "Invalid or missing frontmatter: $skill"
  frontmatter_end="$(awk 'NR > 1 && $0 == "---" { print NR; exit }' "$skill")"
  [[ -n "$frontmatter_end" ]] || fail "Unclosed frontmatter: $skill"
  frontmatter="$(sed -n "2,$((frontmatter_end - 1))p" "$skill")"

  [[ "$name" =~ ^[a-z0-9-]{1,64}$ ]] || fail "Skill folder name must be lowercase letters, digits and hyphens, at most 64: $name"
  printf '%s\n' "$frontmatter" | grep -qFx "name: $name" || fail "Skill name must match directory: $skill"
  description="$(printf '%s\n' "$frontmatter" | sed -n 's/^description: //p')"
  [[ -n "$description" ]] || fail "Missing single-line description: $skill"
  # Codex limits descriptions to 500 characters; keep every Skill within it.
  [[ "${#description}" -le 500 ]] || fail "Description is ${#description} characters; keep it at most 500: $skill"
  extra="$(printf '%s\n' "$frontmatter" | grep -vE '^(name|description): ' || true)"
  [[ -z "$extra" ]] || fail "Only name and description are allowed in frontmatter, for portability: $skill"

  while IFS= read -r reference; do
    [[ -n "$reference" ]] || continue
    [[ -e "$skill_dir/$reference" ]] || fail "Missing bundled file $reference named in $skill"
  done < <(cat "$skill_dir"/SKILL.md "$skill_dir"/references/*.md | grep -v 'Generated from shared/' | grep -oE '(references|templates|scripts)/[A-Za-z0-9._-]+\.(md|sh|ts|json)' | sort -u)

  # shellcheck disable=SC2016 # literal pattern, nothing to expand
  if grep -rnE '\.\./\.\./|AskUserQuestion|TodoWrite|ExitPlanMode|\$CLAUDE_' "$skill_dir"; then
    fail "Skills must be self-contained and agent-neutral (no ../../ paths or agent-specific tool names): $skill_dir"
  fi

  printf 'Valid: %s\n' "$name"
  count=$((count + 1))
done
[[ "$count" -gt 0 ]] || fail 'No Skills found.'

# Local Markdown links.
while IFS= read -r doc; do
  while IFS= read -r link; do
    target="${link:2:${#link}-3}"
    target="${target%%#*}"
    case "$target" in
      ''|http://*|https://*|mailto:*|//*|/*) continue ;;
    esac
    [[ -e "$(dirname "$doc")/$target" ]] || fail "Missing Markdown link $target in $doc"
  done < <(grep -oE '\]\([^) ]*\)' "$doc" || true)
done < <(find "$repo_dir" \( -path "$repo_dir/.git" -o -path "$repo_dir/node_modules" -o -path "$repo_dir/evals/results" -o -path "$repo_dir/.tmp" -o -name results \) -prune -o -type f -name '*.md' -print)

# Script syntax.
while IFS= read -r script; do
  bash -n "$script" || fail "Syntax error: $script"
done < <(find "$repo_dir" \( -path "$repo_dir/.git" -o -path "$repo_dir/node_modules" -o -path "$repo_dir/evals/results" \) -prune -o -type f -name '*.sh' -print)

# Generated copies of shared/ files must match their source (Discovery Toolkit decision 0003).
bash "$script_dir/sync-shared.sh" --check

# JSON files parse; datasets pass the dataset checker.
while IFS= read -r json; do
  node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$json" || fail "Invalid JSON: $json"
done < <(find "$repo_dir" \( -path "$repo_dir/.git" -o -path "$repo_dir/node_modules" -o -path "$repo_dir/dist" -o -name results \) -prune -o -type f -name '*.json' -print)
datasets=("$repo_dir"/skills/*/templates/dataset.json "$repo_dir"/examples/*/*.dataset.json)
node "$repo_dir/src/cli.ts" check-dataset "${datasets[@]}" >/dev/null || fail "A template or example dataset fails the dataset checker"

bash "$script_dir/test-install.sh" >/dev/null

# Evals: every scenario has at least one turn and a rubric.
for scenario in "$repo_dir"/evals/scenarios/*.md; do
  [[ -e "$scenario" ]] || continue
  grep -q '^## Turn 1' "$scenario" || fail "Scenario without '## Turn 1': $scenario"
  grep -q '^## Rubric' "$scenario" || fail "Scenario without '## Rubric': $scenario"
done

printf 'Validated %s Skill(s), Markdown links, script syntax, shared copies, JSON, datasets, installer and eval scenarios.\n' "$count"
if git -C "$repo_dir" rev-parse --verify HEAD >/dev/null 2>&1; then
  printf 'Toolkit commit: %s\n' "$(git -C "$repo_dir" rev-parse HEAD)"
  if [[ -n "$(git -C "$repo_dir" status --porcelain --untracked-files=normal)" ]]; then
    printf 'Toolkit working tree: modified\n'
  else
    printf 'Toolkit working tree: clean\n'
  fi
else
  printf 'Toolkit commit: uncommitted\n'
fi
