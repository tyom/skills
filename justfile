# Symlink this repo's skills into each agent's skills dir (~/.claude, ~/.agents) for local testing.
# The logic lives in ./link-skills.sh; these are just friendly entry points.

# List available recipes.
default:
    @just --list

# Show each skill's link state; offer to link absent ones.
status:
    @./link-skills.sh status

# Symlink skills into each agent's skills dir (all absent, or named ones).
link *names:
    @./link-skills.sh link {{names}}

# Remove this repo's symlinks from each agent's skills dir (all, or named ones).
unlink *names:
    @./link-skills.sh unlink {{names}}

# Serve a skill's page with hot reload, filled from one of its fixtures.
play skill="flow" fixture="example":
    #!/usr/bin/env bash
    cd skills/{{skill}}
    rm -f src/.dev.html
    assets/build.py --template src/template.html assets/{{fixture}}.json src/.dev.html {{justfile_directory()}}
    bun src/.dev.html
