# Symlink this repo's skills into ~/.claude/skills for local testing.
# The logic lives in ./link-skills.sh; these are just friendly entry points.

# List available recipes.
default:
    @just --list

# Show each skill's link state; offer to link absent ones.
status:
    @./link-skills.sh status

# Symlink skills into ~/.claude/skills (all absent, or named ones).
link *names:
    @./link-skills.sh link {{names}}

# Remove this repo's symlinks from ~/.claude/skills (all, or named ones).
unlink *names:
    @./link-skills.sh unlink {{names}}
