---
name: kroki
description: "Builds a diagram with Kroki (kroki.io) and renders it to an image. Use when the user wants something drawn as a diagram — flowchart, sequence, ERD, architecture, state, gantt — or has Mermaid/PlantUML/Graphviz/D2/Excalidraw source they want rendered."
argument-hint: "<what to diagram, or existing diagram source>"
# Auto-approved while the skill runs: file ops in the scratchpad plus the two
# commands the render loop needs. Everything else still prompts.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash(curl:*)
  - Bash(open:*)
---

# Kroki

Turn a textual diagram source into a rendered image via the free kroki.io
service and show it to the user.

## Steps

1. **Pick the language.** Match the diagram to its native language (table
   below). When several fit, use Mermaid. If the user supplied source, its
   language is already decided.

2. **Write the source** to a file in the scratchpad.

3. **Render.** POST the source; the URL path is `/{language}/{format}`:

   ```sh
   curl -s -o diagram.png -w "%{http_code}" -X POST https://kroki.io/mermaid/png --data-binary @diagram.mmd
   ```

   A non-200 response body is the syntax error, in plain text — fix the
   source and re-POST until you get 200. Render PNG (for the proof) and SVG
   (the crisp deliverable): same call, different format segment. A few
   languages are SVG-only; the error body says so, and then the 200 SVG is
   both proof and deliverable.

   An *opaque* 400 (`Internal Server Error`, no syntax message) points at the
   transport, not your source: some languages (`excalidraw`) reject POST
   entirely — switch to the GET form (below). To tell broken source from
   broken service, render kroki's own example for that language from
   kroki.io/examples.html.

4. **Proof it.** Read the PNG and compare it against the intent: every node,
   label, and relationship the user asked for is present, spelled right, and
   legible. A wrong or cluttered proof means edit the source and re-render.
   Done only when the proof passes.

5. **Deliver.** `open` the SVG (macOS) so the user sees it, and give them the
   paths to both the image and the source so they can iterate.

## Languages

| Language      | Use for                                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `mermaid`     | flowcharts, sequence, state, class, gantt, pie — the default                                                               |
| `graphviz`    | arbitrary node–edge graphs, dependency graphs                                                                              |
| `plantuml`    | UML; `c4plantuml` for C4 architecture diagrams                                                                             |
| `d2`          | modern architecture / box-and-line diagrams; for presentation-grade output the `d2` skill renders locally                  |
| `erd`, `dbml` | database schemas                                                                                                           |
| `vegalite`    | data charts (bar, line, scatter)                                                                                           |
| `svgbob`      | ASCII art → clean SVG                                                                                                      |
| `excalidraw`  | render an existing `.excalidraw` JSON file (SVG-only, GET form only) |
| `wavedrom`    | digital timing waveforms                                                                                                   |

The path segment is the lowercase language name. For the full list, or a
working example of an unfamiliar language's syntax, fetch
kroki.io/examples.html.

## GET form

Kroki's GET form embeds the source in the URL, deflate-compressed and
base64url-encoded. Two uses: a shareable link for the user, and the render
transport for languages that reject POST.

```sh
python3 -c "import sys,zlib,base64;print('https://kroki.io/mermaid/svg/'+base64.urlsafe_b64encode(zlib.compress(sys.stdin.buffer.read(),9)).decode())" < diagram.mmd
```
