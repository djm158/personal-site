# personal-site

Daniel McGrath's personal site: portfolio, blog and résumé. A fully static Astro site with
TypeScript (strict), React islands and Tailwind CSS v4. Uses pnpm and Node 22, and deploys to
Netlify on every push to `main`.

## How to help

Dan is building this site himself for practice. Default to explaining, reviewing and
unblocking:

- Don't write features or large blocks of code unless he asks for that specific piece.
- When he does ask, stay within what was asked. Mention anything else you notice; don't fix it.
- Short illustrative snippets are fine when they explain an approach.
- `BACKLOG.md` is the task list. Tick items off when they are done and add items when scope
  changes.

## Development

```sh
pnpm dev       # dev server at http://localhost:4321
pnpm build     # production build to ./dist
pnpm preview   # serve the production build
pnpm test      # run unit tests
pnpm check     # run astro check
```

Before calling a piece of work done, run `pnpm check`, `pnpm test --run` and `pnpm build`. The
build does not type-check, so a page can build while `pnpm check` fails.

TypeScript is pinned to 6 in `devDependencies` because `astro check` fails with TypeScript 7.
Keep it on 6 when updating dependencies until `@astrojs/check` supports 7.

When an agent starts the dev server, use background mode: `astro dev --background`. Manage it
with `astro dev stop`, `astro dev status` and `astro dev logs`.

## Conventions

- **Astro components by default.** Use a React `.tsx` island only when a piece needs state in
  the browser, with the narrowest `client:*` directive that works.
- **Real routes and plain links.** One file per route in `src/pages`, `<a href>` for
  navigation, no client-side router.
- **Theme tokens, not raw values.** Colours, fonts and the breakpoint are defined in
  `src/styles/global.css` under `@theme`. Components use the resulting utilities. Night mode
  works by overriding the same tokens under `[data-theme="night"]`.
- **Fluid layout.** Follow the design: `clamp()` sizes, wrapping flex rows and auto-fit grids.
  The only breakpoint is 760px, where the header collapses to a menu. The one exception is
  `/resume` at 1000px, the width where the roles and picker columns stop wrapping: below it
  the picker is a sticky bar and bottom sheet (`SkillSheet`), above it a sticky sidebar.
- **Native elements first.** For example `<dialog>` for the mobile menu. Respect
  `prefers-reduced-motion`.
- **Tailwind v4 animation gotchas.** An `animate-*` utility sets the whole `animation`
  shorthand, so it resets a separate `[animation-delay:…]` class: pass a per-element delay
  through a custom property in the animation token instead. A `@theme` token whose value uses a
  `var()` set on each element has to go in `@theme inline`; otherwise the `var()` is resolved
  once on `:root` and every element gets the same value. Check the computed style on the
  elements, not just the built CSS.

## Content

Planned; check `BACKLOG.md` for what exists.

- Blog posts and projects are markdown content collections with Zod schemas.
- Résumé data lives in `resume/resume.yaml`, the single source of truth. The site reads it
  directly, and `resume/resume.typ` reads it to lay out `resume.pdf`. Content changes go in
  the YAML; the `.typ` file is layout only. Why Typst and not LaTeX:
  [docs/adr/0001](docs/adr/0001-typst-for-resume-pdf.md).
- `pnpm build` makes `dist/resume.pdf` with [Typst](https://typst.app), so it must be
  installed locally (`brew install typst`, same version as `TYPST_VERSION` in `netlify.toml`).
  The build fails if the PDF runs past two pages. To work on the layout alone:
  `typst watch --ignore-system-fonts resume/resume.typ`.

## Design reference

The design is the `Portfolio.dc.html` project in claude.ai/design. `design/` holds a local
copy for reading, which may be behind the project. It is a prototype: use it as the visual
spec, and don't port its runtime, inline styles or state-based page switching.

## Documentation

Astro docs: https://docs.astro.build

- [Routing](https://docs.astro.build/en/guides/routing/)
- [Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Framework components (React islands)](https://docs.astro.build/en/guides/framework-components/)
- [Content collections](https://docs.astro.build/en/guides/content-collections/)
- [Styling and Tailwind](https://docs.astro.build/en/guides/styling/)
