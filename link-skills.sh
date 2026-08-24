#!/usr/bin/env bash
# Dev helper: symlink this repo's skills into each agent's skills dir for local testing.
# ponytail: symlinks, so edits to SKILL.md are live — no build, no reinstall.
set -euo pipefail

# Every agent reads its own dir; Codex won't see ~/.claude/skills.
SKILL_DIRS=("${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}" "${CODEX_SKILLS_DIR:-$HOME/.codex/skills}")
GLOBAL="${SKILL_DIRS[0]}"
REPO_SKILLS="$(cd "$(dirname "${BASH_SOURCE[0]}")/skills" && pwd -P)"

if [ -t 1 ]; then G=$'\e[32m'; Y=$'\e[33m'; D=$'\e[2m'; B=$'\e[1m'; R=$'\e[0m'
else G=""; Y=""; D=""; B=""; R=""; fi

# Absolute, symlink-free path (its parent dir must exist).
abspath() { echo "$(cd "$(dirname "$1")" && pwd -P)/$(basename "$1")"; }

# True if $GLOBAL/$1 is a symlink pointing into this repo.
links_here() {
  local t="$GLOBAL/$1" dest
  [ -L "$t" ] || return 1
  dest=$(readlink "$t")
  case $dest in /*) : ;; *) dest="$GLOBAL/$dest" ;; esac
  case "$(abspath "$dest" 2>/dev/null)" in "$REPO_SKILLS"/*) return 0 ;; *) return 1 ;; esac
}

repo_skills() {
  local d
  for d in "$REPO_SKILLS"/*/SKILL.md; do [ -e "$d" ] && basename "$(dirname "$d")"; done
}

state_of() {
  local t="$GLOBAL/$1"
  if links_here "$1"; then echo linked
  elif [ -e "$t" ] || [ -L "$t" ]; then echo conflict
  else echo absent; fi
}

row() { printf '  %s%s%s  %s%-9s%s %s\n' "$2" "$1" "$R" "$2" "$3" "$R" "$4"; }

render() {
  case "$1" in
    linked)   row "✓" "$G" linked   "$2" ;;
    absent)   row "·" "$D" absent   "$2" ;;
    conflict) row "✗" "$Y" conflict "$2" ;;
  esac
}

link_one() {
  local n="$1" force="${2:-}" t="$GLOBAL/$n"
  [ -e "$REPO_SKILLS/$n/SKILL.md" ] || { row "✗" "$Y" unknown "$n — no such skill in this repo"; return; }
  case "$(state_of "$n")" in
    linked)   row "=" "$D" linked   "$n (already)" ;;
    conflict)
      if [ -n "$force" ]; then
        rm -rf "$t"; ln -s "$REPO_SKILLS/$n" "$t"; row "+" "$G" linked "$n (replaced existing)"
      else
        row "✗" "$Y" conflict "$n — $t exists and isn't ours; re-run with -f to replace"
      fi ;;
    absent)   ln -s "$REPO_SKILLS/$n" "$t"; row "+" "$G" linked "$n" ;;
  esac
}

unlink_one() {
  local n="$1"
  if links_here "$n"; then rm "$GLOBAL/$n"; row "-" "$G" removed "$n"
  else row "=" "$D" skipped "$n (not ours)"; fi
}

# ~/.claude/skills → "claude"; shown only when the dirs disagree about a skill.
dir_label() { local p="${1%/*}"; p="${p##*/}"; echo "${p#.}"; }
short() { echo "${1/#$HOME/\~}"; }

# One row per skill across all dirs; ABSENT_PAIRS collects "dir name" to link.
cmd_status() {
  local d n i st sts same hs=""
  for d in "${SKILL_DIRS[@]}"; do hs="${hs:+$hs, }$(short "$d")"; done
  printf '%s%s%s → %s%s%s\n\n' "$B" "$REPO_SKILLS" "$R" "$D" "$hs" "$R"

  ABSENT_PAIRS=(); ABSENT_COUNT=0
  for n in $(repo_skills); do
    sts=()
    for d in "${SKILL_DIRS[@]}"; do
      GLOBAL="$d"; st=$(state_of "$n"); sts+=("$st")
      [ "$st" = absent ] && ABSENT_PAIRS+=("$d $n")
    done
    same=1
    for st in "${sts[@]}"; do [ "$st" = "${sts[0]}" ] || same=0; done
    if [ $same -eq 1 ]; then
      render "${sts[0]}" "$n"
    else
      for i in "${!SKILL_DIRS[@]}"; do
        render "${sts[$i]}" "$n $D($(dir_label "${SKILL_DIRS[$i]}"))$R"
      done
    fi
    case " ${sts[*]} " in *" absent "*) ABSENT_COUNT=$((ABSENT_COUNT + 1)) ;; esac
  done
  echo
}

cmd_link() {
  mkdir -p "$GLOBAL"
  local force="" names=() a
  for a in "$@"; do case $a in -f|--force) force=1 ;; *) names+=("$a") ;; esac; done
  [ ${#names[@]} -eq 0 ] && names=($(repo_skills))
  local n; for n in "${names[@]}"; do link_one "$n" "$force"; done
}

cmd_unlink() {
  local names=("$@")
  if [ $# -eq 0 ]; then
    names=(); local n
    for n in $(repo_skills); do links_here "$n" && names+=("$n"); done
    [ ${#names[@]} -eq 0 ] && { echo "Nothing linked from this repo."; return 0; }
    if [ -t 0 ]; then
      printf 'Remove all %d repo symlink(s)? [y/N] ' "${#names[@]}"; read -r reply
      case $reply in [yY]*) : ;; *) echo "Aborted."; return 0 ;; esac
    fi
  fi
  local n; for n in "${names[@]}"; do unlink_one "$n"; done
}

cmd_selftest() {
  local tmp; tmp=$(mktemp -d); GLOBAL="$tmp"
  local n; n=$(repo_skills); n=${n%%$'\n'*}
  ln -s "$REPO_SKILLS/$n" "$tmp/$n"
  links_here "$n" || { echo "FAIL: repo symlink not detected"; exit 1; }
  ln -sfn /etc "$tmp/$n"
  ! links_here "$n" || { echo "FAIL: foreign symlink misdetected"; exit 1; }
  rm -rf "$tmp"; echo "selftest ok"
}

cmd="${1:-status}"; [ $# -gt 0 ] && shift
case "$cmd" in
  status)
    cmd_status
    [ "$ABSENT_COUNT" -eq 0 ] && exit 0
    if [ ! -t 0 ]; then
      echo "Run '$0 link' to symlink the $ABSENT_COUNT absent skill(s)."; exit 0
    fi
    printf 'Link %d absent skill(s)? [y/N] ' "$ABSENT_COUNT"; read -r reply
    case $reply in
      [yY]*)
        for GLOBAL in "${SKILL_DIRS[@]}"; do
          names=()
          for pair in "${ABSENT_PAIRS[@]}"; do
            if [ "${pair% *}" = "$GLOBAL" ]; then names+=("${pair##* }"); fi
          done
          [ ${#names[@]} -gt 0 ] || continue
          printf '\n%s%s%s\n' "$D" "$(short "$GLOBAL")" "$R"
          cmd_link "${names[@]}"
        done ;;
    esac ;;
  link|unlink)
    for GLOBAL in "${SKILL_DIRS[@]}"; do "cmd_$cmd" "$@"; done ;;
  selftest) cmd_selftest ;;
  *) echo "usage: $0 [status | link [-f] [names...] | unlink [names...]]" >&2; exit 2 ;;
esac
