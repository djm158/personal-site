# Backlog

Ordered top to bottom. Each section leaves the site deployable. Design reference: the
`Portfolio.dc.html` project in claude.ai/design.

Tags at the end of an item steer the backlog loop (`.claude/prompts/backlog-iteration.md`):

- `(agent: <slug>)`: the loop may pick it; the slug names its branch, `agent/<slug>`
- `(after: <slug>)`: wait until the item with that slug is ticked
- `(me)`: Dan does it: content, decisions, or ones he wants to build himself
- `(deferred)` or `(deferred: <reason>)`: not now, or maybe never: the design is unsure, or it
  waits on something
- No tag: the loop ignores it

## v0 scope

v0 ships fast so work can move on to projects: the résumé as it stands (no skill picker) and a
landing page with the hero, about and a brief résumé. Everything below this section that v0
skips comes back afterwards. Blog and Projects wait until there's new content for them, so the
skill picker (section 4) and landing page polish (section 5) come first.

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
- [x] Header, desktop: avatar logo and name linking home, pill links with active state, Résumé button, sticky with blur
- [x] Header, mobile (under 760px): Menu button, full-screen `<dialog>` with numbered links and Résumé button, scroll lock, close when a same-page anchor is clicked
- [x] Mobile menu motion: overlay fades in and out (350ms), links rise 16px and fade in staggered by 50ms, Résumé button follows; hover and pressed states on the Menu, Close, link and Résumé controls
- [x] Footer
- [x] Section links scroll smoothly, as the design's `jump()` does: `scroll-behavior: smooth` on `html` under `prefers-reduced-motion: no-preference`, and `scroll-padding-top` so a section stops below the sticky header (the design uses 70px; tie it to the header's real height). CSS only, no JS. Arriving from another page (`/resume` → `/#contact`) can jump; the design's page transition is not ported (agent: smooth-scroll)
- [x] Extract shared pieces: `Container`, `Eyebrow`, `Button` (filled, outlined, soft)
- [x] Extract the shared pieces now in use: `TextLink` (the underlined "Full résumé →" link on the home page) and `Chip` (the skill pills on `/resume` and in `SkillSheet`, which differ in size). The larger hero `Button` size is done (`xl`) (agent: shared-pieces)
- [ ] Type scale tokens in `@theme` (display, page title, lede, body, label) with their line-heights, once sizes start repeating; replace the inline `text-[clamp(...)]` classes (deferred: no size repeats yet)

## 2. Blog

- [ ] Content collection with Zod schema: `title`, `date`, `tags`, `excerpt` (deferred: waits for the first post)
- [ ] Write posts as they come; the old repo's four posts are skipped as low signal (me)
- [ ] `/blog`: post list, post count, tag filter chips (deferred: waits for the first post)
- [ ] `/blog/[slug]`: title, date, tag, read time (computed), rendered markdown, next-post link (deferred: waits for the first post)
- [ ] Typography styles for rendered markdown: headings, code blocks, images, lists, links (deferred: waits for the first post)

## 3. Projects

- [ ] Content collection with Zod schema: `title`, `kind`, `description`, `tags`, `url`, `image`, `order`, `featured` (deferred: waits for the first project)
- [ ] Add projects as they're built, starting with this site's own entry (the old repo's projects are skipped as low signal; no Wizard) (me)
- [ ] `/projects`: numbered rows, filter chips by kind (deferred: waits for the first project)
- [ ] Floating image preview that follows the cursor, on hover-capable devices only (deferred: waits for the first project)

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
- [ ] `/resume`: summary and links, role list with dates, duration and tags, education card, Download PDF button. The Download button sits in the links row under the summary, not the aside. The picker aside is always sticky; skill groups collapse to their first 4 pills (one group expanded at a time), and from 1000px wide the card is capped to the window and scrolls inside; the education card still needs a home that doesn't make the aside taller (deferred: where the education card goes is undecided)
- [x] Add `tags` and `short` to each role in `resume.yaml`; check every role tag appears in a skill group
- [x] Timeline bar with segment widths proportional to months in each role; segments link to `#role-n`
- [x] Skill picker: toggle-button pills and a small `<script>` that marks matching roles, timeline segments and tags with `data-hit`; styling stays in static classes; clicking the selected pill clears it
- [x] Skill picker below 1000px: `SkillSheet`, a sticky bar above the roles ("Filter by skill", then "React · 5 of 6 roles" with a clear button) that opens the full picker in a bottom-sheet `<dialog>` with role counts on each pill; picking closes the sheet and scrolls to the first match
- [x] Skill picker state refactor, before the items below: replace the attribute-driven `reset()`/`pick()` and the `skillchange` event with a nanostores `atom<string[]>` of selected skills (zero or one for now, so multi-select later is a UI change); the page script and `SkillSheet` each subscribe and set `aria-pressed`, `data-hit` and the bar from the value; matching moves to pure, tested functions in `src/lib/resume/` (`matchingRoles(roles, skills)`, later `countsIfAdded`); decide AND vs OR before any multi-select UI (AND is the likely pick) (agent: skill-picker-state) (after: shared-pieces)
- [x] Skill picker "clear" button: small accent button at the right of the "Technical skills" eyebrow, hidden until a skill is picked (`group-data-picked:`), calls the same reset (agent: skill-clear) (after: skill-picker-state)
- [x] Skill note under the picker heading: "Pick a skill to see where I used it." by default, "React at X & Y." when picked, a fallback when no role uses the skill; set by the same script, in an `aria-live` region (agent: skill-note) (after: skill-clear)
- [x] Hover link: hovering or focusing a timeline segment highlights that role's dates, and hovering a role highlights its segment (agent: timeline-hover) (after: skill-note)
- [x] `SkillSheet` pull-down-to-dismiss: drag from the sheet's head (grabber, title and note; `touch-action: none`), with pointer capture and a `data-dragging` attribute that turns the transition off while an inline `translate` follows the finger. On release, close past about a quarter of the sheet's height or on a fast downward flick, otherwise snap back; either way clear the inline style and let the CSS (or `closeSheet()`) animate from the dragged position. Treat `pointercancel` as a snap back, and check that the backdrop click handler doesn't close the sheet after a snapped-back drag. Dragging from the scrolling body (at `scrollTop === 0`) can come later (agent: sheet-drag-dismiss) (after: timeline-hover)
- [x] `SkillSheet` script refactor: after the drag-to-dismiss work (PR #11) the script does three jobs (open/close, drag gesture, skill sync) in one closure. Move the gesture into `src/lib/sheet-drag.ts`, next to `releaseVelocity` and `shouldDismiss`, as `dragToDismiss(sheet, handle, onDismiss)` returning `{ reset, consumeDrag }`. Done when: the component script only opens and closes the sheet and syncs skills; one `reset()` replaces the two copies of the drag reset (in `endDrag` and the `close` handler); `head` is in the null guard, with no `head?.`; the backdrop click asks `consumeDrag()` instead of reading `dragMoved`; behaviour is unchanged (snap back, flick to close, Escape mid-drag, the Clear and Done buttons in the head). No new pure logic, so no new unit tests are required. `MobileMenu`'s duplicated `data-closing` logic is out of scope (agent: sheet-refactor)
- [x] PDF layout in Typst: `resume/resume.typ` reads `resume.yaml` directly and matches the old hand-written LaTeX résumé closely (replaced a LaTeX generator, which needed escaping and kept the layout inside TypeScript strings); the hand-written `resume.tex` is deleted
- [x] Build `/resume.pdf` with Typst in an `astro:build:done` integration; the build fails if the PDF runs past two pages
- [x] Confirm Typst runs in the Netlify build (the build command fetches the pinned static binary); fall back to a GitHub Action if it won't
- [x] Wire the Download PDF button on `/resume` to `/resume.pdf` (part of the `/resume` item above)
- [x] Download PDF button hover: lift it on hover the same way the header's Résumé button does (`transition-transform duration-200 hover:-translate-y-0.5` in `Header.astro`) (agent: pdf-button-hover)

## 5. Home

- [x] Move the home page's existing copy into `content/site-content.yaml`, word for word: status badge, hero text, about text, links. Load it with a Zod schema the way `src/lib/resume/load.ts` loads `resume.yaml`. Housekeeping only: no wording changes, and the copy review below stays separate. Site copy lives in this file and `resume/resume.yaml` only (agent: copy-data-file)
- [ ] Copy review: status badge, hero text, about text, the three cards, marquee items, links (deferred: needs its own review)
- [ ] Status badge driven by data: an optional `openTo` string shows "Open to {openTo}" (green pulse dot); without it, show "Building X at Y" instead. Decide whether the field lives in `resume.yaml` (add it to the schema) or the home copy file (me)
- [x] Hero: status badge, heading with per-letter hover, intro, two buttons (agent: hero-letter-hover)
- [x] Hero name intro: on page load the letters of "Dan." hop in turn, once, with the same lift and tilt as the hover. CSS only: an `--animate-hop` token and `@keyframes` in `global.css` that animate `translate`, `rotate` and `scale` (not `transform`) from per-letter custom properties, staggered with `animation-delay`, fill mode `backwards` so it never blocks the hover afterwards, behind `motion-safe:`. Plays on every visit to `/`; no once-per-session logic (agent: hero-letter-intro) (after: hero-letter-hover)
- [x] Avatar SVG from the updated design (drop the duplicated ears and face shapes) (agent: avatar-svg)
- [ ] Avatar click hints: a line under the avatar that changes with each click toward night mode and clears when it toggles. The design's copy, one per click count 1–4: "hey!", "that tickles", "okay, okay…", "one more and…". Copy goes in `content/site-content.yaml` (agent: avatar-hints) (after: night-toggle)
- [x] Theme toggle design: option C, a sliding switch whose knob carries a sun or moon, in the desktop header between the links and Résumé and as a labelled row above Résumé in the mobile menu. Two states, day and night, using the site's "day/night" copy. Mockups: the "Theme toggle options" design canvas (https://claude.ai/artifact/B7eikJWa3TfqQbesU6nXsi) (me)
- [x] Theme toggle build: a native `<button role="switch" aria-checked>` labelled "Night mode", in the header (54×30 track, 24px knob) and the mobile menu (64×36, with a visible `<label>`), sharing one toggle with the avatar, which stays as an easter egg on desktop. The knob slides with `--ease-spring` behind `motion-safe:`; hover darkens the track border; focus uses the shared ring. With nothing saved, follow `prefers-color-scheme` in the pre-paint script, and keep following it until the switch is used (me) (after: theme toggle design)
- [x] Avatar behaviour: eyes follow the cursor, blink and mouth change on click, cursor glow in the hero (agent: avatar-behaviour) (after: avatar-svg)
- [x] Night mode: five clicks on the avatar toggles it, toast message, saved to `localStorage`, applied before first paint to avoid a flash (agent: night-toggle) (after: avatar-svg)
- [x] Hero avatar ring: the design's dashed circle around the avatar, turning once every 80s (`border: 1.5px dashed var(--line)`, `inset: -4%`, round, linear, infinite). Put it in a new `relative` wrapper around `NightToggle`, as a sibling of the button, not inside it, so it stays still when the avatar is pressed and squishes, as in the design; `aria-hidden` and `pointer-events-none`. Use the `line` colour token, so night mode follows on its own. Add an `--animate-spin-slow` token next to `--animate-marquee`, applied behind `motion-safe:`; with reduced motion the ring stays, unmoving. Check that it doesn't overlap the focus outline or cause horizontal scroll on narrow screens (agent: avatar-ring)
- [x] Marquee strip (agent: marquee)
- [ ] About section: the three cards, once their content is refined (me)
- [x] Experience list from the résumé data, each row linking to that role on `/resume`
- [ ] Featured project cards: description panel slides up on hover, always visible on touch devices (deferred: waits for projects)
- [ ] Latest three posts (deferred: waits for the blog)
- [x] Contact section and form with Netlify Forms: topic chips, validation messages, honeypot, success state (agent: contact-form)

## 6. Polish and launch

- [x] Per-page titles and descriptions; favicon from the nav avatar (`src/assets/avatar-mini.svg`, also used in the header; 32px `favicon.ico` and `apple-touch-icon.png` rendered from it)
- [x] Open Graph tags (agent: og-tags)
- [x] Open Graph share image: `public/og.png` (1200×630, the avatar hero from the design canvas, already in the repo) as `og:image` on every page, with an absolute URL, `og:image:width`/`og:image:height`/`og:image:alt`, and the large `twitter:card` (`summary_large_image`); update `open-graph.ts` and its tests (agent: og-image)
- [x] Résumé share image: `/resume` uses `public/og-resume.png` (1200×630, already in the repo) for `og:image` and its alt text; every other page keeps `og.png`. Let a page pass its own image through `Layout`; update `open-graph.ts` and its tests (agent: og-resume-image)
- [x] Sitemap (agent: sitemap)
- [ ] RSS feed (deferred: waits for the blog)
- [ ] 404 page design session in claude.ai/design (me)
- [ ] 404 page (deferred: waits for the design session)
- [ ] Page transitions: old page fades up and blurs out (220ms), new page rises in from 22px below (520ms); header stays put; `/#about` and `/#contact` still land on their section when coming from another page (deferred)
- [x] Respect `prefers-reduced-motion` for page transitions, the mobile menu, the marquee, spinning ring and hover motion (agent: reduced-motion) (after: marquee) (after: avatar-behaviour)
- [x] axe checks: run axe-core (`@axe-core/playwright`) against `/` and `/resume` from `astro preview`, in day and night themes, as `pnpm test:a11y`; fix what it finds, or list anything left in the PR. If Playwright's browser won't install in the loop, open a needs-input PR instead (agent: axe-checks)
- [x] Run `pnpm test:a11y` in CI after the build (needs `playwright install --with-deps chromium` in the workflow), so the axe checks catch regressions on every PR
- [x] Focus styles: every interactive element (header links, pills, chips, timeline segments, the menu and sheet controls, form fields and buttons) shows a visible `focus-visible` ring from a theme token, in both themes; only 4 components have one now (agent: focus-styles)
- [ ] Contrast: check the text and background token pairs (body, muted, accent, chips, buttons) in day and night against WCAG AA, and adjust the tokens that fail in `global.css` (agent: contrast) (after: axe-checks)
- [ ] Keyboard walkthrough of `/`, `/resume`, the mobile menu and the skill sheet: tab order, Escape, focus returning to the opener, nothing unreachable (me) (after: focus-styles)
- [ ] Accessibility pass for pages built later (blog, projects, 404): add them to the axe checks (deferred: once those pages exist)
- [ ] Performance pass: Lighthouse, image optimisation with `astro:assets` (fonts are already self-hosted through Astro's fonts API) (deferred: once the pages are built)
- [x] Update the small nav avatar to match the new hero face (agent: nav-avatar) (after: avatar-svg)
- [ ] Generate `favicon.ico` (32px, a PNG inside an ICO header) and `apple-touch-icon.png` (180px) from `src/assets/avatar-mini.svg` with sharp at build time, so they can't go stale again (the committed copies still show the old face). Use prerendered endpoints (`src/pages/favicon.ico.ts`, `src/pages/apple-touch-icon.png.ts`) so the dev server serves them too; delete the committed copies from `public/`; add sharp as a direct devDependency (agent: favicon-render)
- [x] Decide on the hero line "Most recently at Wizard AI" (keep it)
- [ ] Verify the contact form on the live domain (me)
- [x] Heartbeat rebuild every month so date-derived content stays current (years of experience in the résumé description, "Present" durations): a scheduled GitHub Action calling a Netlify build hook (agent: heartbeat-rebuild)
