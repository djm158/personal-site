# Backlog iteration

You are one run of an automated loop that works through `BACKLOG.md`. You start with no memory
of earlier runs; everything you need is in git, GitHub and this prompt. Each run does **one
backlog item or nothing**, opens a draft PR, and exits. A separate review run picks the PR up
after you.

`CLAUDE.md` says Dan builds this site himself and agents shouldn't write features. For this
run, that is lifted for the one item you select, and only that item. Everything else in
`CLAUDE.md` (conventions, checks, "mention, don't fix") still applies.

## Settings

- Open agent PR cap: **3**
- Base branch: `main`
- Production URL (for "before" screenshots): https://danielmcgrath.xyz
- Content paths you must never edit: `src/content/**`, `resume/resume.yaml`, and any data file
  whose job is to hold page copy. One exception: an item that says to move existing copy word
  for word. Then move it exactly, change no wording, and say in the PR that Dan needs to
  check it and add the `content-ok` label

## Backlog tags

Items are opted in by tags at the end of the line:

- `(agent: <slug>)`: eligible for this loop; `<slug>` names the branch and dependencies
- `(after: <slug>)`: wait until the item with that slug is ticked on `main`; can repeat
- `(me)`, `(deferred)`, `(deferred: <reason>)` or no tag: never pick it

The legend at the top of `BACKLOG.md` explains the same tags for Dan.

## 1. Preflight

1. `git fetch origin` and confirm `gh auth status` works. If either fails, stop with
   `RESULT: error <reason>`.
2. Count open PRs labelled `agent`, drafts included:
   `gh pr list --label agent --state open --json number --jq length`.
   If the count is at or over the cap, stop with `RESULT: idle (cap)`.

## 2. Select an item

Read `BACKLOG.md` from `origin/main`, not the working tree. Going top to bottom, pick the first
item that meets all of these:

- unticked (`- [ ]`) and tagged `(agent: <slug>)`
- every `(after: …)` slug belongs to an item that is ticked
- no branch `agent/<slug>` on origin and no PR, open or closed, with head `agent/<slug>`.
  A closed, unmerged PR means Dan rejected it: skip the item and list it in your final output
  so he can retag it

If nothing qualifies, stop with `RESULT: idle (nothing eligible)`.

## 3. Set up

Work in a new worktree so Dan's checkout is untouched:

```sh
git worktree add ../personal-site-agent-<slug> -b agent/<slug> origin/main
cd ../personal-site-agent-<slug> && pnpm install --frozen-lockfile
```

Remove the worktree when you finish, whatever the outcome.

## 4. Understand before building

- Read `CLAUDE.md`, the whole backlog section the item sits in (neighbouring items are
  context and future scope, not things to do now), and the files you'll touch.
- For anything visual, find the matching part of the design in `design/` and follow it as the
  visual spec. Don't port its runtime, inline styles or state handling.
- Look at how existing components solve the same problem and reuse them (`Container`,
  `Eyebrow`, `Button`, theme tokens in `src/styles/global.css`).

If the item is ambiguous, needs a decision the backlog doesn't make, or would mean writing or
changing content in the content paths, don't guess. Go to **Needs input** below.

## 5. Build

- Do exactly what the item says. If you notice other problems, write them down for the PR's
  "Noticed, not changed" section and leave them alone.
- Follow the conventions in `CLAUDE.md`: Astro first, the narrowest `client:*`, theme utilities
  instead of raw values, the 760px breakpoint only, native elements, `prefers-reduced-motion`.
- Pure logic goes in `src/lib/` with Vitest tests, written test-first where it's practical.
- Don't change dependencies unless the item needs it. TypeScript stays on 6.
- If a feature needs sample content to render, use test fixtures or obviously fake drafts kept
  out of the production build. Never write anything that reads like a real post, project or
  bio.

## 6. Verify

Run all three, and fix anything they report:

```sh
pnpm check && pnpm test --run && pnpm build
```

If they still fail after a reasonable effort, go to **Needs input** and include the failing
output.

## 7. Update the backlog

Tick the selected item in `BACKLOG.md`. Change no other line, unless the work showed the item
needs a follow-up: then add a new unticked item, untagged, directly below it.

## 8. Screenshots and recordings

Skip this for changes with no visible effect (CI, config, pure logic), and say so in the PR.

Use `scripts/pr-media.mjs`; `node scripts/pr-media.mjs --help` lists every option. It serves
`./dist` on a port of its own and shoots production as "before" and the build as "after", at
375px and 1280px. The build from step 6 is current; rebuild if you changed anything since.

1. Choose the pages the change affects. If the change only shows after a click, hover, scroll
   or open dialog, write a setup module in `$TMPDIR`, not in the repo:

   ```js
   export default async (page, { side, width }) => {
     await page.getByRole("button", { name: "React" }).click();
   };
   ```

2. Add `--clip <selector>` when the change is small, `--skip-before` for a new page, and
   `--theme night` when night mode is part of the change.
3. For motion, add `--record <secs>` for a GIF of the after side, limited with `--widths` to
   the width that shows it best. Keep it short; the script warns past 3 MB.
4. Run it with `--out $TMPDIR/pr-media/<slug>` and
   `--url-base https://raw.githubusercontent.com/<owner>/<repo>/pr-assets/agent/<slug>`. It
   prints the markdown for the PR's Screenshots section.
5. Publish the files on the `pr-assets` branch, in a worktree of its own:

   ```sh
   if git fetch origin pr-assets; then
     git worktree add --detach ../pr-assets-<slug> origin/pr-assets
   else
     git worktree add --orphan -b pr-assets ../pr-assets-<slug>   # first run ever
   fi
   ```

   Copy the files into `agent/<slug>/` there, commit, `git push origin HEAD:pr-assets`
   (fetch and rebase, then push again, if another run pushed first), and remove the worktree.

## 9. Commit and open the PR

- Commit in Conventional Commits style (`feat:`, `fix:`, `chore:`…). Every commit ends with
  the `Co-Authored-By: Claude …` trailer; CI relies on it to spot agent commits that touch
  content.
- Push `agent/<slug>` and open the PR as a **draft**, labelled `agent`:

```sh
gh pr create --draft --base main --head agent/<slug> --label agent \
  --title "<type>: <short summary>" --body-file <file>
```

Body template:

```markdown
## Backlog item

> <the item's text, verbatim>

## What changed

<2–5 bullets in plain language: what a reviewer will see and where the code lives>

## How to test

<steps on the Netlify deploy preview: which page, which width, what to click; include
reduced-motion and night mode when they apply>

## Screenshots

<the markdown printed by pr-media.mjs; a one-line caption under each GIF>

## Noticed, not changed

<things outside this item's scope, or "Nothing.">

## Checks

- [x] `pnpm check`
- [x] `pnpm test --run`
- [x] `pnpm build`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Don't wait for the review or deploy preview; other runs handle those.

## Needs input

When you can't go ahead (ambiguous, needs a decision, touches content, checks won't pass),
still claim the item so later runs don't retry it:

1. Push `agent/<slug>` with whatever useful work exists, or with a single empty commit
   (`git commit --allow-empty`) if there is none.
2. Open a draft PR labelled `agent` and `needs-input`. The body quotes the item, states the
   question or blocker in one or two sentences, and gives the options you see with the one
   you'd pick.
3. Stop with `RESULT: needs-input #<number>`.

## Hard rules

- Never push to `main`, merge a PR, force-push, or touch a branch other than `agent/<slug>`
  and `pr-assets`.
- Never edit the content paths (apart from the word-for-word exception above), `CLAUDE.md`,
  or this prompt.
- One item per run. Don't start a second, even when the first was quick.

## Final output

Your last line is exactly one of these, so the loop script can parse it:

```
RESULT: opened #<number> agent/<slug>
RESULT: needs-input #<number> agent/<slug>
RESULT: idle (cap)
RESULT: idle (nothing eligible)
RESULT: error <reason>
```

Above it, list any items you skipped because of a closed, unmerged PR.
