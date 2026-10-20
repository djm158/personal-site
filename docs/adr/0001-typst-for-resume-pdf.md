# Build the résumé PDF with Typst, not generated LaTeX

`resume/resume.yaml` is the single source of truth for the résumé, so the PDF has to be derived
from it. We first generated LaTeX from TypeScript and compiled it with tectonic. It worked, but
the layout lived inside JS template strings, where LaTeX escaping and JS escaping combined into
code that was hard to edit by hand, and every value from the YAML had to be escaped manually.
We switched to Typst: `resume/resume.typ` reads the YAML directly with `yaml()`, so layout is
plain Typst in its own file and YAML strings are data, never markup, so nothing needs escaping.

## Considered options

- **Generated LaTeX (built first, then replaced).** LaTeX is the format LLMs and most résumé
  templates know best, but escaping, the layout-in-strings problem and tectonic's TeX bundle
  download on every fresh build outweighed that.
- **A LaTeX class file plus a smaller generator.** Moves the styling into real LaTeX, but still
  needs escaping and still splits the résumé across TypeScript and LaTeX.
- **A template engine (Nunjucks with LaTeX-style delimiters).** Gives a template file, but loses
  type checking and still needs an escape filter on every variable.
- **Printing the `/resume` page to PDF with a headless browser.** One layout instead of two, but
  weaker typesetting and page-break control than TeX or Typst.

## Consequences

- Content edits, including LLM-assisted reviews, go through `resume.yaml`, not a `.tex` file.
  LLMs know Typst less well than LaTeX, which matters only for the rarely touched layout file.
- `resume.typ` compiles on its own (`typst compile resume/resume.typ`), so a tailored résumé can
  be a copy of the YAML and layout outside the repo.
- Typst has to be installed locally, and Netlify downloads a pinned static binary at build time.
  It's a single binary with built-in fonts and nothing fetched at compile time, unlike
  tectonic's bundle.
- The Typst file formats dates itself, and Vitest doesn't cover that. The YAML is still
  validated by Zod, because the site pages load it before the PDF step runs.
