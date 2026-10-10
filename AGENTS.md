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
```

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
  The only breakpoint is 760px, where the header collapses to a menu.
- **Native elements first.** For example `<dialog>` for the mobile menu. Respect
  `prefers-reduced-motion`.

## Content

Planned; check `BACKLOG.md` for what exists.

- Blog posts and projects are markdown content collections with Zod schemas.
- Résumé data is parsed from the LaTeX source under `resume/` at build time. The same file
  is compiled to `resume.pdf`.

## Design reference

The design is the `Portfolio.dc.html` project in claude.ai/design. It is a prototype: use it
as the visual spec, and don't port its runtime, inline styles or state-based page switching.

## Documentation

Astro docs: https://docs.astro.build

- [Routing](https://docs.astro.build/en/guides/routing/)
- [Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Framework components (React islands)](https://docs.astro.build/en/guides/framework-components/)
- [Content collections](https://docs.astro.build/en/guides/content-collections/)
- [Styling and Tailwind](https://docs.astro.build/en/guides/styling/)
