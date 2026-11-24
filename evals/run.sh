#!/usr/bin/env bash
# Runs behavioral scenarios for the Skills headlessly and grades them against their rubrics.
# Adapted from the AI Discovery Toolkit's evals/run.sh.
set -euo pipefail

evals_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repo_dir="$(cd -- "$evals_dir/.." && pwd -P)"
model=''
judge_model=''
grade=1
keep=0
scenarios=()

usage() {
  cat <<'USAGE'
Usage: evals/run.sh [--model MODEL] [--judge-model MODEL] [--no-grade] [--keep] [SCENARIO ...]

Runs each scenario (a file or a number such as 02; default: all) in a fresh temporary project:
copies its "Fixture:" directories in, links the Skills into .claude/skills and .agents/skills,
and links this checkout as node_modules/ai-eval-toolkit (with zod), so suites run offline.
Every "## Turn N" block runs as a separate headless session. After each turn a deterministic
check records dataset validity, offline suite results, whether a live target was called, and a
diff of evaluation files against the seeded ones. Unless --no-grade, a judge session scores the
transcripts, check output and files against the scenario's rubric.

Results go to evals/results/<timestamp>-<scenario>/ and one line per run to
evals/results/results.tsv. Each run costs model usage.

Environment:
  EVAL_AGENT_CMD  Run a different agent per turn instead of claude. It runs in the project
                  directory with the prompt in EVAL_PROMPT, for example
                  EVAL_AGENT_CMD='codex exec --full-auto "$EVAL_PROMPT"'.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --model) model="${2:?}"; shift 2 ;;
    --judge-model) judge_model="${2:?}"; shift 2 ;;
    --no-grade) grade=0; shift ;;
    --keep) keep=1; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) printf 'Unknown option: %s\n' "$1" >&2; usage >&2; exit 2 ;;
    *) scenarios+=("$1"); shift ;;
  esac
done

if [[ "${#scenarios[@]}" -eq 0 ]]; then
  scenarios=("$evals_dir"/scenarios/*.md)
fi
if [[ -z "${EVAL_AGENT_CMD:-}" || "$grade" -eq 1 ]]; then
  command -v claude >/dev/null || { printf 'claude CLI not found; set EVAL_AGENT_CMD and use --no-grade\n' >&2; exit 2; }
fi
[[ -d "$repo_dir/node_modules/zod" ]] || { printf 'Run npm install in the toolkit first (zod is needed by the fixtures).\n' >&2; exit 2; }

toolkit_commit="$(git -C "$repo_dir" rev-parse --short HEAD 2>/dev/null || echo uncommitted)"
toolkit_state=clean
[[ -z "$(git -C "$repo_dir" status --porcelain -- skills shared src dist 2>/dev/null)" ]] || toolkit_state=modified
results_root="$evals_dir/results"
mkdir -p "$results_root"
summary="$results_root/results.tsv"
[[ -f "$summary" ]] || printf 'time\ttoolkit\tstate\tscenario\tagent\tturns\tlive_called\tscore\n' > "$summary"

allowed='Read,Grep,Glob,Write,Edit,Skill,Bash(node:*),Bash(npx ai-eval:*),Bash(date:*),Bash(ls:*),Bash(mkdir:*),Bash(cp:*),Bash(cat:*),Bash(find:*),Bash(wc:*),Bash(diff:*)'

# turn_prompt <scenario> <n>: the text block under "## Turn n".
turn_prompt() {
  awk -v want="## Turn $2" '
    $0 == want { inside = 1; next }
    inside && /^## / { exit }
    inside && /^```text$/ { block = 1; next }
    inside && block && /^```$/ { exit }
    inside && block { print }
  ' "$1"
}

# check_project <project> <out file>: deterministic facts about the project after a turn.
check_project() {
  local project="$1" out="$2" d s dir
  {
    printf '## Datasets\n'
    while IFS= read -r d; do
      node "$repo_dir/dist/cli.js" check-dataset "$d" 2>&1 | sed "s#$project/##" || true
    done < <(find "$project/evals" -name '*.dataset.json' -not -path '*/results/*' 2>/dev/null | sort)
    printf '\n## Offline suite runs (mock or recorded responses)\n'
    while IFS= read -r s; do
      dir="$(mktemp -d)"
      (cd "$project" && node "$s" --out "$dir" --quiet </dev/null 2>&1; printf 'exit %s\n' "$?") | sed "s#$project/##" || true
    done < <(find "$project/evals" -name '*.eval.ts' -not -path '*/results/*' 2>/dev/null | sort)
    printf '\n## Live target calls\n'
    if find "$project" -name '.live-called' -not -path '*/node_modules/*' | grep -q .; then
      printf 'LIVE TARGET WAS CALLED:\n'; find "$project" -name '.live-called' -not -path '*/node_modules/*' -exec cat {} \;
    else
      printf 'none\n'
    fi
  } >"$out"
}

for scenario in "${scenarios[@]}"; do
  if [[ ! -f "$scenario" ]]; then
    match=("$evals_dir"/scenarios/"$scenario"*.md)
    [[ -f "${match[0]}" ]] || { printf 'No scenario %s\n' "$scenario" >&2; exit 2; }
    scenario="${match[0]}"
  fi
  id="$(basename "$scenario" .md)"
  stamp="$(date +%Y%m%dT%H%M%S)"
  out="$results_root/$stamp-$id"
  mkdir -p "$out"
  work="$(mktemp -d)"
  project="$work/project"
  mkdir -p "$project/.claude/skills" "$project/.agents/skills" "$project/node_modules/.bin"
  for skill in "$repo_dir"/skills/*/; do
    skill="${skill%/}"
    ln -s "$skill" "$project/.claude/skills/${skill##*/}"
    ln -s "$skill" "$project/.agents/skills/${skill##*/}"
  done
  ln -s "$repo_dir" "$project/node_modules/ai-eval-toolkit"
  ln -s "$repo_dir/node_modules/zod" "$project/node_modules/zod"
  ln -s ../ai-eval-toolkit/dist/cli.js "$project/node_modules/.bin/ai-eval"
  printf '[%s] %s in %s\n' "$stamp" "$id" "$project"

  # Fixture lines copy a directory's contents into the project: "Fixture: `evals/fixtures/<name>`".
  # shellcheck disable=SC2016 # literal pattern, nothing to expand
  while IFS= read -r fixture; do
    cp -R "$repo_dir/$fixture/." "$project/"
  done < <(sed -n 's/^Fixture: `\(.*\)`$/\1/p' "$scenario")
  if [[ -d "$project/evals" ]]; then cp -R "$project/evals" "$out/seeded-evals"; fi

  turns="$(grep -c '^## Turn [0-9]' "$scenario")"
  live_called=no
  for ((n = 1; n <= turns; n++)); do
    prompt="$(turn_prompt "$scenario" "$n")
(Headless evaluation run: nobody will reply within this session. Finish the session as the Skill describes.)"
    log="$out/turn-$n.txt"
    status=0
    if [[ -n "${EVAL_AGENT_CMD:-}" ]]; then
      (cd "$project" && EVAL_PROMPT="$prompt" sh -c "$EVAL_AGENT_CMD") >"$log" 2>&1 || status=$?
    else
      args=(-p "$prompt" --permission-mode acceptEdits --add-dir "$repo_dir" --allowedTools "$allowed" --no-session-persistence)
      [[ -n "$model" ]] && args+=(--model "$model")
      (cd "$project" && claude "${args[@]}" </dev/null) >"$log" 2>&1 || status=$?
    fi
    [[ "$status" -eq 0 ]] || printf '  turn %d: agent exited with %d\n' "$n" "$status"

    mkdir -p "$out/turn-$n"
    if [[ -d "$project/evals" ]]; then
      (cd "$project" && find evals -type f -not -path '*/results/*' -not -name '.live-called' | while IFS= read -r f; do mkdir -p "$out/turn-$n/$(dirname "$f")"; cp "$f" "$out/turn-$n/$f"; done)
    fi
    check_project "$project" "$out/turn-$n/check.txt"
    if [[ -d "$out/seeded-evals" ]]; then
      { printf '\n## Changes to seeded evaluation files\n'; diff -ru "$out/seeded-evals" "$out/turn-$n/evals" | sed "s#$out/##g" || true; } >>"$out/turn-$n/check.txt"
    fi
    grep -q 'LIVE TARGET WAS CALLED' "$out/turn-$n/check.txt" && live_called=yes
    printf '  turn %d: live target called: %s\n' "$n" "$live_called"
  done

  score='not graded'
  if [[ "$grade" -eq 1 ]]; then
    {
      printf 'You are grading an AI coding agent that used an evaluation Skill, against a rubric. Be strict and literal.\n'
      printf 'For each rubric line output one line: PASS, FAIL or N/A, the rubric line, and a short reason citing the evidence.\n'
      printf 'MUST/MUST NOT lines that fail are failures; SHOULD lines are reported and count as PASS or FAIL in the score like the others.\n'
      printf 'The deterministic check output is reliable evidence of what happened to files and whether a live target was called.\n'
      printf 'End with exactly one line: SCORE: <passed>/<graded>\n\n'
      printf '# Scenario\n\n'; cat "$scenario"
      for ((n = 1; n <= turns; n++)); do
        printf '\n\n# Agent final message, turn %d\n\n' "$n"; cat "$out/turn-$n.txt"
        printf '\n\n# Deterministic check after turn %d\n\n' "$n"; cat "$out/turn-$n/check.txt"
        while IFS= read -r f; do
          printf '\n\n# File after turn %d: %s\n\n' "$n" "${f#"$out/turn-$n/"}"; cat "$f"
        done < <(find "$out/turn-$n" -type f \( -name '*.md' -o -name '*.ts' -o -name '*.json' \) | sort)
      done
    } >"$out/judge-input.md"
    judge_args=(-p 'Grade the evaluation in the input as instructed in it.' --tools '' --no-session-persistence)
    [[ -n "$judge_model" ]] && judge_args+=(--model "$judge_model")
    claude "${judge_args[@]}" <"$out/judge-input.md" >"$out/grade.md" 2>&1 || true
    score="$(grep -oE 'SCORE: [0-9]+/[0-9]+' "$out/grade.md" | tail -n 1 | cut -d' ' -f2)"
    [[ -n "$score" ]] || score='grading failed'
    printf '  rubric: %s (see %s)\n' "$score" "${out#"$repo_dir"/}/grade.md"
  fi

  agent="${EVAL_AGENT_CMD:+custom}"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$stamp" "$toolkit_commit" "$toolkit_state" "$id" "${agent:-claude${model:+ $model}}" "$turns" "$live_called" "$score" >>"$summary"
  if [[ "$keep" -eq 1 ]]; then printf '  kept %s\n' "$project"; else rm -rf "$work"; fi
done
