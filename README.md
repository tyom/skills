# tyom/skills

Tyom's personal collection of agent skills, installable with the
[skills.sh](https://skills.sh) CLI.

## Install

```bash
npx skills add tyom/skills
```

## Skills

- `explainer` — Builds a self-contained, interactive HTML explainer for any subject (repo, spec, API, or concept), grounded in its real source so a reader can retell it.
- `explain-diff` — Explains a code change (local diff, branch, commit range, or GitHub PR) as a self-contained HTML page: background, intuition, code walkthrough, and a comprehension quiz. Inspired by [explain-diff-html](https://gist.github.com/geoffreylitt/a29df1b5f9865506e8952488eac3d524).

## Local development

Symlink this repo's skills into `~/.claude/skills` to test them before publishing.
Edits to a `SKILL.md` are then live — just start a fresh session.

```bash
just status                 # show each skill's link state; offer to link absent ones
just link                   # symlink all absent skills (or: just link explain-diff)
just unlink                 # remove this repo's symlinks (or: just unlink explain-diff)
```

No `just`? Call the script directly: `./link-skills.sh status|link|unlink [names...]`.
It only ever touches its own symlinks — a real dir or a skill installed by the
CLI shows as `conflict` and is left untouched.

## Contributing

See [`AGENTS.md`](AGENTS.md) for how skills are structured and how to add one.

## License

[MIT](LICENSE)
