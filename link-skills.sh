#!/usr/bin/env bash
# Dev helper: symlink this repo's skills into ~/.claude/skills for local testing.
# ponytail: symlinks, so edits to SKILL.md are live — no build, no reinstall.
set -euo pipefail

GLOBAL="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
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
  local n="$1" t="$GLOBAL/$n"
  case "$(state_of "$n")" in
    linked)   row "=" "$D" linked   "$n (already)" ;;
    conflict) row "✗" "$Y" conflict "$n — $t exists and isn't ours; skipping" ;;
    absent)   ln -s "$REPO_SKILLS/$n" "$t"; row "+" "$G" linked "$n" ;;
  esac
}

unlink_one() {
  local n="$1"
  if links_here "$n"; then rm "$GLOBAL/$n"; row "-" "$G" removed "$n"
  else row "=" "$D" skipped "$n (not ours)"; fi
}

cmd_status() {
  printf '%s%s%s → %s~/.claude/skills%s\n\n' "$B" "$REPO_SKILLS" "$R" "$D" "$R"
  local n st absent=()
  for n in $(repo_skills); do
    st=$(state_of "$n"); render "$st" "$n"
    [ "$st" = absent ] && absent+=("$n")
  done
  echo
  [ ${#absent[@]} -eq 0 ] && return 0
  if [ -t 0 ]; then
    printf 'Link %d absent skill(s)? [y/N] ' "${#absent[@]}"; read -r reply
    case $reply in [yY]*) cmd_link "${absent[@]}" ;; esac
  else
    echo "Run '$0 link' to symlink the ${#absent[@]} absent skill(s)."
  fi
}

cmd_link() {
  mkdir -p "$GLOBAL"
  local names=("$@"); [ $# -eq 0 ] && names=($(repo_skills))
  local n; for n in "${names[@]}"; do link_one "$n"; done
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

case "${1:-status}" in
  status)   cmd_status ;;
  link)     shift; cmd_link "$@" ;;
  unlink)   shift; cmd_unlink "$@" ;;
  selftest) cmd_selftest ;;
  *) echo "usage: $0 [status | link [names...] | unlink [names...]]" >&2; exit 2 ;;
esac
