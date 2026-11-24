<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/mark-dark.svg">
    <img src="assets/mark.svg" alt="dotfiles" width="300">
  </picture>
</p>

Tyom's personal collection of agent skills, installable with the
[skills.sh](https://skills.sh) CLI.

## Install

```bash
npx skills add tyom/skills
```

## Skills

| Skill | What it does | Runs |
|---|---|---|
| **explainer** | Builds an interactive HTML explainer for a repo, spec, API or concept, pitched at the reader | `/explainer` |
| **explain-diff** | Explains a diff, branch, commit range or PR as an HTML page with a walkthrough and quiz | auto |
| [**flow**](skills/flow/README.md) | Traces a request, pipeline, state machine or user journey through real source as an interactive graph | `/flow` |
| **humanizer** | Rewrites prose so it reads like a person wrote it | auto |
| **micro-world** | Builds an interactive simulation of code or a concept, with knobs to poke | `/micro-world` |
| **screen-capture** | Records a scripted web or iOS Simulator flow and renders a captioned MP4 or screenshots | `/screen-capture` |
| **ungit** | Fetches a GitHub repo, directory or file as LLM-friendly text. Needs the [`ungit`](https://github.com/tyom/ungit) CLI | auto |

**Runs:** `/name` means slash-only. **auto** means the agent can also invoke it on its own.

## Local development

Symlink this repo's skills into `~/.claude/skills` (Claude Code) and `~/.agents/skills` (Codex and other agents; where `npx skills add` installs) to test them before publishing.
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
