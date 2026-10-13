# Backlog

Ordered top to bottom. Each section leaves the site deployable. Design reference: the
`Portfolio.dc.html` project in claude.ai/design.

## v1 scope

v1 is the home page and the résumé. The blog and projects pages stay hidden until there is
content for them, so the working order is: finish section 1, then 4 (Résumé), then 5 (Home),
then 6 (Polish and launch). Sections 2 and 3 come after launch.

- [ ] Hide Work and Writing from the header and mobile menu; remove the `/projects` stub page
- [ ] Home page for v1: leave out the featured projects and latest posts sections, and point the hero's "see my work" button somewhere that exists

## 0. Repo and deploy

- [x] Scaffold Astro with React and Tailwind
- [x] First commit, add the GitHub remote, push
- [x] Replace the template `README.md`; decide whether to keep `AGENTS.md` / `CLAUDE.md`
- [x] Pin Node 22 with `.nvmrc`
- [ ] Add `netlify.toml` (build `pnpm build`, publish `dist`) so the build settings live in the repo, not only in the Netlify UI
- [x] Create a Netlify site for this repo so every push gets a preview URL (leave the live domain alone for now)

## 1. Foundation

- [x] `Header.astro` with nav links, used from `Layout.astro`
- [ ] Layout basics: `<!doctype html>`, import `global.css`, `title` and `description` props
- [x] Fonts: Instrument Serif, Geist, Geist Mono
- [x] Theme tokens in `@theme`: colours, font families, 760px breakpoint, 1240px page width, gutter `clamp(20px, 4vw, 48px)`
- [x] Night theme: same tokens overridden under `[data-theme="night"]`
- [x] Base styles: body background and text, link underline style, `::selection`, grain overlay
- [ ] Header, desktop: avatar logo and name linking home, pill links with active state, Résumé button, sticky with blur
- [x] Header, mobile (under 760px): Menu button, full-screen `<dialog>` with numbered links and Résumé button, scroll lock, close when a same-page anchor is clicked
- [x] Mobile menu motion: overlay fades in and out (350ms), links rise 16px and fade in staggered by 50ms, Résumé button follows; hover and pressed states on the Menu, Close, link and Résumé controls
- [x] Footer
- [x] Extract shared pieces: `Container`, `Eyebrow`, `Button` (filled, outlined, soft)
- [ ] Shared pieces still to come, when first used: text link (underlined, on the home page), `Chip` (filters and skill picker), the larger hero `Button` size

## 2. Blog

- [ ] Content collection with Zod schema: `title`, `date`, `tags`, `excerpt`
- [ ] Migrate the four posts and their three images from `djm158/portfolio-v2` `_posts/`; write excerpts (the design has one per post)
- [ ] Check the old site's post URLs and keep the same slugs so existing links still work
- [ ] `/blog`: post list, post count, tag filter chips
- [ ] `/blog/[slug]`: title, date, tag, read time (computed), rendered markdown, next-post link
- [ ] Typography styles for rendered markdown: headings, code blocks, images, lists, links

## 3. Projects

- [ ] Content collection with Zod schema: `title`, `kind`, `description`, `tags`, `url`, `image`, `order`, `featured`
- [ ] Add the six projects (no Wizard) with images from the old repo; find an image for this site's own entry
- [ ] `/projects`: numbered rows, filter chips by kind
- [ ] Floating image preview that follows the cursor, on hover-capable devices only

## 4. Résumé

Data-first: `resume/resume.yaml` is the source of truth. The site reads it directly and the
LaTeX (then the PDF) is generated from it. Nothing parses LaTeX in the build.

- [x] Add the latest résumé source as `resume/resume.tex`
- [x] Design the data shape: name, links, summary, roles (company, title, location, start, end, bullets, plus site-only `tags` and `short`), skill groups, education
- [x] Zod schema for that shape; export the inferred TypeScript type
- [x] Move the content of `resume.tex` into `resume/resume.yaml`
- [x] Loader `src/lib/resume/load.ts`: read the YAML, validate with the schema, return typed data; invalid data fails the build
- [ ] Set up Vitest
- [ ] Helpers, test-first: format a date range, months in a role, total duration
- [ ] `/resume`: summary and links, role list with dates, duration and tags, education card, Download PDF button
- [ ] Timeline bar with segment widths proportional to months in each role
- [ ] React island: pick a skill to highlight the roles that used it and dim the rest
- [ ] LaTeX generator, test-first: an escape function (`&`, `#`, `%`, `$`, `_`, `{`, `}`, `~`, `^`, `\`), then a template that renders the full `.tex` from the data
- [ ] Golden test: the generated `.tex` matches the current hand-written `resume.tex`; then delete the hand-written file and stop committing generated output
- [ ] Build `/resume.pdf` from the generated `.tex` with tectonic in the Netlify build; fall back to a GitHub Action if tectonic won't run there

## 5. Home

- [ ] Move page copy into one data file: status badge, hero text, about text, the three cards, marquee items, links
- [ ] Hero: status badge, heading with per-letter hover, intro, two buttons
- [ ] Avatar SVG from the updated design (drop the duplicated ears and face shapes)
- [ ] Avatar behaviour: eyes follow the cursor, blink and mouth change on click, cursor glow in the hero
- [ ] Night mode: five clicks on the avatar toggles it, toast message, saved to `localStorage`, applied before first paint to avoid a flash
- [ ] Marquee strip
- [ ] About section with the three cards
- [ ] Experience list from the résumé data, each row linking to that role on `/resume`
- [ ] Featured project cards: description panel slides up on hover, always visible on touch devices
- [ ] Latest three posts
- [ ] Contact section and form with Netlify Forms: topic chips, validation messages, honeypot, success state

## 6. Polish and launch

- [ ] Per-page titles and descriptions, Open Graph tags, favicon from the avatar
- [ ] Sitemap and RSS feed
- [ ] 404 page
- [ ] Page transitions: old page fades up and blurs out (220ms), new page rises in from 22px below (520ms); header stays put; `/#about` and `/#contact` still land on their section when coming from another page
- [ ] Respect `prefers-reduced-motion` for page transitions, the mobile menu, the marquee, spinning ring and hover motion
- [ ] Accessibility pass: keyboard navigation, focus styles, contrast in both themes, axe checks
- [ ] Performance pass: Lighthouse, image optimisation with `astro:assets`, consider self-hosting fonts
- [ ] Update the small nav avatar to match the new hero face
- [ ] Decide on the hero line "Most recently at Wizard AI"
- [ ] Point the existing Netlify site for danielmcgrath.xyz at this repo; verify the form and old post links on the live domain
