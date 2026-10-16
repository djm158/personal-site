# Backlog

Ordered top to bottom. Each section leaves the site deployable. Design reference: the
`Portfolio.dc.html` project in claude.ai/design.

## v0 scope

v0 ships fast so work can move on to projects: the résumé as it stands (no skill picker) and a
landing page with the hero, about and a brief résumé. Everything below this section that v0
skips comes back afterwards, starting with section 3 (Projects), then the picker.

- [x] Hide Work and Writing from the header and mobile menu; remove the `/projects` stub page
- [x] Layout: `description` prop and meta tag; per-page titles for home and résumé
- [x] Home hero: hard-coded status badge, heading, intro, static avatar SVG, buttons (no per-letter hover, no avatar behaviour); point "See the work" at `/resume` and "Say hello" at a `mailto:` link
- [x] Home about section: label and the two paragraphs, with `id="about"` for the nav link (the three cards wait until their content is refined)
- [x] Home experience list from the résumé data, each row linking to `/resume#<role id>`
- [x] Add `netlify.toml`
- [x] Point danielmcgrath.xyz at this repo

## 0. Repo and deploy

- [x] Scaffold Astro with React and Tailwind
- [x] First commit, add the GitHub remote, push
- [x] Replace the template `README.md`; decide whether to keep `AGENTS.md` / `CLAUDE.md`
- [x] Pin Node 22 with `.nvmrc`
- [x] Add `netlify.toml` (build `pnpm build`, publish `dist`) so the build settings live in the repo, not only in the Netlify UI
- [x] Create a Netlify site for this repo so every push gets a preview URL (leave the live domain alone for now)

## 1. Foundation

- [x] `Header.astro` with nav links, used from `Layout.astro`
- [x] Layout basics: `<!doctype html>`, import `global.css`, `title` and `description` props
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
- [ ] Type scale tokens in `@theme` (display, page title, lede, body, label) with their line-heights, once sizes start repeating; replace the inline `text-[clamp(...)]` classes

## 2. Blog

- [ ] Content collection with Zod schema: `title`, `date`, `tags`, `excerpt`
- [ ] Migrate the four posts and their three images from `djm158/portfolio-v2` `_posts/`; write excerpts (the design has one per post)
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
- [x] Set up Vitest
- [x] Helpers, test-first: format a date range, months in a role, format a duration (total duration is `inclusiveMonths` from the earliest start to the latest end, done on the page)
- [ ] `/resume`: summary and links, role list with dates, duration and tags, education card, Download PDF button
- [x] Add `tags` and `short` to each role in `resume.yaml`; check every role tag appears in a skill group
- [ ] Timeline bar with segment widths proportional to months in each role; segments link to `#role-n`
- [ ] Skill picker: toggle-button pills and a small `<script>` that marks matching roles, timeline segments and tags with `data-hit`; styling stays in static classes; clicking the selected pill clears it
- [ ] Skill note under the picker heading: "Pick a skill to see where I used it." by default, "React at X & Y." when picked, a fallback when no role uses the skill; set by the same script, in an `aria-live` region
- [ ] Hover link: hovering or focusing a timeline segment highlights that role's dates, and hovering a role highlights its segment
- [ ] LaTeX generator, test-first: an escape function (`&`, `#`, `%`, `$`, `_`, `{`, `}`, `~`, `^`, `\`), then a template that renders the full `.tex` from the data
- [ ] Golden test: the generated `.tex` matches the current hand-written `resume.tex`; then delete the hand-written file and stop committing generated output
- [ ] Build `/resume.pdf` from the generated `.tex` with tectonic in the Netlify build; fall back to a GitHub Action if tectonic won't run there

## 5. Home

- [ ] Move page copy into one data file: status badge, hero text, about text, the three cards, marquee items, links
- [ ] Status badge driven by data: an optional `openTo` string shows "Open to {openTo}" (green pulse dot); without it, show "Building X at Y" instead. Decide whether the field lives in `resume.yaml` (add it to the schema) or the home copy file
- [ ] Hero: status badge, heading with per-letter hover, intro, two buttons
- [ ] Avatar SVG from the updated design (drop the duplicated ears and face shapes)
- [ ] Avatar behaviour: eyes follow the cursor, blink and mouth change on click, cursor glow in the hero
- [ ] Night mode: five clicks on the avatar toggles it, toast message, saved to `localStorage`, applied before first paint to avoid a flash
- [ ] Marquee strip
- [ ] About section: the three cards, once their content is refined
- [ ] Experience list from the résumé data, each row linking to that role on `/resume`
- [ ] Featured project cards: description panel slides up on hover, always visible on touch devices
- [ ] Latest three posts
- [ ] Contact section and form with Netlify Forms: topic chips, validation messages, honeypot, success state

## 6. Polish and launch

- [x] Per-page titles and descriptions; favicon from the nav avatar (`favicon.svg`, 32px `favicon.ico`, `apple-touch-icon.png`)
- [ ] Open Graph tags
- [ ] Sitemap and RSS feed
- [ ] 404 page
- [ ] Page transitions: old page fades up and blurs out (220ms), new page rises in from 22px below (520ms); header stays put; `/#about` and `/#contact` still land on their section when coming from another page
- [ ] Respect `prefers-reduced-motion` for page transitions, the mobile menu, the marquee, spinning ring and hover motion
- [ ] Accessibility pass: keyboard navigation, focus styles, contrast in both themes, axe checks
- [ ] Performance pass: Lighthouse, image optimisation with `astro:assets`, consider self-hosting fonts
- [ ] Update the small nav avatar to match the new hero face
- [x] Decide on the hero line "Most recently at Wizard AI" (keep it)
- [ ] Verify the contact form on the live domain
- [ ] Heartbeat rebuild every month so date-derived content stays current (years of experience in the résumé description, "Present" durations): a scheduled GitHub Action calling a Netlify build hook
