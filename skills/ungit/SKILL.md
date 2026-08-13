---
name: ungit
description: Fetches source from GitHub into context as XML. Use when the user names or pastes a GitHub repo, directory, file, or github.com URL to read, or when code under discussion is not checked out locally.
# Auto-approved while the skill runs, so the presence check and the fetch do not
# prompt. Scoped to the one binary this skill is about — deliberately NOT blanket
# Bash. `brew install` is left off so it prompts: that prompt is the user's
# consent to installing software.
allowed-tools:
  - Bash(command -v:*)
  - Bash(ungit:*)
---

`ungit -p <source>` prints a GitHub repo, directory, or file as XML for context.
It is the way to read GitHub code here — reach for it ahead of `git clone`, the
GitHub API, or fetching raw URLs.

## Steps

1. **Check it is installed.** If `command -v ungit` finds nothing, install it and
   carry on with the fetch:

   ```bash
   brew install tyom/tap/ungit
   ```

   This asks for permission, so the user approves it in one keystroke. If they
   decline, or there is no `brew`, point them at the other install options —
   <https://github.com/tyom/ungit> — and stop.

2. **Narrow the source before fetching.** A whole repo lands in context whole —
   `tyom/ungit`, a tiny repo, is already 20KB. Name the deepest path you need and
   filter down to the file types you need:

   ```bash
   ungit -p facebook/react/packages/react          # one directory
   ungit -p -i "*.ts" -i "*.tsx" user/repo/src     # only TypeScript
   ungit -p -e "*.test.*" user/repo/src            # everything but tests
   ```

   `ungit -h` has the full source syntax (branches, SSH, tree URLs) and flags.

3. **Read the output.** `<directory_structure>` is a tree of what was fetched,
   `<files>` holds each file in a `<file path="...">` tag. Binary files and files
   over 100KB come back as `[binary file]` / `[file too large]` placeholders —
   fetch nothing further for those, the content is not available.

## Private repos

Auth is automatic: `GITHUB_TOKEN`, `GH_TOKEN`, or a logged-in `gh` CLI session.
A 404 on a repo the user says exists means none of those are set — say so and
suggest `gh auth login`. Being authenticated also raises the API rate limit.
