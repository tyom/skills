---
name: d2
description: "Builds presentation-grade diagrams locally with the D2 CLI. Use when the user wants a polished diagram — architecture, system, or box-and-line — or names D2 or TALA. For quick multi-language rendering without installing anything, the kroki skill covers it."
argument-hint: "<what to diagram, or existing .d2 source>"
# Auto-approved while the skill runs: file ops plus the render loop commands.
# The one-time brew/install.sh bootstrap still prompts, deliberately.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash(d2:*)
  - Bash(qlmanage:*)
  - Bash(rsvg-convert:*)
  - Bash(open:*)
---

# D2

Render a presentation-grade diagram locally with the D2 CLI — free and
watermark-free.

Every command below is pre-approved, but only as a **bare command with
absolute paths**. Chaining (`cd … && d2 …`, `d2 … && qlmanage …`, `a; b`)
matches no allow-rule and prompts the user, as does editing the source with
`sed`/`python3 -c`/heredocs. So: one command per Bash call, never `cd`, and
revise the `.d2` with Edit or Write.

## Steps

1. **Check the toolchain.** `d2 --version` works, or bootstrap once:
   `brew install d2` (macOS) or
   `curl -fsSL https://d2lang.com/install.sh | sh` elsewhere.

2. **Pick the layout.** Default to the bundled `elk` engine. The one upgrade
   is TALA — Terrastruct's engine built for architecture diagrams — and it
   requires a paid subscription: use `--layout tala` only when the user is
   licensed (`$TSTRUCT_TOKEN` set or `~/.config/tstruct/auth.json` exists,
   plugin via `brew install terrastruct/tap/tala`). Unlicensed TALA stamps
   an `UNLICENSED COPY` watermark across the output.

3. **Write the source** to a `.d2` file in the scratchpad, then render:

   ```sh
   d2 --layout elk --theme 0 --pad 32 /abs/path/diagram.d2 /abs/path/diagram.svg
   ```

   Compile errors name the offending line — fix the source with Edit and
   re-render until it compiles. Labels containing `[`, `]`, `|`, `<`, `>` or a
   trailing `(…)` must be quoted (`node: "Run: cmd [arg]"`), and a chained edge
   (`a -> b -> c: label`) stamps the label on **both** edges — split it.
   Keep one **house style** per project: the same theme
   and layout across every diagram is most of what reads as sleek. `d2 themes`
   lists the palette options; `--sketch` gives a deliberate hand-drawn look;
   `--dark-theme <id>` adds a dark variant.

   Two graph shapes compile fine and still proof badly. Both are cheaper to
   avoid than to debug:

   - **Cycles invert the layout.** One back-edge (a round trip through a
     database, a response returning to the caller it came from) makes ELK
     reverse the whole diagram so it reads bottom-up. Break the cycle at the
     source: split a read/write store into two nodes, and a request/response
     terminal into two nodes. Duplicating one box beats an upside-down diagram.
   - **Container-crossing edges route around, not through.** Every edge that
     enters or leaves a container gets dragged around its border, and a handful
     turn into spaghetti. Reserve containers for clusters whose edges mostly
     stay inside; a container drawn only to group two or three nodes visually
     is cheaper as a `style.stroke-dash` on the nodes themselves.

   Read a bidirectional relationship as one `a <-> b` edge rather than two
   opposing edges — the two-edge form is a cycle, and pays the cost above.

4. **Proof it.** d2's own PNG export is broken (it fetches Playwright from a
   retired CDN), so rasterize the SVG:

   ```sh
   qlmanage -t -s 1600 -o /abs/path /abs/path/diagram.svg   # → diagram.svg.png (macOS)
   rsvg-convert -w 1600 /abs/path/diagram.svg -o /abs/path/diagram.png   # elsewhere
   ```

   Pass the output dir to `-o` explicitly; `-o .` would need a `cd`, which
   prompts.

   Read the PNG and compare it against the intent: every node, label, and
   relationship present, spelled right, and legible — and the watermark
   absent. A wrong or cluttered proof means edit the source and re-render.
   Done only when the proof passes.

5. **Deliver.** `open` the SVG so the user sees it, and give them the paths
   to both the image and the `.d2` source so they can iterate.
