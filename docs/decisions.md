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
One file per route in `src/pages` and `<a href>` for navigation. Page transitions are an open
PR (#19).

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
Animations sit behind `motion-safe:`. The marquee stops, the hero glow hides, and the avatar
ring stays still.

**Per-element animation delays go through a custom property in `@theme inline`** · 2026-10-29
· #10
A plain `[animation-delay:…]` class is reset by the `animate-*` shorthand, and a token in
plain `@theme` resolves its `var()` once on `:root`, so every letter hopped together. Caught
by Dan on the preview, not by code review. Now a rule in `CLAUDE.md`.

**Accessible split-letter heading** · 2026-10-29 · #7 (agent)
"Dan." is split into spans for the per-letter hover, which are `aria-hidden`, with an `sr-only`
copy so screen readers read one word.

## Site features

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
