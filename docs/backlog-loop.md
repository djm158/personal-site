# The backlog loop: how it works and how it got here

Source notes for a write-up, current as of 2026-10-29. It covers what the loop does, why each
piece is the way it is, what broke while building it, and the prior art it draws on. The
detailed evidence is in [`docs/research/`](research/):
[agentic-backlog-loop.md](research/agentic-backlog-loop.md) (prior art and gaps),
[loop-github-identity.md](research/loop-github-identity.md) (App vs machine user) and
[loop-sandbox.md](research/loop-sandbox.md) (sandbox tests).

Status: everything below is built. The first item went through end to end: a run got
blocked, asked for input, and a second run resumed and finished it (see
[First runs](#6-first-runs)). The fix, rebase and retry passes are built but haven't met a real
case yet.

## 1. What it is

A local driver works through `BACKLOG.md` one item at a time. For each item it starts a fresh,
headless Claude Code session in a sandbox. The session builds the item and opens one pull
request as a GitHub App, with before/after screenshots in the description. CI, a content guard,
an AI code review and a Netlify deploy preview then run on the PR. Dan reviews and merges.

Requirements Dan set at the start:

- One PR per backlog item, so each can be tested and reviewed on its own.
- A preview environment per PR, so testing doesn't mean checking out a branch.
- Screenshots in PR descriptions, and recordings for animations.
- Checks that content is written or approved by Dan: "don't write blogs for me".
- A fresh context for every iteration.
- An automatic code review on every PR.
- Later: run it on his Claude subscription, not a pay-per-token API key.

The site itself is a practice project. `CLAUDE.md` tells agents not to write features, so the
iteration prompt lifts that rule for the one item a run picks, and only that item.

## 2. One pass, end to end

Each `pnpm loop` is one pass, and each pass does at most one Claude run. `--until-idle` keeps
going until there's nothing to do.

```
pnpm loop
 │
 ├─ mint a 1-hour GitHub App token (private key read from the macOS keychain)
 ├─ stop if: CI red on main · daily budget spent · 2 failed runs in a row
 ├─ survey GitHub: open agent PRs, conflicts, labels, branches, PR history, BACKLOG.md on main
 │
 ├─ pick the first thing to do, in this order:
 │    1. resume   a needs-input draft Dan has answered (label removed)
 │    2. rebase   a PR that conflicts with main
 │    3. fix      a reviewed PR with findings or failed CI
 │               (a clean review is labelled `reviewed` by the driver, no run needed)
 │    4. new      the next backlog item, if fewer than 3 agent PRs are open;
 │               a retry if its last PR was closed with the `retry` label
 │
 ├─ fresh clone in ~/.cache/personal-site-loop/runs/<time>-<slug>/
 │    repo/ (new branch from main, or the PR's branch)  pr-assets/  scratch/  settings.json
 ├─ claude -p  (sandboxed Bash, subscription auth, repo settings only, no MCP, time limit)
 │    new item: understand → "Done when" list → build → check/test/build → tick BACKLOG.md
 │      → screenshots (production vs build) → push media → push branch → open PR
 │    resume / fix / rebase / retry: the same prompt plus a short addendum for that pass
 │    → NOTE: lines → RESULT: opened | needs-input | fixed | rebased | error
 ├─ log the result, cost and notes to .loop/
 └─ revoke the token, delete the run folder
          │
          ▼  on GitHub
   CI (check, test, build) · content guard · Claude review · Netlify preview
          │
          ▼
   next pass: fix run or straight to `reviewed` → Dan approves and merges
```

## 3. The pieces

| Piece             | File                                                               | Job                                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backlog tags      | `BACKLOG.md`                                                       | `(agent: slug)` opts an item in; `(after: slug)` waits on another; `(me)` and `(deferred)` keep it out                                                                              |
| Driver            | `scripts/loop/run.mjs`                                             | Limits, survey, selection, clone, runs Claude, logs, cleanup. `--dry-run`, `--smoke`, `--until-idle`                                                                                |
| Selection         | `scripts/loop/backlog.mjs`                                         | Pure functions with Vitest tests: parse the backlog, pick the next item or retry, report rejected or stranded items                                                                 |
| App tokens        | `scripts/loop/app-token.mjs`                                       | JWT from the keychain key, mint and revoke installation tokens                                                                                                                      |
| Sandbox settings  | `.claude/loop-settings.json`                                       | Network allowlist, blocked credential paths, permission rules                                                                                                                       |
| Iteration prompt  | `.claude/prompts/backlog-iteration.md`                             | What one run does, the PR template, hard rules, output format                                                                                                                       |
| Pass addenda      | `.claude/prompts/backlog-{resume,fix,rebase,retry}.md`             | Added after the iteration prompt for the other passes; each replaces only the steps that differ                                                                                     |
| Screenshot helper | `scripts/pr-media.mjs`                                             | Before/after PNGs and GIFs with Playwright, markdown for the PR                                                                                                                     |
| Media hosting     | orphan `pr-assets` branch                                          | Images linked from PRs by `raw.githubusercontent.com` URL                                                                                                                           |
| CI                | `.github/workflows/ci.yml`                                         | `pnpm check`, `pnpm test --run`, `pnpm build` (with Typst)                                                                                                                          |
| Content guard     | `.github/workflows/content-guard.yml`, `.github/content-paths.txt` | Fails agent PRs that touch content until Dan adds `content-ok`                                                                                                                      |
| Review            | `.github/workflows/claude-code-review.yml`                         | `claude-code-action` running the `code-review` plugin                                                                                                                               |
| Ruleset on `main` | GitHub settings                                                    | PRs only, both checks required, no force push; only the admin role bypasses                                                                                                         |
| Labels            | GitHub                                                             | `agent` (made by the loop), `needs-input` (blocked, Dan's turn), `reviewed` (review handled, Dan's turn), `content-ok` (Dan approved content), `retry` (on a closed PR: start over) |

## 4. Decisions and why

### Shape of the loop

**One item per run, fresh context each time.** Every run is a new `claude -p` session. State
lives in git and GitHub (ticked items, branches, PRs, labels), not in the model's memory. This
is the core of Geoffrey Huntley's "Ralph" loop ("one thing per loop"), and Anthropic's
long-running harness hit the same problem from the other side: Claude "tried to do too much at
once" until it was limited to one feature per session.

**One PR per item, no stacking.** Each PR branches from `main`. Stacked PRs would make each
review depend on the one below. Dependencies are handled in the backlog instead (below).

**A cap of 3 open agent PRs.** Review is the bottleneck. Simon Willison: "the natural
bottleneck on all of this is how fast I can review the results". The cap keeps the queue at a
size Dan can clear.

**Opt-in tags in `BACKLOG.md`.** Only items tagged `(agent: slug)` are eligible. Content work
and things Dan wants to build for practice are `(me)`; undecided design is `(deferred)`. This
matches GitHub's advice to keep "learning tasks" and "ambiguous tasks" for yourself, and Mitchell
Hashimoto's habit of handing agents only tasks they will "almost certainly solve well".

**`(after: slug)` dependencies, and chaining items that touch the same files.** Four follow-ups
to the skill picker all waited on one refactor, so they would have opened together and
conflicted in the same résumé files. They are now chained one after another.

**Selection in code, not in the prompt.** The first version of the prompt had the agent read
the backlog and pick. That moved into `backlog.mjs`, with tests, because it's deterministic
logic and the driver needs the answer before starting a session (to clone and name the branch).

**Claiming and rejection through GitHub itself.** An item is taken if `agent/<slug>` exists or
any PR came from it. A PR closed without merging means Dan rejected it; the item is skipped and
reported so he can reword or retag it, or ask for a retry (below). A branch with no PR means a
run died, and is reported as stranded. When a run is blocked it still claims the item with a
draft PR labelled `needs-input`, so later runs don't retry it.

**A "Done when" list in every PR.** Before building, the agent writes 2–5 checks taken from the
item's wording, then ticks them in the PR with evidence. Matt Pocock watched a Ralph loop
declare "Done with all user-facing commands" after quietly skipping some; explicit criteria are
the common fix.

**Loop notes, but no self-editing.** Runs end with up to three `NOTE:` lines that the driver
saves to `.loop/notes.md` for Dan. The agent may never edit `CLAUDE.md` or its own prompt. Dan
moves lasting lessons there himself, the way Hashimoto adds an `AGENTS.md` line after each
mistake.

### Evidence on the PR

**Screenshots from a helper script, not ad hoc.** `pr-media.mjs` shoots production as
"before" and the local build as "after", at 375px and 1280px, with reduced motion and
animations disabled so stills are stable. A setup module can click, hover or open dialogs
first. `--record` makes a GIF with ffmpeg. A fixed tool gives consistent results across runs,
and Hashimoto describes writing screenshot scripts for his agents for the same reason.

**Production as "before".** No second build is needed, and the comparison is what users see
today.

**Images on an orphan `pr-assets` branch.** GitHub has no API for uploading images to a PR
description. An orphan branch keeps binaries out of `main`'s history, and
`raw.githubusercontent.com` URLs render inline.

**Media even for refactors.** The first agent PR skipped screenshots because nothing was
supposed to look different. But the pairs are how Dan checks that nothing changed, so the rule
now requires them whenever anything that renders is touched, including pressed or open states.

**Netlify deploy previews.** Already built into the hosting: a URL per PR, with a status check
and comment.

### Verification and review

**CI runs the checks, not the agent's word.** The first PR template had the agent tick
"pnpm check / test / build" boxes itself. Several sources report agents claiming tests pass when
they don't (Birgitta Böckeler: "AI frequently claimed the build and tests were successful").
CI now runs all three, and the boxes are gone.

**An AI review on every PR.** `anthropics/claude-code-action` runs the official `code-review`
plugin, which flags only high-signal issues (compile errors, definite logic errors, quotable
`CLAUDE.md` violations) and has a second agent confirm each one before posting. Anthropic's own
guidance warns that "a reviewer that's asked to find problems will always find _something_",
so the fix pass does one round only.

**Review on open, not on every push.** Re-reviewing each push would repeat the review after
every fix-pass commit, all on the subscription.

**Ready PRs, not drafts.** Agent PRs first opened as drafts, but the review skips drafts.
Copilot's cloud agent works the same way ("cannot mark its pull requests as 'Ready for
review'"), which is why a human has to step in there. Here PRs open ready, and only
`needs-input` PRs are drafts.

### After the PR opens

Labels carry the whole conversation between Dan and the loop, so the driver can work out what
each PR needs from GitHub alone, with nothing to remember between passes.

**Finish open work before starting new work.** Each pass resumes, rebases or fixes an existing
PR before it picks a new item. Those PRs are already open, so the 3-PR cap doesn't apply to
them. It keeps the queue moving toward "merged" instead of growing.

**Resume: a draft without `needs-input` means "answered".** Agent PRs are drafts only while
blocked. When Dan replies and removes the label, the next pass clones the PR's branch as it is
(including anything Dan pushed), gives the run Dan's comments, and finishes the item. The run
then rewrites the PR body and marks it ready, which starts the review.

**Fix: one round, then hand over.** Once CI and the review have finished, the driver collects
comments from Dan and `claude[bot]` made since the PR became ready, or since `reviewed` was last
added. If there are none and CI passed, it adds `reviewed` itself without starting Claude. If
there are, a fix run fixes the in-scope ones, replies to the rest with a reason, re-checks,
re-shoots changed screenshots under the same names (so the PR's image links keep working),
replies on every comment, and adds `reviewed`. The driver adds the label too, so a forgetful
run can't fix the same comments again. Dan asks for another round by commenting and removing
`reviewed`.

**Only trusted comments reach a run.** The repo is public, so anyone can comment on a PR. Resume,
fix and retry runs only see comments from Dan (and, for fixes, `claude[bot]`), and the prompts
say to treat anything else on the PR as information, never instructions. This is the
"untrusted content" leg of Willison's trifecta, cut at the driver. Copilot's cloud agent
similarly ignores comments from users without write access.

**Rebase pass: merge, don't rebase.** A PR that conflicts with `main` can't merge, and CI
doesn't run on it, so it's handled before fixes. The run merges `main` into the branch instead
of rebasing: rebasing would need a force-push, which the hard rules forbid, and would detach
review comments from their lines. GitHub's update-branch API can't help here because it refuses
branches with conflicts. If `main` changed the same code so much that the item's approach no
longer fits, the run stops with `needs-input` instead of rewriting the item.

**Retry: a label on the closed PR.** Closing a PR means "rejected". Closing it and adding
`retry` means "start over": the driver deletes the old branch (the new attempt can't be
force-pushed over it, and the closed PR keeps its diff) and starts a fresh run from `main`. That
run reads the old PR and Dan's comments on it, and the new PR says what it replaces and what it
did differently. The newest PR from a branch decides the item's state, so a rejected retry goes
back to rejected rather than retrying forever.

### Content guard

**Enforced by CI, not just the prompt.** The prompt forbids content edits, but a prompt is a
request. Claude Code's docs: "If something has to happen every time, make it a hook, a deny
rule, or a managed setting."

**Site copy in two files.** Dan's call: all copy lives in `resume/resume.yaml` and
`content/site-content.yaml` (plus markdown collections for posts and projects later), so "an
agent changed content" becomes "an agent changed one of these paths".

**How it decides.** A PR counts as an agent PR if the branch starts with `agent/`, a commit has
the Claude co-author trailer, or the PR or a commit comes from an account in the `LOOP_LOGINS`
variable. If it touches a listed path it fails until the `content-ok` label is present.

**Details that close loopholes:**

- `pull_request_target`, so the workflow runs as it is on `main`. With `pull_request`, a PR
  could edit the guard to pass itself. Nothing from the PR is checked out or executed.
- The path list is read from `main` for the same reason.
- The label only counts if Dan added it, checked in the PR's event history. Anyone with write
  access can add labels, including the loop.
- If protected files change after approval, the guard removes the label.
- `.github/**`, `.claude/**` and `CLAUDE.md` are protected too, so an agent can't weaken CI or
  its own instructions unnoticed.

### Identity and access

**The subscription, not an API key.** Dan wants runs to count against his Claude plan. This
ruled out GitHub Agentic Workflows (gh-aw), which otherwise solved several problems well:
sandboxed runs on Actions, writes only through declared "safe outputs", filtering out content
from untrusted users, and per-run budgets. Its Claude engine requires `ANTHROPIC_API_KEY`
("Subscription OAuth tokens are unsupported").

**A separate GitHub identity.** Running as Dan meant every protection Dan could bypass, the
loop could too. Willison's "lethal trifecta" (private data, untrusted content, a way to send
data out) describes the risk once the fix pass reads PR comments on a public repo.

**A GitHub App over a machine user.** From the identity research:

- Fine-grained personal access tokens don't work on repos where the account is only a
  collaborator. A machine user would need a classic token or an SSH key, which can't be
  narrowed to one repo.
- An App token covers one repo and only the permissions requested, and expires in an hour.
  The driver mints one per run and revokes it at the end.
- Without the Workflows permission, GitHub itself rejects pushes that change
  `.github/workflows`.
- The cost is one line in the review workflow: the action rejects bot authors unless they're
  listed in `allowed_bots`.

**The private key stays in the keychain.** Only the driver reads it, outside the sandbox. The
agent gets the 1-hour token as `GH_TOKEN`, and git uses it through a credential helper that
reads the environment, so the token never sits in a config file.

**A ruleset on `main`.** PRs only, "Check, test and build" and "Content guard" required
(pinned to the GitHub Actions app, so no other app can satisfy them), no force pushes, and only
the admin role can bypass, and one approval. Approvals started at 0, because while agent PRs
were opened under Dan's account he couldn't approve them, and went to 1 once PRs came from the
App. Anthropic's best practices say the same: before leaving a task running, "protect `main`
with a GitHub branch rule the task can't bypass".

### Isolation on the Mac

**Claude Code's sandbox rather than a second macOS user.** A separate macOS user would hide
Dan's keychain and SSH keys completely, but his Node, pnpm and Claude Code are installed per
user, so it meant maintaining a second toolchain. The sandbox, once tested, covers the same
ground:

- Network: only GitHub, npm, production, and two font hosts. SSH can't connect at all, so
  Dan's SSH key is useless to the agent.
- Files: `~/.ssh`, `~/.config/gh` and `~/Library/Keychains` can't be read; writes only inside
  the run folder.
- `allowUnsandboxedCommands: false`, so a blocked command can't be retried outside.

**A fresh clone per run, not a git worktree.** A worktree shares the main repo's `.git` folder,
so the sandbox would have had to let the agent write there. A planted git hook would then run,
outside the sandbox, the next time Dan used git. A clone keeps the agent out of Dan's checkout,
and the driver runs its own git commands with hooks disabled.

**Only the repo's settings.** Runs use `--setting-sources project` and `--strict-mcp-config`,
so Dan's personal plugins and connectors (Gmail, Calendar) aren't available to the agent.
Anything that would need a permission prompt is denied (`--permission-prompts none`).

### Limits

- Per-run budget (`--max-budget-usd`, an estimate on a subscription), a 45-minute time limit
  (tokens last 60), a daily estimated budget, a stop after two failed runs in a row, and a stop
  when CI is red on `main`. Pocock and Willison both recommend iteration caps and tight budgets
  for unattended loops; Anthropic's harness runs a smoke check on startup so a broken base
  doesn't look like the agent's own failure.

## 5. What went wrong, and the fixes

In roughly the order they happened.

| Problem                                                                            | Cause                                                                                                                                                                                                     | Fix                                                                                                                                                                    |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First screenshot run hung, and would have shot the wrong site                      | A dev server from another project was still on port 4321                                                                                                                                                  | The helper serves `./dist` itself on a free port                                                                                                                       |
| "astro preview didn't start"                                                       | Astro 7 allows one preview server per project, and an old one was still running in the background                                                                                                         | Same: the built-in static server replaced `astro preview`                                                                                                              |
| `timeout: command not found`                                                       | macOS has no `timeout`                                                                                                                                                                                    | The driver is Node, with its own timer                                                                                                                                 |
| Desktop PNGs around 1.8 MB                                                         | The page's grain overlay doesn't compress                                                                                                                                                                 | Desktop shots at 1x scale, phones at 2x                                                                                                                                |
| Clipped screenshot timed out on the home page                                      | The selector's first match was a link inside the closed mobile menu                                                                                                                                       | Clip only visible matches                                                                                                                                              |
| `git worktree add --orphan` failed                                                 | Needs git 2.42; the Mac has 2.39                                                                                                                                                                          | `checkout --orphan` instead (later replaced by clones)                                                                                                                 |
| The first agent PR had no screenshots                                              | "No visible change" read as "nothing to show"                                                                                                                                                             | Media required for anything that renders; backfilled by hand                                                                                                           |
| PR checkboxes ticked by the agent                                                  | The template had `[x]` built in                                                                                                                                                                           | CI runs the checks; boxes removed                                                                                                                                      |
| Draft PRs would never be reviewed                                                  | The review and the plugin both skip drafts                                                                                                                                                                | PRs open ready; only `needs-input` is a draft                                                                                                                          |
| The review did nothing on PR #2                                                    | The action only runs when the workflow file matches the copy on `main`                                                                                                                                    | Expected on the PR that adds it. Also means open PRs need updating whenever the review workflow changes                                                                |
| The review ran 2 turns in 4 seconds and posted nothing                             | The plugin's subagents started in the background; a headless session ends when its turn ends, so they were dropped                                                                                        | `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`. Found with `display_report: true`, which writes Claude's report to the job summary without making the full transcript public |
| Reopening a PR doesn't re-review it                                                | The plugin skips PRs Claude has already commented on                                                                                                                                                      | Delete the comment to re-review                                                                                                                                        |
| Chromium crashed inside the sandbox                                                | It registers a macOS Mach service at startup, which the sandbox forbids                                                                                                                                   | `--single-process`, with a fresh browser per screenshot because single-process mode can't open a second context                                                        |
| Chromium couldn't reach production                                                 | It ignores the sandbox's `HTTPS_PROXY`                                                                                                                                                                    | Pass the proxy to Playwright at launch                                                                                                                                 |
| `gh` failed TLS verification in the sandbox                                        | Go programs verify certificates through a macOS service the sandbox blocks                                                                                                                                | `enableWeakerNetworkIsolation`, a documented and accepted loosening                                                                                                    |
| **The keychain leaked inside the sandbox**                                         | The sandbox profile always allows the keychain services, and no setting removes them                                                                                                                      | Block reads of `~/Library/Keychains`; the login keychain is a file the client reads. Dan found this by running the check himself                                       |
| `$TMPDIR` pointed somewhere unexpected                                             | Claude Code sets its own temp folder inside the sandbox                                                                                                                                                   | Runs get an explicit scratch folder                                                                                                                                    |
| Testing anything near a real token was blocked                                     | Claude Code's auto-mode safety check refuses to put credentials in commands                                                                                                                               | Fake tokens for TLS tests; Dan ran the real-credential checks                                                                                                          |
| `LOOP_LOGINS` contained `<app-name>[bot]`                                          | The placeholder from the instructions was copied literally                                                                                                                                                | Set to the App's real bot name                                                                                                                                         |
| The App's permissions couldn't be checked via the API                              | The App is private, so it's hidden from Dan's `gh` login                                                                                                                                                  | The token-mint response lists the permissions granted                                                                                                                  |
| Smoke test: screenshots crashed                                                    | Runs clone `main`, which didn't have the sandbox fix yet                                                                                                                                                  | Push first, then smoke test                                                                                                                                            |
| **Smoke test: the build had no fonts, and still passed**                           | Astro downloads the fonts from Fontsource while building; the sandbox blocked it and the build fell back silently                                                                                         | Allow `api.fontsource.org` and `cdn.jsdelivr.net`; the smoke test now counts font files                                                                                |
| First real run: `pnpm add nanostores` failed, so the item stopped at `needs-input` | pnpm 12 takes a lock in `/private/tmp/pnpm-store-operation-locks-<uid>` before writing to its store, outside every folder the sandbox allowed. Moving the store didn't help, because the lock isn't in it | Allow that folder; the smoke test now runs `pnpm add`. The agent's own note pinned down the lock                                                                       |
| Commands with `VAR=value`, `sed -i` or `${...}` were denied                        | Claude Code treats them as needing approval, and nothing can approve in a headless run                                                                                                                    | The prompt says so and points to the Edit tool and full paths. Both came from the agent's notes                                                                        |
| A command ran in the wrong folder                                                  | Two Bash calls running at once, one of which had `cd`'d into the `pr-assets` clone, shared a working directory                                                                                            | The prompt says to use `git -C` and absolute paths. Also from the agent's notes                                                                                        |
| Loop fixes ended up on an agent branch                                             | Uncommitted changes followed Dan when he switched branches to add nanostores, and were committed there                                                                                                    | Caught before the push; moved back to `main`. The driver reads its prompts from Dan's checkout, so uncommitted loop changes are fragile                                |
| (Design) A fix pass could read an old CI result                                    | A PR can have several runs of one check, including cancelled ones                                                                                                                                         | Use the latest run                                                                                                                                                     |
| (Design) Dan's answer to a `needs-input` question would have started a fix pass    | It's a comment from Dan on the PR                                                                                                                                                                         | Fix passes only count comments since the PR became ready or `reviewed` was last added                                                                                  |

Patterns worth noting:

- Several failures were silent: a review that "succeeded" doing nothing, and a build that
  "succeeded" without fonts. Both were caught only by checking the output, not the status.
- The sandbox needed testing against real tools. Its docs covered Chromium only on Linux, and
  the keychain gap and font downloads only showed up by running things.
- Small human-in-the-loop steps (running the keychain check, the token check, the smoke test)
  kept credentials out of the agent's hands during the build-out as well as in the loop.
- The `NOTE:` lines paid off on the first two runs: the agent diagnosed the pnpm lock and
  three sandbox gotchas itself, and each became a fix or a line in the prompt.
- When the agent hit the sandbox it stopped and asked, instead of trying to get around it. It
  tried several legitimate options for pnpm first, then filed a clear `needs-input` PR.

## 6. First runs

**`skill-picker-state`, run 1: blocked.** The item asked for a nanostores store, and
`pnpm add` failed in the sandbox (the pnpm lock above). The agent did the part it could, the
pure `matchingRoles` and `toggleSkill` functions with tests, and decided AND over OR as the
item suggested. Then it opened draft PR #3 labelled `needs-input`: the blocker, three options
and the one it would pick ("Dan runs `pnpm add nanostores` on this branch"). About $0.73
estimated, 23 turns, 2 minutes.

**Dan answered.** He added nanostores on the branch, commented "nanostores is installed, go
ahead", and removed the label.

**Run 2: resumed and finished.** The resume pass cloned the branch with Dan's commit, wired the
store into the page script and `SkillSheet`, ticked the backlog, shot three before/after sets
(sidebar pick, sheet reopened, cleared) showing no visible change, rewrote the PR with a ticked
"Done when" list, and marked it ready. CI, the content guard and the review passed; the review
found no issues. About $0.96 estimated, 34 turns, under 3 minutes.

Everything on GitHub came from the App: the PR author was `djm158-site-loop[bot]`, its
commits had the bot as author and Claude as co-author, and the App's PR triggered CI, the guard,
the review (through `allowed_bots`) and the Netlify preview.

## 7. Cost notes

- Everything runs on the Claude subscription. Cost figures in logs are estimates at API prices,
  not charges, unless extra usage is turned on.
- Observed estimates: the first item took about $1.70 over two runs (Opus); a review run that
  stalled early cost about $0.05–0.11; a setup check on Haiku cost under $0.01; CI takes about
  40 seconds on GitHub's free runners for public repos.
- gh-aw would have billed per token through an API key, plus about 3 minutes of runner setup
  per run.

## 8. Not built yet, or not tested

- **Fix, rebase and retry passes:** built, but no real PR has needed them yet.
- **Stranded branches** (a branch with no PR, from a run that died) are reported, not retried:
  there's no PR to label, and an automatic retry of a run that crashes would keep crashing.
- **Route sweep:** shoot every page on every PR, so changes outside the item's area show up.
- **`--compare` for the screenshot helper:** report which before/after pairs differ, instead of
  relying on the agent's "no visible change".

## 9. Prior art and sources

Prior art (dates as published):

- Geoffrey Huntley, [Ralph Wiggum as a "software engineer"](https://ghuntley.com/ralph/),
  2025-07-14. The original loop: one item per iteration, a plan file reloaded each time.
- Young / Anthropic,
  [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents),
  2025-11-26. One feature per session, progress files, startup smoke tests, browser testing.
- Rajasekaran / Anthropic,
  [Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps),
  2026-03-24. "Agents reliably skew positive when grading their own work"; a separate
  Playwright evaluator.
- Anthropic Applied AI,
  [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents),
  2025-09-29. Notes outside the context window as memory.
- Matt Pocock / AI Hero,
  [11 tips for AI coding with Ralph Wiggum](https://www.aihero.dev/tips-for-ai-coding-with-ralph-wiggum),
  updated 2026-01-08. Explicit stop conditions, iteration caps, watch before leaving it alone.
- Mitchell Hashimoto, [My AI Adoption Journey](https://mitchellh.com/writing/my-ai-adoption-journey),
  2026-02-05. Agent-solvable tasks only, a rule after each mistake, screenshot scripts.
- Simon Willison, [The lethal trifecta for AI agents](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/)
  (2025-06-16), [Designing agentic loops](https://simonwillison.net/2025/Sep/30/designing-agentic-loops/)
  (2025-09-30), [Embracing the parallel coding agent lifestyle](https://simonwillison.net/2025/Oct/5/parallel-coding-agents/)
  (2025-10-05).
- Birgitta Böckeler,
  [How far can we push AI autonomy in code generation?](https://martinfowler.com/articles/pushing-ai-autonomy.html),
  2025-08-05. False success claims, unrequested features.
- Kent Beck, [Augmented Coding: Beyond the Vibes](https://newsletter.kentbeck.com/p/augmented-coding-beyond-the-vibes),
  2025-06-25. Warning signs, such as deleted or disabled tests.
- Armin Ronacher, [The Coming Loop](https://lucumr.pocoo.org/2026/6/23/the-coming-loop/),
  2026-06-23. Loops making code more defensive; merging code you can't explain.
- Sehn / DoltHub, [A Day in Gas Town](https://www.dolthub.com/blog/2026-01-15-a-day-in-gas-town/),
  2026-01-15. Operator overload, self-merging with failing tests.
- Google, [Meet Jules' sharpest critic](https://developers.googleblog.com/en/meet-jules-sharpest-critic-and-most-valuable-ally/),
  2025-08-12. A critic that flags but doesn't fix.

Product documentation it leans on:

- Claude Code: [Best practices](https://code.claude.com/docs/en/best-practices),
  [Run Claude Code programmatically](https://code.claude.com/docs/en/headless),
  [Sandboxing](https://code.claude.com/docs/en/sandboxing),
  [Configure permissions](https://code.claude.com/docs/en/permissions),
  [GitHub Actions](https://code.claude.com/docs/en/github-actions),
  [Environment variables](https://code.claude.com/docs/en/env-vars).
- [anthropics/claude-code-action](https://github.com/anthropics/claude-code-action) (the
  `allowed_bots`, `display_report` inputs and the write-permission check in
  `src/github/validation/permissions.ts`) and the
  [`code-review` plugin](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-review/commands/code-review.md).
- [anthropics/sandbox-runtime](https://github.com/anthropics/sandbox-runtime), the open-source
  sandbox Claude Code uses; most sandbox tests ran on it directly.
- GitHub: [Copilot cloud agent risks and mitigations](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/risks-and-mitigations),
  [Copilot task best practices](https://docs.github.com/en/copilot/tutorials/cloud-agent/get-the-best-results),
  [About rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets),
  [fine-grained token limitations](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#fine-grained-personal-access-tokens-limitations),
  [installation access tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app),
  [events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).
- [GitHub Agentic Workflows](https://github.github.com/gh-aw/), especially
  [safe outputs](https://github.github.com/gh-aw/reference/safe-outputs/),
  [integrity filtering](https://github.github.com/gh-aw/reference/integrity/) and the
  [Claude engine](https://github.github.com/gh-aw/reference/engines/claude/) page.
- [Netlify Deploy Previews](https://docs.netlify.com/deploy/deploy-types/deploy-previews/),
  [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots).
