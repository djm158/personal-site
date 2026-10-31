# Backlog loop runbook

How to run the backlog loop day to day, what it expects from Dan, and how to change it without
breaking it. For how it works and why, see [backlog-loop.md](backlog-loop.md).

## Running it

```sh
caffeinate -i pnpm loop --watch --notify   # the normal way: runs until stopped
pnpm loop --dry-run                        # what would happen next, using your gh login
pnpm loop --smoke                          # setup check on Haiku; opens no PR
pnpm loop                                  # one pass, then exit
```

- **One driver at a time.** Two at once can claim the same item and overshoot the PR cap.
- **Ctrl-C once** lets a run in progress finish, then stops. **Twice** stops it now, which can
  leave a pushed branch with no PR (reported as stranded).
- **Sleep:** on the power adapter the Mac never idle-sleeps (`sleep 0`), and docked with the
  lid closed it stays awake. Undocking, restarting or closing the terminal stops the loop;
  start it again by hand.
- **Pauses on its own** when the subscription's 5-hour window passes 80% (`--max-usage`) or the
  7-day passes 90%, when the daily estimated budget is spent, or while CI is red on `main`.
  **Stops** after two failed runs in a row: read `.loop/runs.jsonl` and the kept run folder,
  then restart with `--force`.
- Other options: `--every <min>` (idle check interval, default 3), `--model` (default opus),
  `--verify-model` (default sonnet), `--budget`, `--daily-budget`, `--timeout`, `--keep`.
  `pnpm loop --help` lists them all.

## Dan's side

| You see                                                   | What it means                                   | What to do                                                                                                                                 |
| --------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| A review request on an agent PR (`claude-reviewed`)       | Built, verified, problems fixed: your turn      | Try the Netlify preview. Approve and merge, or submit **Request changes**; the loop fixes your comments and requests your review again     |
| A draft labelled `needs-input`                            | A run was blocked and asked a question          | Answer in a comment (or push a commit), then remove `needs-input`. The next pass resumes it                                                |
| The content guard failing                                 | An agent PR touched content or the loop's rules | Read those files' diff. If the words are yours or a faithful move, add `content-ok` (only yours counts; it's removed if they change again) |
| A PR you don't want                                       | —                                               | Close it. The item is then skipped as rejected                                                                                             |
| A PR you want redone from scratch                         | —                                               | Comment on what to do differently, close it, add `retry`                                                                                   |
| "Stranded: branch agent/x has no PR" in the loop's output | A run died after pushing                        | Delete the branch on GitHub; the item becomes eligible again                                                                               |
| "Rejected: #n (x) was closed"                             | Reminder of an item you turned down             | Reword or retag it in `BACKLOG.md`, or add `retry` to the PR                                                                               |
| Comments you leave with a plain **Comment** review        | —                                               | The loop ignores them. Use **Request changes** when you want it to act                                                                     |

Writing backlog items:

- Tag with `(agent: <slug>)` to opt an item in, `(after: <slug>)` to wait for another; chain
  items that edit the same files so they don't conflict.
- Describe the outcome, not the implementation, unless the implementation is the point. An
  item that said "load it the way `load.ts` does" cost a round of changes on #5.
- General review feedback (for example "content files hold copy; ordering comes from the
  page") belongs in `AGENTS.md` as a convention, so the next run follows it.

## Where things are

| What                                  | Where                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| One line per run: result, cost, usage | `.loop/runs.jsonl` (gitignored)                                                             |
| Notes runs leave for you              | `.loop/notes.md`: read regularly, move lasting lessons into `AGENTS.md` or the prompts      |
| Full transcripts                      | `.loop/transcripts/<time>-<slug>.jsonl`, and `~/.claude/projects/*personal-site-loop-runs*` |
| A failed run's folder                 | `~/.cache/personal-site-loop/runs/<time>-<slug>/` (kept on error or with `--keep`)          |
| Prompts                               | `.claude/prompts/backlog-{iteration,resume,fix,rebase,retry,verify}.md`                     |
| Sandbox and permission settings       | `.claude/loop-settings.json`                                                                |
| Driver, selection, App tokens         | `scripts/loop/{run,backlog,app-token}.mjs`                                                  |

## Changing the loop safely

- **Commit loop changes on `main`.** Uncommitted changes follow you when you switch branches,
  and once ended up committed on an agent branch.
- **Runs clone `main`.** Anything a run executes from the repo (`scripts/pr-media.mjs`, the
  site itself) must be pushed before it takes effect.
- **Prompts and `.claude/loop-settings.json` are read from your checkout at the start of each
  run**, so edits apply to the next run. **Code changes** in `scripts/loop/` need a driver
  restart.
- **Don't rename labels while a driver runs.** A running driver keeps its old label names;
  renaming `reviewed` once made it redo finished work and recreate the old label.
- **After changing sandbox settings, run `pnpm loop --smoke`.** Silent failures are the risk:
  a build once "passed" with no fonts because the sandbox blocked the font download.
- **`CLAUDE.md` is a symlink to `AGENTS.md`.** Edit `AGENTS.md`. The content guard lists both.
- **Credentials:** never put the App's key or a real token in a command a Claude session runs
  (its safety checks block it anyway). Test with fake tokens; run real-credential checks
  yourself.

## Setup facts

- **GitHub App** `djm158-site-loop` (App ID 5532866, installation 176685886), bot login
  `djm158-site-loop[bot]`. Private key: base64 PEM in the login keychain, service
  `personal-site-loop-app-key`; only `scripts/loop/app-token.mjs` reads it.
  `node scripts/loop/app-token.mjs` checks it and lists the token's permissions.
- **Repo variable** `LOOP_LOGINS` = `claude[bot],djm158-site-loop[bot]` (used by the content
  guard).
- **Ruleset on `main`:** PRs only, "Check, test and build" and "Content guard" required, one
  approval, no force pushes; only the admin role (Dan) bypasses.
- **Labels:** `agent`, `needs-input`, `claude-reviewed`, `content-ok`, `retry`.
- **Workflows:** `ci.yml`, `content-guard.yml`, and `claude.yml` (`@claude` mentions). The
  `claude-code-review.yml` plugin review was removed in favour of the verify pass.
- **Machine:** macOS, git 2.39, Node via fnm, pnpm 12, Typst and ffmpeg from Homebrew,
  Playwright's Chromium; docked with the lid closed, never idle-sleeps on AC.

## Open threads (2026-10-30)

- The **verify pass** hasn't run on a real PR yet. Check its first reports, and its real cost
  in `.loop/runs.jsonl`, against the plugin review's $0.05–0.10.
- The **retry pass** hasn't met a real case.
- The fix for **a review submitted during a fix run** (the driver skips the review request and
  fixes it next) hasn't met a real case. Watch for "Dan requested changes during the fix run"
  in the loop's output.
- An old **`reviewed`** label is left over from the rename; it can be deleted.
- Not built: a route sweep (shoot every page on every PR), `--compare` for the screenshot
  helper, `--parallel`, and starting the loop at login (launchd).
