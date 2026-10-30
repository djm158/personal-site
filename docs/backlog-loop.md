# The backlog loop: how it works and how it got here

Source notes for a write-up, current as of 2026-10-29. It covers what the loop does, why each
piece is the way it is, what broke while building it, and the prior art it draws on. The
detailed evidence is in [`docs/research/`](research/):
[agentic-backlog-loop.md](research/agentic-backlog-loop.md) (prior art and gaps),
[loop-github-identity.md](research/loop-github-identity.md) (App vs machine user) and
[loop-sandbox.md](research/loop-sandbox.md) (sandbox tests). For running it day to day, see
the [runbook](loop-runbook.md).

Status, 2026-10-30: everything below is built and in use. Over the first evening the loop did
17 runs: 11 new items, 4 fix runs and 2 rebases, opening PRs #3–#12, of which #3–#10 were
merged (see [First runs](#6-first-runs)). The retry pass hasn't met a real case yet.

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
going until there's nothing to do; `--watch` never stops, checking again every few minutes when
idle, so merging a PR frees a slot and the loop carries on.

```
pnpm loop --watch
 │
 ├─ mint a 1-hour GitHub App token (private key read from the macOS keychain)
 ├─ pause if: subscription usage high · daily budget spent · CI red on main
 ├─ stop if: 2 failed runs in a row
 ├─ survey GitHub: open agent PRs, conflicts, labels, reviews, branches, BACKLOG.md on main
 │
 ├─ pick the first thing to do, in this order:
 │    1. resume   a needs-input draft Dan has answered (label removed)
 │    2. rebase   a PR that conflicts with main
 │    3. fix      the verify pass found problems, CI failed, or Dan requested changes
 │    4. verify   a fresh run checks a ready PR in a real browser and reports
 │               (nothing found, or nothing visible changed: handed straight to Dan)
 │    5. new      the next backlog item, if fewer than 3 agent PRs are open;
 │               a retry if its last PR was closed with the `retry` label
 │
 ├─ fresh clone in ~/.cache/personal-site-loop/runs/<time>-<slug>/
 │    repo/ (new branch from main, or the PR's branch)  pr-assets/  scratch/  settings.json
 ├─ claude -p  (sandboxed Bash, subscription auth, repo settings only, no MCP, time limit)
 │    new item: understand → "Done when" list → build → check/test/build → tick BACKLOG.md
 │      → screenshots (production vs build) → push media → push branch → open PR
 │    resume / fix / rebase / retry: the same prompt plus a short addendum for that pass
 │    → NOTE: lines → RESULT: opened | needs-input | fixed | rebased | error
 │    (each step printed live as it happens; full transcript saved)
 ├─ log the result, cost, usage and notes to .loop/
 └─ revoke the token, delete the run folder
          │
          ▼  on GitHub
   CI (check, test, build) · content guard · Netlify preview
          │
          ▼
   next passes: verify run → fix run if it found problems → hand over:
   `claude-reviewed` label + review request to Dan
          │
          ▼
   Dan approves and merges, or requests changes (→ fix run → review requested again)
```

## 3. The pieces

| Piece             | File                                                               | Job                                                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backlog tags      | `BACKLOG.md`                                                       | `(agent: slug)` opts an item in; `(after: slug)` waits on another; `(me)` and `(deferred)` keep it out                                                                                              |
| Driver            | `scripts/loop/run.mjs`                                             | Limits, survey, selection, clone, runs Claude, live feed, logs, cleanup. `--dry-run`, `--smoke`, `--until-idle`, `--watch`, `--notify`                                                              |
| Selection         | `scripts/loop/backlog.mjs`                                         | Pure functions with Vitest tests: parse the backlog, pick the next item or retry, report rejected or stranded items                                                                                 |
| App tokens        | `scripts/loop/app-token.mjs`                                       | JWT from the keychain key, mint and revoke installation tokens                                                                                                                                      |
| Sandbox settings  | `.claude/loop-settings.json`                                       | Network allowlist, blocked credential paths, permission rules                                                                                                                                       |
| Iteration prompt  | `.claude/prompts/backlog-iteration.md`                             | What one run does, the PR template, hard rules, output format                                                                                                                                       |
| Pass addenda      | `.claude/prompts/backlog-{resume,fix,rebase,retry}.md`             | Added after the iteration prompt for the other passes; each replaces only the steps that differ                                                                                                     |
| Screenshot helper | `scripts/pr-media.mjs`                                             | Before/after PNGs and GIFs with Playwright, markdown for the PR                                                                                                                                     |
| Media hosting     | orphan `pr-assets` branch                                          | Images linked from PRs by `raw.githubusercontent.com` URL                                                                                                                                           |
| CI                | `.github/workflows/ci.yml`                                         | `pnpm check`, `pnpm test --run`, `pnpm build` (with Typst)                                                                                                                                          |
| Content guard     | `.github/workflows/content-guard.yml`, `.github/content-paths.txt` | Fails agent PRs that touch content until Dan adds `content-ok`                                                                                                                                      |
| Verify pass       | `.claude/prompts/backlog-verify.md`                                | A fresh Sonnet run checks each ready PR in a real browser and posts a `## Verify` report; replaced the `claude-code-action` review                                                                  |
| Ruleset on `main` | GitHub settings                                                    | PRs only, both checks required, no force push; only the admin role bypasses                                                                                                                         |
| Labels            | GitHub                                                             | `agent` (made by the loop), `needs-input` (blocked, Dan's turn), `claude-reviewed` (Claude's review handled, Dan's turn), `content-ok` (Dan approved content), `retry` (on a closed PR: start over) |

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

**What the review actually caught: nothing.** Across the first 10 agent PRs the plugin posted
"No issues found" every time, with no inline comments. Every change that was made came from
Dan's own reviews:

| PR  | Dan's feedback                                                                   | Why a diff-only bug review misses it                                                                                                                     |
| --- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #5  | Use an Astro content collection; numbering belongs in the page, not the content  | A structural preference, not a bug                                                                                                                       |
| #8  | Hovering the article triggers the timeline highlight, and only on the first item | Only visible in the browser, and a matter of feel ("reads as jarring")                                                                                   |
| #10 | The letters hop in unison instead of staggering                                  | The CSS looks right; the browser resolves one delay for every letter (`@theme` vs `@theme inline`). Visible by running the page, not by reading the diff |

The plugin works as designed: it reads the diff without running anything and flags only
compile errors, definite logic errors and quotable rule violations, which CI and small,
well-scoped items leave little room for. Anthropic's documentation of its managed review says
the same thing in other words: it works "from reading the diff and the surrounding code,
without building or running your code". The gap it leaves is the one Anthropic's harness post
fills with a separate evaluator that drives the running app with Playwright.

**So the review was replaced with a verify pass.** Dan's verdict: "the review seems like a
waste of tokens, at least a verify may catch something." After CI passes, the driver starts a
fresh Sonnet run that didn't write the code and may not change it. It builds the branch,
exercises every "Done when" line and "Also check" item in a browser at both widths (plus
night mode, reduced motion and keyboard focus where relevant), reads computed styles for
anything animated, compares with `design/`, and posts one `## Verify` comment: "No problems
found" with what it checked, or numbered problems with evidence. Problems go to the fix pass;
a clean report hands the PR to Dan. PRs that change nothing visible skip it.

- _Why a separate run:_ Anthropic's harness work found "agents reliably skew positive when
  grading their own work", and that tuning a sceptical evaluator was easier than making the
  builder self-critical. The prompt tells the verifier exactly that.
- _Why locally, not in Actions:_ the loop's sandbox already runs Playwright (through
  `pr-media.mjs` setup modules, which can run any page code and print results), and the
  `design/` copy is local.
- _Cost:_ it doesn't save tokens. The plugin review reported about $0.05–0.10 a PR; a verify
  run should be more, since it builds and drives a browser. It's on Sonnet, skips invisible
  changes, and what it buys is fewer problems reaching Dan.
- _Order of work:_ broken CI is fixed before verifying (no point checking a page that doesn't
  build), and if CI still fails after one fix run, the driver turns the PR into a
  `needs-input` draft instead of trying forever.

**Ready PRs, not drafts.** Agent PRs first opened as drafts, but the review skips drafts.
Copilot's cloud agent works the same way ("cannot mark its pull requests as 'Ready for
review'"), which is why a human has to step in there. Here PRs open ready, and only
`needs-input` PRs are drafts.

### After the PR opens

Labels and GitHub's own review states carry the whole conversation between Dan and the loop,
so the driver can work out what each PR needs from GitHub alone, with nothing to remember
between passes.

**Finish open work before starting new work.** Each pass resumes, rebases or fixes an existing
PR before it picks a new item. Those PRs are already open, so the 3-PR cap doesn't apply to
them. It keeps the queue moving toward "merged" instead of growing.

**Resume: a draft without `needs-input` means "answered".** Agent PRs are drafts only while
blocked. When Dan replies and removes the label, the next pass clones the PR's branch as it is
(including anything Dan pushed), gives the run Dan's comments, and finishes the item. The run
then rewrites the PR body and marks it ready, which starts the review.

**Fix: two rounds, using GitHub's review flow.**

- _The verify round._ Once CI has finished, a verify run checks the PR in a browser and posts
  a `## Verify` report (see [Verification and review](#verification-and-review); this round
  used Claude's code review until that was replaced). The driver then collects the report's
  problems and Dan's comments made since the PR became ready. If there are none and CI passed,
  it hands the PR over without starting Claude. If there are, a fix run fixes the in-scope
  ones, replies to the rest with a reason, re-checks, re-shoots changed screenshots under the
  same names (so the PR's image links keep working), and replies on every comment.
- _The handover._ The driver, not the run, adds `claude-reviewed` and requests Dan's review.
  The request puts the PR in Dan's GitHub review queue with GitHub's own notification, and
  because the driver does it, a forgetful run can't leave the same comments to be fixed again.
- _Dan's round._ When Dan's latest review is "Request changes" and came after the loop last
  requested his review, the next pass runs a fix with his comments since then, and requests
  his review again: the same "re-request review" a human contributor would click. Approving,
  or reviewing with plain comments, starts nothing. It also works before the verify pass has
  run.

The first version used a single `reviewed` label that Dan had to remove to ask for another
round. He found that clunky ("having to remove a tag after requesting changes"), so the loop
now reads review states instead of asking him to manage labels.

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
- **Real subscription usage, not just estimates.** Claude's streaming output includes
  `rate_limit_event` messages with the account's actual usage windows: how full the 5-hour
  and 7-day windows are and when each resets. The driver logs them with every run and pauses
  before the 5-hour window passes 80% (`--max-usage`) or the 7-day passes 90%, until the window
  resets, so Dan's own sessions keep some headroom. The same events showed extra usage turned
  off on the account, so loop runs can't incur charges.

### Watching it run

**A live feed instead of "Claude is working…".** Runs use `--output-format stream-json`, and
the driver prints one line per step: each tool call (a command, a file edited, a screenshot
looked at) and each short thing Claude says, prefixed with the item and with paths shortened.
Each run's full transcript goes to `.loop/transcripts/`. Before this existed, the same
transcripts could be read live from `~/.claude/projects/`, where Claude Code keeps every
session.

**Watch mode.** `--watch` runs forever: straight to the next pass after a run, every 3 minutes
when idle, printing only when something changes. A red `main` waits and carries on once it's
fixed, the daily budget and usage limits pause until they reset, and only two failed runs in a
row stop it. `caffeinate -i` keeps the Mac awake. `--notify` adds macOS notifications when a PR
becomes Dan's turn.

**Ctrl-C finishes the current run.** Claude starts in its own process group, so the terminal's
Ctrl-C reaches only the driver. The first press lets a run in progress finish, because killing
one halfway can leave a pushed branch with no PR (a stranded item). The second press stops it.

**One driver, not several.** Two drivers at once could both claim the same item, misreport
each other's in-progress branches as stranded, and overshoot the PR cap. Parallel runs, if
ever needed, belong inside one driver (`--parallel N`), which can claim items itself. They
aren't needed yet: many items are chained, and review is the bottleneck, not run time.

## 5. What went wrong, and the fixes

In roughly the order they happened.

| Problem                                                                                                                                                                                  | Cause                                                                                                                                                                                                                                                                                                                | Fix                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First screenshot run hung, and would have shot the wrong site                                                                                                                            | A dev server from another project was still on port 4321                                                                                                                                                                                                                                                             | The helper serves `./dist` itself on a free port                                                                                                                                                                                                                                 |
| "astro preview didn't start"                                                                                                                                                             | Astro 7 allows one preview server per project, and an old one was still running in the background                                                                                                                                                                                                                    | Same: the built-in static server replaced `astro preview`                                                                                                                                                                                                                        |
| `timeout: command not found`                                                                                                                                                             | macOS has no `timeout`                                                                                                                                                                                                                                                                                               | The driver is Node, with its own timer                                                                                                                                                                                                                                           |
| Desktop PNGs around 1.8 MB                                                                                                                                                               | The page's grain overlay doesn't compress                                                                                                                                                                                                                                                                            | Desktop shots at 1x scale, phones at 2x                                                                                                                                                                                                                                          |
| Clipped screenshot timed out on the home page                                                                                                                                            | The selector's first match was a link inside the closed mobile menu                                                                                                                                                                                                                                                  | Clip only visible matches                                                                                                                                                                                                                                                        |
| `git worktree add --orphan` failed                                                                                                                                                       | Needs git 2.42; the Mac has 2.39                                                                                                                                                                                                                                                                                     | `checkout --orphan` instead (later replaced by clones)                                                                                                                                                                                                                           |
| The first agent PR had no screenshots                                                                                                                                                    | "No visible change" read as "nothing to show"                                                                                                                                                                                                                                                                        | Media required for anything that renders; backfilled by hand                                                                                                                                                                                                                     |
| PR checkboxes ticked by the agent                                                                                                                                                        | The template had `[x]` built in                                                                                                                                                                                                                                                                                      | CI runs the checks; boxes removed                                                                                                                                                                                                                                                |
| Draft PRs would never be reviewed                                                                                                                                                        | The review and the plugin both skip drafts                                                                                                                                                                                                                                                                           | PRs open ready; only `needs-input` is a draft                                                                                                                                                                                                                                    |
| The review did nothing on PR #2                                                                                                                                                          | The action only runs when the workflow file matches the copy on `main`                                                                                                                                                                                                                                               | Expected on the PR that adds it. Also means open PRs need updating whenever the review workflow changes                                                                                                                                                                          |
| The review ran 2 turns in 4 seconds and posted nothing                                                                                                                                   | The plugin's subagents started in the background; a headless session ends when its turn ends, so they were dropped                                                                                                                                                                                                   | `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`. Found with `display_report: true`, which writes Claude's report to the job summary without making the full transcript public                                                                                                           |
| Reopening a PR doesn't re-review it                                                                                                                                                      | The plugin skips PRs Claude has already commented on                                                                                                                                                                                                                                                                 | Delete the comment to re-review                                                                                                                                                                                                                                                  |
| Chromium crashed inside the sandbox                                                                                                                                                      | It registers a macOS Mach service at startup, which the sandbox forbids                                                                                                                                                                                                                                              | `--single-process`, with a fresh browser per screenshot because single-process mode can't open a second context                                                                                                                                                                  |
| Chromium couldn't reach production                                                                                                                                                       | It ignores the sandbox's `HTTPS_PROXY`                                                                                                                                                                                                                                                                               | Pass the proxy to Playwright at launch                                                                                                                                                                                                                                           |
| `gh` failed TLS verification in the sandbox                                                                                                                                              | Go programs verify certificates through a macOS service the sandbox blocks                                                                                                                                                                                                                                           | `enableWeakerNetworkIsolation`, a documented and accepted loosening                                                                                                                                                                                                              |
| **The keychain leaked inside the sandbox**                                                                                                                                               | The sandbox profile always allows the keychain services, and no setting removes them                                                                                                                                                                                                                                 | Block reads of `~/Library/Keychains`; the login keychain is a file the client reads. Dan found this by running the check himself                                                                                                                                                 |
| `$TMPDIR` pointed somewhere unexpected                                                                                                                                                   | Claude Code sets its own temp folder inside the sandbox                                                                                                                                                                                                                                                              | Runs get an explicit scratch folder                                                                                                                                                                                                                                              |
| Testing anything near a real token was blocked                                                                                                                                           | Claude Code's auto-mode safety check refuses to put credentials in commands                                                                                                                                                                                                                                          | Fake tokens for TLS tests; Dan ran the real-credential checks                                                                                                                                                                                                                    |
| `LOOP_LOGINS` contained `<app-name>[bot]`                                                                                                                                                | The placeholder from the instructions was copied literally                                                                                                                                                                                                                                                           | Set to the App's real bot name                                                                                                                                                                                                                                                   |
| The App's permissions couldn't be checked via the API                                                                                                                                    | The App is private, so it's hidden from Dan's `gh` login                                                                                                                                                                                                                                                             | The token-mint response lists the permissions granted                                                                                                                                                                                                                            |
| Smoke test: screenshots crashed                                                                                                                                                          | Runs clone `main`, which didn't have the sandbox fix yet                                                                                                                                                                                                                                                             | Push first, then smoke test                                                                                                                                                                                                                                                      |
| **Smoke test: the build had no fonts, and still passed**                                                                                                                                 | Astro downloads the fonts from Fontsource while building; the sandbox blocked it and the build fell back silently                                                                                                                                                                                                    | Allow `api.fontsource.org` and `cdn.jsdelivr.net`; the smoke test now counts font files                                                                                                                                                                                          |
| First real run: `pnpm add nanostores` failed, so the item stopped at `needs-input`                                                                                                       | pnpm 12 takes a lock in `/private/tmp/pnpm-store-operation-locks-<uid>` before writing to its store, outside every folder the sandbox allowed. Moving the store didn't help, because the lock isn't in it                                                                                                            | Allow that folder; the smoke test now runs `pnpm add`. The agent's own note pinned down the lock                                                                                                                                                                                 |
| Commands with `VAR=value`, `sed -i` or `${...}` were denied                                                                                                                              | Claude Code treats them as needing approval, and nothing can approve in a headless run                                                                                                                                                                                                                               | The prompt says so and points to the Edit tool and full paths. Both came from the agent's notes                                                                                                                                                                                  |
| A command ran in the wrong folder                                                                                                                                                        | Two Bash calls running at once, one of which had `cd`'d into the `pr-assets` clone, shared a working directory                                                                                                                                                                                                       | The prompt says to use `git -C` and absolute paths. Also from the agent's notes                                                                                                                                                                                                  |
| Loop fixes ended up on an agent branch                                                                                                                                                   | Uncommitted changes followed Dan when he switched branches to add nanostores, and were committed there                                                                                                                                                                                                               | Caught before the push; moved back to `main`. The driver reads its prompts from Dan's checkout, so uncommitted loop changes are fragile                                                                                                                                          |
| (Design) A fix pass could read an old CI result                                                                                                                                          | A PR can have several runs of one check, including cancelled ones                                                                                                                                                                                                                                                    | Use the latest run                                                                                                                                                                                                                                                               |
| (Design) Dan's answer to a `needs-input` question would have started a fix pass                                                                                                          | It's a comment from Dan on the PR                                                                                                                                                                                                                                                                                    | Fix passes only count comments since the PR became ready or `reviewed` was last added                                                                                                                                                                                            |
| Many ordinary commands were denied in runs: chains with `;`, `cd` into another folder, `$(...)`, `ffmpeg`, `gh api` POSTs with `-F body=@file`, and once `node scripts/pr-media.mjs / …` | Claude Code asks for approval on Bash commands it can't fully analyse (heredocs, shell variables, loops, `$(...)`, dense quoting, `@file` arguments) unless an allow rule matches; the sandbox's auto-approval didn't cover them. In a headless run nobody can approve, so they're denied. Runs had 0–3 denials each | Tested in headless sandboxed runs: specific allow rules fixed all but loops and `$(...)`; a blanket `Bash` allow rule fixed everything, and the sandbox still blocked `~/.ssh`, unlisted hosts and writes outside the run. The sandbox is the boundary, so `Bash` is now allowed |
| Replies to inline review comments failed                                                                                                                                                 | The `gh api …/replies` call was one of the denied commands                                                                                                                                                                                                                                                           | Fixed by allowing `Bash`. The fix prompt also says to fall back to the PR comment if an inline reply fails                                                                                                                                                                       |
| The content guard didn't protect the agent rules file                                                                                                                                    | `CLAUDE.md` is a symlink to `AGENTS.md`, and the guard matches paths, so an edit to `AGENTS.md` would have passed. Found while adding a lesson to it                                                                                                                                                                 | `AGENTS.md` added to the guard's list and to the prompt's hard rules                                                                                                                                                                                                             |
| `git push -u` couldn't set the upstream                                                                                                                                                  | The sandbox always write-protects `.git/config`                                                                                                                                                                                                                                                                      | Harmless: the push itself works                                                                                                                                                                                                                                                  |
| On-load animations were missed in recordings, and clipping a dialog that had closed failed                                                                                               | `pr-media.mjs --record` trims the video to start after load and measures the clip box after the setup runs                                                                                                                                                                                                           | The agents worked around both in setup modules (restart animations with `document.getAnimations()`; clip to a placeholder box). The helper now has `--replay` and `--clip-box`, and `--clip` measures straight after the setup                                                   |
| GIFs of the full skill sheet came out at 4–6 MB                                                                                                                                          | A full-viewport backdrop changes every frame                                                                                                                                                                                                                                                                         | Clip to the part that moves (about 3 MB)                                                                                                                                                                                                                                         |
| A fix run repeated work on #5 that was already done, after Dan had approved it                                                                                                           | The label was renamed from `reviewed` to `claude-reviewed` while an old driver was still running. It looked for "labeled reviewed" events, which now showed the new name, so it saw the PR as never reviewed. The same old driver then recreated `reviewed` on #8 and #11                                            | Restart the driver after changing labels or its code. The new flow also stops after an approval. Cost: one short run ($0.20)                                                                                                                                                     |
| #5 needed a round of structural changes                                                                                                                                                  | The backlog item said _how_ to do it ("load it the way `load.ts` loads `resume.yaml`"), and Dan wanted an Astro content collection instead                                                                                                                                                                           | A lesson about items: describe the outcome, and prescribe an approach only when it's the point                                                                                                                                                                                   |

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
- The notes kept paying off over the first evening: denied command patterns, Tailwind v4
  gotchas (an `animate-*` utility resets a separate `animation-delay`; a `@theme` token that
  uses a per-element `var()` must go in `@theme inline`), and limits of the screenshot helper.
  One note even suggested a driver improvement (check for an approval before a fix pass) that
  the redesigned review flow now covers.
- Changing the loop while it runs is risky: a running driver keeps its old code, and GitHub
  state it doesn't expect (a renamed label) makes it misread PRs.

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

**The first evening.** Over about four and a half hours of wall time (with a break), the loop
did 17 runs totalling 31 minutes of run time:

| Time (UTC) | Pass         | Item               | Result         | Est. cost | Minutes |
| ---------- | ------------ | ------------------ | -------------- | --------- | ------- |
| 21:29      | new          | skill-picker-state | needs-input #3 | $0.73     | 1.9     |
| 21:41      | resume       | skill-picker-state | opened #3      | $0.96     | 2.7     |
| 22:06      | new          | skill-clear        | opened #4      | $0.51     | 1.5     |
| 22:08      | new          | copy-data-file     | opened #5      | $0.87     | 2.3     |
| 22:10      | new          | skill-note         | opened #6      | $0.65     | 1.9     |
| 22:12      | new          | hero-letter-hover  | opened #7      | $0.59     | 1.8     |
| 01:22      | new          | timeline-hover     | opened #8      | $0.85     | 2.4     |
| 01:22      | rebase       | copy-data-file     | rebased #5     | $0.32     | 0.8     |
| 01:24      | new          | pdf-button-hover   | opened #9      | $0.36     | 1.1     |
| 01:27      | fix (Dan)    | copy-data-file     | fixed #5       | $1.07     | 3.1     |
| 01:28      | fix (Claude) | timeline-hover     | fixed #8       | $0.39     | 1.0     |
| 01:30      | new          | hero-letter-intro  | opened #10     | $0.69     | 2.2     |
| 01:38      | new          | sheet-drag-dismiss | opened #11     | $1.02     | 4.4     |
| 01:49      | fix          | hero-letter-intro  | fixed #10      | $0.47     | 1.4     |
| 01:50      | fix (stale)  | copy-data-file     | fixed #5       | $0.20     | 0.4     |
| 01:50      | rebase       | hero-letter-intro  | rebased #10    | $0.34     | 0.8     |
| 01:52      | new          | avatar-svg         | opened #12     | $0.50     | 1.1     |

Notes on it:

- Runs are short: a new item took 1–4 minutes, fixes and rebases under a minute or two. Dan's
  review, not the agent, set the pace, as Willison predicts.
- The rebase pass met its first real conflicts (#5 and #10, after neighbouring PRs merged) and
  resolved both.
- The fix pass handled Claude's findings (#8, #10) and Dan's structural feedback on #5: move
  the copy into an Astro content collection.
- The only `needs-input` was the pnpm lock. No run failed.
- Two items, `pdf-button-hover` and `hero-letter-intro`, weren't in the original backlog: Dan
  added them during the evening, and the loop picked them up on its next pass.

## 7. Cost notes

- Everything runs on the Claude subscription. Cost figures in logs are estimates at API prices,
  not charges, unless extra usage is turned on.
- Observed estimates: the first evening's 17 runs came to about $10.50 (Opus), or $0.20–1.07 a
  run; a review run that stalled early cost about $0.05–0.11; a setup check on Haiku cost under
  $0.01; CI takes about 40 seconds on GitHub's free runners for public repos.
- Real usage: across the second half of the evening, the 5-hour window went from 20% to 53%
  and the 7-day window from 38% to 41%. That includes Dan's own interactive sessions running at
  the same time, so it's an upper bound for the loop, but it shows a busy loop can use a large
  share of a 5-hour window, which is why the usage pause exists.
- gh-aw would have billed per token through an API key, plus about 3 minutes of runner setup
  per run.

## 8. Not built yet, or not tested

- **Retry pass:** built, but no PR has been closed with `retry` yet.
- **The new review flow** (`claude-reviewed`, review requests, "Request changes") and watch
  mode's pauses haven't run for real yet.
- **The verify pass** is built but hasn't run on a real PR yet.
- **Dan's review feedback as conventions**, where it's general: for example "content files hold
  copy; order and numbering come from the page".
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
