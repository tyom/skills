# Working in this repo

This is a personal collection of **agent skills**, installable via the
[skills.sh](https://skills.sh) CLI (`npx skills add tyom/skills`).

This file is the shared, cross-agent context seed. Adapter-specific notes for a
particular tool live in that tool's own file (e.g. `CLAUDE.md`), which points
here for the shared guidance.

## Structure

- Skills live in a **flat layout**: `skills/<name>/SKILL.md`.
- Each skill is one folder containing a `SKILL.md` with YAML frontmatter.

## Adding a skill

1. Create `skills/<name>/SKILL.md` (or run `npx skills init <name>`).
2. Fill in the frontmatter and body. The `name` must be kebab-case and match the
   folder name.
3. Register the path in `.claude-plugin/plugin.json` (add `"./skills/<name>"` to
   the `skills` array).
4. Add a row to the Skills table in `README.md`.

A `SKILL.md` has YAML frontmatter — required `name` (kebab-case) and
`description`, optional `disable-model-invocation: true` — followed by a markdown
body (Purpose / When to use / Steps).

## Writing good descriptions

The `description` frontmatter field is how the agent decides whether to invoke a
skill, so make it count:

- Write in the **third person**.
- Name the **trigger** — what the user is doing or asking when this skill applies.
- Include concrete keywords and cues the user is likely to say.
- Set `disable-model-invocation: true` for skills that should only run when the
  user explicitly types `/<name>` (never auto-invoked by the model).
