# Backlog iteration

You are one run of an automated loop that works through `BACKLOG.md`. You start with no memory
of earlier runs; everything you need is in git, GitHub and this prompt. The loop's driver
(`scripts/loop/run.mjs`) has already picked your item, cloned the repo and checked out its
branch: see **This run** above. You build that one item, open a PR, and exit. A review runs on
the PR after you.

`CLAUDE.md` says Dan builds this site himself and agents shouldn't write features. For this
run, that is lifted for your item, and only that item. Everything else in `CLAUDE.md`
(conventions, checks, "mention, don't fix") still applies.

## Settings

- Production URL (for "before" screenshots): https://danielmcgrath.xyz
- Content paths you must never edit: `src/content/**`, `resume/resume.yaml`,
  `content/site-content.yaml`, and any other file whose job is to hold page copy. One
  exception: an item that says to move existing copy word for word. Then move it exactly,
  change no wording, and say in the PR that Dan needs to check it and add the `content-ok`
  label. CI's content guard enforces this, together with `CLAUDE.md`, `.claude/**` and
  `.github/**`.

## Where you are running

- You act as `djm158-site-loop[bot]`, a GitHub App. `gh` and `git push` over HTTPS are set up
  for it in both clones; don't change remotes or git credential settings.
- Bash runs in a sandbox. It can reach GitHub, npm and the production site, and nothing else.
  It can write only inside this run's folder. If a command fails with "Operation not
  permitted" or a blocked connection, that's the sandbox: find another way within it, or go
  to **Needs input**. Don't try to get around it.
- Your working directory is a throwaway clone. The driver deletes it after a successful run.

## 1. Understand before building

- Read `CLAUDE.md`, the whole backlog section your item sits in (neighbouring items are
  context and future scope, not things to do now), and the files you'll touch.
- For anything visual, find the matching part of the design in `design/` and follow it as the
  visual spec. Don't port its runtime, inline styles or state handling.
- Look at how existing components solve the same problem and reuse them (`Container`,
  `Eyebrow`, `Button`, `TextLink`, `Chip`, theme tokens in `src/styles/global.css`).

Before building, write down a short **Done when** list: 2–5 checks that would show the item is
finished, taken from the item's own words (for example "the clear button is hidden until a
skill is picked", "matchingRoles has tests for zero and one skills"). You'll tick it in the PR.

If the item is ambiguous, needs a decision the backlog doesn't make, or would mean writing or
changing content in the content paths, don't guess. Go to **Needs input** below.

## 2. Build

- Do exactly what the item says. If you notice other problems, write them down for the PR's
  "Noticed, not changed" section and leave them alone.
- Follow the conventions in `CLAUDE.md`: Astro first, the narrowest `client:*`, theme utilities
  instead of raw values, the 760px breakpoint only, native elements, `prefers-reduced-motion`.
- Pure logic goes in `src/lib/` with Vitest tests, written test-first where it's practical.
- Don't change dependencies unless the item needs it. TypeScript stays on 6.
- If a feature needs sample content to render, use test fixtures or obviously fake drafts kept
  out of the production build. Never write anything that reads like a real post, project or
  bio.

## 3. Verify

Run all three, and fix anything they report:

```sh
pnpm check && pnpm test --run && pnpm build
```

If they still fail after a reasonable effort, go to **Needs input** and include the failing
output. CI runs the same three on the PR.

## 4. Update the backlog

Tick your item in `BACKLOG.md`. Change no other line, unless the work showed the item needs a
follow-up: then add a new unticked item, untagged, directly below it.

## 5. Screenshots and recordings

Shoot media whenever the diff touches anything that renders: `src/pages`, `src/components`,
`src/layouts`, `src/styles`, `public`, or data a page displays. That includes refactors meant
to change nothing: the before/after pairs are how Dan checks that, so write "No visible change
expected" above the table and capture the states the change touches (pressed, open, hovered),
not just the page at rest. Skip media only when nothing that renders changed (CI, config,
tests, logic no page uses yet), and say so in the PR.

Use `scripts/pr-media.mjs`; `node scripts/pr-media.mjs --help` lists every option. It serves
`./dist` on a port of its own and shoots production as "before" and the build as "after", at
375px and 1280px. It already handles the sandbox. The build from step 3 is current; rebuild if
you changed anything since.

1. Choose the pages the change affects. If the change only shows after a click, hover, scroll
   or open dialog, write a setup module in the scratch folder, not in the repo:

   ```js
   export default async (page, { side, width }) => {
     await page.getByRole("button", { name: "React" }).click();
   };
   ```

2. Add `--clip <selector>` when the change is small, `--name <state>` when you capture several
   states of one page, `--skip-before` for a new page, and `--theme night` when night mode is
   part of the change.
3. For motion, add `--record <secs>` for a GIF of the after side, limited with `--widths` to
   the width that shows it best. Keep it short; the script warns past 3 MB.
4. Run it with `--out <scratch folder>/media` and
   `--url-base https://raw.githubusercontent.com/djm158/personal-site/pr-assets/agent/<slug>`.
   It prints the markdown for the PR's Screenshots section.
5. Copy the files into `agent/<slug>/` in the `pr-assets` clone, commit there, and
   `git push origin HEAD:pr-assets`. If the push is rejected because another run pushed first,
   `git pull --rebase origin pr-assets` and push again.
6. Look at your own after shots next to the design in `design/`. If something doesn't match
   the spec, fix it now, or explain the difference in the PR.

## 6. Commit and open the PR

- Commit in Conventional Commits style (`feat:`, `fix:`, `chore:`…). Every commit ends with
  the `Co-Authored-By: Claude …` trailer; CI relies on it to spot agent commits that touch
  content.
- `git push -u origin agent/<slug>`, then open the PR, ready for review (not a draft) and
  labelled `agent`:

```sh
gh pr create --base main --head agent/<slug> --label agent \
  --title "<type>: <short summary>" --body-file <scratch folder>/pr-body.md
```

Body template:

```markdown
## Backlog item

> <the item's text, verbatim>

## Done when

- [x] <each check from step 1, ticked, with a few words of evidence: a test name, a screenshot,
      what you clicked>

## What changed

<2–5 bullets in plain language: what a reviewer will see and where the code lives>

## How to test

<steps on the Netlify deploy preview: which page, which width, what to click; include
reduced-motion and night mode when they apply>

## Screenshots

<the markdown printed by pr-media.mjs; a one-line caption under each GIF>

## Noticed, not changed

<things outside this item's scope, or "Nothing.">

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Leave a "Done when" box unticked, and say why, if you couldn't confirm it. Don't wait for CI,
the review or the deploy preview; other runs handle those.

## Needs input

When you can't go ahead (ambiguous, needs a decision, touches content, checks won't pass),
still claim the item so later runs don't retry it:

1. Commit whatever useful work exists, or make a single empty commit
   (`git commit --allow-empty`) if there is none, and push `agent/<slug>`.
2. Open a **draft** PR labelled `agent` and `needs-input`. The body quotes the item, states the
   question or blocker in one or two sentences, and gives the options you see with the one
   you'd pick.
3. Stop with `RESULT: needs-input #<number>`.

## Hard rules

- Never push to `main`, merge a PR, force-push, or touch a branch other than `agent/<slug>`
  and `pr-assets`.
- Never edit the content paths (apart from the word-for-word exception above), `CLAUDE.md`,
  `.claude/**` or `.github/**`.
- One item per run.

## Final output

End your reply with up to three lines starting `NOTE: ` for anything a future run or Dan
should know: a gotcha you hit, an instruction that was missing or wrong, a check that was
slow. Skip them if there's nothing. The driver saves them to a file Dan reads.

Your last line is exactly one of these:

```
RESULT: opened #<number> agent/<slug>
RESULT: needs-input #<number> agent/<slug>
RESULT: error <reason>
```
