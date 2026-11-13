# Decision log

Every decision about how the site is built, with the reason and a link to where it happened.
Newest entries go at the bottom of each section. Long write-ups live elsewhere and are linked:
big, hard-to-reverse choices are ADRs in [`adr/`](adr/), and the backlog loop has its own
design doc, [`backlog-loop.md`](backlog-loop.md).

Who made the call:

- No tag: Dan's decision.
- **(agent)**: proposed or chosen by the backlog loop in a PR, and kept when Dan reviewed it.
- **(Dan, in review)**: Dan changed an agent PR's approach in review.

Entries marked _Why: to fill in_ are decisions taken from the code or commits, where the
reason was never written down.

## Stack and hosting

**Astro, fully static, with TypeScript strict** · 2026-10-10 · initial commit
A portfolio, blog and résumé are pages of content with a few interactive pieces, so they're
built to HTML at deploy time with no server. _Why Astro over Next.js or others: to fill in._

**React installed for islands, but no island used yet** · 2026-10-10 · `CLAUDE.md`
The rule is Astro components by default, and a React island only for state in the browser,
with the narrowest `client:*` directive. So far every interactive piece (skill picker, sheet,
night toggle, contact form) is a plain `<script>` in an Astro component, so the site ships no
React runtime.

**Tailwind CSS v4 with theme tokens** · 2026-10-10 · `src/styles/global.css`
Colours, fonts and the one breakpoint are `@theme` tokens, and components use the utilities
they generate, never raw values. That's also what makes night mode a token override (below).

**Netlify, deploying every push to `main`, build config in the repo** · 2026-10-15 ·
`netlify.toml`
Every PR gets a deploy preview URL, which became the testing surface for the backlog loop.
Build settings live in `netlify.toml`, not only in the Netlify UI, so they're reviewed and
versioned.

**Trailing slashes everywhere** · 2026-10-15 · fdb3253
Netlify serves each page as a directory index and redirects `/page` to `/page/`, so Astro uses
`trailingSlash: "always"` to generate matching links and avoid a redirect on every click.

**Fonts through Astro's fonts API (Fontsource)** · 2026-10-10 · `astro.config.mjs`
Geist, Geist Mono and Instrument Serif, served by the site with fallbacks. _Why over Google
Fonts links: to fill in._

**Pin TypeScript to 6** · `CLAUDE.md`
`astro check` fails with TypeScript 7. Stay on 6 until `@astrojs/check` supports it.

**Real routes and plain links, no client-side router** · `CLAUDE.md`
One file per route in `src/pages` and `<a href>` for navigation.

**Page transitions deferred** · 2026-10-31 · #19
The loop's attempt (#19) was closed after two rounds of requested changes, and the item is
deferred. Smooth section scrolling and reduced-motion support no longer wait on it. _Why: to
fill in._

## Content and data

**The design is a spec, not code to port** · 2026-10-10 · `CLAUDE.md`
The design is a claude.ai/design prototype with inline styles and state-based page switching.
It's used for how things look; its runtime isn't copied.

**Résumé data in one YAML file with a Zod schema** · 2026-10-13 · 5a94335
`resume/resume.yaml` is the single source of truth: the site reads it at build time, and the
PDF layout reads the same file. The schema fails the build on bad data.

**v0 scope: ship the résumé and landing page first** · 2026-10-15 · `BACKLOG.md`
The projects stub was removed and Work and Writing hidden. Blog and projects wait until there's
new content for them; the skill picker and landing polish came first.

**All site copy in two content files** · 2026-10-29 · #5, `backlog-loop.md`
Copy lives only in `resume/resume.yaml` and `src/content/site-content.yaml` (and later the blog
and projects collections). That turns "did an agent change my words?" into "did a PR touch
these paths?", which the content guard can check.

**Home copy as an Astro content collection, numbers in the page** · 2026-10-29 · #5
(Dan, in review)
The agent first loaded the YAML with its own Zod loader. Dan asked for a content collection,
and for section numbers to live in the page rather than the content. `*asterisks*` in prose
become accent italics, parsed in the schema.

## Résumé

**Typst for the PDF, not generated LaTeX** · 2026-10-19 · [ADR 0001](adr/0001-typst-for-resume-pdf.md)
Generated LaTeX was built first and replaced: escaping and layout-in-JS-strings made it hard
to edit. Typst reads the YAML directly.

**The build fails if the PDF runs past two pages** · 2026-10-19 · `src/integrations/resume-pdf.ts`
Enforced by the build, so a content edit can't quietly push it to three pages. _Why two:
to fill in._

**Skill picker state in a nanostores atom** · 2026-10-29 · #3 (agent)
Replaced DOM-attribute state and a custom event, so the sidebar and the mobile sheet each
subscribe to one store instead of reading each other's markup. Matching is a pure, tested
function. Picking several skills means AND (a role must have them all); switching to OR is a
one-word change.

**Picker layout switch at 1000px, the one exception to the 760px breakpoint** · `CLAUDE.md`
1000px is where the roles and picker columns stop wrapping: below it the picker is a sticky bar
and a bottom sheet, above it a sticky sidebar.

**Timeline links one way only** · 2026-10-29 · #8 (Dan, in review)
Hovering a timeline segment highlights its role's dates. The reverse (hovering a role lights
its segment) was removed, because only the top role is in view beside the timeline, so it
read as jarring.

**Drag-to-dismiss rules in a tested module** · 2026-10-29 · #11, #25 (agent)
The sheet closes past a quarter of its height or on a flick faster than 0.5px/ms, measured over
the last 100ms so a finger held still doesn't count. The decision logic, then the whole
gesture (#25), moved into `src/lib/sheet-drag.ts` so it can be unit-tested.

## Layout, styling and motion

**Fluid layout with one breakpoint** · `CLAUDE.md`
`clamp()` sizes, wrapping flex rows and auto-fit grids. The only breakpoint is 760px, where
the header collapses to a menu.

**Native elements first** · 2026-10-12 · `MobileMenu.astro`, `SkillSheet.astro`
The mobile menu and the skill sheet are `<dialog>` elements, which give focus trapping, Escape
to close and a backdrop for free.

**Respect reduced motion everywhere** · `CLAUDE.md`
Animations sit behind `motion-safe:`. The marquee stops and the avatar ring stays still.

**Reduced motion keeps colour, drops movement** · 2026-10-31 · `agent/reduced-motion` (agent)
Under `prefers-reduced-motion`, hover and press keep their colour, shadow and indent changes,
but buttons no longer lift, tilt or shrink: every `translate`/`rotate`/`scale` on hover or
press is behind `motion-safe:`. The cursor-following eyes stay, since they move only with the
pointer and never animate on their own.

**Per-element animation delays go through a custom property in `@theme inline`** · 2026-10-29
· #10
A plain `[animation-delay:…]` class is reset by the `animate-*` shorthand, and a token in
plain `@theme` resolves its `var()` once on `:root`, so every letter hopped together. Caught
by Dan on the preview, not by code review. Now a rule in `CLAUDE.md`.

**Smooth section scrolling in CSS, offset by the header height** · 2026-10-31 · agent/smooth-scroll (agent)
`scroll-behavior: smooth` under `prefers-reduced-motion: no-preference` and
`scroll-padding-top` on `html`, instead of porting the design's `jump()`. The header's height
lives in `--header-h` (69px under 760px, 63px above), written by hand from its padding and
tallest control, since CSS can't measure it. The résumé roles' `scroll-margin-top` now
subtracts it, so they land where they did before.

**Theme colour pairs are checked against WCAG AA in a unit test** · 2026-10-31 · agent/contrast (agent)
`src/styles/contrast.test.ts` parses `global.css` with `postcss` (day from `@theme`, night from
the `[data-theme="night"]` rule on top) and checks each text and background pair in day and
night with `colorjs.io`, so a token change that breaks AA fails `pnpm test`. Both are
devDependencies, so the colour maths and CSS parsing aren't ours to maintain. axe sees only what's
rendered at rest; this covers pressed chips and matched tags too. The tokens all passed. The
one failure was the form placeholder at 70% muted (3.3:1 in day). The placeholders were removed
rather than darkened, because placeholder text that passes AA looks like a filled-in value; the
fields already have visible labels. This departs from the design, which shows placeholders.

**Accessible split-letter heading** · 2026-10-29 · #7 (agent)
"Dan." is split into spans for the per-letter hover, which are `aria-hidden`, with an `sr-only`
copy so screen readers read one word.

**No hero avatar on phones, a departure from the design** · 2026-10-31 · #34
Below 760px the hero avatar was about 340px tall and pushed the heading, intro and buttons
below the fold. It is hidden there; from 760px up nothing changes. A 96px version was tried
first and still took too much of the screen. Trade-off: the avatar is the night-mode easter
egg, so phones don't get the five clicks; they switch themes with the switch in the mobile menu
(see the night-mode switch entry under Site features). The nav avatar stays.

**The hero is one row from 560px, avatar included** · 2026-11-12 · #43
Reverses part of #34, which hid the avatar below 760px. Between 760px and about 900px the hero
wrapped, with a 340px avatar stacked above the text, and the avatar's width also depended on
the window's height (`40svh`). Now a `--breakpoint-hero` token at 560px shows the avatar, and
from there the hero is a single row that never wraps: the text column takes the space left
and the avatar is `clamp(180px, 30vw, 420px)` wide. 560px is where the 68px heading (about
260px wide) still fits beside a 180px avatar. Phones still get no hero avatar. Tablets get
the cyclist easter egg with it.

**No cursor glow in the hero, a departure from the design** · 2026-11-12 · agent/remove-hero-glow
The soft glow that trailed the cursor across the hero is gone. It's a stock "spotlight" effect
common on templated and AI-generated sites, and it competed with the avatar's cursor-following
eyes, which are now the hero's one pointer interaction.

## Site features

**A visible night-mode switch, following the system until used** · 2026-10-31 · #34
The avatar's five clicks are hidden and don't work for keyboard or screen-reader users, and the
hero avatar is gone on phones. Night mode gets a sliding switch in the header and mobile menu
(option C of three in the "Theme toggle options" design canvas), with two states and the
site's day/night copy. With nothing saved the page follows `prefers-color-scheme`; a third
"system" state was left out. The avatar clicks stay as an easter egg on desktop.

**Night mode: token overrides, set before first paint** · 2026-10-30 · #16 (agent)
`[data-theme="night"]` overrides the same theme tokens. An inline script in `<head>` applies
the saved choice from `localStorage` before the page renders, so there's no flash of day mode.
The avatar became a `<button>` so keyboard users can toggle it too.

**Contact form on Netlify Forms, working without JavaScript** · 2026-10-30 · #14 (agent)
No backend to run. Topic chips are radio inputs so the form posts without JS. With JS it
validates inline and posts with `fetch`; if that fails it falls back to a normal submit. A
hidden honeypot field catches bots.

**Open Graph and share images** · 2026-10-30–31 · #17, #22, #28
Absolute production URLs, so previews of a link show the right card. A large Twitter/X card
with a 1200×630 image; `/resume` has its own image. No `og:locale` (agent), because the site
only declares `lang="en"`.

**Sitemap from the official integration, plus `robots.txt`** · 2026-10-30 · #18
`@astrojs/sitemap` picks new routes up at build time. `robots.txt` was the agent's addition:
the standard way crawlers find the sitemap.

**Favicon and touch icon are committed files, exported by hand** · 2026-11-12 · static-favicon
`favicon.ico` and `apple-touch-icon.png` in `public/` were re-exported once from
`avatar-mini.svg` and are not generated in the build. Generating them (PR #35, closed) took
about 200 lines: sharp's SVG renderer paints `var()` and `oklch()` fills black, so it needed
its own colour conversion. That is too much for two fallback images of an avatar that rarely
changes; modern browsers use the SVG icon anyway. Re-export both when the avatar changes. The
touch icon sits inset on the day page background, because iOS turns transparent pixels black.

**Cyclist easter egg replaces the avatar's night toggle** · 2026-11-12 · feat/cyclist-easter-egg
Five clicks on the hero avatar used to switch the theme. Now that the header has a switch for
that, they send a cyclist out along the marquee, up a hill and round the avatar's ring, and
five more send him off. Dan specified the behaviour, the route, the speeds and the file layout
(a pure, tested `lib/ride.ts`; a `<script>` that writes `transform` each frame; no React
island). The calls below were the agent's:

- **Wherever the avatar shows, so from 560px (agent).** The spec asked for a 390px check, but
  phones have no hero avatar (#34), so there is nothing to tap and no ring to ride. The ride
  needs the avatar; if the window narrows past the hero breakpoint mid-ride, he is removed.
  The button has `touch-action: manipulation`, so five quick taps don't zoom the page.
- **Reduced motion shows the start toast, "Out for a ride." (agent).** The spec said "only a
  toast" without saying which. Nothing else changes, so every fifth click shows it again.
- **One layer over the hero and marquee, clipped sideways only (agent).** The hero clips its
  own overflow, so the rider can't live inside it. A `relative` wrapper
  now holds the hero, the marquee and the ride layer; the layer uses `overflow-x: clip`, so
  riding in and out never widens the page while he can still stand above the ring.
- **He goes under the sticky header, not over it (agent).** The layer is page content
  (`z-10`, the header is `z-40`). He is sized to fit under the header at the top of a lap:
  112px wide at most, 0.69 × the ring's radius beside a smaller ring, and no taller than the
  space above the ring, down to 64px.
- **The hill keeps the design's slope, so it can start left of the middle (Dan, in review:
  "a more gradual climb").** The real avatar is bigger and higher above the marquee than the
  prototype's, so a hill from the viewport's middle was about twice as steep as designed and
  pressed against the ring's left side. The start is now 0.8 × the rise before the join (the
  design's 275px run for a 345px rise), and the middle only when that is further left.
- **On tablets the hill crosses the hero text (agent).** With the hero in one row the join
  is never far above the marquee, so the hill keeps the design's slope at every width. Below
  about 900px that puts its start under the text column, and the dashed line passes over the
  intro and the buttons. The start never goes closer than 16px to the left edge, and the
  curve's handles are capped at the run, so a tall, narrow hill would get steep but never
  lean back.
- **The ring's radius comes from `offsetWidth`, not `getBoundingClientRect` (agent).** The
  ring spins, so its bounding box is larger than the ring. The box's centre is still right.
- **Three new colour tokens (agent):** `shorts` and `shorts2`, because the design keeps the
  shorts dark at night when `ink` turns light, and `beam` for the headlight. The collar is
  `color-mix` from `moss`, and the glasses use `muted` (day) and `shorts2` (night), which are
  close to the design's values, not exact.
- **`NightToggle` became `RideTrigger`, markup only (agent).** The click handler moved to
  `Ride.astro` with the animation loop, so one script owns the ride's state. `poke`,
  `hintFor` and `toastFor` left `lib/theme.ts`; the counter and hints are in `lib/ride.ts`.
- **A resize mid-ride re-measures but doesn't remap his progress (agent).** On the way in he
  may jump a little; on the ring he follows it exactly.
- **Browser tests for the ride run with the axe checks (agent),** in `e2e/ride.e2e.ts`, on
  Playwright's fake clock.

## Operations

**CI runs check, test and build on every PR** · 2026-10-29 · 98c3594
The build doesn't type-check, so `astro check` runs separately. CI, not the agent's own word,
is what proves the checks pass.

**Ruleset on `main`** · 2026-10-29 · `backlog-loop.md`
PRs only, CI and the content guard required, no force pushes, one approval. Approvals went
from 0 to 1 once agent PRs came from a GitHub App instead of Dan's account, since Dan can't
approve his own PRs.

**Monthly heartbeat rebuild** · 2026-10-31 · #23, `.github/workflows/heartbeat.yml`
The site is static, so anything worked out from today's date (years of experience, "Present"
durations) is frozen at the last build. A scheduled GitHub Action calls a Netlify build hook
at 06:17 UTC on the 1st of each month, and can also be run by hand.

- A build hook, not the Netlify API (agent): the hook can only start a build of this one site,
  while an API token can act on the whole Netlify account.
- Failures are reported by Netlify's "deploy failed" email, not by the workflow waiting for
  the build: the workflow would need that account-wide token. GitHub already emails if the hook
  call itself fails.
- `trigger_title=Monthly+heartbeat` is set in the workflow, not stored in the secret, so the
  deploy is labelled in Netlify's list without changing the secret.
- Known limit: GitHub disables scheduled workflows after 60 days with no repo activity.

## Agent workflow (the backlog loop)

**Agents write most of the code; Dan specifies, reviews and decides** · 2026-11-12 · `AGENTS.md`
The site started as hand-coding practice, with agents told to explain and not write features.
Dan is now using it to practise agentic engineering instead. `AGENTS.md` ("How to help") says
agents write what he asks, design and content stay his calls, and small, well-specified
follow-ups go in the backlog as `(agent: slug)`. The loop's build prompt no longer lifts a
"don't write features" rule; it says the item is the request and its PR is part of it.

The full reasoning, with sources, is in [`backlog-loop.md` §4](backlog-loop.md#4-decisions-and-why).
The main calls:

- **One backlog item per run, in a fresh session, one PR each, at most 3 open.** Review is the
  bottleneck, and long sessions try to do too much.
- **Opt-in tags.** Only `(agent: slug)` items are eligible. Content and anything Dan wants to
  build for practice stays `(me)`.
- **Runs on Dan's Claude subscription, not an API key**, which ruled out GitHub Agentic
  Workflows.
- **A GitHub App identity**, so the loop can't bypass protections the way Dan's own account
  can, with tokens scoped to one repo that expire in an hour.
- **A content guard in CI**, so an agent PR touching copy, `.github/**` or its own
  instructions fails until Dan adds `content-ok`.
- **The AI code review was replaced with a verify pass.** Across the first 10 agent PRs the
  diff-only review found nothing; every fix came from Dan using the running page. A separate
  run now checks each PR in a browser.
- **Claude Code's sandbox and a fresh clone per run**, not a second macOS user or a git
  worktree.
