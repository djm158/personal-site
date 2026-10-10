# personal-site

The next version of [danielmcgrath.xyz](https://danielmcgrath.xyz): portfolio, blog and résumé. Work in progress; see [BACKLOG.md](./BACKLOG.md) for what's done and what's next.

## Stack

- [Astro](https://astro.build) with TypeScript, building a fully static site
- React for the few pieces that need state in the browser
- Tailwind CSS v4
- Deployed on Netlify on every push to `main`

## Development

Requires Node 22 (see `.nvmrc`) and [pnpm](https://pnpm.io).

```sh
pnpm install
pnpm dev       # dev server at http://localhost:4321
pnpm build     # production build to ./dist
pnpm preview   # serve the production build locally
```

## Structure

```text
src/
├── components/   # Astro components (and React islands)
├── layouts/      # page shells
├── pages/        # one file per route
└── styles/       # global CSS and Tailwind theme
public/           # static files served as-is
```
