# Claude Code

Shared, cross-agent repo guidance — read it first:

@AGENTS.md

## Claude-specific

- Skills install to `.claude/skills/` (project) or `~/.claude/skills/` (with `-g`).
- The skills.sh CLI discovers skills via `.claude-plugin/plugin.json`.
- A skill with `disable-model-invocation: true` is only run when the user types
  `/<name>`; otherwise the model may invoke it on its own based on the
  `description`.
